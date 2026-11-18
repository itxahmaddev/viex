import { useState, type ComponentType } from "react";
import { IconDevices, IconSettings, StatusDot, Wordmark } from "@viex/shared";
import { useViewer } from "./lib/useViewer";
import { Devices } from "./pages/Devices";
import { Settings } from "./pages/Settings";
import { Setup } from "./pages/Setup";
import { Session } from "./pages/Session";

type PageId = "devices" | "settings";

const NAV: Array<{ id: PageId; label: string; icon: ComponentType<{ size?: number }> }> = [
  { id: "devices", label: "Devices", icon: IconDevices },
  { id: "settings", label: "Settings", icon: IconSettings },
];

export function App() {
  const state = useViewer();
  const [page, setPage] = useState<PageId>("devices");

  if (!state.ready) return <div className="h-full bg-canvas" />;
  if (!state.config?.server_url || !state.config.password) return <Setup />;
  if (state.session) return <Session />;

  const tone = state.relay === "online" ? "online" : state.relay === "connecting" ? "busy" : "offline";
  const label =
    state.relay === "online" ? "Connected" : state.relay === "connecting" ? "Connecting…" : state.relay === "auth-failed" ? "Wrong password" : "Offline";
  const Page = page === "devices" ? Devices : Settings;

  return (
    <div className="flex h-full flex-col bg-canvas md:flex-row" style={{ paddingTop: "var(--safe-top)" }}>
      {/* Sidebar (desktop / tablet) */}
      <nav className="hidden h-full w-[220px] shrink-0 flex-col ps-3 pe-2 pt-4 pb-3 md:flex">
        <div className="mb-5">
          <Wordmark tag="VIEW" />
        </div>
        <div className="flex flex-1 flex-col gap-0.5">
          <span className="px-2 pb-1 font-mono text-[10.5px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
            Workspace
          </span>
          {NAV.map(({ id, label: text, icon: Icon }) => (
            <button
              key={id}
              type="button"
              aria-current={page === id ? "page" : undefined}
              onClick={() => setPage(id)}
              className={`flex h-8 w-full items-center gap-2.5 rounded-lg border px-2 text-start text-[13px] transition-colors duration-200 ease-glide ${
                page === id
                  ? "border-border bg-accent font-medium text-foreground"
                  : "border-transparent text-muted-foreground hover:bg-accent/50 hover:text-foreground"
              }`}
            >
              <span className={page === id ? "text-primary" : ""}>
                <Icon size={16} />
              </span>
              {text}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/50 px-2.5 py-2 text-[12px] text-muted-foreground">
          <StatusDot tone={tone} pulse={tone === "busy"} />
          <span className="truncate">{label}</span>
        </div>
      </nav>

      {/* Mobile header */}
      <header className="flex items-center justify-between px-4 pt-3 pb-2 md:hidden">
        <Wordmark tag="VIEW" />
        <span className="flex items-center gap-2 rounded-full border border-border bg-muted/50 px-2.5 py-1 text-[12px] text-muted-foreground">
          <StatusDot tone={tone} pulse={tone === "busy"} />
          {label}
        </span>
      </header>

      <main className="relative flex min-h-0 flex-1 flex-col overflow-hidden border-border bg-background md:my-2 md:me-2 md:rounded-2xl md:border">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 hidden bg-[radial-gradient(circle,var(--color-line)_1px,transparent_1.2px)] [background-size:22px_22px] [mask-image:linear-gradient(to_bottom,black,transparent_340px)] md:block"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 -top-40 mx-auto h-72 max-w-xl rounded-full bg-primary/12 blur-3xl"
        />
        <div className="relative flex-1 overflow-y-auto">
          <div key={page} className="mx-auto w-full max-w-[760px] animate-rise px-4 pt-4 pb-6 md:px-7 md:pt-8 md:pb-10">
            <Page />
          </div>
        </div>
      </main>

      {/* Bottom tabs (mobile) */}
      <nav
        className="flex shrink-0 border-t border-border bg-background md:hidden"
        style={{ paddingBottom: "var(--safe-bottom)" }}
      >
        {NAV.map(({ id, label: text, icon: Icon }) => (
          <button
            key={id}
            type="button"
            aria-current={page === id ? "page" : undefined}
            onClick={() => setPage(id)}
            className={`flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11.5px] font-medium transition-colors ${
              page === id ? "text-primary" : "text-muted-foreground"
            }`}
          >
            <Icon size={20} />
            {text}
          </button>
        ))}
      </nav>
    </div>
  );
}
