import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { WebSocket } from "ws";
import { createRelay } from "../src/index.js";
import { Auth } from "../src/auth.js";

const PASSWORD = "correct-horse-battery";
let relay;
let base;

before(async () => {
  relay = createRelay({ password: PASSWORD, quiet: true, iceServers: [{ urls: "stun:example.test:3478" }] });
  await new Promise((resolve) => relay.server.listen(0, "127.0.0.1", resolve));
  base = `127.0.0.1:${relay.server.address().port}`;
});

after(() => {
  for (const client of relay.wss.clients) client.terminate();
  relay.server.close();
});

const getToken = async () => {
  const res = await fetch(`http://${base}/auth`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password: PASSWORD }),
  });
  assert.equal(res.status, 200);
  return (await res.json()).token;
};

/** Opens a socket and buffers messages so tests can await specific types. */
const connect = (hello) =>
  new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://${base}/ws`);
    const queue = [];
    const waiters = [];
    ws.on("message", (raw) => {
      const msg = JSON.parse(raw.toString());
      const index = waiters.findIndex((w) => w.type === msg.type);
      if (index >= 0) waiters.splice(index, 1)[0].resolve(msg);
      else queue.push(msg);
    });
    ws.next = (type) => {
      const index = queue.findIndex((m) => m.type === type);
      if (index >= 0) return Promise.resolve(queue.splice(index, 1)[0]);
      return new Promise((res, rej) => {
        const timer = setTimeout(() => rej(new Error(`timeout waiting for ${type}`)), 3000);
        waiters.push({ type, resolve: (m) => (clearTimeout(timer), res(m)) });
      });
    };
    ws.on("open", () => {
      ws.send(JSON.stringify(hello));
      resolve(ws);
    });
    ws.on("error", reject);
  });

test("GET /health returns ok", async () => {
  const res = await fetch(`http://${base}/health`);
  assert.equal(res.status, 200);
  assert.equal((await res.json()).ok, true);
});

test("POST /auth rejects a wrong password and accepts the right one", async () => {
  const bad = await fetch(`http://${base}/auth`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password: "nope" }),
  });
  assert.equal(bad.status, 401);
  assert.ok(await getToken());
});

test("tokens are signed, expire and reject tampering", () => {
  const auth = new Auth(PASSWORD);
  const token = auth.issueToken();
  assert.equal(auth.verifyToken(token), true);
  assert.equal(auth.verifyToken(token + "x"), false);
  assert.equal(auth.verifyToken(token, Date.now() + 13 * 3600 * 1000), false);
  assert.equal(new Auth("another-password").verifyToken(token), false);
});

test("a socket with a bad token is closed", async () => {
  const ws = await connect({ type: "hello", role: "viewer", viewer_id: "v-bad", token: "nope" });
  const code = await new Promise((resolve) => ws.on("close", resolve));
  assert.equal(code, 4001);
});

test("host registers, viewer connects, request is approved and SDP/ICE relay both ways", async () => {
  const token = await getToken();
  const monitors = [
    { id: 0, label: "Monitor 1", w: 2560, h: 1440 },
    { id: 1, label: "Monitor 2", w: 1920, h: 1080 },
  ];
  const host = await connect({ type: "hello", role: "host", token, device_id: "host-1", name: "Test-PC", monitors });
  const welcome = await host.next("welcome");
  assert.deepEqual(welcome.ice_servers, [{ urls: "stun:example.test:3478" }]);

  const viewer = await connect({ type: "hello", role: "viewer", token, viewer_id: "viewer-1", viewer_name: "Phone" });
  await viewer.next("welcome");
  let list = await viewer.next("device-list");
  while (!list.devices.some((d) => d.device_id === "host-1")) list = await viewer.next("device-list");
  const device = list.devices.find((d) => d.device_id === "host-1");
  assert.equal(device.name, "Test-PC");
  assert.equal(device.monitors.length, 2);

  viewer.send(JSON.stringify({ type: "connect-request", target: "host-1" }));
  const request = await host.next("connect-request");
  assert.equal(request.viewer_id, "viewer-1");
  assert.equal(request.viewer_name, "Phone");

  host.send(JSON.stringify({ type: "approved", session_id: request.session_id }));
  const approved = await viewer.next("approved");
  assert.equal(approved.session_id, request.session_id);

  host.send(JSON.stringify({ type: "offer", session_id: request.session_id, sdp: { type: "offer", sdp: "v=0" } }));
  assert.equal((await viewer.next("offer")).sdp.sdp, "v=0");
  viewer.send(JSON.stringify({ type: "answer", session_id: request.session_id, sdp: { type: "answer", sdp: "v=0" } }));
  assert.equal((await host.next("answer")).sdp.type, "answer");
  viewer.send(JSON.stringify({ type: "ice-candidate", session_id: request.session_id, candidate: { candidate: "c" } }));
  assert.equal((await host.next("ice-candidate")).candidate.candidate, "c");

  // A second viewer is told the host is busy.
  const second = await connect({ type: "hello", role: "viewer", token, viewer_id: "viewer-2" });
  await second.next("welcome");
  second.send(JSON.stringify({ type: "connect-request", target: "host-1" }));
  assert.equal((await second.next("error")).code, "busy");

  viewer.send(JSON.stringify({ type: "session-end", session_id: request.session_id }));
  assert.equal((await host.next("session-end")).session_id, request.session_id);

  for (const ws of [host, viewer, second]) ws.close();
});

