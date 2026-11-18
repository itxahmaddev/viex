import { useEffect, useState } from "react";
import { Button, Card, DEFAULT_ICE_SERVERS, Notice, PageHeader, SettingRow, TextArea, parseIceServers } from "@viex/shared";
import { host } from "../lib/controller";
import { useHost } from "../lib/useHost";

export function Network() {
  const { config } = useHost();
  const saved = config?.custom_ice ?? "";
  const [text, setText] = useState(saved);
  const [justSaved, setJustSaved] = useState(false);

  useEffect(() => setText(saved), [saved]);

  const trimmed = text.trim();
  const invalid = trimmed !== "" && parseIceServers(trimmed) === null;
  const dirty = trimmed !== saved.trim();

  return (
    <>
      <PageHeader title="Network" subtitle="STUN / TURN servers used to connect your devices peer-to-peer." />

      <Card className="mb-6">
        <SettingRow title="Server" hint="The Relay only brokers the handshake. Video never passes through it.">
          <span className="max-w-[260px] truncate font-mono text-[12.5px] text-ink-2">{config?.server_url}</span>
        </SettingRow>
        <SettingRow
          stacked
          title="Custom ICE servers"
          hint="Paste a JSON array to use your own STUN/TURN (e.g. a self-hosted coturn). Leave empty to use the Relay’s or the free defaults."
        >
          <TextArea
            rows={8}
            spellCheck={false}
            value={text}
            placeholder={JSON.stringify(DEFAULT_ICE_SERVERS, null, 2)}
            onChange={(e) => {
              setText(e.target.value);
              setJustSaved(false);
            }}
            error={invalid ? "That isn’t a valid ICE server list. Expect [{ \"urls\": \"stun:…\" }, …]." : null}
          />
        </SettingRow>
      </Card>

      <div className="flex items-center gap-2">
        <Button
          variant="primary"
          disabled={invalid || !dirty}
          onClick={async () => {
            await host.saveConfig({ custom_ice: trimmed });
            setJustSaved(true);
          }}
        >
          Save
        </Button>
        <Button
          variant="ghost"
          disabled={!saved}
          onClick={async () => {
            setText("");
            await host.saveConfig({ custom_ice: "" });
          }}
        >
          Reset to defaults
        </Button>
        {justSaved && <span className="text-small text-moss">Saved. Applies to the next session.</span>}
      </div>

      <div className="mt-6">
        <Notice tone="warn" title="About the free TURN default">
          The built-in OpenRelay TURN is shared and rate-limited. Most sessions connect directly and never use it, but for
          reliability on strict networks run your own coturn and paste it above.
        </Notice>
      </div>
    </>
  );
}
