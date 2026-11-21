import { registerPlugin } from "@capacitor/core";

/**
 * Bridges to ViexNativePlugin.java (viewer/android/app/src/main/java/dev/viex/viewer/).
 * Not a published package — it's a plain custom Capacitor plugin that ships inside this
 * app's own Android project. On the web/PWA build these calls just no-op (registerPlugin
 * falls back to a web implementation that resolves immediately when none is provided).
 */
export interface ViexNativePlugin {
  /** Tells the native side whether a live session is on screen, so Picture-in-Picture
   *  only triggers while actually watching (see MainActivity#onUserLeaveHint). */
  setWatching(options: { active: boolean }): Promise<void>;
  /** Manually enters Picture-in-Picture (the "mini player" button), where supported. */
  enterPip(): Promise<void>;
  isPipSupported(): Promise<{ supported: boolean }>;
  /** Persists the last-known device list for the home-screen widget. */
  updateDevices(options: { devices: { name: string; online: boolean }[] }): Promise<void>;
}

export const ViexNative = registerPlugin<ViexNativePlugin>("ViexNative");
