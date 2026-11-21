# Branding

Source art lives in [`brand/source`](../brand/source):

| File | What it is |
|---|---|
| `viex-logo-master.png` | The original, uncropped artwork (black on white) — keep this; it's what any future re-crop starts from. |
| `viex-mark-crop.png` | Tight crop of just the icon (no wordmark) — feeds `viex-mark-*`. |
| `viex-logo-crop.png` | Tight crop of the full lockup (icon + "VIEX" wordmark) — feeds `viex-logo-*`. |

The two crops are plain rectangular crops of the master art (padding trimmed to content, no other editing). If you replace `viex-logo-master.png` with new art, re-cut `viex-mark-crop.png` / `viex-logo-crop.png` to match (any image editor, or a quick Pillow/ImageMagick crop) before running the build below.

`scripts/build-brand.cjs` turns the two crops into transparent **light-theme** (black) and **dark-theme** (light ink) variants and regenerates every icon:

| Output | Used by |
|---|---|
| `brand/viex-{mark,logo}-{light,dark}.png` | README, marketing, copied into `website/assets/` (see below) |
| `shared/assets/*` | Host + Viewer UI (`Wordmark`, `ViexMark` switch with the theme) |
| `website/assets/icon.png`, `favicon.png` | Website favicon + social image |
| `viewer/public/*`, `viewer/android-res/*` | PWA icons, Android launcher |
| `host/src-tauri/icons/*` | Windows/Linux/macOS installer, tray, and window icon |

```bash
npm i --no-save sharp
node scripts/build-brand.cjs

# the script doesn't copy these itself — the website reads them directly as static files
cp brand/viex-{mark,logo}-{light,dark}.png website/assets/

# writes straight into host/src-tauri/icons/ (run from host/)
cd host && npx tauri icon ../brand/app-icon.png
# tauri icon also generates iOS/Android variants the desktop-only Host doesn't use —
# fine to delete src-tauri/icons/{ios,android,Square*.png,StoreLogo.png} afterward

npm uninstall --no-save sharp   # it's a one-off tool, not a runtime or build dependency
```
