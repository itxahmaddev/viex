#!/usr/bin/env node
/** Stamps a release version into the Tauri app: `node scripts/set-version.mjs 0.1.7` (used by CI). */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const version = process.argv[2];
if (!/^\d+\.\d+\.\d+$/.test(version ?? "")) {
  console.error("Usage: set-version.mjs <major.minor.patch>");
  process.exit(1);
}
const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const confPath = join(root, "host/src-tauri/tauri.conf.json");
const conf = JSON.parse(readFileSync(confPath, "utf8"));
conf.version = version;
writeFileSync(confPath, JSON.stringify(conf, null, 2) + "\n");

const cargoPath = join(root, "host/src-tauri/Cargo.toml");
writeFileSync(cargoPath, readFileSync(cargoPath, "utf8").replace(/^version = "[^"]*"/m, `version = "${version}"`));

for (const file of ["host/package.json", "viewer/package.json", "relay/package.json"]) {
  const path = join(root, file);
  const json = JSON.parse(readFileSync(path, "utf8"));
  json.version = version;
  writeFileSync(path, JSON.stringify(json, null, 2) + "\n");
}
console.log(`Stamped version ${version}`);
