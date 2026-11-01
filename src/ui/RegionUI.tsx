// ── ICEBOUND V2: region banner + boss health bar overlays ──────────────────

import { useEffect, useState } from "react";
import { ENEMY, REGIONS } from "../game/config";
import type { Game } from "../game/engine";
import type { RegionId } from "../game/types";
import { useGame } from "./hooks";
import { ItemIcon } from "./icons";
import { cn } from "@/utils/cn";

export function RegionBanner({ game }: { game: Game }) {
  const s = useGame(game);
  if (game.bannerT <= 0 || !game.bannerRegion) return null;
  const def = REGIONS[game.bannerRegion];
  const fade = Math.min(1, game.bannerT / 0.6);
  return (
    <div
      className="pointer-events-none absolute inset-x-0 top-1/3 z-30 flex flex-col items-center"
      style={{ opacity: fade }}
    >
      <div className="animate-rise flex flex-col items-center">
        <div className="mb-2 flex items-center gap-2 text-ember-400">
          <span className="h-px w-10 bg-gradient-to-r from-transparent to-ember-400/70" />
          <ItemIcon icon={def.icon} className="h-5 w-5" />
          <span className="h-px w-10 bg-gradient-to-l from-transparent to-ember-400/70" />
        </div>
        <h2 className="title-grad font-display text-4xl font-bold tracking-[0.14em] sm:text-5xl">
          {def.name.toUpperCase()}
        </h2>
        <p className="mt-1 font-display text-xs uppercase tracking-[0.3em] text-frost-300/70">{def.subtitle}</p>
        {s.region !== "forest" && (
          <p className="mt-2 max-w-sm px-6 text-center text-[11px] text-frost-300/55">{def.dangers}</p>
        )}
      </div>
    </div>
  );
}

interface Summary { region: RegionId; gathered: number; kills: number; logs: number; containers: number; minutes: number }

/** Shown when you walk back through the gate at home — closes the expedition loop. */
export function ExpeditionSummary({ game }: { game: Game }) {
  const [sum, setSum] = useState<Summary | null>(null);
  useEffect(() => game.on("expedition", (p) => {
    setSum(p as Summary);
    window.setTimeout(() => setSum(null), 9000);
  }), [game]);
  if (!sum) return null;
  const rows: [string, string, string][] = [
    ["crate", "Salvage recovered", String(sum.gathered)],
    ["wolf", "Creatures defeated", String(sum.kills)],
    ["box", "Containers opened", String(sum.containers)],
    ["journal", "Logs recovered", String(sum.logs)],
  ];
  return (
    <div className="pointer-events-auto absolute right-3 top-28 z-30 sm:right-4 sm:top-32">
      <div className="panel animate-rise w-[224px] px-4 py-3">
        <div className="mb-1 flex items-center gap-2 text-ember-400">
          <ItemIcon icon="compass" className="h-4 w-4" />
          <span className="font-display text-[10px] font-bold uppercase tracking-[0.2em]">Expedition complete</span>
        </div>
        <p className="mb-2 text-[11px] text-frost-300/70">
          Returned from {REGIONS[sum.region].name}
        </p>
        <div className="space-y-1">
          {rows.filter(r => r[2] !== "0").map(([icon, label, val]) => (
            <div key={label} className="flex items-center gap-2">
              <ItemIcon icon={icon} className="h-3.5 w-3.5 text-frost-300/70" />
              <span className="flex-1 text-[11px] text-frost-300/75">{label}</span>
              <span className="font-display text-sm font-bold text-frost-200">{val}</span>
            </div>
          ))}
        </div>
        <button onClick={() => { setSum(null); game.openModal("craft"); }}
          className="btn btn-ember mt-2.5 w-full px-3 py-2 text-[11px]">
          <ItemIcon icon="hammer" className="h-3.5 w-3.5" /> Craft & upgrade
        </button>
      </div>
    </div>
  );
}

export function BossBar({ game }: { game: Game }) {
  const s = useGame(game);
  const [, setPing] = useState(0);
  useEffect(() => game.on("boss", () => setPing(p => p + 1)), [game]);

  const boss = s.enemies.find(e => e.kind === "guardian");
  if (!boss || boss.dead || !boss.alerted) return null;
  const pct = Math.max(0, boss.hp / boss.max);
  const vuln = boss.state === "stagger";

  return (
    <div className="pointer-events-none absolute inset-x-0 top-3 z-30 flex justify-center px-4 sm:top-4">
      <div className="panel w-full max-w-lg px-4 py-2.5">
        <div className="mb-1.5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ItemIcon icon="core" className={cn("h-4 w-4", vuln ? "text-ember-400" : "text-[#b48cff]")} />
            <span className="font-display text-sm font-bold uppercase tracking-[0.2em] text-frost-200">
              {ENEMY.guardian.name}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {[1, 2, 3].map(p => (
              <span key={p} className={cn("h-1.5 w-5", boss.phase >= p ? "bg-[#b48cff]" : "bg-ink-700")}
                style={{ clipPath: "polygon(3px 0,100% 0,calc(100% - 3px) 100%,0 100%)" }} />
            ))}
          </div>
        </div>
        <div className="statbar h-3.5">
          <i style={{
            transform: `scaleX(${pct})`,
            background: vuln
              ? "linear-gradient(90deg,#ff8f3d,#ffe3a8)"
              : "linear-gradient(90deg,#5b4fa8,#b48cff)",
          }} />
        </div>
        <div className={cn("mt-1 text-center font-display text-[11px] font-bold uppercase tracking-[0.18em]",
          vuln ? "animate-pulse-warn text-ember-300" : "text-frost-300/55")}>
          {vuln ? "⟡ Core exposed — strike now ⟡" : "Armour sealed — wait for the opening"}
        </div>
      </div>
    </div>
  );
}
