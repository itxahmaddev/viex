import type { IceServer } from "./protocol";

/**
 * Built-in defaults: public STUN only. STUN lets most home networks connect directly, but it
 * CANNOT help when both sides are behind strict/carrier NAT (common on mobile data) — that needs a
 * TURN relay. There is no reliable free TURN that works without an account, so VIEX does not ship
 * one: set TURN on the Relay (METERED_*, CLOUDFLARE_TURN_*, VIEX_TURN_* or VIEX_ICE_SERVERS — see
 * docs/SETUP.md) and every Host/Viewer picks it up automatically, or paste your own list in Settings.
 */
export const DEFAULT_ICE_SERVERS: IceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun.cloudflare.com:3478" },
];

/** True when the list contains at least one TURN server. */
export function hasTurn(servers: IceServer[]): boolean {
  return servers.some((s) => (Array.isArray(s.urls) ? s.urls : [s.urls]).some((u) => /^turns?:/i.test(u)));
}

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
