import { useEffect, useState } from "react";
import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";
import { Button, Card, Modal, PageHeader, Segmented, SettingRow, Switch, TextInput } from "@viex/shared";
import { host } from "../lib/controller";
import { useHost } from "../lib/useHost";

export function System() {
  const { config, session } = useHost();
  const [autostart, setAutostart] = useState<boolean | null>(null);
  const [name, setName] = useState(config?.device_name ?? "");
  const [confirmReset, setConfirmReset] = useState(false);

  useEffect(() => {
    isEnabled()
      .then(setAutostart)
      .catch(() => setAutostart(null));
  }, []);

  return (
    <>
      <PageHeader title="System" subtitle="How VIEX Host behaves on this PC." />

      <Card className="mb-6">
        <SettingRow title="Start with the system" hint="Launches hidden in the tray at login and announces this PC as online — zero clicks.">
          <Switch
            label="Start with the system"
            checked={autostart ?? false}
            disabled={autostart === null}
            onChange={async (value) => {
              try {
                if (value) await enable();
                else await disable();
                setAutostart(value);
              } catch {
                /* leave as-is */
              }
            }}
          />
        </SettingRow>
        <SettingRow stacked title="Device name" hint="What you see in the device list on your phone.">
          <div className="flex gap-2">
            <TextInput value={name} onChange={(e) => setName(e.target.value)} maxLength={64} className="flex-1" />
            <Button
              disabled={!name.trim() || name.trim() === config?.device_name}
              onClick={() => void host.renameDevice(name.trim())}
            >
              Rename
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
            onChange={(theme) => void host.saveConfig({ theme })}
          />
        </SettingRow>
      </Card>

      <Card>
        <SettingRow title="Change server" hint="Sign out and go through setup again with a different server or password.">
          <Button variant="danger" disabled={!!session} onClick={() => setConfirmReset(true)}>
            Sign out
          </Button>
        </SettingRow>
      </Card>

      <Modal
        open={confirmReset}
        title="Sign out of this server?"
        onClose={() => setConfirmReset(false)}
        actions={
          <>
            <Button variant="ghost" onClick={() => setConfirmReset(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={async () => {
                setConfirmReset(false);
                await host.resetSetup();
              }}
            >
              Sign out
            </Button>
          </>
        }
      >
        This PC will go offline and stop starting with the system until you set it up again. Trusted viewers are kept.
      </Modal>
    </>
  );
}
