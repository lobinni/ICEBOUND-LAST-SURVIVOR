// ── ICEBOUND V3: loading screen + device/orientation guidance ──────────────

import { useEffect, useState } from "react";
import { REGIONS, REGION_ORDER } from "../game/config";
import type { Game } from "../game/engine";
import { useGame } from "./hooks";
import { ItemIcon } from "./icons";
import { cn } from "@/utils/cn";

const TIPS = [
  "Firelight keeps wolves at the treeline. A lit camp is a safe camp.",
  "Melt ice at the fire instead of eating it raw — raw ice costs you warmth.",
  "Every creature telegraphs. Watch the wind-up, then dodge through it.",
  "Better axes gather faster and yield more. Upgrade before a long trip.",
  "The Guardian's armour blocks almost everything — strike only when its core opens.",
  "Store surplus in the supply cache: free pack slots are expedition range.",
];

export function LoadingScreen({ game }: { game: Game }) {
  const s = useGame(game);
  const [tip] = useState(() => TIPS[Math.floor(Math.random() * TIPS.length)]);
  if (s.screen !== "loading") return null;
  const pct = Math.round(game.loadProgress * 100);
  const doneCount = Math.floor(game.loadProgress * REGION_ORDER.length);

  return (
    <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-ink-950 px-6">
      <div className="menu-snow pointer-events-none absolute inset-0 opacity-40" />
      <div className="relative z-10 w-full max-w-sm text-center">
        <h1 className="title-grad font-display text-5xl font-bold leading-none tracking-[0.06em]">ICEBOUND</h1>
        <div className="font-display mt-1 text-sm font-bold tracking-[0.5em] text-ember-400" style={{ textIndent: "0.5em" }}>
          LAST SURVIVOR
        </div>

        <div className="mt-8 flex items-center justify-center gap-2">
          {REGION_ORDER.map((id, i) => (
            <span key={id} className={cn("flex h-8 w-8 items-center justify-center transition-colors",
              i < doneCount ? "text-frost-300" : "text-frost-300/20")}>
              <ItemIcon icon={REGIONS[id].icon} className="h-4 w-4" />
            </span>
          ))}
        </div>

        <div className="statbar mt-3 h-2">
          <i style={{ transform: `scaleX(${game.loadProgress})`, background: "linear-gradient(90deg,#1e7fb4,#a5e0ff)" }} />
        </div>
        <p className="mt-2 font-display text-[11px] uppercase tracking-[0.24em] text-frost-300/60">
          Surveying the region — {pct}%
        </p>

        <div className="panel-soft mt-8 px-4 py-3">
          <p className="font-display text-[10px] font-bold uppercase tracking-[0.22em] text-ember-300">Field note</p>
          <p className="mt-1 text-[12px] leading-relaxed text-frost-300/80">{tip}</p>
        </div>
      </div>
    </div>
  );
}

/** Nudge phones held in portrait; purely advisory, never blocks play. */
export function OrientationHint() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const check = () => {
      const coarse = window.matchMedia?.("(pointer: coarse)").matches ?? false;
      const portrait = window.innerHeight > window.innerWidth;
      const small = Math.min(window.innerWidth, window.innerHeight) < 500;
      setShow(coarse && portrait && small);
    };
    check();
    window.addEventListener("resize", check);
    window.addEventListener("orientationchange", check);
    return () => {
      window.removeEventListener("resize", check);
      window.removeEventListener("orientationchange", check);
    };
  }, []);
  if (!show) return null;
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-[42%] z-40 flex justify-center px-6">
      <div className="panel animate-toast-in flex items-center gap-3 px-4 py-2.5">
        <ItemIcon icon="compass" className="h-5 w-5 shrink-0 text-ember-400" />
        <p className="text-[12px] leading-snug text-frost-200">
          Rotate to <span className="font-bold">landscape</span> for the full view — portrait still works.
        </p>
      </div>
    </div>
  );
}
