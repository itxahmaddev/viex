import { useState } from "react";
import { Button, Card, IconUsers, Modal, Notice, PageHeader, Segmented, SectionLabel, SettingRow } from "@viex/shared";
import type { TrustedViewer } from "@viex/shared";
import { host } from "../lib/controller";
import { useHost } from "../lib/useHost";

export function Viewers() {
  const { config } = useHost();
  const viewers = config?.trusted_viewers ?? [];
  const [confirmQuiet, setConfirmQuiet] = useState<TrustedViewer | null>(null);

  return (
    <>
      <PageHeader
        title="Viewers"
        subtitle="Choose how each viewer is let in. These choices are stored only on this PC."
      />

      <Card className="mb-6">
        <SettingRow title="Ask (default)" hint="A popup asks you to Accept or Reject every request." />
        <SettingRow title="Auto-Approve" hint="A trusted viewer connects instantly. You still see a notice and the live indicator." />
        <SettingRow
          title="Quiet Mode"
          hint="Like Auto-Approve, but no popup and no notice. A small live indicator always stays visible — this cannot be turned off."
        />
      </Card>

      <SectionLabel count={viewers.length}>Trusted viewers</SectionLabel>
      {viewers.length === 0 ? (
        <Card className="grid place-items-center gap-2 px-6 py-10 text-center">
          <span className="grid size-10 place-items-center rounded-lg bg-muted text-ink-3">
            <IconUsers size={18} />
          </span>
          <div className="text-[14px] font-medium">No trusted viewers yet</div>
          <p className="max-w-sm text-small text-ink-3">
            Every new viewer is asked about first. Choose “Always allow” in that popup to add them here.
          </p>
        </Card>
      ) : (
        <Card>
          {viewers.map((viewer) => (
            <SettingRow
              key={viewer.viewer_id}
              title={viewer.name}
              hint={`Added ${new Date(viewer.added_at).toLocaleDateString()}`}
            >
              <div className="flex items-center gap-2">
                <Segmented
                  value={viewer.mode}
                  options={[
                    { value: "auto-approve", label: "Auto-Approve" },
                    { value: "quiet", label: "Quiet" },
                  ]}
                  onChange={(mode) => {
                    if (mode === "quiet") setConfirmQuiet(viewer);
                    else void host.setTrust(viewer.viewer_id, viewer.name, mode);
                  }}
                />
                <Button size="sm" variant="ghost" onClick={() => void host.setTrust(viewer.viewer_id, viewer.name, null)}>
                  Remove
                </Button>
              </div>
            </SettingRow>
          ))}
        </Card>
      )}

      <Modal
        open={!!confirmQuiet}
        title="Turn on Quiet Mode?"
        onClose={() => setConfirmQuiet(null)}
        actions={
          <>
            <Button variant="ghost" onClick={() => setConfirmQuiet(null)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                if (confirmQuiet) void host.setTrust(confirmQuiet.viewer_id, confirmQuiet.name, "quiet");
                setConfirmQuiet(null);
              }}
            >
              I understand, turn it on
            </Button>
          </>
        }
      >
        <p>
          <span className="font-semibold text-foreground">{confirmQuiet?.name}</span> will be able to watch this PC
          <strong> without any popup or notification</strong>.
        </p>
        <div className="mt-3">
          <Notice tone="warn" title="The indicator always stays on">
            While they watch, a small “VIEX is live” pill and a red tray icon remain visible. This is a core safety
            rule of VIEX and cannot be disabled.
          </Notice>
        </div>
      </Modal>
    </>
  );
}
