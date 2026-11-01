// ── ICEBOUND Phase 4.1: Survivor progression panel ─────────────────────────

import { ITEMS, REGION_ORDER, REGIONS } from "../game/config";
import { ALL_DISCOVERY_COUNT, totalDiscoveries } from "../game/discoveries";
import {
  MAX_LEVEL, UPGRADES, progCapacityBonus, progColdMul, progDamageMul,
  progGatherBonusChance, progMaxHp, progMaxStamina, progSurvivalMul,
  spentPoints, upgradeStatus, xpForNext,
} from "../game/progression";
import type { Game } from "../game/engine";
import { capacity } from "../game/state";
import { useGame } from "./hooks";
import { ItemIcon } from "./icons";
import { Shell } from "./Shell";
import { cn } from "@/utils/cn";

function StatLine({ icon, label, value, note }: { icon: string; label: string; value: string; note?: string }) {
  return (
    <div className="panel-soft flex items-center gap-2.5 px-3 py-2">
      <ItemIcon icon={icon} className="h-4 w-4 shrink-0 text-frost-300" />
      <span className="min-w-0 flex-1 truncate text-[11px] text-frost-300/75">{label}</span>
      <span className="font-display text-[13px] font-bold tabular-nums text-frost-200">{value}</span>
      {note && <span className="text-[10px] text-moss-400">{note}</span>}
    </div>
  );
}

