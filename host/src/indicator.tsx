import React from "react";
import ReactDOM from "react-dom/client";
import "./app.css";
import mark from "../../shared/assets/viex-mark-dark.png";

/**
 * The always-on-top "VIEX is live" pill. It is created and kept alive by the Rust
 * side (src-tauri/src/live.rs) for the whole session and cannot be turned off.
 */
function Indicator() {
  const text = new URLSearchParams(window.location.search).get("text") ?? "Someone is viewing this screen";
  return (
    <div
      data-tauri-drag-region
      className="flex h-full w-full items-center gap-2.5 bg-[#111419] px-3.5 text-[#eff0f2] select-none"
    >
      <img src={mark} alt="" className="size-5 shrink-0 object-contain" draggable={false} />
      <span className="relative flex size-2.5 shrink-0">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-[#f87171] opacity-60" />
        <span className="relative inline-flex size-2.5 rounded-full bg-[#f87171]" />
      </span>
      <span data-tauri-drag-region className="min-w-0 flex-1 truncate text-[12.5px] font-medium tracking-[-0.01em]">
        {text}
      </span>
      <span className="rounded-[5px] bg-white/10 px-1.5 py-[3px] font-mono text-[9.5px] font-semibold leading-none tracking-wider">
        VIEX LIVE
      </span>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Indicator />
  </React.StrictMode>,
);
