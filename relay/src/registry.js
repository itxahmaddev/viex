import { randomUUID } from "node:crypto";

const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export const isValidId = (value) => typeof value === "string" && ID_PATTERN.test(value);

/** Keeps only well-formed monitor descriptors and caps the list. */
export function sanitizeMonitors(monitors) {
  if (!Array.isArray(monitors)) return [];
  return monitors.slice(0, 16).map((m, index) => ({
    id: Number.isInteger(m?.id) ? m.id : index,
    label: String(m?.label ?? `Monitor ${index + 1}`).slice(0, 64),
    w: Math.max(0, Math.min(16384, Number(m?.w) || 0)),
    h: Math.max(0, Math.min(16384, Number(m?.h) || 0)),
  }));
}

/**
 * In-memory registry of connected hosts, viewers and live sessions.
 * No database: the device list is "who is connected right now".
 */
export class Registry {
  constructor() {
    /** @type {Map<string, {device_id: string, name: string, monitors: any[], socket: any, session_id: string|null}>} */
    this.hosts = new Map();
    /** @type {Set<any>} */
    this.viewers = new Set();
    /** @type {Map<string, {id: string, hostId: string, viewer: any, viewerId: string, state: 'pending'|'active', timer: NodeJS.Timeout|null}>} */
    this.sessions = new Map();
  }

  addHost({ device_id, name, monitors, socket }) {
    const previous = this.hosts.get(device_id);
    this.hosts.set(device_id, { device_id, name, monitors, socket, session_id: null });
    return previous ?? null;
  }

  removeHost(device_id, socket) {
    const host = this.hosts.get(device_id);
    if (host && host.socket === socket) {
      this.hosts.delete(device_id);
      return host;
    }
    return null;
  }

  /** Public device list sent to viewers (never includes sockets). */
  listDevices() {
    return [...this.hosts.values()].map((h) => ({
      device_id: h.device_id,
      name: h.name,
      status: "online",
      busy: h.session_id !== null,
      monitors: h.monitors,
    }));
  }

  createSession(hostId, viewer, viewerId) {
    const session = { id: randomUUID(), hostId, viewer, viewerId, state: "pending", timer: null };
    this.sessions.set(session.id, session);
    const host = this.hosts.get(hostId);
    if (host) host.session_id = session.id;
    return session;
  }

  endSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    if (session.timer) clearTimeout(session.timer);
    this.sessions.delete(sessionId);
    const host = this.hosts.get(session.hostId);
    if (host && host.session_id === sessionId) host.session_id = null;
    return session;
  }

  sessionsForViewer(socket) {
    return [...this.sessions.values()].filter((s) => s.viewer === socket);
  }
}
