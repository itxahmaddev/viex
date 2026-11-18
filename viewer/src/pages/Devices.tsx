import { Badge, Button, Card, IconMonitor, IconRefresh, Notice, PageHeader, SectionLabel, StatusDot } from "@viex/shared";
import { viewer } from "../lib/controller";
import { useViewer } from "../lib/useViewer";

export function Devices() {
  const { devices, relay, relayDetail, notice } = useViewer();
  const online = relay === "online";

  return (
    <>
      <PageHeader
        title="Devices"
        subtitle="Pick a PC to watch."
        actions={
          <Button size="sm" variant="secondary" onClick={() => viewer.refresh()} disabled={!online} aria-label="Refresh devices">
            <IconRefresh size={14} />
            Refresh
          </Button>
        }
      />

      {notice && (
        <div className="mb-4 flex items-start gap-3">
          <div className="flex-1">
            <Notice tone="warn">{notice}</Notice>
          </div>
          <Button size="sm" variant="ghost" onClick={() => viewer.dismissNotice()}>
            Dismiss
          </Button>
        </div>
      )}

      {relay === "auth-failed" && (
        <div className="mb-4">
          <Notice tone="error" title="The server rejected the password">
            Open Settings → Sign out and enter it again.
          </Notice>
        </div>
      )}
      {(relay === "offline" || relay === "connecting") && (
        <div className="mb-4">
          <Notice tone="warn" title={relay === "connecting" ? "Connecting to your server…" : "Can’t reach your server"}>
            {relay === "connecting"
              ? "A free Render server can take up to a minute to wake up."
              : (relayDetail ?? "Retrying automatically.")}
          </Notice>
        </div>
      )}

      <SectionLabel count={devices.length}>Your PCs</SectionLabel>
      {devices.length === 0 ? (
        <Card className="grid place-items-center gap-2 px-6 py-12 text-center">
          <span className="grid size-11 place-items-center rounded-lg bg-muted text-ink-3">
            <IconMonitor size={20} />
          </span>
          <div className="text-[15px] font-medium">No PCs online</div>
          <p className="max-w-sm text-small text-ink-3">
            Install VIEX Host on a computer and sign in with the same server. It appears here as soon as it starts.
          </p>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {devices.map((device) => (
            <Card key={device.device_id} className="p-4">
              <div className="flex items-center gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary">
                  <IconMonitor size={20} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-[15px] font-semibold leading-5">{device.name}</span>
                    <StatusDot tone={device.busy ? "busy" : "online"} />
                  </div>
                  <div className="mt-0.5 flex flex-wrap gap-1.5">
                    <Badge>{device.monitors.length || 1} SCREEN{device.monitors.length === 1 ? "" : "S"}</Badge>
                    {device.monitors.slice(0, 3).map((m) => (
                      <Badge key={m.id}>
                        {m.w}×{m.h}
                      </Badge>
                    ))}
                  </div>
                </div>
                <Button variant="primary" disabled={device.busy || !online} onClick={() => viewer.watch(device)}>
                  {device.busy ? "In use" : "Watch"}
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
