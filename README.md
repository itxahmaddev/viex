<div align="center">

<img src="website/assets/icon.png" width="96" alt="VIEX" />

# viex.

**Open-source, self-hosted, view-only remote screen viewer.**
Watch your own PCs live from your phone or laptop — multi-machine, multi-monitor, **$0/month** to run.

[Download](https://github.com/itxahmaddev/viex/releases/latest) · [Setup guide](docs/SETUP.md) · [Architecture](docs/ARCHITECTURE.md) · [Report an issue](https://github.com/itxahmaddev/viex/issues)

</div>

---

## What is VIEX?

VIEX lets you **watch** your own computers from anywhere. It is deliberately **not** a remote-control tool: there is no mouse or keyboard channel in the protocol at all.

| Piece | What it is | Where it runs |
|---|---|---|
| **VIEX Relay** | Tiny Node server: device list, password gate, WebRTC handshake. Never touches video. | Render free tier (or any Node host / Docker / VPS) |
| **VIEX Host** | Tauri desktop app. Captures every monitor, auto-starts with the PC, asks before sharing. | Each PC you want to watch (Windows `.exe`) |
| **VIEX Viewer** | Android app (`.apk`) **and** a web viewer served by your Relay. | Your phone / any browser |

Video flows **peer-to-peer** over WebRTC (DTLS-SRTP encrypted). Your free server only brokers the handshake, so it never needs bandwidth.

## Features

- 🖥️ **Multi-PC** — register as many Hosts as you like; pick one from a live online/offline list.
- 🪟 **Multi-monitor** — each display is its own video track: view all in a grid, tap one for full screen, swipe between them.
- ⚡ **Zero-click Host** — starts hidden with the OS and announces itself online. No manual steps after first-run setup.
- 🔐 **Password-gated** — `VIEX_PASSWORD` is set on your Relay at deploy time; nobody without it can even see the device list.
- 🛡️ **Permission modes** — *Ask* (default), *Auto-Approve* (per trusted viewer), *Quiet Mode* (no popup — indicator stays). Stored only on the PC.
- 🌐 **Configurable STUN/TURN** — free working defaults, fully editable in Settings (or set once on the Relay).
- 💸 **$0/month** for personal use. 100 % open source (MIT).

## Quick start (about 10 minutes)

1. **Deploy the Relay** — [![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/itxahmaddev/viex)
   Enter a strong `VIEX_PASSWORD` when asked. You get a URL like `https://viex-relay.onrender.com`.
2. **Keep it awake** — add `https://<your-relay>/health` to a free external pinger ([UptimeRobot](https://uptimerobot.com) / [cron-job.org](https://cron-job.org)) every 5–10 min.
3. **Install the Host** — download `VIEX-Host-Setup.exe` from the [latest release](https://github.com/itxahmaddev/viex/releases/latest), run it on each PC, enter your **Server URL** + **Password**.
4. **Install the Viewer** — download `VIEX-Viewer.apk` on your phone (or just open your Relay URL in any browser), enter the same URL + password, pick a PC, tap **Watch**.

The full walkthrough, troubleshooting and self-hosting options are in **[docs/SETUP.md](docs/SETUP.md)**.

## Releases are automatic

Every push to `main` runs [`.github/workflows/release.yml`](.github/workflows/release.yml), which tests the code, builds all three artifacts and publishes a new GitHub Release marked **Latest**:

| Asset | Built from |
|---|---|
| `VIEX-Host-Setup.exe` | `host/` — Tauri 2 + Rust (NSIS installer) |
| `VIEX-Viewer.apk` | `viewer/` — React + Capacitor (Android) |
| `viex-relay.zip` | `relay/` + the web viewer build |

Versions are `MAJOR.MINOR.<run number>` (e.g. `v0.1.12`). Dependabot keeps npm, Cargo, Actions and Docker dependencies current.

## The one hard line: the live indicator

Ask, Auto-Approve and Quiet Mode only change **whether you get a popup**. In *every* mode, while someone is watching, the Host shows a small always-on-top **"VIEX is live"** pill and a red tray icon. It cannot be disabled in this app (a watchdog recreates it if closed).

Without that, a screen viewer becomes a covert surveillance tool — and since this project is open source, the feature would ship to every fork. **Forks are asked to keep the indicator in their default build.** See [`host/src-tauri/src/live.rs`](host/src-tauri/src/live.rs).

## Repository layout

```
viex/
├── relay/      Node + ws server (registry, auth, signaling, /health) — deploy to Render
├── host/       Tauri app for the PC being viewed (Rust capture + React UI)
├── viewer/     React app → web viewer (served by the Relay) and Android APK (Capacitor)
├── shared/     Protocol types, ICE defaults, Relay client, shared design system
├── website/    Static marketing/download site
├── docs/       SETUP.md, ARCHITECTURE.md
└── .github/    CI, release automation, Dependabot
```

## Build from source

Requires Node 22+, Rust (stable), and on Windows the WebView2 runtime (preinstalled on Windows 11).

```bash
git clone https://github.com/itxahmaddev/viex.git && cd viex
npm install

# Relay (tests + run)
npm test
VIEX_PASSWORD='a-long-password' npm run relay

# Host (Windows)
npm run host:dev        # development
npm run host:build      # NSIS installer in host/src-tauri/target/release/bundle/nsis

# Viewer (web)
npm run viewer:dev
```

Android build steps are in [docs/SETUP.md → Building the APK yourself](docs/SETUP.md#building-the-android-apk-yourself).

## Design

The apps and website follow the same design language as [Yap](https://github.com/itxahmaddev/yap): Geist type, cool near-black and paper, one blue primary, hairline borders, soft raised surfaces. The shared tokens live in [`shared/styles`](shared/styles).

## Roadmap

🔊 optional system audio · 📜 session history on the Host · 🔔 push notification when a Host comes online · 🎚️ adaptive quality · 👥 multiple simultaneous viewers · 🍎🐧 macOS/Linux Host releases.

## License

[MIT](LICENSE) © VIEX contributors. See [SECURITY.md](SECURITY.md) to report vulnerabilities and [CONTRIBUTING.md](CONTRIBUTING.md) to help.
