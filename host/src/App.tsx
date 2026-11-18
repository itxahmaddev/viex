import { useState, type ComponentType } from "react";
import {
  Badge,
  Button,
  IconDevices,
  IconInfo,
  IconMonitor,
  IconNetwork,
  IconSettings,
  Modal,
  StatusDot,
  Wordmark,
} from "@viex/shared";
import { host } from "./lib/controller";
import { useHost } from "./lib/useHost";
import { Home } from "./pages/Home";
import { Viewers } from "./pages/Viewers";
import { Network } from "./pages/Network";
import { System } from "./pages/System";
import { About } from "./pages/About";
import { Onboarding } from "./pages/Onboarding";

type PageId = "home" | "viewers" | "network" | "system" | "about";

const NAV: Array<{ group: string; items: Array<{ id: PageId; label: string; icon: ComponentType<{ size?: number }> }> }> = [
  {
    group: "Workspace",
    items: [
      { id: "home", label: "Home", icon: IconMonitor },
      { id: "viewers", label: "Viewers", icon: IconDevices },
    ],
  },
  { group: "Preferences", items: [{ id: "network", label: "Network", icon: IconNetwork }] },
  {
    group: "App",
    items: [
      { id: "system", label: "System", icon: IconSettings },
      { id: "about", label: "About", icon: IconInfo },
    ],
  },
];

const PAGES: Record<PageId, ComponentType> = { home: Home, viewers: Viewers, network: Network, system: System, about: About };

export function App() {
  const state = useHost();
  const [page, setPage] = useState<PageId>("home");

  if (!state.ready) return <div className="h-full bg-canvas" />;
  if (!state.config?.setup_complete) return <Onboarding />;

  const Page = PAGES[page];
  const relayTone = state.relay === "online" ? "online" : state.relay === "connecting" ? "busy" : "offline";
  const relayLabel =
    state.relay === "online" ? "Online" : state.relay === "connecting" ? "Connecting…" : state.relay === "auth-failed" ? "Wrong password" : "Offline";

  return (
    <div className="flex h-full select-none cursor-default flex-col bg-canvas">
      <div className="flex flex-1 overflow-hidden">
        <nav className="flex h-full w-[220px] shrink-0 flex-col ps-3 pe-2 pt-4 pb-3">
          <div className="mb-5">
            <Wordmark tag="HOST" />
          </div>
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
            {NAV.map((section) => (
              <div key={section.group} className="flex flex-col gap-0.5">
                <span className="flex items-baseline gap-1.5 px-2 pb-1 font-mono text-[10.5px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                  {section.group}
                  <span className="text-muted-foreground/55">{section.items.length}</span>
                </span>
                {section.items.map(({ id, label, icon: Icon }) => {
                  const active = page === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      aria-current={active ? "page" : undefined}
                      onClick={() => setPage(id)}
                      className={`relative flex h-8 w-full items-center gap-2.5 rounded-lg border px-2 text-start text-[13px] transition-colors duration-200 ease-glide ${
                        active
                          ? "border-border bg-accent font-medium text-foreground"
                          : "border-transparent text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                      }`}
                    >
                      <span className={active ? "text-primary" : ""}>
                        <Icon size={16} />
                      </span>
                      {label}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center gap-2 rounded-lg border border-border bg-muted/50 px-2.5 py-2 text-[12px] text-muted-foreground">
            <StatusDot tone={state.session ? "live" : relayTone} pulse={!!state.session} />
            <span className="truncate">{state.session ? "Live" : relayLabel}</span>
          </div>
        </nav>

        <main className="relative my-2 me-2 flex flex-1 flex-col overflow-hidden rounded-2xl border border-border bg-background">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle,var(--color-line)_1px,transparent_1.2px)] [background-size:22px_22px] [mask-image:linear-gradient(to_bottom,black,transparent_340px)]"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 -top-40 mx-auto h-72 max-w-xl rounded-full bg-primary/12 blur-3xl"
          />
          <div className="relative flex-1 overflow-y-auto select-text">
            <div key={page} className="mx-auto w-full max-w-[760px] animate-rise px-7 pt-8 pb-10">
              <Page />
            </div>
          </div>
        </main>
      </div>

      {state.toast && (
        <div className="fixed bottom-4 end-4 z-40 max-w-sm rounded-lg border border-border bg-surface px-4 py-2.5 text-small shadow-pop animate-rise">
          {state.toast}
        </div>
      )}

      <Modal
        open={!!state.pending}
        title="Someone wants to watch this screen"
        actions={
          <>
            <Button variant="ghost" onClick={() => host.reject()}>
              Reject
            </Button>
            <Button onClick={() => void host.accept(true)}>Always allow</Button>
            <Button variant="primary" onClick={() => void host.accept(false)}>
              Accept once
            </Button>
          </>
        }
      >
        <p>
          <span className="font-semibold text-foreground">{state.pending?.viewer_name}</span> is asking to view{" "}
          {state.monitors.length === 1 ? "your screen" : `all ${state.monitors.length} of your screens`}. They can only
          watch — they cannot control anything.
        </p>
        <p className="mt-2 text-small text-ink-3">
          “Always allow” remembers this viewer on this PC (Auto-Approve). You can change or remove it any time in Viewers.
        </p>
        <div className="mt-3">
          <Badge tone="warn">A live indicator stays visible for the whole session</Badge>
        </div>
      </Modal>
    </div>
  );
}
