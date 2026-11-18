import { useEffect, useRef, useState } from "react";
import { Badge, Button, IconClose, IconExpand, IconGrid, StatusDot } from "@viex/shared";
import { viewer, type Tile } from "../lib/controller";
import { useViewer } from "../lib/useViewer";

function VideoTile({ tile, contain }: { tile: Tile; contain?: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const video = ref.current;
    if (video && video.srcObject !== tile.stream) {
      video.srcObject = tile.stream;
      void video.play().catch(() => {});
    }
  }, [tile.stream]);
  return (
    <video
      ref={ref}
      autoPlay
      playsInline
      muted
      className={`h-full w-full bg-black ${contain ? "object-contain" : "object-cover"}`}
    />
  );
}

export function Session() {
  const { session } = useViewer();
  const [chromeVisible, setChromeVisible] = useState(true);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchX = useRef<number | null>(null);

  // Keep the screen awake while watching.
  useEffect(() => {
    let lock: WakeLockSentinel | null = null;
    navigator.wakeLock
      ?.request("screen")
      .then((l) => (lock = l))
      .catch(() => {});
    return () => void lock?.release().catch(() => {});
  }, []);

  const poke = () => {
    setChromeVisible(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setChromeVisible(false), 3500);
  };
  useEffect(() => {
    poke();
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, []);

  if (!session) return null;
  const { tiles, mode, focus, phase, device, detail, noTurn } = session;
  const live = phase === "live" && tiles.length > 0;

  const go = (delta: number) => {
    const next = (focus + delta + tiles.length) % tiles.length;
    viewer.setView("single", next);
  };

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      /* not available in every webview */
    }
  };

  return (
    <div
      className="relative h-full w-full overflow-hidden bg-black text-white"
      onPointerMove={poke}
      onPointerDown={poke}
    >
      {!live ? (
        <div className="grid h-full place-items-center p-6">
          <div className="flex w-full max-w-sm animate-pop flex-col items-center gap-4 rounded-panel border border-white/10 bg-[#15171b] p-7 text-center">
            <span className="size-9 animate-spin rounded-full border-2 border-white/15 border-t-[#5a94ff]" />
            <div>
              <div className="text-[17px] font-semibold tracking-[-0.02em]">
                {phase === "requesting" ? `Waiting for ${device.name}…` : `Connecting to ${device.name}…`}
              </div>
              <p className="mt-1 text-small text-white/60">
                {phase === "requesting"
                  ? "Someone at the PC may need to tap Accept."
                  : "Setting up a direct, encrypted connection."}
              </p>
              {detail && phase !== "requesting" && <p className="mt-2 font-mono text-[11.5px] text-white/50">{detail}</p>}
              {noTurn && phase === "connecting" && (
                <p className="mt-2 text-[11.5px] leading-4 text-white/45">
                  No TURN relay is configured, so this only works when both networks allow direct connections.
                </p>
              )}
            </div>
            <Button variant="secondary" onClick={() => viewer.leave()}>
              Cancel
            </Button>
          </div>
        </div>
      ) : mode === "grid" ? (
        <div
          className="grid h-full w-full auto-rows-fr gap-1.5 overflow-y-auto p-1.5"
          style={{
            gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 380px), 1fr))",
            paddingTop: "calc(var(--safe-top) + 3.25rem)",
            paddingBottom: "calc(var(--safe-bottom) + 0.375rem)",
          }}
        >
          {tiles.map((tile, index) => (
            <button
              key={tile.stream_id}
              type="button"
              onClick={() => viewer.setView("single", index)}
              className="group relative min-h-[160px] overflow-hidden rounded-xl border border-white/10"
              aria-label={`Open ${tile.label} full screen`}
            >
              <VideoTile tile={tile} contain />
              <span className="absolute bottom-2 start-2 rounded-md bg-black/60 px-2 py-0.5 text-[12px] font-medium backdrop-blur">
                {tile.label}
              </span>
            </button>
          ))}
        </div>
      ) : (
        <div
          className="h-full w-full"
          onTouchStart={(e) => (touchX.current = e.touches[0].clientX)}
          onTouchEnd={(e) => {
            if (touchX.current === null || tiles.length < 2) return;
            const dx = e.changedTouches[0].clientX - touchX.current;
            touchX.current = null;
            if (Math.abs(dx) > 70) go(dx < 0 ? 1 : -1);
          }}
        >
          {tiles[focus] && <VideoTile key={tiles[focus].stream_id} tile={tiles[focus]} contain />}
        </div>
      )}

      {/* Top bar */}
      <div
        className={`absolute inset-x-0 top-0 z-10 flex items-center gap-2 bg-gradient-to-b from-black/80 to-transparent px-3 pb-6 transition-opacity duration-300 ${
          chromeVisible || !live ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        style={{ paddingTop: "calc(var(--safe-top) + 0.5rem)" }}
      >
        <Button size="sm" variant="secondary" onClick={() => viewer.leave()} aria-label="Stop watching" className="bg-white/10 text-white hover:bg-white/20 border-white/15">
          <IconClose size={14} />
          Stop
        </Button>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <StatusDot tone={live ? "online" : "busy"} pulse={!live} />
          <span className="truncate text-[14px] font-medium">{device.name}</span>
          {live && mode === "single" && tiles[focus] && <Badge tone="neutral">{tiles[focus].label}</Badge>}
        </div>
        {live && tiles.length > 1 && (
          <Button
            size="sm"
            variant="secondary"
            className="bg-white/10 text-white hover:bg-white/20 border-white/15"
            onClick={() => viewer.setView(mode === "grid" ? "single" : "grid")}
            aria-label={mode === "grid" ? "Single screen" : "All screens"}
          >
            <IconGrid size={14} />
            {mode === "grid" ? "Single" : "Grid"}
          </Button>
        )}
        <Button
          size="sm"
          variant="secondary"
          className="bg-white/10 text-white hover:bg-white/20 border-white/15"
          onClick={() => void toggleFullscreen()}
          aria-label="Toggle full screen"
        >
          <IconExpand size={14} />
        </Button>
      </div>

      {/* Monitor tabs in single view */}
      {live && mode === "single" && tiles.length > 1 && (
        <div
          className={`absolute inset-x-0 bottom-0 z-10 flex justify-center gap-1.5 bg-gradient-to-t from-black/80 to-transparent px-3 pt-8 transition-opacity duration-300 ${
            chromeVisible ? "opacity-100" : "pointer-events-none opacity-0"
          }`}
          style={{ paddingBottom: "calc(var(--safe-bottom) + 0.75rem)" }}
        >
          {tiles.map((tile, index) => (
            <button
              key={tile.stream_id}
              type="button"
              onClick={() => viewer.setView("single", index)}
              className={`rounded-full border px-3 py-1.5 text-[12.5px] font-medium backdrop-blur transition-colors ${
                index === focus ? "border-transparent bg-[#5a94ff] text-[#070b14]" : "border-white/15 bg-white/10 text-white"
              }`}
            >
              {tile.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
