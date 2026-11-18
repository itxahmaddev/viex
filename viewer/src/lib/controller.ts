import {
  RelayClient,
  authenticate,
  newId,
  normalizeServerUrl,
  hasTurn,
  parseIceServers,
  resolveIceServers,
  type DeviceInfo,
  type RelayStatus,
  type ServerMessage,
} from "@viex/shared";

declare const __APP_VERSION__: string;
export const APP_VERSION = __APP_VERSION__;

export interface ViewerConfig {
  server_url: string;
  password: string;
  viewer_id: string;
  viewer_name: string;
  custom_ice: string;
  theme: "system" | "light" | "dark";
}

export interface Tile {
  stream_id: string;
  monitor_id: number | null;
  label: string;
  w: number;
  h: number;
  stream: MediaStream;
}

export type SessionPhase = "requesting" | "connecting" | "live";

export interface SessionState {
  phase: SessionPhase;
  device: DeviceInfo;
  session_id: string | null;
  tiles: Tile[];
  mode: "grid" | "single";
  focus: number; // index into tiles
  /** Human-readable connection progress, shown while connecting. */
  detail: string | null;
  /** True when no TURN server is configured (direct connections only). */
  noTurn: boolean;
}

export interface ViewerState {
  ready: boolean;
  config: ViewerConfig | null;
  relay: RelayStatus;
  relayDetail: string | null;
  devices: DeviceInfo[];
  session: SessionState | null;
  notice: string | null;
}

interface MetaMonitor {
  stream_id: string;
  monitor_id: number;
  label: string;
  w: number;
  h: number;
}

const STORAGE_KEY = "viex.viewer.config";

const isNative = () => typeof window !== "undefined" && "Capacitor" in window;

function defaultName(): string {
  if (isNative()) return "Phone";
  const ua = navigator.userAgent;
  if (/Android|iPhone|iPad/i.test(ua)) return "Phone browser";
  return "Browser";
}

function load(): ViewerConfig {
  let saved: Partial<ViewerConfig> = {};
  try {
    saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
  } catch {
    /* private mode etc. */
  }
  // When the web viewer is served by the Relay itself, the server is simply this origin.
  const sameOrigin = !isNative() && /^https?:$/.test(location.protocol) && !/^(localhost|127\.0\.0\.1)$/.test(location.hostname)
    ? location.origin
    : "";
  return {
    server_url: saved.server_url ?? sameOrigin,
    password: saved.password ?? "",
    viewer_id: saved.viewer_id ?? newId(),
    viewer_name: saved.viewer_name ?? defaultName(),
    custom_ice: saved.custom_ice ?? "",
    theme: saved.theme ?? "system",
  };
}

class ViewerController {
  private state: ViewerState = {
    ready: false,
    config: null,
    relay: "offline",
    relayDetail: null,
    devices: [],
    session: null,
    notice: null,
  };
  private listeners = new Set<() => void>();
  private relay: RelayClient | null = null;
  private pc: RTCPeerConnection | null = null;
  private meta: RTCDataChannel | null = null;
  private metaOrder: MetaMonitor[] = [];
  private queuedCandidates: RTCIceCandidateInit[] = [];
  private disconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private connectTimer: ReturnType<typeof setTimeout> | null = null;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  getState = () => this.state;

  private set(patch: Partial<ViewerState>) {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }

  private setSession(patch: Partial<SessionState> | null) {
    if (patch === null) return this.set({ session: null });
    if (!this.state.session) return;
    this.set({ session: { ...this.state.session, ...patch } });
  }

  dismissNotice() {
    this.set({ notice: null });
  }

  /* ---------- config ---------- */

  init() {
    const config = load();
    this.set({ config, ready: true });
    this.applyTheme(config.theme);
    this.persist(config);
    if (config.server_url && config.password) this.startRelay();
  }

