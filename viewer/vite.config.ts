import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as { version: string };

export default defineConfig({
  // Relative asset URLs so the same build works from the Relay's root, a sub-path, or inside the Android app.
  base: "./",
  plugins: [react(), tailwindcss()],
  define: {
    __APP_VERSION__: JSON.stringify(process.env.VIEX_VERSION ?? pkg.version),
  },
  server: { port: 1422 },
});
