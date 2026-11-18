import { Channel, invoke } from "@tauri-apps/api/core";
import { disable, enable } from "@tauri-apps/plugin-autostart";
import {
  RelayClient,
  authenticate,
  normalizeServerUrl,
  parseIceServers,
  resolveIceServers,
  type MonitorInfo,
  type RelayStatus,
  type ServerMessage,
  type TrustedViewer,
} from "@viex/shared";

export interface HostConfig {
  device_id: string;
  device_name: string;
  server_url: string;
  trusted_viewers: TrustedViewer[];
  custom_ice: string;
  theme: "system" | "light" | "dark";
  setup_complete: boolean;
}

export interface LocalMonitor extends MonitorInfo {
  x: number;
  y: number;
  primary: boolean;
}

export interface PendingRequest {
  session_id: string;
  viewer_id: string;
  viewer_name: string;
}

export interface ActiveSession extends PendingRequest {
  quiet: boolean;
  phase: "connecting" | "live";
}

export interface HostState {
  ready: boolean;
  config: HostConfig | null;
  relay: RelayStatus;
  relayDetail: string | null;
  monitors: LocalMonitor[];
  pending: PendingRequest | null;
  session: ActiveSession | null;
  toast: string | null;
}

type ViewHint = { type: "view"; mode: "grid" | "single"; monitor_id?: number };

interface CaptureStream {
  monitor: LocalMonitor;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  track: CanvasCaptureMediaStreamTrack;
  stream: MediaStream;
  decoding: boolean;
}

const MONITOR_POLL_MS = 20_000;

/**
 * Owns everything the Host does: keeps the Relay connection, runs the permission engine,
 * and — for an approved viewer — streams one WebRTC video track per monitor.
 *
 * Capture happens in Rust (src-tauri/src/capture.rs). Frames arrive here as JPEG bytes,
 * are painted to a canvas, and published with `canvas.captureStream()`. The webview's own
 * WebRTC stack does the encoding, congestion control and DTLS-SRTP encryption.
 */
class HostController {
  private state: HostState = {
    ready: false,
    config: null,
    relay: "offline",
    relayDetail: null,
    monitors: [],
    pending: null,
    session: null,
    toast: null,
  };
  private listeners = new Set<() => void>();
  private relay: RelayClient | null = null;
  private pc: RTCPeerConnection | null = null;
  private meta: RTCDataChannel | null = null;
  private streams: CaptureStream[] = [];
  private queuedCandidates: RTCIceCandidateInit[] = [];
  private disconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private monitorTimer: ReturnType<typeof setInterval> | null = null;
  private toastTimer: ReturnType<typeof setTimeout> | null = null;

  /* ---------- store ---------- */

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  getState = () => this.state;

  private set(patch: Partial<HostState>) {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }

