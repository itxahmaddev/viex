import { isValidId, sanitizeMonitors } from "./registry.js";

const HELLO_TIMEOUT_MS = 8000;
const REQUEST_TIMEOUT_MS = 60_000;
const RATE_WINDOW_MS = 10_000;
const RATE_MAX_MESSAGES = 400;

/** WebSocket close codes the clients act on. */
export const CLOSE = {
  UNAUTHORIZED: 4001,
  REPLACED: 4002,
  BAD_REQUEST: 4003,
  RATE_LIMITED: 4004,
};

const send = (socket, message) => {
  if (socket.readyState === 1) socket.send(JSON.stringify(message));
};

const small = (value, max) => typeof value === "string" && value.length <= max;
const isDescription = (sdp) => sdp && typeof sdp === "object" && small(sdp.sdp, 65_536) && small(sdp.type, 16);
const isCandidate = (c) => c && typeof c === "object" && JSON.stringify(c).length <= 4096;

/**
 * Wires the WebSocket server: handshake auth, host/viewer registration,
 * connect requests and SDP/ICE relaying. Media never passes through here.
 */
export function attachSignaling(wss, { auth, registry, iceServers = null, log = () => {} }) {
  const broadcastDevices = () => {
    const devices = registry.listDevices();
    for (const viewer of registry.viewers) send(viewer, { type: "device-list", devices });
  };

  const endSession = (sessionId, { reason, notifyHost = true, notifyViewer = true } = {}) => {
    const session = registry.endSession(sessionId);
    if (!session) return;
    const message = { type: "session-end", session_id: sessionId, reason: reason ?? "ended" };
    if (notifyViewer) send(session.viewer, message);
    const host = registry.hosts.get(session.hostId);
    if (notifyHost && host) send(host.socket, message);
    broadcastDevices();
  };

  wss.on("connection", (socket) => {
    const ctx = { authed: false, role: null, deviceId: null, viewerId: null, windowStart: Date.now(), count: 0 };
    socket.ctx = ctx;
    socket.isAlive = true;
    socket.on("pong", () => {
      socket.isAlive = true;
    });

    const helloTimer = setTimeout(() => {
      if (!ctx.authed) socket.close(CLOSE.UNAUTHORIZED, "hello timeout");
    }, HELLO_TIMEOUT_MS);

    socket.on("message", (raw) => {
      const now = Date.now();
      if (now - ctx.windowStart > RATE_WINDOW_MS) {
        ctx.windowStart = now;
        ctx.count = 0;
      }
      if (++ctx.count > RATE_MAX_MESSAGES) return socket.close(CLOSE.RATE_LIMITED, "rate limited");

      let msg;
      try {
        msg = JSON.parse(raw.toString("utf8"));
      } catch {
        return socket.close(CLOSE.BAD_REQUEST, "invalid json");
      }
      if (!msg || typeof msg.type !== "string") return socket.close(CLOSE.BAD_REQUEST, "invalid message");

      if (msg.type === "hello") return void handleHello(msg);
      if (!ctx.authed) return socket.close(CLOSE.UNAUTHORIZED, "hello first");

      if (ctx.role === "host") handleHost(msg);
      else handleViewer(msg);
    });

    async function handleHello(msg) {
      if (ctx.authed) return;
      if (!auth.verifyToken(msg.token)) return socket.close(CLOSE.UNAUTHORIZED, "invalid token");

      if (msg.role === "host") {
        if (!isValidId(msg.device_id) || !small(msg.name, 64) || !msg.name) {
          return socket.close(CLOSE.BAD_REQUEST, "invalid host registration");
        }
        const previous = registry.addHost({
          device_id: msg.device_id,
          name: msg.name,
          monitors: sanitizeMonitors(msg.monitors),
          socket,
        });
        if (previous && previous.socket !== socket) {
          if (previous.session_id) endSession(previous.session_id, { reason: "host-replaced" });
          previous.socket.close(CLOSE.REPLACED, "replaced by a newer connection");
        }
        ctx.role = "host";
        ctx.deviceId = msg.device_id;
        log(`host online: ${msg.name} (${msg.device_id})`);
      } else if (msg.role === "viewer") {
        if (!isValidId(msg.viewer_id)) return socket.close(CLOSE.BAD_REQUEST, "invalid viewer id");
        ctx.role = "viewer";
        ctx.viewerId = msg.viewer_id;
        ctx.viewerName = small(msg.viewer_name, 64) && msg.viewer_name ? msg.viewer_name : "Viewer";
        registry.viewers.add(socket);
      } else {
        return socket.close(CLOSE.BAD_REQUEST, "unknown role");
      }

      ctx.authed = true;
      clearTimeout(helloTimer);
      let ice = null;
      try {
        ice = typeof iceServers === "function" ? await iceServers() : iceServers;
      } catch (error) {
        log(`could not load ICE servers: ${error.message}`);
      }
      send(socket, { type: "welcome", role: ctx.role, ice_servers: ice });
      if (ctx.role === "viewer") send(socket, { type: "device-list", devices: registry.listDevices() });
      broadcastDevices();
    }

    function handleHost(msg) {
      switch (msg.type) {
        case "update-monitors": {
          const host = registry.hosts.get(ctx.deviceId);
          if (host && host.socket === socket) {
            host.monitors = sanitizeMonitors(msg.monitors);
            broadcastDevices();
          }
          break;
        }
        case "approved":
        case "rejected": {
          const session = registry.sessions.get(msg.session_id);
          if (!session || session.hostId !== ctx.deviceId || session.state !== "pending") return;
          if (msg.type === "approved") {
            session.state = "active";
            if (session.timer) clearTimeout(session.timer);
            session.timer = null;
            send(session.viewer, { type: "approved", session_id: session.id });
            broadcastDevices();
          } else {
            send(session.viewer, {
              type: "rejected",
              session_id: session.id,
              reason: small(msg.reason, 120) ? msg.reason : "rejected",
            });
            registry.endSession(session.id);
            broadcastDevices();
          }
          break;
        }
        case "offer":
        case "ice-candidate": {
          const session = registry.sessions.get(msg.session_id);
          if (!session || session.hostId !== ctx.deviceId || session.state !== "active") return;
          if (msg.type === "offer" && !isDescription(msg.sdp)) return;
          if (msg.type === "ice-candidate" && !isCandidate(msg.candidate)) return;
          send(session.viewer, { type: msg.type, session_id: session.id, sdp: msg.sdp, candidate: msg.candidate });
          break;
        }
        case "session-end": {
          const session = registry.sessions.get(msg.session_id);
          if (session && session.hostId === ctx.deviceId) endSession(session.id, { reason: "host-ended", notifyHost: false });
          break;
        }
        default:
          break;
      }
    }

    function handleViewer(msg) {
      switch (msg.type) {
        case "list-devices":
          send(socket, { type: "device-list", devices: registry.listDevices() });
          break;
        case "connect-request": {
          const host = registry.hosts.get(msg.target);
          if (!host) return send(socket, { type: "error", code: "offline", message: "That device is offline." });
          if (host.session_id) return send(socket, { type: "error", code: "busy", message: "That device already has a viewer." });
          const session = registry.createSession(host.device_id, socket, ctx.viewerId);
          session.timer = setTimeout(() => {
            if (session.state === "pending") {
              send(session.viewer, { type: "rejected", session_id: session.id, reason: "No response from the device." });
              send(host.socket, { type: "session-end", session_id: session.id, reason: "timeout" });
              registry.endSession(session.id);
              broadcastDevices();
            }
          }, REQUEST_TIMEOUT_MS);
          send(host.socket, {
            type: "connect-request",
            session_id: session.id,
            viewer_id: ctx.viewerId,
            viewer_name: ctx.viewerName,
          });
          send(socket, { type: "request-sent", session_id: session.id, target: host.device_id });
          broadcastDevices();
          break;
        }
        case "answer":
        case "ice-candidate": {
          const session = registry.sessions.get(msg.session_id);
          if (!session || session.viewer !== socket || session.state !== "active") return;
          if (msg.type === "answer" && !isDescription(msg.sdp)) return;
          if (msg.type === "ice-candidate" && !isCandidate(msg.candidate)) return;
          const host = registry.hosts.get(session.hostId);
          if (host) send(host.socket, { type: msg.type, session_id: session.id, sdp: msg.sdp, candidate: msg.candidate });
          break;
        }
        case "session-end": {
          const session = registry.sessions.get(msg.session_id);
          if (session && session.viewer === socket) endSession(session.id, { reason: "viewer-ended", notifyViewer: false });
          break;
        }
        default:
          break;
      }
    }

    socket.on("close", () => {
      clearTimeout(helloTimer);
      if (ctx.role === "host") {
        const host = registry.hosts.get(ctx.deviceId);
        if (host && host.socket === socket) {
          if (host.session_id) endSession(host.session_id, { reason: "host-offline", notifyHost: false });
          registry.removeHost(ctx.deviceId, socket);
          log(`host offline: ${host.name}`);
          broadcastDevices();
        }
      } else if (ctx.role === "viewer") {
        registry.viewers.delete(socket);
        for (const session of registry.sessionsForViewer(socket)) {
          endSession(session.id, { reason: "viewer-left", notifyViewer: false });
        }
      }
    });

    socket.on("error", () => socket.terminate());
  });

  // Drop half-open sockets so "online" always means online.
  const heartbeat = setInterval(() => {
    for (const socket of wss.clients) {
      if (socket.isAlive === false) {
        socket.terminate();
        continue;
      }
      socket.isAlive = false;
      socket.ping();
    }
  }, 30_000);
  wss.on("close", () => clearInterval(heartbeat));
}
