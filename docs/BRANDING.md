# Branding

Source art lives in [`/LOGO`](../LOGO): the wordmark, the monitor-cast mark, and the combined lockup (all black on white).

`scripts/build-brand.cjs` turns them into transparent **light-theme** (black) and **dark-theme** (light ink, lifted blue) variants and regenerates every icon:

| Output | Used by |
|---|---|
| `brand/viex-{mark,wordmark,logo}-{light,dark}.png` | README, marketing |
| `shared/assets/*` | Host + Viewer UI (`Wordmark`, `ViexMark` switch with the theme) |
| `website/assets/*` | Website nav, loader, favicon, social image |
| `viewer/public/*`, `viewer/android-res/*` | PWA icons, Android launcher |
| `host/src-tauri/icons/*` | Windows installer / tray / window icon |

```bash
npm i --no-save sharp
node scripts/build-brand.cjs
cd host && npx tauri icon ../brand/app-icon.png   # writes host/icons; move the files into host/src-tauri/icons
```
