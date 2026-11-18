# VIEX — complete setup guide

This guide takes you from nothing to watching your PC on your phone. Budget about 10 minutes. Everything runs on free tiers.

- [How the pieces fit](#how-the-pieces-fit)
- [Step 1 — Deploy the Relay](#step-1--deploy-the-relay)
- [Step 2 — Keep the Relay awake (free)](#step-2--keep-the-relay-awake-free)
- [Step 3 — Install VIEX Host on your PC](#step-3--install-viex-host-on-your-pc)
- [Step 4 — Install VIEX Viewer](#step-4--install-viex-viewer)
- [Step 5 — Watch](#step-5--watch)
- [Permission modes](#permission-modes)
- [STUN / TURN (when direct connection fails)](#stun--turn)
- [Other ways to host the Relay](#other-ways-to-host-the-relay)
- [Building from source](#building-from-source)
- [Forking: your own releases and signing key](#forking-your-own-releases-and-signing-key)
- [Troubleshooting](#troubleshooting)

---

## How the pieces fit

```
VIEX Host (your PC) ──┐                         ┌── VIEX Viewer (phone / browser)
                      ├── VIEX Relay (Render) ──┤
   registers "online" │   device list + auth    │   asks to connect
                      └─ SDP / ICE handshake ───┘
        ▲                                                ▲
        └──────────── video: direct P2P WebRTC ──────────┘
```

The Relay only keeps the device list and passes the connection handshake. Video never goes through it, so the free tier is plenty.

---

## Step 1 — Deploy the Relay

You need a place to run a small Node server. **Render's free tier** is the easiest.

### Option A — one click (recommended)

1. Click **Deploy to Render**: <https://render.com/deploy?repo=https://github.com/itxahmaddev/viex>
2. Sign in to Render (a free account is fine) and, when the Blueprint asks for **`VIEX_PASSWORD`**, enter a strong password (8+ characters). This is the password you will type into the Host and Viewer.
3. Click **Apply**. The first build takes a few minutes. When it finishes you get a URL such as `https://viex-relay.onrender.com`.
4. Open that URL in a browser — you should see the VIEX web viewer sign-in screen. Open `/health` — you should see `{"ok":true,...}`.

### Option B — manual Render service

1. Fork this repo (or use it directly) and create a **New → Web Service** on Render from the repository.
2. Runtime: **Docker**. Dockerfile path: `./Dockerfile`. Plan: **Free**.
3. Environment variable: `VIEX_PASSWORD` = your password.
4. Health check path: `/health`.

> **Never commit `VIEX_PASSWORD`.** It lives only in the Render dashboard (or a local `.env`). The Relay refuses to start without it.

### Optional environment variables

| Variable | Purpose |
|---|---|
| `VIEX_PASSWORD` | **Required.** The shared password (8+ characters). |
| `VIEX_ICE_SERVERS` | JSON array of STUN/TURN servers handed to every Host/Viewer. Example: `[{"urls":"turn:turn.example.com:3478","username":"u","credential":"p"}]` |
| `VIEX_TURN_URL` / `_USERNAME` / `_CREDENTIAL` | Shortcut for a single coturn server. |
| `METERED_DOMAIN` + `METERED_API_KEY` | Free TURN from metered.ca — see [STUN / TURN](#stun--turn). |
| `CLOUDFLARE_TURN_KEY_ID` + `CLOUDFLARE_TURN_API_TOKEN` | Cloudflare Realtime TURN. |
| `PORT` | Listen port (Render sets this automatically). Default `8787`. |
| `VIEX_VIEWER_DIR` | Folder with the web viewer build to serve at `/`. Included in the Docker image and release zip. |
| `VIEX_TRUST_PROXY` | `1` to trust `X-Forwarded-For` for per-IP rate limiting (automatic on Render). |

---

## Step 2 — Keep the Relay awake (free)

Render's free web services **sleep after ~15 minutes without outside traffic** and take up to a minute to wake. A timer *inside* the server does **not** help — only external HTTP requests count. Use a free external pinger:

**UptimeRobot** (recommended)
1. Create a free account at <https://uptimerobot.com>.
2. **Add New Monitor** → type **HTTP(s)**.
3. URL: `https://<your-relay>.onrender.com/health`, interval **5 minutes**.

**cron-job.org** (alternative)
1. Create a free account at <https://cron-job.org>.
2. New cronjob → URL `https://<your-relay>.onrender.com/health` → every 10 minutes.

That is the whole fix, and it costs $0.

---

## Step 3 — Install VIEX Host on your PC

1. Open the [latest release](https://github.com/itxahmaddev/viex/releases/latest) and download **`VIEX-Host-Setup.exe`**.
2. Run it. If Windows SmartScreen says *"Windows protected your PC"*, click **More info → Run anyway** (the open-source build is not code-signed).
3. The installer installs for the current user (no admin rights needed) and launches VIEX Host.
4. First-run wizard: enter
   - **Server URL** — e.g. `https://viex-relay.onrender.com`
   - **Password** — the `VIEX_PASSWORD` you chose
   - **This PC's name** — what you'll see in the device list

   The password is stored in the **Windows Credential Manager**, not in a plain file. The first connection can take up to a minute if your free Render server was asleep.
5. Done. VIEX Host now:
   - lives in the **system tray** (closing the window keeps it running),
   - **starts hidden with Windows** and announces itself online — zero clicks,
   - shows your monitors on the **Home** page.

Repeat on every PC you want to watch. Each gets its own name in the list.

To quit completely: right-click the tray icon → **Quit**. To stop auto-start: **System → Start with the system**.

---

## Step 4 — Install VIEX Viewer

### Android app

1. On your phone, open the [latest release](https://github.com/itxahmaddev/viex/releases/latest) and download **`VIEX-Viewer.apk`**.
2. Open it. Android will ask you to allow **Install unknown apps** for your browser or file manager — allow it for this install.
3. Open **VIEX Viewer**, enter the same **Server URL** and **Password**, and name your phone.

### Web viewer (laptops, iPhone, anything with a browser)

Just open your Relay URL (`https://<your-relay>.onrender.com`). Sign in the same way. On a phone you can **Add to Home Screen** for an app-like experience.

---

## Step 5 — Watch

1. In the Viewer's **Devices** list, every online PC shows a green dot, its screen count and resolutions.
2. Tap **Watch**.
3. On the PC, a popup appears: **Accept once**, **Always allow**, or **Reject**. (After "Always allow", that viewer connects instantly next time.)
4. You are connected. With several monitors you see a **grid**; tap a tile for **full screen**, swipe left/right (or use the pills) to switch monitors, **Grid** to go back. Tap **Stop** to leave.

While you watch, the PC shows a small **"VIEX is live"** pill and a red tray icon. That is intentional and cannot be turned off — see below.

---

## Permission modes

Set per trusted viewer, **locally on the Host only** (never sent to the server). Open **Viewers** in VIEX Host.

| Mode | Behavior |
|---|---|
| **Ask** (default) | Popup on the PC: Accept / Reject. |
| **Auto-Approve** | Trusted viewer connects instantly. A small notice still appears. Off by default; added through "Always allow". |
| **Quiet Mode** | Like Auto-Approve but **no popup and no notice**. Turning it on requires an explicit confirmation dialog. |

### The indicator guardrail

In **all** modes, while a viewer is connected the Host shows an always-on-top "VIEX is live" pill and a red tray icon. A watchdog recreates the pill if it is closed. There is no setting to disable it. This is the project's core safety rule: it keeps VIEX a tool for watching *your own* computers rather than covert surveillance. If you fork VIEX, please keep it in your default build.

---

## STUN / TURN

VIEX connects your PC and phone **directly** whenever the networks allow it, using free public **STUN** (built in). That works on most home Wi-Fi. It does **not** work when a side is behind strict or carrier NAT — typically a **phone on mobile data** — and then the screen sits on "Connecting…" until it times out (30 s) with a message. To cover those cases you need a **TURN relay**.

> VIEX no longer ships a default TURN: the old free public one (OpenRelay) is gone, and no free TURN works without an account. Set one up once on your **Relay** and every Host and Viewer picks it up automatically.

Pick one (all free for personal use), then set the variables in the Render dashboard → **Environment** and let it redeploy:

| Option | Variables on the Relay |
|---|---|
| **Metered** (free plan, signup) — create an app at <https://www.metered.ca>, copy the app name and API key | `METERED_DOMAIN` = `yourapp.metered.live`, `METERED_API_KEY` = your key |
| **Cloudflare Realtime TURN** (free tier) — create a TURN key in the Cloudflare dashboard | `CLOUDFLARE_TURN_KEY_ID`, `CLOUDFLARE_TURN_API_TOKEN` |
| **Your own coturn** on a small VPS | `VIEX_TURN_URL` = `turn:your.host:3478,turns:your.host:443?transport=tcp`, `VIEX_TURN_USERNAME`, `VIEX_TURN_CREDENTIAL` |
| **Anything else** | `VIEX_ICE_SERVERS` = a JSON array (see below) |

> The Metered and Cloudflare integrations fetch credentials from those services' APIs and cache them; they have not been verified against live accounts in this repo's tests — if a fetch fails, the Relay logs `Metered/Cloudflare TURN fetch failed` and falls back to STUN.

You can also paste a list on one device only: **Network** (Host) or **Settings** (Viewer). A device's own list beats the Relay's, which beats the built-in STUN defaults. The Host's **Network** page shows whether a TURN relay is configured.

Example list for `VIEX_ICE_SERVERS` or the Settings box:

```json
[
  { "urls": "stun:stun.l.google.com:19302" },
  { "urls": "turn:turn.example.com:3478", "username": "viex", "credential": "secret" }
]
```

---

## Other ways to host the Relay

The Relay is a plain Node app. Any host works.

### Docker

```bash
docker build -t viex-relay .
docker run -d --name viex-relay -p 8787:8787 \
  -e VIEX_PASSWORD='a-long-password' --restart unless-stopped viex-relay
```

### The release zip (no Docker)

Download **`viex-relay.zip`** from the release, unzip, then:

```bash
npm install --omit=dev
VIEX_PASSWORD='a-long-password' npm start      # Node 20+
```

### Behind HTTPS

Outside your LAN you **must** use HTTPS/WSS (browsers and the Android app refuse insecure WebSockets from secure pages). Render, Railway, Fly.io and Cloudflare Tunnel provide TLS automatically; on a VPS put Caddy or nginx in front. Set `VIEX_TRUST_PROXY=1` behind your own proxy.

---

## Building from source

Prerequisites: **Node 22+**, **Rust (stable)**. For the Host on Windows you also need the **MSVC build tools** and **WebView2** (preinstalled on Windows 11).

```bash
git clone https://github.com/itxahmaddev/viex.git
cd viex
npm install
```

| Goal | Command |
|---|---|
| Run Relay tests | `npm test` |
| Typecheck everything | `npm run typecheck` |
| Run the Relay locally | `VIEX_PASSWORD='a-long-password' npm run relay` |
| Run the web viewer (dev) | `npm run viewer:dev` |
| Run the Host (dev) | `npm run host:dev` |
| Build the Windows installer | `npm run host:build` → `host/src-tauri/target/release/bundle/nsis/` |

### Building the Android APK yourself

Requires **JDK 21** and the **Android SDK** (`ANDROID_HOME` set).

```bash
npm install
npm run build -w viewer
cd viewer
npx cap add android
node scripts/prepare-android.mjs      # icons, version, signing config
npx cap sync android
cd android && ./gradlew assembleRelease
# APK: viewer/android/app/build/outputs/apk/release/app-release.apk
```

---

## Forking: your own releases and signing key

Fork the repo and every push to `main` builds and publishes a release in **your** fork — no setup needed.

- **Android signing.** By default the APK is signed with the public *community* keystore in `viewer/signing/` (fine for personal sideloading; anyone can build an APK with the same signature, so don't treat it as proof of origin). To sign with your own key, add these repository secrets: `ANDROID_KEYSTORE_BASE64` (base64 of your `.jks`), `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`.
- **Windows signing.** Not configured (the installer shows a SmartScreen notice). If you own a code-signing certificate, add it to the Tauri build per the [Tauri signing docs](https://v2.tauri.app/distribute/sign/windows/).
- **Repository links.** Search for `itxahmaddev/viex` and replace it with your own `owner/repo` (README, website, Host About page, Render button).

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| "Could not reach the server" | Check the URL (include `https://`). A sleeping free Render server needs up to a minute — wait and retry. |
| "Wrong password" | It must match `VIEX_PASSWORD` exactly. After 10 wrong attempts from one IP the Relay blocks it for 10 minutes. |
| Host shows "Offline" / "Connecting…" | Relay is asleep (add the pinger from Step 2) or the URL changed. It retries automatically. |
| PC doesn't appear in the Viewer | The Host must be running (tray icon) and signed in to the **same server** with the same password. |
| "Waiting for…" never resolves | Someone must press **Accept** on the PC, or the viewer must already be trusted. Requests time out after 60 s. |
| Stuck on "Connecting…", then "Could not connect directly" | A direct connection isn't possible between these two networks (usually phone on mobile data). Configure a TURN relay on your Relay — see [STUN / TURN](#stun--turn). Test with the phone on the same Wi-Fi as the PC first. |
| "That device already has a viewer" | Version 1 allows one viewer per PC at a time. |
| Black tile for one monitor | The monitor may be asleep or locked. Wake it; capture resumes automatically. |
| SmartScreen warning | Expected for unsigned open-source builds → **More info → Run anyway**. |
| Android: "App not installed" | Uninstall an older VIEX Viewer signed with a different key, then install again. |

Still stuck? [Open an issue](https://github.com/itxahmaddev/viex/issues) — include your OS, what you saw, and (if you can) the Relay's logs. Never paste your password.