test("rejection reaches the viewer and frees the host", async () => {
  const token = await getToken();
  const host = await connect({ type: "hello", role: "host", token, device_id: "host-2", name: "Quiet-PC", monitors: [] });
  await host.next("welcome");
  const viewer = await connect({ type: "hello", role: "viewer", token, viewer_id: "viewer-3" });
  await viewer.next("welcome");

  viewer.send(JSON.stringify({ type: "connect-request", target: "host-2" }));
  const request = await host.next("connect-request");
  host.send(JSON.stringify({ type: "rejected", session_id: request.session_id, reason: "No thanks" }));
  const rejected = await viewer.next("rejected");
  assert.equal(rejected.reason, "No thanks");

  viewer.send(JSON.stringify({ type: "connect-request", target: "host-2" }));
  assert.ok(await host.next("connect-request"));

  host.close();
  viewer.close();
});

test("connecting to an offline device returns an error", async () => {
  const token = await getToken();
  const viewer = await connect({ type: "hello", role: "viewer", token, viewer_id: "viewer-4" });
  await viewer.next("welcome");
  viewer.send(JSON.stringify({ type: "connect-request", target: "ghost" }));
  assert.equal((await viewer.next("error")).code, "offline");
  viewer.close();
});

test("host going offline ends the session and updates the list", async () => {
  const token = await getToken();
  const host = await connect({ type: "hello", role: "host", token, device_id: "host-3", name: "Temp-PC", monitors: [] });
  await host.next("welcome");
  const viewer = await connect({ type: "hello", role: "viewer", token, viewer_id: "viewer-5" });
  await viewer.next("welcome");
  viewer.send(JSON.stringify({ type: "connect-request", target: "host-3" }));
  const request = await host.next("connect-request");
  host.send(JSON.stringify({ type: "approved", session_id: request.session_id }));
  await viewer.next("approved");

  host.close();
  const ended = await viewer.next("session-end");
  assert.equal(ended.reason, "host-offline");
  viewer.close();
});

test("ICE provider builds STUN+TURN from env and the relay hands it to clients", async () => {
  const { createIceProvider } = await import("../src/ice.js");
  assert.equal(createIceProvider({}), null);
  const provider = createIceProvider({
    VIEX_TURN_URL: "turn:turn.example.com:3478, turns:turn.example.com:443?transport=tcp",
    VIEX_TURN_USERNAME: "u",
    VIEX_TURN_CREDENTIAL: "p",
  });
  const list = await provider();
  assert.equal(list[0].urls, "stun:stun.l.google.com:19302");
  assert.deepEqual(list[1].urls, ["turn:turn.example.com:3478", "turns:turn.example.com:443?transport=tcp"]);
  assert.equal(list[1].username, "u");

  // a relay configured with a provider function sends the resolved list in `welcome`
  const custom = createRelay({ password: PASSWORD, quiet: true, iceServers: async () => list });
  await new Promise((resolve) => custom.server.listen(0, "127.0.0.1", resolve));
  const port = custom.server.address().port;
  const res = await fetch(`http://127.0.0.1:${port}/auth`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password: PASSWORD }),
  });
  const { token } = await res.json();
  const welcome = await new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    ws.on("open", () => ws.send(JSON.stringify({ type: "hello", role: "viewer", token, viewer_id: "ice-v" })));
    ws.on("message", (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.type === "welcome") {
        ws.close();
        resolve(msg);
      }
    });
    ws.on("error", reject);
  });
  assert.equal(welcome.ice_servers[1].username, "u");
  for (const client of custom.wss.clients) client.terminate();
  custom.server.close();
});
