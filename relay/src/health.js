/** Tiny HTTP helpers: CORS, JSON replies, and the /health endpoint. */

export const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "content-type",
  "access-control-max-age": "86400",
};

export function sendJson(res, status, body) {
  res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store", ...CORS_HEADERS });
  res.end(JSON.stringify(body));
}

/** GET /health — hit this from an EXTERNAL pinger (UptimeRobot / cron-job.org) to keep Render awake. */
export function handleHealth(res, registry) {
  sendJson(res, 200, {
    ok: true,
    service: "viex-relay",
    uptime: Math.round(process.uptime()),
    hosts: registry.hosts.size,
  });
}

export function readJsonBody(req, limit = 4096) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error("body too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"));
      } catch {
        reject(new Error("invalid json"));
      }
    });
    req.on("error", reject);
  });
}