export function ProgressionModal({ game }: { game: Game }) {
  const s = useGame(game);
  const p = s.progression;
  const need = xpForNext(p.level);
  const pct = p.level >= MAX_LEVEL ? 1 : Math.min(1, p.xp / need);
  const foundAll = REGION_ORDER.reduce(
    (n, r) => n + (s.regions[r]?.discoveries.filter(d => d.found).length ?? 0), 0);

  return (
    <Shell
      title="Survivor Record" icon="progress" wide
      onClose={() => game.closeModal()}
      sub={`Level ${p.level}${p.level >= MAX_LEVEL ? " (max)" : ""} · ${p.points} point${p.points === 1 ? "" : "s"} unspent · ${spentPoints(s)} invested`}
    >
      {/* level + experience */}
      <div className="panel-soft mb-3 px-4 py-3">
        <div className="flex items-end justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-ember-300">
              <ItemIcon icon="progress" className="h-5 w-5" />
              <span className="font-display text-lg font-bold uppercase tracking-[0.16em]">Level {p.level}</span>
            </div>
            <p className="mt-1 text-[11px] leading-snug text-frost-300/65">
              Experience comes only from doing things: gathering, crafting, building,
              fighting, finding sites and completing objectives.
            </p>
          </div>
          <div className="shrink-0 text-right">
            <div className="font-display text-sm font-bold tabular-nums text-frost-200">
              {p.level >= MAX_LEVEL ? "MAX" : `${p.xp} / ${need}`}
            </div>
            <div className="text-[9px] uppercase tracking-[0.16em] text-frost-300/45">experience</div>
          </div>
        </div>
        <div className="statbar mt-2 h-2.5">
          <i style={{
            transform: `scaleX(${pct})`,
            background: p.level >= MAX_LEVEL
              ? "linear-gradient(90deg,#3fae6c,#9be2b5)"
              : "linear-gradient(90deg,#1e7fb4,#a5e0ff)",
          }} />
        </div>
        {p.points > 0 && (
          <div className="mt-2 flex items-center gap-2 text-[11px] text-ember-300">
            <ItemIcon icon="bolt" className="h-3.5 w-3.5" />
            {p.points} upgrade point{p.points === 1 ? "" : "s"} ready to spend below.
          </div>
        )}
      </div>

      {/* current derived stats */}
      <div className="mb-1.5 flex items-center gap-2">
        <span className="font-display text-[10px] font-bold uppercase tracking-[0.22em] text-frost-300/50">Current attributes</span>
        <span className="h-px flex-1 bg-frost-400/15" />
      </div>
      <div className="mb-3 grid gap-1.5 sm:grid-cols-2">
        <StatLine icon="heart" label="Maximum health" value={String(progMaxHp(s))} />
        <StatLine icon="bolt" label="Maximum stamina" value={String(progMaxStamina(s))} />
        <StatLine icon="temp" label="Cold exposure" value={`${Math.round(progColdMul(s) * 100)}%`}
          note={progColdMul(s) < 1 ? `−${Math.round((1 - progColdMul(s)) * 100)}%` : undefined} />
        <StatLine icon="meat" label="Hunger & thirst drain" value={`${Math.round(progSurvivalMul(s) * 100)}%`}
          note={progSurvivalMul(s) < 1 ? `−${Math.round((1 - progSurvivalMul(s)) * 100)}%` : undefined} />
        <StatLine icon="backpack" label="Inventory slots" value={String(capacity(s))}
          note={progCapacityBonus(s) > 0 ? `+${progCapacityBonus(s)}` : undefined} />
        <StatLine icon="spear" label="Weapon damage" value={`${Math.round(progDamageMul(s) * 100)}%`}
          note={progDamageMul(s) > 1 ? `+${Math.round((progDamageMul(s) - 1) * 100)}%` : undefined} />
        <StatLine icon="axe" label="Bonus yield chance" value={`${Math.round(progGatherBonusChance(s) * 100)}%`} />
        <StatLine icon="compass" label="Sites discovered" value={`${foundAll}/${ALL_DISCOVERY_COUNT}`} />
      </div>

      {/* upgrade tracks */}
      <div className="mb-1.5 flex items-center gap-2">
        <span className="font-display text-[10px] font-bold uppercase tracking-[0.22em] text-frost-300/50">Upgrades</span>
        <span className="h-px flex-1 bg-frost-400/15" />
        <span className="font-display text-[10px] text-frost-300/45">1 point each</span>
      </div>
      <div className="space-y-2">
        {UPGRADES.map(u => {
          const st = upgradeStatus(s, u.id);
          return (
            <div key={u.id} className={cn("panel-soft px-3 py-2.5", st.canBuy && "border-ember-400/40")}>
              <div className="flex items-start gap-3">
                <span className={cn("invslot flex h-11 w-11 shrink-0 items-center justify-center",
                  st.maxed && "border-moss-400/50")}>
                  <ItemIcon icon={u.icon} className="h-5 w-5" color={st.maxed ? "#7fd6a4" : undefined} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-display text-[15px] font-bold tracking-wide text-frost-200">{u.name}</span>
                    <span className={cn("chip text-[9px]", st.maxed ? "bg-moss-400/15 text-moss-400" : "bg-frost-500/10 text-frost-300")}>
                      Rank {st.rank}/{u.maxRank}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[11px] leading-snug text-frost-300/65">{u.summary}</p>

                  {/* rank pips */}
                  <div className="mt-1.5 flex items-center gap-1">
                    {Array.from({ length: u.maxRank }, (_, i) => (
                      <span key={i} className={cn("h-1.5 flex-1",
                        i < st.rank ? "bg-gradient-to-r from-ember-500 to-ember-300" : "bg-ink-700")}
                        style={{ clipPath: "polygon(3px 0,100% 0,calc(100% - 3px) 100%,0 100%)" }} />
                    ))}
                  </div>

                  <div className="mt-1.5 text-[11px] text-frost-300/70">
                    {st.rank > 0 && <span className="text-moss-400">Now: {u.effectAt(st.rank)}. </span>}
                    {!st.maxed && <span className="text-ember-300">Next: {u.effectAt(st.rank + 1)}.</span>}
                  </div>
                  {!st.canBuy && !st.maxed && st.reason && (
                    <div className="mt-1 text-[11px] font-semibold text-blood-400">{st.reason}</div>
                  )}
                </div>
                <button
                  onClick={() => game.buyUpgrade(u.id)}
                  disabled={!st.canBuy}
                  className={cn("btn shrink-0 px-3.5 py-2 text-[11px]", st.canBuy ? "btn-ember" : "btn-ghost")}
                >
                  {st.maxed ? "Maxed" : "Upgrade"}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* per-region survey progress */}
      <div className="mb-1.5 mt-4 flex items-center gap-2">
        <span className="font-display text-[10px] font-bold uppercase tracking-[0.22em] text-frost-300/50">Survey progress</span>
        <span className="h-px flex-1 bg-frost-400/15" />
      </div>
      <div className="grid gap-1.5 sm:grid-cols-2">
        {REGION_ORDER.map(id => {
          const unlocked = s.unlocked.includes(id);
          const found = s.regions[id]?.discoveries.filter(d => d.found).length ?? 0;
          const total = totalDiscoveries(id);
          return (
            <div key={id} className={cn("panel-soft flex items-center gap-2.5 px-3 py-2", !unlocked && "opacity-45")}>
              <ItemIcon icon={unlocked ? REGIONS[id].icon : "warn"} className="h-4 w-4 shrink-0 text-frost-300" />
              <span className="min-w-0 flex-1 truncate text-[11px] text-frost-300/75">
                {unlocked ? REGIONS[id].name : "Undiscovered region"}
              </span>
              <span className={cn("font-display text-[12px] font-bold tabular-nums",
                found === total && unlocked ? "text-moss-400" : "text-frost-200")}>
                {unlocked ? `${found}/${total}` : "—"}
              </span>
            </div>
          );
        })}
      </div>

      <p className="mt-3 text-center text-[10px] text-frost-300/45">
        Progression, upgrades and recorded sites are saved locally with your expedition.
      </p>
      <div className="mt-2 flex justify-center">
        <span className="chip border border-frost-400/20 bg-ink-800/60 text-[9px] text-frost-300/60">
          <ItemIcon icon={ITEMS.core.icon} className="h-2.5 w-2.5" />
          Lifetime experience {p.totalXp}
        </span>
      </div>
    </Shell>
  );
}
