import { useEffect, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { Badge, Button, IconClose, IconExpand, IconGrid, StatusDot } from "@viex/shared";
import { viewer, type Tile } from "../lib/controller";
import { useViewer } from "../lib/useViewer";
import { ViexNative } from "../lib/nativePlugin";

const isNativeApp = () => Capacitor.getPlatform() !== "web";

function VideoTile({
  tile,
  contain,
  videoRef,
}: {
  tile: Tile;
  contain?: boolean;
  videoRef?: (el: HTMLVideoElement | null) => void;
}) {
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
      ref={(el) => {
        (ref as React.MutableRefObject<HTMLVideoElement | null>).current = el;
        videoRef?.(el);
      }}
      autoPlay
      playsInline
      muted
      className={`h-full w-full bg-black ${contain ? "object-contain" : "object-cover"}`}
    />
  );
}

/** Pinch-to-zoom + drag-to-pan on the focused screen. Disabled while zoomed out (scale 1),
 *  where a horizontal swipe instead switches monitors — the two gestures never fight because
 *  a swipe only fires when the pinch never moved the scale away from 1. */
function useZoomPan(enabled: boolean) {
  const [transform, setTransform] = useState({ scale: 1, x: 0, y: 0 });
  const gesture = useRef<{
    mode: "none" | "pinch" | "pan";
    startDist: number;
    startScale: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    lastTap: number;
  }>({ mode: "none", startDist: 0, startScale: 1, startX: 0, startY: 0, originX: 0, originY: 0, lastTap: 0 });

  const clamp = (t: { scale: number; x: number; y: number }) => {
    const scale = Math.min(4, Math.max(1, t.scale));
    const maxPan = (scale - 1) * 160; // generous bound; the video itself clips via overflow-hidden
    return { scale, x: Math.min(maxPan, Math.max(-maxPan, t.x)), y: Math.min(maxPan, Math.max(-maxPan, t.y)) };
  };

  const reset = () => setTransform({ scale: 1, x: 0, y: 0 });

  const onTouchStart = (e: React.TouchEvent) => {
    if (!enabled) return;
    const g = gesture.current;
    if (e.touches.length === 2) {
      const [a, b] = [e.touches[0], e.touches[1]];
      g.mode = "pinch";
      g.startDist = Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY);
      g.startScale = transform.scale;
    } else if (e.touches.length === 1 && transform.scale > 1.01) {
      g.mode = "pan";
      g.startX = e.touches[0].clientX;
      g.startY = e.touches[0].clientY;
      g.originX = transform.x;
      g.originY = transform.y;
    } else {
      g.mode = "none";
    }
  };

  const onTouchMove = (e: React.TouchEvent) => {
    const g = gesture.current;
    if (g.mode === "pinch" && e.touches.length === 2) {
      const [a, b] = [e.touches[0], e.touches[1]];
      const dist = Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY);
      const scale = g.startScale * (dist / g.startDist);
      setTransform((t) => clamp({ ...t, scale }));
    } else if (g.mode === "pan" && e.touches.length === 1) {
      const dx = e.touches[0].clientX - g.startX;
      const dy = e.touches[0].clientY - g.startY;
      setTransform((t) => clamp({ ...t, x: g.originX + dx, y: g.originY + dy }));
    }
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    const g = gesture.current;
    const wasZooming = g.mode !== "none";
    g.mode = "none";
    setTransform((t) => (t.scale < 1.05 ? { scale: 1, x: 0, y: 0 } : t));
    if (wasZooming || e.touches.length > 0) return;

    // Double-tap to reset (or to zoom in to 2x from 1x).
    const now = Date.now();
    if (now - g.lastTap < 300) {
      g.lastTap = 0;
      setTransform((t) => (t.scale > 1.01 ? { scale: 1, x: 0, y: 0 } : { scale: 2, x: 0, y: 0 }));
    } else {
      g.lastTap = now;
    }
  };

  return { transform, zoomed: transform.scale > 1.01, reset, onTouchStart, onTouchMove, onTouchEnd };
}

export function Session() {
  const { session } = useViewer();
  const [chromeVisible, setChromeVisible] = useState(true);
  const [pipSupported, setPipSupported] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchX = useRef<number | null>(null);
  const activeVideo = useRef<HTMLVideoElement | null>(null);

  const live = !!session && session.phase === "live" && session.tiles.length > 0;
  const zoomPan = useZoomPan(live && session?.mode === "single");

  // Keep the screen awake while watching.
  useEffect(() => {
    let lock: WakeLockSentinel | null = null;
    navigator.wakeLock
      ?.request("screen")
      .then((l) => (lock = l))
      .catch(() => {});
    return () => void lock?.release().catch(() => {});
  }, []);

  useEffect(() => {
    if (isNativeApp()) void ViexNative.isPipSupported().then((r) => setPipSupported(r.supported)).catch(() => {});
    else setPipSupported(typeof document !== "undefined" && "pictureInPictureEnabled" in document && document.pictureInPictureEnabled);
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

  /** The "mini player" — floats the current screen in a small system window so watching
   *  continues while you use other apps. Native Android gets real Picture-in-Picture;
   *  on the web it's the standard browser PiP window for the focused <video>. */
  const enterMiniPlayer = async () => {
    try {
      if (isNativeApp()) await ViexNative.enterPip();
      else if (activeVideo.current && document.pictureInPictureEnabled) await activeVideo.current.requestPictureInPicture();
    } catch {
      /* unsupported on this device/launcher — stays full screen */
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
          className="h-full w-full touch-none overflow-hidden"
          onTouchStart={(e) => {
            touchX.current = e.touches.length === 1 ? e.touches[0].clientX : null;
            zoomPan.onTouchStart(e);
          }}
          onTouchMove={zoomPan.onTouchMove}
          onTouchEnd={(e) => {
            zoomPan.onTouchEnd(e);
            if (zoomPan.zoomed || touchX.current === null || tiles.length < 2) return;
            const dx = e.changedTouches[0].clientX - touchX.current;
            touchX.current = null;
            if (Math.abs(dx) > 70) go(dx < 0 ? 1 : -1);
          }}
        >
          <div
            className="h-full w-full"
            style={{
              transform: `translate(${zoomPan.transform.x}px, ${zoomPan.transform.y}px) scale(${zoomPan.transform.scale})`,
              transition: zoomPan.zoomed ? "none" : "transform 0.2s ease-out",
            }}
          >
            {tiles[focus] && (
              <VideoTile key={tiles[focus].stream_id} tile={tiles[focus]} contain videoRef={(el) => (activeVideo.current = el)} />
            )}
          </div>
          {zoomPan.zoomed && (
            <button
              type="button"
              className="absolute right-3 top-[calc(var(--safe-top)+3.75rem)] z-10 rounded-full bg-black/60 px-3 py-1.5 text-[12px] font-medium text-white backdrop-blur"
              onClick={zoomPan.reset}
            >
              Reset zoom
            </button>
          )}
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
        {live && mode === "single" && pipSupported && (
          <Button
            size="sm"
            variant="secondary"
            className="bg-white/10 text-white hover:bg-white/20 border-white/15"
            onClick={() => void enterMiniPlayer()}
            aria-label="Mini player"
          >
            Mini player
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
