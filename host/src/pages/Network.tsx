import { useEffect, useState } from "react";
import { Button, Card, DEFAULT_ICE_SERVERS, Notice, PageHeader, SettingRow, TextArea, hasTurn, parseIceServers } from "@viex/shared";
import { host } from "../lib/controller";
import { useHost } from "../lib/useHost";

export function Network() {
  const { config, relay } = useHost(); // re-renders when the relay (and its ICE list) comes online
  const turnReady = hasTurn(host.currentIceServers());
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
        {turnReady ? (
          <Notice tone="ok" title="TURN relay configured">
            Connections that can’t go direct (mobile data, strict NAT) fall back to your TURN server.
          </Notice>
        ) : (
          <Notice tone="warn" title="No TURN relay configured">
            Only direct connections will work. That is fine on most home Wi-Fi, but a phone on mobile data usually needs TURN.
            Set one on your Relay once (every device picks it up) or paste it above — see the setup guide.
            {relay === "online" ? "" : " Connect to your Relay first so its settings can load."}
          </Notice>
        )}
      </div>
    </>
  );
}
