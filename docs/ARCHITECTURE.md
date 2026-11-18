# VIEX architecture

## Overview

```
                      ┌─────────────────────────────┐
                      │          VIEX RELAY          │
                      │  Node + ws (Render free)      │
                      │  • device registry (memory)   │
                      │  • password auth (env var)    │
                      │  • signaling relay (SDP/ICE)  │
                      │  • GET /health, serves web UI │
                      └───────────┬───────────────────┘
          hello(host) / monitors  │   connect-request / offer / answer / ice
            ┌─────────────────────┴───────────────────────┐
┌───────────▼───────────┐                      ┌──────────▼──────────┐
│      VIEX HOST (PC)   │   🔴 direct P2P WebRTC │    VIEX VIEWER      │
│  Tauri 2 (Rust + web) │ ◄──── video tracks ───►│  React (web/Android) │
└───────────────────────┘   (STUN, or TURN)      └─────────────────────┘
```

The Relay never carries media, so a 512 MB free instance is plenty.

## Components

### Relay (`relay/`)
- `src/auth.js` — password check (constant-time), HMAC-signed stateless tokens (12 h), per-IP rate limit on failures.
- `src/registry.js` — in-memory hosts, viewers and sessions. No database.
- `src/signaling.js` — WebSocket protocol: handshake, routing, timeouts, heartbeat.
- `src/health.js` — CORS + JSON helpers and `/health`.
- `src/index.js` — HTTP server (`POST /auth`, `GET /health`, static web viewer) + `/ws`.

Tokens are derived from `VIEX_PASSWORD`, so they survive a restart (Render restarts a slept service) and need no storage.

### Host (`host/`)
- **Rust** (`src-tauri/`)
  - `capture.rs` — one thread per monitor using [`xcap`](https://crates.io/crates/xcap): grab → downscale → JPEG → stream bytes to the webview over a Tauri `Channel`. Unchanged frames are skipped (≥ 1 frame/s keepalive). Quality/fps/size are live-tunable.
  - `live.rs` — the **live indicator** (always-on-top pill + red tray icon + watchdog). Not optional.
  - `config.rs` — `config.json` in the app config dir; the Relay password is stored in the OS credential vault via `keyring`.
  - `lib.rs` — single-instance, autostart (`--hidden`), tray, close-to-tray.
- **Webview** (`src/lib/controller.ts`) — owns the Relay connection and permission engine and does the WebRTC: each monitor's frames are painted on a canvas and published with `canvas.captureStream()`, so the webview's own WebRTC stack provides VP8/H.264 encoding, congestion control and DTLS-SRTP.

> Design note: the original plan was `webrtc-rs` with manual VP8/H.264 encoding in Rust. The shipped design keeps capture in Rust but uses the webview's built-in WebRTC for the encode/transport leg (the fallback the plan allowed), which is dramatically less code and uses hardware codecs where available. The cost is a JPEG hop from Rust to the webview.

### Viewer (`viewer/`)
A single React app. Served by the Relay as the web viewer, and wrapped by Capacitor as the Android APK. It receives one video track per monitor and renders a grid or a single full-screen monitor.

### Shared (`shared/`)
Protocol types (`protocol.ts`), ICE defaults and resolution (`ice.ts`), the reconnecting `RelayClient` (`relay-client.ts`), and the design system (`styles/`, `ui.tsx`).

## Signaling protocol

JSON over WebSocket at `/ws`. The first message must be `hello` within 8 s.

```jsonc
// client → relay (after POST /auth → token)
{ "type": "hello", "role": "host", "token": "…", "device_id": "…", "name": "Ahmad-PC", "monitors": [{ "id": 0, "label": "Monitor 1", "w": 2560, "h": 1440 }] }
{ "type": "hello", "role": "viewer", "token": "…", "viewer_id": "…", "viewer_name": "Phone" }

// relay → client
{ "type": "welcome", "role": "host|viewer", "ice_servers": null }
{ "type": "device-list", "devices": [{ "device_id": "…", "name": "…", "status": "online", "busy": false, "monitors": [] }] }

// viewer → relay → host
{ "type": "connect-request", "target": "device_id" }            // viewer → relay
{ "type": "connect-request", "session_id", "viewer_id", "viewer_name" }   // relay → host

// host → relay → viewer
{ "type": "approved", "session_id": "…" }
{ "type": "rejected", "session_id": "…", "reason": "…" }

// relayed (host offers, viewer answers)
{ "type": "offer", "session_id": "…", "sdp": { … } }
{ "type": "answer", "session_id": "…", "sdp": { … } }
{ "type": "ice-candidate", "session_id": "…", "candidate": { … } }

{ "type": "session-end", "session_id": "…", "reason": "…" }
```

There is **no input or control message**. The only data channel (`meta`, negotiated id 0) carries:

- host → viewer: `{ type: "meta", monitors: [{ stream_id, monitor_id, label, w, h }] }` so the viewer can label/order tracks, and
- viewer → host: `{ type: "view", mode: "grid"|"single", monitor_id }` — a bandwidth hint (grid = all screens small; single = the focused screen sharp, others paused).

### Session lifecycle

1. Viewer sends `connect-request`; the Relay creates a pending session (60 s timeout) and forwards it to the Host.
2. Host's permission engine decides: Ask → popup, trusted → auto/quiet. It sends `approved` or `rejected`.
3. On approval the Host raises the **live indicator first**, starts capture, creates one track per monitor and sends `offer`; the Viewer answers; ICE candidates trickle both ways.
4. Either side (or a disconnect) ends the session; the Host stops capture and removes the indicator.

Version 1 allows one viewer per host.

## Security model

- Password gate on every Relay connection (constant-time compare, per-IP lockout after 10 failures / 10 min, signed expiring tokens).
- Media is DTLS-SRTP encrypted end to end; signaling uses WSS when the Relay is behind HTTPS.
- Per-viewer permissions are stored only on the Host.
- The Host's Relay password lives in the OS credential vault; the Viewer keeps it in app-private storage (Android) / browser storage (web).
- The live indicator is mandatory in every mode (see `host/src-tauri/src/live.rs`).

Report vulnerabilities per [SECURITY.md](../SECURITY.md).
