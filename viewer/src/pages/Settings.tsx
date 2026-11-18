import { useEffect, useState } from "react";
import { Button, Card, DEFAULT_ICE_SERVERS, Notice, PageHeader, Segmented, SettingRow, TextArea, TextInput, parseIceServers } from "@viex/shared";
import { APP_VERSION, viewer } from "../lib/controller";
import { useViewer } from "../lib/useViewer";

const REPO = "https://github.com/itxahmaddev/viex";

export function Settings() {
  const { config } = useViewer();
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