  private toast(message: string) {
    this.set({ toast: message });
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.set({ toast: null }), 5000);
  }

  /* ---------- lifecycle ---------- */

  async init() {
    const config = await invoke<HostConfig>("get_config");
    this.set({ config, ready: true });
    this.applyTheme(config.theme);
    if (config.setup_complete) await this.startRelay();
  }

  private applyTheme(theme: HostConfig["theme"]) {
    if (theme === "system") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = theme;
  }

  async saveConfig(patch: Partial<HostConfig>) {
    const config = { ...this.state.config!, ...patch };
    await invoke("save_config", { config });
    this.set({ config });
    if (patch.theme) this.applyTheme(patch.theme);
  }

  /** First-run / change-server flow. Throws a user-readable Error when the password or URL is wrong. */
  async completeSetup(input: { serverUrl: string; password: string; deviceName: string }) {
    const serverUrl = normalizeServerUrl(input.serverUrl);
    if (!serverUrl) throw new Error("Enter your server URL.");
    if (!input.password) throw new Error("Enter the server password.");
    await authenticate(serverUrl, input.password); // throws RelayAuthError with a friendly message
    await invoke("set_secret", { value: input.password });
    await this.saveConfig({
      server_url: serverUrl,
      device_name: input.deviceName.trim() || this.state.config!.device_name,
      setup_complete: true,
    });
    try {
      await enable(); // zero-click from now on: start with the PC
    } catch {
      /* autostart is a convenience; the System page can retry */
    }
    await this.startRelay();
  }

  async resetSetup() {
    this.endSession("host-ended");
    this.relay?.stop();
    this.relay = null;
    await invoke("clear_secret");
    try {
      await disable();
    } catch {
      /* ignore */
    }
    await this.saveConfig({ server_url: "", setup_complete: false });
    this.set({ relay: "offline", relayDetail: null });
  }

  /* ---------- relay ---------- */

  private async refreshMonitors(): Promise<boolean> {
    try {
      const monitors = await invoke<LocalMonitor[]>("list_monitors");
      const changed = JSON.stringify(monitors) !== JSON.stringify(this.state.monitors);
      if (changed) this.set({ monitors });
      return changed;
    } catch {
      return false;
    }
  }

  private wireMonitors(): MonitorInfo[] {
    return this.state.monitors.map(({ id, label, w, h }) => ({ id, label, w, h }));
  }

  async startRelay() {
    this.relay?.stop();
    const config = this.state.config;
    const password = await invoke<string | null>("get_secret");
    if (!config?.server_url || !password) return;
    await this.refreshMonitors();

    this.relay = new RelayClient({
      serverUrl: config.server_url,
      password,
      hello: (token) => ({
        type: "hello",
        role: "host",
        token,
        device_id: config.device_id,
        name: this.state.config?.device_name ?? config.device_name,
        monitors: this.wireMonitors(),
      }),
      onMessage: (message) => void this.onRelayMessage(message),
      onStatus: (relay, relayDetail) => {
        this.set({ relay, relayDetail: relayDetail ?? null });
        if (relay !== "online" && this.state.session) this.endSession("host-offline", false);
      },
    });
    this.relay.start();

    if (this.monitorTimer) clearInterval(this.monitorTimer);
    this.monitorTimer = setInterval(async () => {
      if (this.state.session) return;
      if (await this.refreshMonitors()) this.relay?.send({ type: "update-monitors", monitors: this.wireMonitors() });
    }, MONITOR_POLL_MS);
  }

  async renameDevice(name: string) {
    await this.saveConfig({ device_name: name });
    await this.startRelay(); // re-register under the new name
  }

  private async onRelayMessage(message: ServerMessage) {
    switch (message.type) {
      case "connect-request":
        return this.onConnectRequest(message);
      case "answer":
        return this.onAnswer(message.session_id, message.sdp);
      case "ice-candidate":
        return this.onRemoteCandidate(message.session_id, message.candidate);
      case "session-end": {
        if (this.state.pending?.session_id === message.session_id) this.set({ pending: null });
        if (this.state.session?.session_id === message.session_id) this.endSession(message.reason, false);
        return;
      }
      default:
        return;
    }
  }

  /* ---------- permission engine ---------- */

  private onConnectRequest(request: PendingRequest & { type: "connect-request" }) {
    const req: PendingRequest = {
      session_id: request.session_id,
      viewer_id: request.viewer_id,
      viewer_name: request.viewer_name,
    };
    if (this.state.session || this.state.pending) {
      this.relay?.send({ type: "rejected", session_id: req.session_id, reason: "This device is busy." });
      return;
    }
    const trusted = this.state.config?.trusted_viewers.find((v) => v.viewer_id === req.viewer_id);
    if (trusted?.mode === "quiet") {
      // Quiet Mode: no popup, no toast, no window. The live indicator still appears (live.rs).
      void this.startSession(req, true);
    } else if (trusted?.mode === "auto-approve") {
      this.toast(`${req.viewer_name} connected (Auto-Approve).`);
      void this.startSession(req, false);
    } else {
      this.set({ pending: req });
      void invoke("show_main_window");
    }
  }

  /** Ask mode: the user clicked Accept. `remember` stores the viewer as Auto-Approve. */
  async accept(remember: boolean) {
    const req = this.state.pending;
    if (!req) return;
    this.set({ pending: null });
    if (remember) await this.setTrust(req.viewer_id, req.viewer_name, "auto-approve");
    await this.startSession(req, false);
  }

  reject() {
    const req = this.state.pending;
    if (!req) return;
    this.relay?.send({ type: "rejected", session_id: req.session_id, reason: "The owner declined." });
    this.set({ pending: null });
  }

  async setTrust(viewerId: string, name: string, mode: "auto-approve" | "quiet" | null) {
    const others = this.state.config!.trusted_viewers.filter((v) => v.viewer_id !== viewerId);
    const trusted_viewers = mode
      ? [...others, { viewer_id: viewerId, name, mode, added_at: Date.now() }]
      : others;
    await this.saveConfig({ trusted_viewers });
  }

  /* ---------- streaming ---------- */

  private iceServers() {
    return resolveIceServers(parseIceServers(this.state.config?.custom_ice ?? ""), this.relay?.iceServers ?? null);
  }

  private async startSession(req: PendingRequest, quiet: boolean) {
    await this.refreshMonitors();
    const monitors = this.state.monitors;
    if (monitors.length === 0) {
      this.relay?.send({ type: "rejected", session_id: req.session_id, reason: "No screens available." });
      return;
    }

    this.set({ session: { ...req, quiet, phase: "connecting" } });
    this.relay?.send({ type: "approved", session_id: req.session_id });

    try {
      // The indicator comes up BEFORE any pixel leaves the machine, in every permission mode.
      await invoke("set_live", { live: true, viewer: req.viewer_name, screens: monitors.length });

      const pc = new RTCPeerConnection({ iceServers: this.iceServers() });
      this.pc = pc;
      this.queuedCandidates = [];

      const meta = pc.createDataChannel("meta", { negotiated: true, id: 0 });
      this.meta = meta;
      meta.onopen = () => this.sendMeta();
      meta.onmessage = (event) => this.onViewerMessage(String(event.data));

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          this.relay?.send({ type: "ice-candidate", session_id: req.session_id, candidate: event.candidate.toJSON() });
        }
      };
      pc.onconnectionstatechange = () => this.onConnectionState(req.session_id);

      this.streams = [];
      for (const monitor of monitors) {
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(2, Math.min(monitor.w, 1280));
        canvas.height = Math.max(2, Math.min(monitor.h, 720));
        const ctx = canvas.getContext("2d", { alpha: false })!;
        ctx.fillStyle = "#101215";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        const stream = canvas.captureStream(0);
        const track = stream.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack;
        pc.addTrack(track, stream);
        this.streams.push({ monitor, canvas, ctx, track, stream, decoding: false });
      }

      const profile = this.profileFor({ type: "view", mode: monitors.length > 1 ? "grid" : "single", monitor_id: monitors[0].id });
      for (const capture of this.streams) {
        const channel = new Channel<ArrayBuffer>();
        channel.onmessage = (data) => void this.paint(capture, data);
        const p = profile(capture.monitor.id);
        await invoke("start_capture", {
          monitorId: capture.monitor.id,
          fps: p.fps,
          maxWidth: p.maxWidth,
          quality: p.quality,
          onFrame: channel,
        });
      }

      await pc.setLocalDescription(await pc.createOffer());
      this.relay?.send({ type: "offer", session_id: req.session_id, sdp: pc.localDescription!.toJSON() });
    } catch (error) {
      this.toast(`Could not start sharing: ${error instanceof Error ? error.message : String(error)}`);
      this.endSession("error");
    }
  }

  private async paint(capture: CaptureStream, data: ArrayBuffer | number[]) {
    if (capture.decoding) return; // drop frames rather than queue them up
    capture.decoding = true;
    try {
      const bytes = data instanceof ArrayBuffer ? data : new Uint8Array(data).buffer;
      const bitmap = await createImageBitmap(new Blob([bytes], { type: "image/jpeg" }));
      if (capture.canvas.width !== bitmap.width || capture.canvas.height !== bitmap.height) {
        capture.canvas.width = bitmap.width;
        capture.canvas.height = bitmap.height;
      }
      capture.ctx.drawImage(bitmap, 0, 0);
      bitmap.close();
      capture.track.requestFrame();
    } catch {
      /* a corrupt frame is just skipped */
    } finally {
      capture.decoding = false;
    }
  }

  /** Quality per monitor for a given view hint: grid = everything small, single = focused one sharp, rest paused. */
  private profileFor(hint: ViewHint) {
    const count = this.streams.length || this.state.monitors.length || 1;
    return (monitorId: number) => {
      if (hint.mode === "single") {
        return monitorId === hint.monitor_id
          ? { fps: 15, maxWidth: 1920, quality: 70 }
          : { fps: 0, maxWidth: 640, quality: 50 };
      }
      return count <= 2 ? { fps: 10, maxWidth: 1280, quality: 60 } : { fps: 8, maxWidth: 960, quality: 55 };
    };
  }

  private sendMeta() {
    if (this.meta?.readyState !== "open") return;
    this.meta.send(
      JSON.stringify({
        type: "meta",
        monitors: this.streams.map((s) => ({
          stream_id: s.stream.id,
          monitor_id: s.monitor.id,
          label: s.monitor.label,
          w: s.monitor.w,
          h: s.monitor.h,
        })),
      }),
    );
  }

  /** The data channel carries view hints only (which screens to prioritise). There is no input path. */
  private onViewerMessage(raw: string) {
    let message: { type: "hello" } | ViewHint;
    try {
      message = JSON.parse(raw);
    } catch {
      return;
    }
    if (message.type === "hello") return this.sendMeta();
    if (message.type === "view" && (message.mode === "grid" || message.mode === "single")) {
      const profile = this.profileFor(message);
      for (const capture of this.streams) {
        const p = profile(capture.monitor.id);
        void invoke("set_capture_profile", {
          monitorId: capture.monitor.id,
          fps: p.fps,
          maxWidth: p.maxWidth,
          quality: p.quality,
        });
      }
    }
  }

  private async onAnswer(sessionId: string, sdp: RTCSessionDescriptionInit) {
    const pc = this.pc;
    if (!pc || this.state.session?.session_id !== sessionId) return;
    await pc.setRemoteDescription(sdp);
    for (const candidate of this.queuedCandidates.splice(0)) await pc.addIceCandidate(candidate).catch(() => {});
    // Best-effort bitrate cap so a phone on mobile data isn't flooded.
    for (const sender of pc.getSenders()) {
      try {
        const params = sender.getParameters();
        if (params.encodings?.length) {
          params.encodings[0].maxBitrate = 2_500_000;
          await sender.setParameters(params);
        }
      } catch {
        /* not supported everywhere */
      }
    }
  }

  private async onRemoteCandidate(sessionId: string, candidate: RTCIceCandidateInit) {
    if (this.state.session?.session_id !== sessionId || !this.pc) return;
    if (!this.pc.remoteDescription) this.queuedCandidates.push(candidate);
    else await this.pc.addIceCandidate(candidate).catch(() => {});
  }

  private onConnectionState(sessionId: string) {
    const pc = this.pc;
    if (!pc || this.state.session?.session_id !== sessionId) return;
    if (this.disconnectTimer) clearTimeout(this.disconnectTimer);
    switch (pc.connectionState) {
      case "connected": {
        const session = this.state.session;
        if (session) this.set({ session: { ...session, phase: "live" } });
        break;
      }
      case "disconnected":
        this.disconnectTimer = setTimeout(() => this.endSession("connection-lost"), 10_000);
        break;
      case "failed":
      case "closed":
        this.endSession("connection-lost");
        break;
      default:
        break;
    }
  }

  /** Ends the live session (or a half-built one). `notifyRelay=false` when the Relay already told us. */
  endSession(reason = "host-ended", notifyRelay = true) {
    const session = this.state.session;
    if (this.disconnectTimer) clearTimeout(this.disconnectTimer);
    this.disconnectTimer = null;
    if (!session && !this.pc) return;

    if (session && notifyRelay) this.relay?.send({ type: "session-end", session_id: session.session_id });
    void invoke("stop_all_captures");
    for (const capture of this.streams) capture.track.stop();
    this.streams = [];
    this.meta?.close();
    this.meta = null;
    this.pc?.close();
    this.pc = null;
    this.queuedCandidates = [];
    void invoke("set_live", { live: false, viewer: "", screens: 0 });
    this.set({ session: null });
    if (reason === "connection-lost") this.toast("The viewer disconnected.");
  }
}

export const host = new HostController();
