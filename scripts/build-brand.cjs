#!/usr/bin/env node
/**
 * Regenerates the transparent light/dark logo variants and every app icon from the source
 * art in brand/source/ (see docs/BRANDING.md for how those crops are produced).
 *
 *   npm i --no-save sharp   # (not a project dependency)
 *   node scripts/build-brand.cjs
 *
 * Outputs: brand/*.png, shared/assets/*.png, website/assets/*, viewer/public/*, viewer/android-res/*,
 * host/src-tauri/icons/* (via `tauri icon`, run separately: see docs/BRANDING.md).
 */
const sharp = require("sharp");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const SRC = {
  mark: path.join(root, "brand", "source", "viex-mark-crop.png"),
  logo: path.join(root, "brand", "source", "viex-logo-crop.png"),
};
const OUT = path.join(root, "brand");
const INK_DARK = [239, 240, 242]; // text color used on dark backgrounds (matches --dark-color-text)

/** White background -> transparency ("color to alpha"), then split into light-theme / dark-theme art. */
async function cutout(file) {
  const { data, info } = await sharp(file).flatten({ background: "#ffffff" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const light = Buffer.alloc(data.length);
  const dark = Buffer.alloc(data.length);
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const a = Math.max(255 - r, 255 - g, 255 - b);
    const alpha = Math.max(0, Math.min(255, Math.round(((a - 14) * 255) / (235 - 14))));
    let cr = 0, cg = 0, cb = 0;
    if (a > 0) {
      cr = Math.max(0, Math.min(255, 255 - ((255 - r) * 255) / a));
      cg = Math.max(0, Math.min(255, 255 - ((255 - g) * 255) / a));
      cb = Math.max(0, Math.min(255, 255 - ((255 - b) * 255) / a));
    }
    light.set([cr, cg, cb, alpha], i);
    const colorful = Math.max(cr, cg, cb) - Math.min(cr, cg, cb) > 45;
    if (colorful) {
      // keep the brand blue, lifted a little so it reads on near-black
      dark.set([cr + (255 - cr) * 0.3, cg + (255 - cg) * 0.3, cb + (255 - cb) * 0.3, alpha], i);
    } else {
      dark.set([...INK_DARK, alpha], i);
    }
  }
  const make = (buf) => sharp(buf, { raw: { width: info.width, height: info.height, channels: 4 } }).png();
  return { light: await make(light).toBuffer(), dark: await make(dark).toBuffer() };
}

async function trim(buf, pad = 0.04) {
  const trimmed = await sharp(buf).trim({ threshold: 1 }).toBuffer({ resolveWithObject: true });
  const p = Math.round(Math.max(trimmed.info.width, trimmed.info.height) * pad);
  return sharp(trimmed.data).extend({ top: p, bottom: p, left: p, right: p, background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
}

async function fitWidth(buf, width) {
  return sharp(buf).resize({ width, withoutEnlargement: true }).png({ compressionLevel: 9 }).toBuffer();
}

/** Square app icon: dark rounded tile with the dark-theme mark centred. */
async function appIcon(markDark, size, { rounded = true, scale = 0.78 } = {}) {
  const mark = await sharp(markDark).resize({ width: Math.round(size * scale), height: Math.round(size * scale), fit: "inside" }).toBuffer();
  const radius = Math.round(size * 0.223);
  const tile = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${rounded ? radius : 0}" fill="#111419"/></svg>`,
  );
  return sharp(tile).composite([{ input: mark, gravity: "center" }]).png().toBuffer();
}

const write = (file, buf) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, buf);
  console.log("wrote", path.relative(root, file));
};

(async () => {
  const out = {};
  for (const [name, file] of Object.entries(SRC)) {
    const { light, dark } = await cutout(file);
    out[name] = { light: await trim(light), dark: await trim(dark) };
  }

  for (const name of Object.keys(out)) {
    for (const theme of ["light", "dark"]) {
      const full = out[name][theme];
      write(path.join(OUT, `viex-${name}-${theme}.png`), await fitWidth(full, name === "mark" ? 1024 : 1600));
      write(path.join(root, "shared", "assets", `viex-${name}-${theme}.png`), await fitWidth(full, name === "mark" ? 256 : 640));
    }
  }

  // App icons from the dark-theme mark.
  const icon1024 = await appIcon(out.mark.dark, 1024);
  write(path.join(OUT, "app-icon.png"), icon1024);
  write(path.join(root, "website", "assets", "icon.png"), icon1024);
  write(path.join(root, "website", "assets", "favicon.png"), await sharp(icon1024).resize(64, 64).png().toBuffer());
  write(path.join(root, "host", "public", "favicon.png"), await sharp(icon1024).resize(64, 64).png().toBuffer());
  write(path.join(root, "viewer", "public", "favicon.png"), await sharp(icon1024).resize(64, 64).png().toBuffer());
  write(path.join(root, "viewer", "public", "icon-192.png"), await sharp(icon1024).resize(192, 192).png().toBuffer());
  write(path.join(root, "viewer", "public", "icon-512.png"), await sharp(icon1024).resize(512, 512).png().toBuffer());

  // Android launcher: legacy (rounded), round, and adaptive foreground (mark only, inside the safe zone).
  const sizes = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
  for (const [density, px] of Object.entries(sizes)) {
    const dir = path.join(root, "viewer", "android-res", `mipmap-${density}`);
    write(path.join(dir, "ic_launcher.png"), await sharp(icon1024).resize(px, px).png().toBuffer());
    const round = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}"><circle cx="${px / 2}" cy="${px / 2}" r="${px / 2}" fill="#fff"/></svg>`);
    const square = await appIcon(out.mark.dark, px, { rounded: false });
    write(path.join(dir, "ic_launcher_round.png"), await sharp(square).composite([{ input: round, blend: "dest-in" }]).png().toBuffer());
    // adaptive foreground is 108dp canvas; keep the mark within the central 66%
    const fg = px * 1.5;
    const mark = await sharp(out.mark.dark).resize({ width: Math.round(fg * 0.5), height: Math.round(fg * 0.5), fit: "inside" }).toBuffer();
    write(
      path.join(dir, "ic_launcher_foreground.png"),
      await sharp({ create: { width: Math.round(fg), height: Math.round(fg), channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
        .composite([{ input: mark, gravity: "center" }])
        .png()
        .toBuffer(),
    );
  }
})();
