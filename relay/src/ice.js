/**
 * Builds the ICE (STUN/TURN) list the Relay hands to every Host and Viewer in `welcome`.
 * Clients that have their own custom list in Settings still win over this.
 *
 * Sources, combined in this order (all optional):
 *   VIEX_ICE_SERVERS                          JSON array, used as-is
 *   VIEX_TURN_URL (+ _USERNAME, _CREDENTIAL)  one or more comma-separated turn:/turns: URLs (your own coturn)
 *   METERED_DOMAIN + METERED_API_KEY          free TURN from metered.ca (credentials fetched + cached)
 *   CLOUDFLARE_TURN_KEY_ID + CLOUDFLARE_TURN_API_TOKEN   Cloudflare Realtime TURN (credentials generated + cached)
 */

const CACHE_MS = 30 * 60 * 1000;

async function fetchJson(url, init, timeoutMs = 8000) {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/** @returns {null | (() => Promise<any[]|null>)} */
export function createIceProvider(env = process.env, log = () => {}) {
  /** @type {any[]} */
  const fixed = [];
  if (env.VIEX_ICE_SERVERS) {
    try {
      const parsed = JSON.parse(env.VIEX_ICE_SERVERS);
      if (Array.isArray(parsed)) fixed.push(...parsed);
      else log("VIEX_ICE_SERVERS must be a JSON array; ignoring it.");
    } catch {
      log("VIEX_ICE_SERVERS is not valid JSON; ignoring it.");
    }
  }
  if (env.VIEX_TURN_URL) {
    const urls = env.VIEX_TURN_URL.split(",").map((u) => u.trim()).filter(Boolean);
    fixed.push({ urls, username: env.VIEX_TURN_USERNAME ?? "", credential: env.VIEX_TURN_CREDENTIAL ?? "" });
  }

  const metered = env.METERED_DOMAIN && env.METERED_API_KEY ? { domain: env.METERED_DOMAIN, key: env.METERED_API_KEY } : null;
  const cloudflare =
    env.CLOUDFLARE_TURN_KEY_ID && env.CLOUDFLARE_TURN_API_TOKEN
      ? { id: env.CLOUDFLARE_TURN_KEY_ID, token: env.CLOUDFLARE_TURN_API_TOKEN }
      : null;

  if (fixed.length === 0 && !metered && !cloudflare) return null;
  if (!fixed.some((s) => [].concat(s.urls).some((u) => String(u).startsWith("stun:")))) {
    fixed.unshift({ urls: "stun:stun.l.google.com:19302" });
  }

  let cache = null;
  let cacheAt = 0;
  let inflight = null;

  const load = async () => {
    const list = [...fixed];
    if (metered) {
      try {
        const host = metered.domain.includes(".") ? metered.domain : `${metered.domain}.metered.live`;
        const servers = await fetchJson(`https://${host}/api/v1/turn/credentials?apiKey=${encodeURIComponent(metered.key)}`);
        if (Array.isArray(servers)) list.push(...servers);
      } catch (error) {
        log(`Metered TURN fetch failed: ${error.message}`);
      }
    }
    if (cloudflare) {
      try {
        const body = await fetchJson(
          `https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(cloudflare.id)}/credentials/generate-ice-servers`,
          {
            method: "POST",
            headers: { authorization: `Bearer ${cloudflare.token}`, "content-type": "application/json" },
            body: JSON.stringify({ ttl: 86400 }),
          },
        );
        if (Array.isArray(body.iceServers)) list.push(...body.iceServers);
      } catch (error) {
        log(`Cloudflare TURN fetch failed: ${error.message}`);
      }
    }
    return list;
  };

  return async () => {
    if (cache && Date.now() - cacheAt < CACHE_MS) return cache;
    inflight ??= load()
      .then((list) => {
        cache = list;
        cacheAt = Date.now();
        return list;
      })
      .finally(() => {
        inflight = null;
      });
    return inflight;
  };
}