  private persist(config: ViewerConfig) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    } catch {
      /* storage unavailable: the session still works, setup just won't be remembered */
    }
  }

  private applyTheme(theme: ViewerConfig["theme"]) {
    if (theme === "system") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = theme;
  }

  updateConfig(patch: Partial<ViewerConfig>) {
    const config = { ...this.state.config!, ...patch };
    this.persist(config);
    this.set({ config });
    if (patch.theme) this.applyTheme(patch.theme);
  }

  async setup(input: { serverUrl: string; password: string; name: string }) {
    const serverUrl = normalizeServerUrl(input.serverUrl);
    if (!serverUrl) throw new Error("Enter your server URL.");
    if (!input.password) throw new Error("Enter the server password.");
    await authenticate(serverUrl, input.password);
    this.updateConfig({ server_url: serverUrl, password: input.password, viewer_name: input.name.trim() || defaultName() });
    this.startRelay();
  }

  signOut() {
    this.leave();
    this.relay?.stop();
    this.relay = null;
    this.updateConfig({ password: "" });
    this.set({ relay: "offline", relayDetail: null, devices: [] });
  }

  /* ---------- relay ---------- */

  startRelay() {
    this.relay?.stop();
    const config = this.state.config!;
    this.relay = new RelayClient({
      serverUrl: config.server_url,
      password: config.password,
      hello: (token) => ({
        type: "hello",
        role: "viewer",
        token,
        viewer_id: config.viewer_id,
        viewer_name: this.state.config?.viewer_name ?? config.viewer_name,
      }),
      onMessage: (message) => void this.onRelayMessage(message),
      onStatus: (relay, relayDetail) => {
        this.set({ relay, relayDetail: relayDetail ?? null });
        if (relay !== "online" && this.state.session) this.teardown("The connection to the server was lost.");
      },
    });
    this.relay.start();
  }

  refresh() {
    this.relay?.send({ type: "list-devices" });
  }

  private async onRelayMessage(message: ServerMessage) {
    const session = this.state.session;
    switch (message.type) {
      case "device-list":
        this.set({ devices: message.devices });
        return;
      case "request-sent":
        if (session) this.setSession({ session_id: message.session_id });
        return;
      case "approved":
        if (session && session.session_id === message.session_id) {
          this.setSession({ phase: "connecting" });
          this.createPeer(message.session_id);
        }
        return;
      case "rejected":
        if (session) this.teardown(message.reason || "The request was declined.", false);
        return;
      case "offer":
        if (session && session.session_id === message.session_id) await this.onOffer(message.sdp);
        return;
      case "ice-candidate":
        if (session && session.session_id === message.session_id) await this.onRemoteCandidate(message.candidate);
        return;
      case "session-end":
        if (session && session.session_id === message.session_id) {
          this.teardown(endReasonText(message.reason), false);
        }
        return;
      case "error":
        if (session) this.teardown(message.message, false);
        return;
      default:
        return;
    }
  }

  /* ---------- session ---------- */

  watch(device: DeviceInfo) {
    if (this.state.session || !this.relay?.isOpen) return;
    this.set({ notice: null });
    this.metaOrder = [];
    this.set({ session: { phase: "requesting", device, session_id: null, tiles: [], mode: "grid", focus: 0, detail: null, noTurn: false } });
    this.relay.send({ type: "connect-request", target: device.device_id });
  }

  private createPeer(sessionId: string) {
    const ice = resolveIceServers(parseIceServers(this.state.config?.custom_ice ?? ""), this.relay?.iceServers ?? null);
    const pc = new RTCPeerConnection({ iceServers: ice });
    this.pc = pc;
    const turn = hasTurn(ice);
    this.setSession({ noTurn: !turn, detail: "Negotiating…" });
    if (this.connectTimer) clearTimeout(this.connectTimer);
    this.connectTimer = setTimeout(() => {
      const current = this.state.session;
      if (!current || current.phase === "live") return;
      this.teardown(
        turn
          ? "Could not connect to that PC. Check that its VIEX Host is running and online, then try again."
          : "Could not connect directly to that PC. Your networks (for example mobile data) need a TURN relay — set one on your Relay or in Settings (see the setup guide).",
      );
    }, 30_000);
    pc.oniceconnectionstatechange = () => {
      if (this.pc === pc) this.setSession({ detail: `Connection: ${pc.iceConnectionState}` });
    };
    this.queuedCandidates = [];

    const meta = pc.createDataChannel("meta", { negotiated: true, id: 0 });
    this.meta = meta;
    meta.onopen = () => meta.send(JSON.stringify({ type: "hello" }));
    meta.onmessage = (event) => this.onMeta(String(event.data));

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.relay?.send({ type: "ice-candidate", session_id: sessionId, candidate: event.candidate.toJSON() });
      }
    };
    pc.ontrack = (event) => {
      const stream = event.streams[0];
      if (!stream) return;
      const session = this.state.session;
      if (!session || session.tiles.some((t) => t.stream_id === stream.id)) return;
      const tile: Tile = { stream_id: stream.id, monitor_id: null, label: `Screen ${session.tiles.length + 1}`, w: 0, h: 0, stream };
      this.setSession({ tiles: this.orderTiles([...session.tiles, tile]) });
    };
    pc.onconnectionstatechange = () => {
      if (this.pc !== pc) return;
      if (this.disconnectTimer) clearTimeout(this.disconnectTimer);
      if (pc.connectionState === "connected") {
        if (this.connectTimer) clearTimeout(this.connectTimer);
        this.setSession({ phase: "live", detail: "Connected — waiting for video…" });
      }
      else if (pc.connectionState === "disconnected")
        this.disconnectTimer = setTimeout(() => this.teardown("The connection dropped."), 10_000);
      else if (pc.connectionState === "failed" || pc.connectionState === "closed")
        this.teardown("The connection failed. Try again, or add a TURN server in Settings.");
    };
  }

  private async onOffer(sdp: RTCSessionDescriptionInit) {
    const pc = this.pc;
    const sessionId = this.state.session?.session_id;
    if (!pc || !sessionId) return;
    await pc.setRemoteDescription(sdp);
    for (const candidate of this.queuedCandidates.splice(0)) await pc.addIceCandidate(candidate).catch(() => {});
    await pc.setLocalDescription(await pc.createAnswer());
    this.relay?.send({ type: "answer", session_id: sessionId, sdp: pc.localDescription!.toJSON() });
  }

  private async onRemoteCandidate(candidate: RTCIceCandidateInit) {
    if (!this.pc) return;
    if (!this.pc.remoteDescription) this.queuedCandidates.push(candidate);
    else await this.pc.addIceCandidate(candidate).catch(() => {});
  }

  private onMeta(raw: string) {
    try {
      const message = JSON.parse(raw) as { type: string; monitors?: MetaMonitor[] };
      if (message.type === "meta" && Array.isArray(message.monitors)) {
        this.metaOrder = message.monitors;
        const session = this.state.session;
        if (session) this.setSession({ tiles: this.orderTiles(session.tiles) });
        this.sendView();
      }
    } catch {
      /* ignore */
    }
  }

  /** Applies host-provided labels/order to whatever streams have arrived. */
  private orderTiles(tiles: Tile[]): Tile[] {
    const labelled = tiles.map((tile) => {
      const info = this.metaOrder.find((m) => m.stream_id === tile.stream_id);
      return info ? { ...tile, monitor_id: info.monitor_id, label: info.label, w: info.w, h: info.h } : tile;
    });
    const rank = (tile: Tile) => {
      const index = this.metaOrder.findIndex((m) => m.stream_id === tile.stream_id);
      return index === -1 ? Number.MAX_SAFE_INTEGER : index;
    };
    return [...labelled].sort((a, b) => rank(a) - rank(b));
  }

  /** Tells the host which screen to prioritise — bandwidth only; this is not remote control. */
  private sendView() {
    const session = this.state.session;
    if (!session || this.meta?.readyState !== "open") return;
    const focused = session.tiles[session.focus];
    this.meta.send(
      JSON.stringify({ type: "view", mode: session.mode, monitor_id: focused?.monitor_id ?? undefined }),
    );
  }

  setView(mode: "grid" | "single", focus?: number) {
    const session = this.state.session;
    if (!session) return;
    this.setSession({ mode, focus: focus ?? session.focus });
    this.sendView();
  }

  /** User pressed "stop watching". */
  leave() {
    this.teardown(null, true);
  }

  private teardown(notice: string | null, notifyRelay = false) {
    const session = this.state.session;
    if (this.disconnectTimer) clearTimeout(this.disconnectTimer);
    this.disconnectTimer = null;
    if (this.connectTimer) clearTimeout(this.connectTimer);
    this.connectTimer = null;
    if (session?.session_id && notifyRelay) this.relay?.send({ type: "session-end", session_id: session.session_id });
    this.meta?.close();
    this.meta = null;
    this.pc?.close();
    this.pc = null;
    this.queuedCandidates = [];
    this.metaOrder = [];
    this.set({ session: null, ...(notice ? { notice } : {}) });
    this.refresh();
  }
}

function endReasonText(reason: string): string {
  switch (reason) {
    case "host-ended":
      return "The owner stopped sharing.";
    case "host-offline":
      return "That PC went offline.";
    case "host-replaced":
      return "That PC reconnected. Try again.";
    case "timeout":
      return "No response from the PC.";
    default:
      return "The session ended.";
  }
}

export const viewer = new ViewerController();
