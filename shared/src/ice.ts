import type { IceServer } from "./protocol";

/**
 * Free defaults so VIEX works out of the box. Both are editable in Settings
 * (Host and Viewer). OpenRelay is a shared public TURN — fine for personal use;
 * for reliability run your own coturn or set `VIEX_ICE_SERVERS` on the Relay.
 */
export const DEFAULT_ICE_SERVERS: IceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  {
    urls: [
      "turn:openrelay.metered.ca:80",
      "turn:openrelay.metered.ca:443",
      "turns:openrelay.metered.ca:443?transport=tcp",
    ],
    username: "openrelayproject",
    credential: "openrelayproject",
  },
];

/** Parses the Settings text area (JSON array) — returns null when it is not a valid ICE list. */
export function parseIceServers(text: string): IceServer[] | null {
  try {
    const value = JSON.parse(text);
    if (!Array.isArray(value)) return null;
    for (const entry of value) {
      if (!entry || typeof entry !== "object") return null;
      const urls = (entry as IceServer).urls;
      const ok = typeof urls === "string" || (Array.isArray(urls) && urls.every((u) => typeof u === "string"));
      if (!ok) return null;
    }
    return value as IceServer[];
  } catch {
    return null;
  }
}

/**
 * Picks the ICE servers to use: the user's custom list wins, then whatever the
 * Relay operator configured, then the shipped defaults.
 */
export function resolveIceServers(custom: IceServer[] | null, fromRelay: IceServer[] | null): IceServer[] {
  if (custom && custom.length > 0) return custom;
  if (fromRelay && fromRelay.length > 0) return fromRelay;
  return DEFAULT_ICE_SERVERS;
}
