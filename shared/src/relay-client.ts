import type { ClientMessage, HostHello, IceServer, ServerMessage, ViewerHello } from "./protocol";
import { CLOSE_CODES } from "./protocol";

export type RelayStatus = "connecting" | "online" | "offline" | "auth-failed";

export class RelayAuthError extends Error {
  constructor(
    message: string,
    readonly kind: "wrong-password" | "rate-limited" | "unreachable",
  ) {
    super(message);
  }
}

/** "my-relay.onrender.com" -> "https://my-relay.onrender.com" (no trailing slash). */
export function normalizeServerUrl(input: string): string {
  let url = input.trim();
  if (!url) return "";
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(url)) {
    const isLocal = /^(localhost|127\.|\[::1\]|10\.|192\.168\.)/i.test(url);
    url = `${isLocal ? "http" : "https"}://${url}`;
  }
  return url.replace(/\/+$/, "");
}

export const toWebSocketUrl = (serverUrl: string) => `${serverUrl.replace(/^http/i, "ws")}/ws`;

/** Exchanges the password for a short-lived token (`POST /auth`). */
export async function authenticate(serverUrl: string, password: string, timeoutMs = 70_000): Promise<string> {
  const controller = new AbortController();
  // Render's free tier can need ~50s to wake up, so be patient.
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${serverUrl}/auth`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password }),
      signal: controller.signal,
    });
    if (res.status === 401) throw new RelayAuthError("Wrong password.", "wrong-password");
    if (res.status === 429) throw new RelayAuthError("Too many attempts. Try again in a few minutes.", "rate-limited");
    if (!res.ok) throw new RelayAuthError(`The server answered ${res.status}.`, "unreachable");
    const body = (await res.json()) as { token?: string };
    if (!body.token) throw new RelayAuthError("The server did not return a token.", "unreachable");
    return body.token;
  } catch (error) {
    if (error instanceof RelayAuthError) throw error;
    throw new RelayAuthError("Could not reach the server. Check the URL and your connection.", "unreachable");
  } finally {
    clearTimeout(timer);
  }
}

export interface RelayClientOptions {
  serverUrl: string;
  password: string;
  /** Builds the hello message once a token is available. */
  hello: (token: string) => HostHello | ViewerHello;
  onMessage: (message: ServerMessage) => void;
  onStatus: (status: RelayStatus, detail?: string) => void;
}

/**
 * Keeps one authenticated WebSocket to the Relay alive: re-authenticates when a
 * token expires, reconnects with backoff, and reports status to the UI.
 */
export class RelayClient {
  private socket: WebSocket | null = null;
  private stopped = false;
  private attempt = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  iceServers: IceServer[] | null = null;

  constructor(private readonly options: RelayClientOptions) {}

  start() {
    this.stopped = false;
    void this.connect();
  }

  stop() {
    this.stopped = true;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.socket?.close(1000);
    this.socket = null;
  }

  send(message: ClientMessage) {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(message));
  }

  get isOpen() {
    return this.socket?.readyState === WebSocket.OPEN;
  }

  private async connect() {
    if (this.stopped) return;
    this.options.onStatus("connecting");
    let token: string;
    try {
      token = await authenticate(this.options.serverUrl, this.options.password);
    } catch (error) {
      if (this.stopped) return;
      if (error instanceof RelayAuthError && error.kind === "wrong-password") {
        this.options.onStatus("auth-failed", error.message);
        return; // Retrying a wrong password only trips the rate limiter.
      }
      this.options.onStatus("offline", error instanceof Error ? error.message : String(error));
      this.scheduleRetry();
      return;
    }
    if (this.stopped) return;

    const socket = new WebSocket(toWebSocketUrl(this.options.serverUrl));
    this.socket = socket;
    socket.onopen = () => socket.send(JSON.stringify(this.options.hello(token)));
    socket.onmessage = (event) => {
      let message: ServerMessage;
      try {
        message = JSON.parse(String(event.data));
      } catch {
        return;
      }
      if (message.type === "welcome") {
        this.attempt = 0;
        this.iceServers = message.ice_servers;
        this.options.onStatus("online");
      }
      this.options.onMessage(message);
    };
    socket.onclose = (event) => {
      if (this.socket === socket) this.socket = null;
      if (this.stopped) return;
      if (event.code === CLOSE_CODES.REPLACED) {
        this.options.onStatus("offline", "Another instance connected with the same device id.");
        return;
      }
      this.options.onStatus("offline", event.reason || undefined);
      this.scheduleRetry();
    };
    socket.onerror = () => socket.close();
  }

  private scheduleRetry() {
    if (this.stopped) return;
    const delay = Math.min(30_000, 1000 * 2 ** this.attempt++);
    this.retryTimer = setTimeout(() => void this.connect(), delay);
  }
}
