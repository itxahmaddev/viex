import { useState } from "react";
import { Button, IconLock, IconMonitor, IconShield, Notice, TextInput, Wordmark } from "@viex/shared";
import { host } from "../lib/controller";
import { useHost } from "../lib/useHost";

/** First-run wizard: what VIEX Host does, then Server URL + Password. */
export function Onboarding() {
  const { config } = useHost();
  const [step, setStep] = useState<0 | 1>(0);
  const [serverUrl, setServerUrl] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState(config?.device_name ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connect = async () => {
    setBusy(true);
    setError(null);
    try {
      await host.completeSetup({ serverUrl, password, deviceName: name });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  return (
    <div className="relative grid h-full place-items-center overflow-hidden bg-canvas p-6">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 -top-40 mx-auto h-80 max-w-xl rounded-full bg-primary/15 blur-3xl"
      />
      <div className="relative w-full max-w-[460px] animate-pop rounded-panel border border-border bg-background p-7 shadow-lift">
        <Wordmark tag="HOST" />

        {step === 0 ? (
          <div className="mt-7">
            <h1 className="text-title font-semibold leading-8 tracking-[-0.03em]">Watch this PC from anywhere.</h1>
            <p className="mt-2 text-body text-ink-2">
              VIEX Host lets you view this computer’s screens live from your phone or another laptop. It runs quietly in the
              tray and starts with Windows.
            </p>
            <ul className="mt-5 flex flex-col gap-3">
              {[
                [IconMonitor, "View-only", "No mouse or keyboard control exists in VIEX — by design."],
                [IconLock, "Your server, your password", "Video goes peer-to-peer and is encrypted end to end."],
                [IconShield, "Always visible", "A small indicator shows whenever someone is watching."],
              ].map(([Icon, title, text]) => {
                const I = Icon as typeof IconMonitor;
                return (
                  <li key={title as string} className="flex gap-3">
                    <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary">
                      <I size={16} />
                    </span>
                    <div>
                      <div className="text-[14px] font-medium leading-5">{title as string}</div>
                      <div className="text-small leading-[18px] text-ink-3">{text as string}</div>
                    </div>
                  </li>
                );
              })}
            </ul>
            <Button variant="primary" size="lg" className="mt-7 w-full" onClick={() => setStep(1)}>
              Get started
            </Button>
          </div>
        ) : (
          <form
            className="mt-7 flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              void connect();
            }}
          >
            <div>
              <h1 className="text-title font-semibold leading-8 tracking-[-0.03em]">Connect to your server</h1>
              <p className="mt-1 text-body text-ink-2">
                Use the Relay you deployed and the password you set in <code className="font-mono text-[13px]">VIEX_PASSWORD</code>.
              </p>
            </div>
            <TextInput
              label="Server URL"
              placeholder="https://your-relay.onrender.com"
              value={serverUrl}
              onChange={(e) => setServerUrl(e.target.value)}
              autoFocus
              autoComplete="off"
              spellCheck={false}
            />
            <TextInput
              label="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="off"
              hint="Saved in the Windows Credential Manager — never in a plain file."
            />
            <TextInput
              label="This PC’s name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              hint="Shown in the device list on your phone."
              maxLength={64}
            />
            {error && <Notice tone="error">{error}</Notice>}
            {busy && !error && (
              <p className="text-label text-ink-3">Connecting… a free Render server can take up to a minute to wake up.</p>
            )}
            <div className="mt-1 flex gap-2">
              <Button variant="ghost" onClick={() => setStep(0)} disabled={busy}>
                Back
              </Button>
              <Button type="submit" variant="primary" className="flex-1" disabled={busy || !serverUrl || !password}>
                {busy ? "Connecting…" : "Connect"}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
