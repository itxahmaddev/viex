import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "dev.viex.viewer",
  appName: "VIEX Viewer",
  webDir: "dist",
  backgroundColor: "#101215",
  server: {
    // The app talks to YOUR Relay over HTTPS/WSS (Render gives you TLS automatically).
    androidScheme: "https",
  },
};

export default config;
