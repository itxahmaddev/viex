import { createServer } from "node:http";
import { existsSync, createReadStream, statSync } from "node:fs";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";
import { Auth } from "./auth.js";
import { Registry } from "./registry.js";
import { attachSignaling } from "./signaling.js";
import { CORS_HEADERS, handleHealth, readJsonBody, sendJson } from "./health.js";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".json": "application/json",
  ".woff2": "font/woff2",
  ".webmanifest": "application/manifest+json",
};

/**
 * Builds (but does not start) a Relay. Exported so tests can run it on a random port.
 * @param {{password: string, viewerDir?: string|null, iceServers?: any[]|null, trustProxy?: boolean, quiet?: boolean}} options
 */
export function createRelay({ password, viewerDir = null, iceServers = null, trustProxy = false, quiet = false }) {
  const auth = new Auth(password);
  const registry = new Registry();
  const log = (line) => {
    if (!quiet) console.log(`[viex-relay] ${line}`);
  };

  const clientIp = (req) => {
    if (trustProxy) {
      const forwarded = req.headers["x-forwarded-for"];
      if (typeof forwarded === "string" && forwarded) return forwarded.split(",")[0].trim();
    }
    return req.socket.remoteAddress ?? "unknown";
  };

  const serveStatic = (req, res) => {
    if (!viewerDir || (req.method !== "GET" && req.method !== "HEAD")) {
      return sendJson(res, 404, { error: "not found" });
    }
    const root = resolve(viewerDir);
    const pathname = decodeURIComponent(new URL(req.url, "http://x").pathname);
    let file = normalize(join(root, pathname));
    if (file !== root && !file.startsWith(root + sep)) return sendJson(res, 403, { error: "forbidden" });
    if (!existsSync(file) || statSync(file).isDirectory()) file = join(root, "index.html");
    if (!existsSync(file)) return sendJson(res, 404, { error: "not found" });
    res.writeHead(200, {
      "content-type": MIME[extname(file)] ?? "application/octet-stream",
      "cache-control": file.endsWith("index.html") ? "no-cache" : "public, max-age=3600",
    });
    if (req.method === "HEAD") return res.end();
    createReadStream(file).pipe(res);
  };

  const server = createServer(async (req, res) => {
    const { pathname } = new URL(req.url, "http://x");
    if (req.method === "OPTIONS") {
      res.writeHead(204, CORS_HEADERS);
      return res.end();
    }
    if (pathname === "/health" && (req.method === "GET" || req.method === "HEAD")) return handleHealth(res, registry);

    if (pathname === "/auth" && req.method === "POST") {
      const ip = clientIp(req);
      if (auth.isBlocked(ip)) return sendJson(res, 429, { error: "too many attempts, try again later" });
      let body;
      try {
        body = await readJsonBody(req);
      } catch {
        return sendJson(res, 400, { error: "bad request" });
      }
      if (!auth.checkPassword(body.password)) {
        auth.recordFailure(ip);
        return sendJson(res, 401, { error: "wrong password" });
      }
      auth.clearFailures(ip);
      return sendJson(res, 200, { token: auth.issueToken(), expires_in: auth.tokenTtlSeconds });
    }

    return serveStatic(req, res);
  });

  const wss = new WebSocketServer({ server, path: "/ws", maxPayload: 256 * 1024 });
  attachSignaling(wss, { auth, registry, iceServers, log });
  server.on("close", () => wss.close());

  return { server, wss, registry, auth };
}

function main() {
  const password = process.env.VIEX_PASSWORD ?? "";
  if (password.length < 8) {
    console.error(
      "[viex-relay] VIEX_PASSWORD is missing or shorter than 8 characters.\n" +
        "Set it as an environment variable before starting (see docs/DEPLOY-RELAY.md).",
    );
    process.exit(1);
  }

  let iceServers = null;
  if (process.env.VIEX_ICE_SERVERS) {
    try {
      iceServers = JSON.parse(process.env.VIEX_ICE_SERVERS);
    } catch {
      console.error("[viex-relay] VIEX_ICE_SERVERS is not valid JSON; ignoring it.");
    }
  }

  const here = fileURLToPath(new URL(".", import.meta.url));
  const defaultViewerDir = resolve(here, "../public");
  const viewerDir = process.env.VIEX_VIEWER_DIR ?? (existsSync(defaultViewerDir) ? defaultViewerDir : null);

  const { server } = createRelay({
    password,
    viewerDir,
    iceServers,
    trustProxy: process.env.VIEX_TRUST_PROXY ? process.env.VIEX_TRUST_PROXY !== "0" : Boolean(process.env.RENDER),
  });

  const port = Number(process.env.PORT) || 8787;
  server.listen(port, "0.0.0.0", () => {
    console.log(`[viex-relay] listening on :${port}${viewerDir ? " (serving web viewer)" : ""}`);
  });

  const shutdown = () => server.close(() => process.exit(0));
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
