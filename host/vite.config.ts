import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "node:path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Two windows: the main app and the always-on-top "live" indicator pill.
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        indicator: resolve(__dirname, "indicator.html"),
      },
    },
  },
  clearScreen: false,
  server: {
    port: 1421,
    strictPort: true,
    watch: { ignored: ["**/src-tauri/**"] },
  },
});
