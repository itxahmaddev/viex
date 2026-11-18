import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Button, Card, Notice, PageHeader, SettingRow } from "@viex/shared";

const REPO = "https://github.com/itxahmaddev/viex";

export function About() {
  const [version, setVersion] = useState("…");
  useEffect(() => {
    getVersion()
      .then(setVersion)
      .catch(() => setVersion("dev"));
  }, []);

  return (
    <>
      <PageHeader title="About" subtitle="Open-source, self-hosted, view-only remote screen viewer." />
      <Card className="mb-6">
        <SettingRow title="VIEX Host">
          <span className="font-mono text-[12.5px] text-ink-2">v{version}</span>
        </SettingRow>
        <SettingRow title="Source code & releases" hint="MIT licensed. Fork it, deploy your own server, point your devices at it.">
          <Button size="sm" onClick={() => void openUrl(REPO)}>
            Open GitHub
          </Button>
        </SettingRow>
        <SettingRow title="Report an issue">
          <Button size="sm" onClick={() => void openUrl(`${REPO}/issues`)}>
            Open issues
          </Button>
        </SettingRow>
      </Card>
      <Notice tone="warn" title="The indicator guardrail">
        VIEX is for watching your own computers. Whenever a session is live, a visible indicator is shown — in every
        permission mode — and it cannot be disabled in this app. Forks should keep it that way.
      </Notice>
    </>
  );
}
