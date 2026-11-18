/**
 * VIEX signaling protocol — JSON over WebSocket (`/ws`).
 *
 * There is intentionally NO input/control message anywhere in this protocol:
 * VIEX is view-only by design.
 */

export interface MonitorInfo {
  id: number;
  label: string;
  w: number;
  h: number;
}

export interface DeviceInfo {
  device_id: string;
  name: string;
  status: "online";
  /** True while a viewer already holds a pending or live session. */
  busy: boolean;
  monitors: MonitorInfo[];
}

export type IceServer = { urls: string | string[]; username?: string; credential?: string };

// ---- client -> relay -------------------------------------------------------

export type HostHello = {
  type: "hello";
  role: "host";
  token: string;
  device_id: string;
  name: string;
  monitors: MonitorInfo[];
};

export type ViewerHello = {
  type: "hello";
  role: "viewer";
  token: string;
  viewer_id: string;
  viewer_name: string;
};

export type ClientMessage =
  | HostHello
  | ViewerHello
  | { type: "update-monitors"; monitors: MonitorInfo[] }
  | { type: "list-devices" }
  | { type: "connect-request"; target: string }
  | { type: "approved"; session_id: string }
  | { type: "rejected"; session_id: string; reason?: string }
  | { type: "offer"; session_id: string; sdp: RTCSessionDescriptionInit }
  | { type: "answer"; session_id: string; sdp: RTCSessionDescriptionInit }
  | { type: "ice-candidate"; session_id: string; candidate: RTCIceCandidateInit }
  | { type: "session-end"; session_id: string };

// ---- relay -> client -------------------------------------------------------

export type ServerMessage =
  | { type: "welcome"; role: "host" | "viewer"; ice_servers: IceServer[] | null }
  | { type: "device-list"; devices: DeviceInfo[] }
  | { type: "connect-request"; session_id: string; viewer_id: string; viewer_name: string }
  | { type: "request-sent"; session_id: string; target: string }
  | { type: "approved"; session_id: string }
  | { type: "rejected"; session_id: string; reason: string }
  | { type: "offer"; session_id: string; sdp: RTCSessionDescriptionInit }
  | { type: "answer"; session_id: string; sdp: RTCSessionDescriptionInit }
  | { type: "ice-candidate"; session_id: string; candidate: RTCIceCandidateInit }
  | { type: "session-end"; session_id: string; reason: string }
  | { type: "error"; code: "offline" | "busy" | string; message: string };

/** Relay WebSocket close codes. */
export const CLOSE_CODES = {
  UNAUTHORIZED: 4001,
  REPLACED: 4002,
  BAD_REQUEST: 4003,
  RATE_LIMITED: 4004,
} as const;

/** How the host decides about an incoming request. Stored per viewer, locally on the host only. */
export type PermissionMode = "ask" | "auto-approve" | "quiet";

export interface TrustedViewer {
  viewer_id: string;
  name: string;
  mode: Exclude<PermissionMode, "ask">;
  added_at: number;
}
