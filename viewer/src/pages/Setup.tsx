import { useState } from "react";
import { Button, Notice, TextInput, Wordmark } from "@viex/shared";
import { viewer } from "../lib/controller";
import { useViewer } from "../lib/useViewer";

/** First-run: Server URL + Password. */
export function Setup() {
  const { config } = useViewer();
  const [serverUrl, setServerUrl] = useState(config?.server_url ?? "");
  const [password, setPassword] = useState("");
  const [name, setName] = useState(config?.viewer_name ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await viewer.setup({ serverUrl, password, name });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  return (
    <div
      className="relative grid h-full place-items-center overflow-y-auto bg-canvas p-4"
      style={{ paddingTop: "calc(var(--safe-top) + 1rem)", paddingBottom: "calc(var(--safe-bottom) + 1rem)" }}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 -top-40 mx-auto h-80 max-w-xl rounded-full bg-primary/15 blur-3xl"
      />
      <form
        className="relative flex w-full max-w-[440px] animate-pop flex-col gap-4 rounded-panel border border-border bg-background p-6 shadow-lift"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <Wordmark tag="VIEW" />
        <div className="mt-2">
          <h1 className="text-title font-semibold leading-8 tracking-[-0.03em]">Connect to your server</h1>
          <p className="mt-1 text-body text-ink-2">Enter the Relay URL and the password you set when you deployed it.</p>
        </div>
        <TextInput
          label="Server URL"
          placeholder="https://your-relay.onrender.com"
          value={serverUrl}
          onChange={(e) => setServerUrl(e.target.value)}
          inputMode="url"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
        />
        <TextInput
          label="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
        />
        <TextInput
          label="Name this device"
          value={name}
          onChange={(e) => setName(e.target.value)}
          hint="Shown on your PC when this device asks to watch."
          maxLength={64}
        />
        {error && <Notice tone="error">{error}</Notice>}
        {busy && !error && (
          <p className="text-label text-ink-3">Connecting… a free Render server can take up to a minute to wake up.</p>
        )}
        <Button type="submit" variant="primary" size="lg" disabled={busy || !serverUrl || !password}>
          {busy ? "Connecting…" : "Connect"}
        </Button>
      </form>
    </div>
  );
}
