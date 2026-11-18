import { Badge, Button, Card, IconMonitor, Notice, PageHeader, SectionLabel, StatusDot } from "@viex/shared";
import { host } from "../lib/controller";
import { useHost } from "../lib/useHost";

export function Home() {
  const { config, relay, relayDetail, monitors, session } = useHost();

  const status =
    relay === "online"
      ? { tone: "online" as const, title: "Online — ready to be viewed", text: "Open VIEX Viewer on your phone and pick this PC." }
      : relay === "connecting"
        ? { tone: "busy" as const, title: "Connecting to your server…", text: "A free Render server can take up to a minute to wake up." }
        : relay === "auth-failed"
          ? { tone: "offline" as const, title: "The server rejected the password", text: "Open System → Change server to sign in again." }
          : { tone: "offline" as const, title: "Offline", text: relayDetail ?? "Trying to reach your server. This retries automatically." };

  return (
    <>
      <PageHeader title="Home" subtitle={config?.device_name ?? ""} />

      {session ? (
        <Card className="mb-6 border-error/40">
          <div className="flex items-center gap-4 p-4">
            <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-error-wash text-error">
              <StatusDot tone="live" pulse />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[15px] font-semibold leading-5">
                {session.viewer_name} is watching{session.phase === "connecting" ? " (connecting…)" : ""}
              </div>
              <div className="text-small text-ink-3">
                {monitors.length} screen{monitors.length === 1 ? "" : "s"} shared · view-only
                {session.quiet ? " · Quiet Mode (indicator stays visible)" : ""}
              </div>
            </div>
            <Button variant="danger" onClick={() => host.endSession()}>
              Stop sharing
            </Button>
          </div>
        </Card>
      ) : (
        <Card className="mb-6">
          <div className="flex items-center gap-4 p-4">
            <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-muted">
              <StatusDot tone={status.tone} pulse={status.tone === "busy"} />
            </span>
            <div className="min-w-0">
              <div className="text-[15px] font-semibold leading-5">{status.title}</div>
              <div className="text-small text-ink-3">{status.text}</div>
            </div>
          </div>
        </Card>
      )}

      {relay === "auth-failed" && (
        <div className="mb-6">
          <Notice tone="error">{relayDetail ?? "Wrong password."}</Notice>
        </div>
      )}

      <SectionLabel count={monitors.length}>Screens on this PC</SectionLabel>
      {monitors.length === 0 ? (
        <Notice tone="warn">No displays found. Viewers will see an empty device until a screen is available.</Notice>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {monitors.map((monitor) => (
            <Card key={monitor.id} className="p-4">
              <div className="flex items-center gap-3">
                <span className="grid size-9 place-items-center rounded-lg bg-primary-soft text-primary">
                  <IconMonitor size={18} />
                </span>
                <div className="min-w-0">
                  <div className="truncate text-[14px] font-medium leading-5">{monitor.label}</div>
                  <div className="font-mono text-[11.5px] text-ink-3">
                    {monitor.w} × {monitor.h}
                  </div>
                </div>
                {monitor.primary && (
                  <span className="ms-auto">
                    <Badge tone="primary">PRIMARY</Badge>
                  </span>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      <p className="mt-6 text-small text-ink-3">
        Closing this window keeps VIEX Host running in the tray so this PC stays reachable. Quit it from the tray icon.
      </p>
    </>
  );
}
