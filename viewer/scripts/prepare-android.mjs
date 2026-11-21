#!/usr/bin/env node
/**
 * Run after `npx cap add android` (CI does this; the android/ folder is not committed).
 * Applies VIEX's launcher icons, version, APK signing config, and two native-only features
 * to the generated project — Picture-in-Picture mini player and the home-screen devices
 * widget (see android-templates/ and docs/BRANDING.md's sibling note in this file).
 *
 *   VIEX_VERSION       e.g. "0.1.7"  (defaults to package.json)
 *   VIEX_VERSION_CODE  integer       (defaults to 1)
 *
 * Signing reads VIEX_KEYSTORE_PATH / VIEX_KEYSTORE_PASSWORD / VIEX_KEY_ALIAS / VIEX_KEY_PASSWORD at
 * build time; without them it falls back to the public community keystore in viewer/signing.
 */
import { cpSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const androidApp = join(root, "android", "app");
if (!existsSync(androidApp)) {
  console.error("android/ not found. Run `npx cap add android` first.");
  process.exit(1);
}
const templates = join(root, "android-templates");
const javaOut = join(androidApp, "src", "main", "java", "dev", "viex", "viewer");
const resOut = join(androidApp, "src", "main", "res");

const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const version = process.env.VIEX_VERSION || pkg.version;
const versionCode = Number(process.env.VIEX_VERSION_CODE || 1);

// 1. build.gradle: version + signing
const gradlePath = join(androidApp, "build.gradle");
let gradle = readFileSync(gradlePath, "utf8");
gradle = gradle.replace(/versionCode\s+\d+/, `versionCode ${versionCode}`).replace(/versionName\s+"[^"]*"/, `versionName "${version}"`);

if (!gradle.includes("signingConfigs")) {
  const signing = `    signingConfigs {
        release {
            storeFile file(System.getenv("VIEX_KEYSTORE_PATH") ?: "../../signing/viex-community.jks")
            storePassword System.getenv("VIEX_KEYSTORE_PASSWORD") ?: "viexcommunity"
            keyAlias System.getenv("VIEX_KEY_ALIAS") ?: "viex"
            keyPassword System.getenv("VIEX_KEY_PASSWORD") ?: "viexcommunity"
        }
    }
    buildTypes {`;
  gradle = gradle.replace("    buildTypes {", signing);
  gradle = gradle.replace("            minifyEnabled false", "            signingConfig signingConfigs.release\n            minifyEnabled false");
}
writeFileSync(gradlePath, gradle);

// 2. launcher icons
cpSync(join(root, "android-res"), resOut, { recursive: true });
writeFileSync(
  join(resOut, "values", "ic_launcher_background.xml"),
  `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#111419</color>\n</resources>\n`,
);

// 3. Mini player (Picture-in-Picture) + home-screen devices widget — native code that has
// no web equivalent, so it isn't built by Capacitor's web->native sync. Source lives in
// android-templates/, committed to git (unlike android/, which is regenerated every build).
cpSync(join(templates, "java", "MainActivity.java"), join(javaOut, "MainActivity.java"));
cpSync(join(templates, "java", "ViexNativePlugin.java"), join(javaOut, "ViexNativePlugin.java"));
cpSync(join(templates, "java", "DeviceWidgetProvider.java"), join(javaOut, "DeviceWidgetProvider.java"));
cpSync(join(templates, "res", "layout", "widget_devices.xml"), join(resOut, "layout", "widget_devices.xml"));
cpSync(join(templates, "res", "values", "widget_styles.xml"), join(resOut, "values", "widget_styles.xml"));
cpSync(join(templates, "res", "drawable", "widget_dot.xml"), join(resOut, "drawable", "widget_dot.xml"));
cpSync(join(templates, "res", "xml", "widget_devices_info.xml"), join(resOut, "xml", "widget_devices_info.xml"));

// 3a. strings.xml: add the widget's two strings (the file already has real content to merge into).
const stringsPath = join(resOut, "values", "strings.xml");
let strings = readFileSync(stringsPath, "utf8");
if (!strings.includes("widget_title")) {
  strings = strings.replace(
    "</resources>",
    '    <string name="widget_title">VIEX</string>\n    <string name="widget_empty">Open the app to load your devices</string>\n</resources>',
  );
  writeFileSync(stringsPath, strings);
}

// 3b. AndroidManifest.xml: Picture-in-Picture flags on the activity + the widget's receiver.
const manifestPath = join(androidApp, "src", "main", "AndroidManifest.xml");
let manifest = readFileSync(manifestPath, "utf8");
if (!manifest.includes("supportsPictureInPicture")) {
  manifest = manifest.replace(
    /(<activity[^>]*android:launchMode="singleTask")/,
    '$1\n            android:supportsPictureInPicture="true"\n            android:resizeableActivity="true"',
  );
}
if (!manifest.includes("DeviceWidgetProvider")) {
  manifest = manifest.replace(
    "    </application>",
    `        <!-- Home-screen widget: the last device list the app saw, read-only. -->
        <receiver
            android:name=".DeviceWidgetProvider"
            android:exported="false">
            <intent-filter>
                <action android:name="android.appwidget.action.APPWIDGET_UPDATE" />
            </intent-filter>
            <meta-data
                android:name="android.appwidget.provider"
                android:resource="@xml/widget_devices_info" />
        </receiver>
    </application>`,
  );
}
writeFileSync(manifestPath, manifest);

console.log(`Prepared Android project: version ${version} (${versionCode}), release signing configured, mini player + widget installed.`);
