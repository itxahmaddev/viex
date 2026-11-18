# Contributing to VIEX

Thanks for helping! VIEX is MIT-licensed and welcomes issues and pull requests.

## Ground rules

1. **View-only stays view-only.** No PR may add mouse/keyboard/clipboard control or any input channel.
2. **The live indicator stays.** Any change to `host/src-tauri/src/live.rs` or the permission flow must keep the "VIEX is live" indicator visible in every mode and not add a way to disable it.
3. **No secrets in git** — `VIEX_PASSWORD`, tokens, TURN credentials, signing keys.

## Dev setup

```bash
git clone https://github.com/itxahmaddev/viex.git && cd viex
npm install
npm test               # relay tests
npm run typecheck      # shared + host + viewer
npm run viewer:dev     # web viewer
npm run host:dev       # Tauri Host (needs Rust + WebView2)
```

## Before opening a PR

- `npm test && npm run typecheck`
- `npm run build -w viewer && npm run build -w host`
- `cargo check --manifest-path host/src-tauri/Cargo.toml` if you touched Rust
- Keep UI consistent with the shared design tokens in `shared/styles` (no ad-hoc colors).

CI runs the same checks. Merges to `main` publish a new release automatically, so keep `main` green.

## Where things live

See the layout in the [README](README.md#repository-layout) and the protocol in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
