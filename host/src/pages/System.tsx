import { useEffect, useState } from "react";
import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";
import { Button, Card, Modal, PageHeader, Segmented, SettingRow, Switch, TextInput } from "@viex/shared";
import { host } from "../lib/controller";
import { useHost } from "../lib/useHost";

function updateStatusText(status: ReturnType<typeof useHost>["updateStatus"], version: string | null, progress: number) {
  switch (status) {
    case "checking":
      return "Checking for updates…";
    case "available":
      return `Update ${version ?? ""} found — starting download…`.trim();
    case "downloading":
      return `Downloading update… ${progress}%`;
    case "installing":
      return "Installing — VIEX Host will restart itself.";
    case "up-to-date":
      return "You're on the latest version.";
    case "error":
      return "Couldn't check for updates. Will try again automatically.";
    default:
      return "Checks automatically — no clicks needed.";
  }
}

export function System() {
  const { config, session, updateStatus, updateVersion, updateProgress } = useHost();
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
        <SettingRow title="Stream quality" hint="Higher is sharper but uses more bandwidth and CPU. Applies to the next session.">
          <Segmented
            value={config?.quality ?? "high"}
            options={[
              { value: "balanced", label: "Balanced" },
              { value: "high", label: "High" },
              { value: "max", label: "Max" },
            ]}
            onChange={(quality) => void host.saveConfig({ quality })}
          />
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

      <Card className="mb-6">
        <SettingRow title="Updates" hint={updateStatusText(updateStatus, updateVersion, updateProgress)}>
          <Button
            size="sm"
            variant="ghost"
            disabled={updateStatus === "checking" || updateStatus === "downloading" || updateStatus === "installing"}
            onClick={() => void host.checkForUpdates(true)}
          >
            Check now
          </Button>
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
