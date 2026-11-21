import { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { Button, Card, DEFAULT_ICE_SERVERS, Notice, PageHeader, Segmented, SettingRow, TextArea, TextInput, parseIceServers } from "@viex/shared";
import { APP_VERSION, viewer } from "../lib/controller";
import { useViewer } from "../lib/useViewer";

const REPO = "https://github.com/itxahmaddev/viex";

interface AvailableUpdate {
  version: string;
  downloadUrl: string;
}

/** Android has no Play Store auto-update here, so this is the closest equivalent:
 *  check GitHub Releases on open, and if a newer APK exists, offer a one-tap download.
 *  Android still requires the user's own confirmation to install it (OS security). */
function useApkUpdateCheck(): AvailableUpdate | null {
  const [update, setUpdate] = useState<AvailableUpdate | null>(null);
  useEffect(() => {
    if (Capacitor.getPlatform() !== "android") return;
    fetch("https://api.github.com/repos/itxahmaddev/viex/releases/latest", {
      headers: { Accept: "application/vnd.github+json" },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((release: { tag_name?: string; assets?: { name: string; browser_download_url: string }[] } | null) => {
        if (!release?.tag_name) return;
        const latest = release.tag_name.replace(/^v/, "");
        if (latest === APP_VERSION || !isNewer(latest, APP_VERSION)) return;
        const apk = release.assets?.find((a) => a.name.endsWith(".apk"));
        if (apk) setUpdate({ version: latest, downloadUrl: apk.browser_download_url });
      })
      .catch(() => {
        /* offline or rate limited: silently skip, same as the website widget */
      });
  }, []);
  return update;
}

function isNewer(a: string, b: string): boolean {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff > 0;
  }
  return false;
}

export function Settings() {
  const { config } = useViewer();
  const update = useApkUpdateCheck();
  const [name, setName] = useState(config?.viewer_name ?? "");
  const saved = config?.custom_ice ?? "";
  const [ice, setIce] = useState(saved);
  const [saveNote, setSaveNote] = useState(false);
  useEffect(() => setIce(saved), [saved]);

  const trimmed = ice.trim();
  const invalid = trimmed !== "" && parseIceServers(trimmed) === null;

  return (
    <>
      <PageHeader title="Settings" subtitle="This device’s connection to your VIEX server." />

      {update && (
        <Notice tone="ok" title={`Update available — v${update.version}`}>
          <div className="flex items-center justify-between gap-3">
            <span>A newer VIEX Viewer is out. Download it and tap the file to install.</span>
            <Button size="sm" onClick={() => window.open(update.downloadUrl, "_blank")}>
              Download
            </Button>
          </div>
        </Notice>
      )}

      <Card className="mb-6">
        <SettingRow title="Server">
          <span className="max-w-[200px] truncate font-mono text-[12.5px] text-ink-2 md:max-w-[300px]">{config?.server_url}</span>
        </SettingRow>
        <SettingRow stacked title="This device’s name" hint="Shown on the PC when you ask to watch it.">
          <div className="flex gap-2">
            <TextInput value={name} onChange={(e) => setName(e.target.value)} maxLength={64} className="flex-1" />
            <Button
              disabled={!name.trim() || name.trim() === config?.viewer_name}
              onClick={() => {
                viewer.updateConfig({ viewer_name: name.trim() });
                viewer.startRelay(); // re-announce under the new name
              }}
            >
              Save
            </Button>
          </div>
        </SettingRow>
        <SettingRow title="Theme">
          <Segmented
            value={config?.theme ?? "system"}
            options={[
              { value: "system", label: "System" },
              { value: "light", label: "Light" },
              { value: "dark", label: "Dark" },
            ]}
            onChange={(theme) => viewer.updateConfig({ theme })}
          />
        </SettingRow>
      </Card>

      <Card className="mb-6">
        <SettingRow
          stacked
          title="STUN / TURN servers"
          hint="Optional JSON array. Leave empty to use the server’s or the free defaults."
        >
          <TextArea
            rows={6}
            spellCheck={false}
            value={ice}
            placeholder={JSON.stringify(DEFAULT_ICE_SERVERS, null, 2)}
            onChange={(e) => {
              setIce(e.target.value);
              setSaveNote(false);
            }}
            error={invalid ? "That isn’t a valid ICE server list." : null}
          />
          <div className="mt-2 flex items-center gap-2">
            <Button
              size="sm"
              variant="primary"
              disabled={invalid || trimmed === saved.trim()}
              onClick={() => {
                viewer.updateConfig({ custom_ice: trimmed });
                setSaveNote(true);
              }}
            >
              Save
            </Button>
            {saveNote && <span className="text-small text-moss">Saved. Applies to the next session.</span>}
          </div>
        </SettingRow>
      </Card>

      <Card className="mb-6">
        <SettingRow title="Sign out" hint="Forget the password on this device.">
          <Button variant="danger" onClick={() => viewer.signOut()}>
            Sign out
          </Button>
        </SettingRow>
        <SettingRow title="VIEX Viewer" hint="Open source · MIT">
          <a className="font-mono text-[12.5px] text-primary hover:underline" href={REPO} target="_blank" rel="noreferrer">
            v{APP_VERSION}
          </a>
        </SettingRow>
      </Card>

      <Notice tone="ok" title="View-only by design">
        VIEX has no remote-control channel. This app can only watch screens a PC has chosen to share, and that PC always shows a
        live indicator.
      </Notice>
    </>
  );
}
