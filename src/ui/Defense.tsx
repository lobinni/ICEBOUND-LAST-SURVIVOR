// ── ICEBOUND Phase 6.4: defense board & siege calendar ──────────────────────
// Readiness breakdown from real state, the event calendar with countdowns,
// the structure-repair board, and the (single-issue) resolution report.

import { ENEMY, ITEMS } from "../game/config";
import type { Game } from "../game/engine";
import { XP } from "../game/progression";
import {
  formatCountdown, readiness, readinessBand, siegeTargets,
  structHealth, SIEGE, timeUntil, type SiegeKind, activeSiege,
} from "../game/siege";
import { ItemIcon } from "./icons";
import { Shell } from "./Shell";
import { useGame } from "./hooks";
import { cn } from "@/utils/cn";

const KIND_META: Record<SiegeKind, { name: string; sub: string; icon: string }> = {
  night:   { name: "Nightly pack",   sub: "most nights after dusk · small",    icon: "moon" },
  weekly:  { name: "Weekly horde",   sub: `every ${SIEGE.weekly.everyDays} days · surging waves`,   icon: "wolf" },
  monthly: { name: "Beast Tide",     sub: `every ${SIEGE.monthly.everyDays} days · multi-wave, a leader`, icon: "fortress" },
};

export function DefenseModal({ game }: { game: Game }) {
  const s = useGame(game);
  const r = readiness(s);
  const band = readinessBand(r.score);
  const live = activeSiege(s);
  const targets = siegeTargets(s);

  return (
    <Shell title="Defense" icon="bunks" onClose={() => game.closeModal()} wide
      sub={`Readiness ${r.score}/100 · ${band.label}${live ? " · UNDER ATTACK" : ""}`}>

      {/* live alarm strip */}
      {live && (
        <div className="mb-3 rounded border border-blood-400/50 bg-blood-500/15 px-3 py-2">
          <div className="flex items-center gap-2 font-display text-[13px] font-bold text-blood-400">
            <ItemIcon icon="warn" className="h-4 w-4 animate-pulse" />
            {KIND_META[live.kind].name}
            <span className="ml-auto text-[11px] text-frost-300/70">
              {live.kills}/{live.planned.total} down · wave {Math.min(live.waveIdx, live.waves.length)}/{live.waves.length}
            </span>
          </div>
          <div className="statbar mt-1.5 h-1.5">
            <i style={{
              transform: `scaleX(${live.kills / Math.max(1, live.planned.total)})`,
              background: "linear-gradient(90deg,#e84848,#ff8a70)",
            }} />
          </div>
          <div className="mt-1 text-[10.5px] text-frost-300/70">
            Attackers remaining: {live.spawnedIds.length - live.kills}. Hold the camp.
          </div>
        </div>
      )}

      {/* offline report (single issue) */}
      {s.siege.pendingReport && (
        <OfflineReport game={game} />
      )}

      {/* readiness + calendar */}
      <section className="panel-soft mb-3 px-4 py-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="font-display text-[11px] font-bold uppercase tracking-[0.2em] text-frost-300/75">Shelter readiness</span>
          <span className={cn("font-display text-xl font-bold",
            band.tone === "bad" ? "text-blood-400" : band.tone === "warn" ? "text-ember-300" : "text-moss-400")}>
            {r.score}
          </span>
        </div>
        <div className="statbar mb-2 h-2.5">
          <i style={{
            transform: `scaleX(${r.score / 100})`,
            background: band.tone === "bad" ? "linear-gradient(90deg,#e84848,#ff8a70)"
              : band.tone === "warn" ? "linear-gradient(90deg,#e76f1e,#ffb063)"
              : "linear-gradient(90deg,#3fae6c,#9be2b5)",
          }} />
        </div>
        <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
          {r.parts.map(p => (
            <div key={p.label} className="flex items-center gap-2 text-[10.5px]">
              <span className={cn("font-display font-bold", p.ok ? "text-moss-400" : "text-blood-400")}>{p.ok ? "✓" : "✕"}</span>
              <span className="flex-1 text-frost-300/70">{p.label}</span>
              <span className="shrink-0 font-display text-[10px] tabular-nums text-frost-300/45">{Math.round(p.pts)}/{p.max}</span>
            </div>
          ))}
        </div>
      </section>

      {/* calendar */}
      <section className="panel-soft mb-3 px-4 py-3">
        <div className="mb-2 font-display text-[11px] font-bold uppercase tracking-[0.2em] text-frost-300/75">
          Siege calendar <span className="ml-1 text-[9px] normal-case text-frost-300/45">(game-time, day {Math.floor(game.state.time / 480) + 1})</span>
        </div>
        <div className="space-y-1.5">
          {(["night", "weekly", "monthly"] as SiegeKind[]).map(kind => {
            const ev = s.siege.events.find(e => e.kind === kind && !e.resolved);
            const meta = KIND_META[kind];
            const sec = timeUntil(s, kind);
            return (
              <div key={kind} className={cn("panel-soft flex items-center gap-3 px-3 py-2.5",
                ev && (ev.kind !== "night") && "border-ember-400/30")}>
                <span className="invslot flex h-10 w-10 shrink-0 items-center justify-center">
                  <ItemIcon icon={meta.icon} className="h-5 w-5" color={kind === "night" ? "#a5e0ff" : kind === "weekly" ? "#ffb063" : "#ff6b6b"} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-display text-[13px] font-bold text-frost-200">{meta.name}</span>
                    <span className="chip bg-ink-700/80 text-[9px] text-frost-300/60">{meta.sub}</span>
                  </div>
                  {ev ? (
                    <div className="mt-0.5 text-[10.5px] text-frost-300/65">
                      {ev.planned.total} beasts · seen: {ev.planned.threats.map(t => ENEMY[t].name).join(", ")} · {ev.planned.plan}
                    </div>
                  ) : (
                    <div className="mt-0.5 text-[10.5px] text-frost-300/50">No warning yet — size & direction reveal with the alert.</div>
                  )}
                </div>
                <div className="shrink-0 text-right">
                  {ev && ev.status === "active" ? (
                    <span className="font-display text-[11px] font-bold text-blood-400">UNDER ATTACK</span>
                  ) : (
                    <>
                      <div className={cn("font-display text-[15px] font-bold",
                        kind === "monthly" ? "text-blood-400" : kind === "weekly" ? "text-ember-300" : "text-frost-200")}>
                        {ev ? formatCountdown(Math.max(0, ev.startAt - s.time)) : formatCountdown(sec)}
                      </div>
                      <div className="text-[9px] uppercase tracking-widest text-frost-300/50">
                        {ev ? (ev.status === "scheduled" ? "in" : "live") : `~${SIEGE.night.warnAt > 0.4 ? "tonight" : "soon"}`}
                      </div>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <p className="mt-2 text-[10px] leading-snug text-frost-300/50">
          Sieges fire only when you're home. The nightly pack is a short warn; the weekly horde and the monthly tide give a clear preparation window before the first wave.
        </p>
      </section>

      {/* structure repair board */}
      <section className="panel-soft px-4 py-3">
        <div className="mb-2 font-display text-[11px] font-bold uppercase tracking-[0.2em] text-frost-300/75">Structure integrity</div>
        <div className="space-y-1.5">
          {targets.map(t => {
            const hp = structHealth(s, t.id);
            const dmg = t.max - hp;
            return (
              <div key={t.id} className="flex items-center gap-3">
                <span className="w-36 shrink-0 truncate text-[11px] text-frost-300/70">{t.name}</span>
                <div className="statbar h-2 flex-1">
                  <i style={{
                    transform: `scaleX(${hp / t.max})`,
                    background: hp / t.max > 0.5 ? "linear-gradient(90deg,#3fae6c,#9be2b5)" : hp > 0 ? "linear-gradient(90deg,#e76f1e,#ffb063)" : "linear-gradient(90deg,#e84848,#ff8a70)",
                  }} />
                </div>
                <span className={cn("w-12 shrink-0 text-right font-display text-[11px] font-bold tabular-nums",
                  hp <= 0 ? "text-blood-400" : hp < t.max ? "text-ember-300" : "text-frost-300/60")}>
                  {hp}/{t.max}
                </span>
                <button onClick={() => game.repairStructure(t.id)} disabled={dmg <= 0}
                  className="btn btn-ghost shrink-0 px-2.5 py-1.5 text-[9.5px]"
                  title="4 Wood + 2 Stone per point, paid from storage first, then pack">
                  <ItemIcon icon="hammer" className="h-3 w-3" /> Repair
                </button>
              </div>
            );
          })}
        </div>
        <p className="mt-2 text-[10px] text-frost-300/50">
          Repairs are carpentry via the workbench: each damaged point costs real wood and stone. Nothing is lost while you're away — damage caps out, never erases, and a point of integrity always survives offline.
        </p>
      </section>

      {/* history */}
      {s.siege.history.length > 0 && (
        <section className="panel-soft mt-3 px-4 py-3">
          <div className="mb-1.5 font-display text-[11px] font-bold uppercase tracking-[0.2em] text-frost-300/75">Recent sieges</div>
          <div className="space-y-1">
            {[...s.siege.history].slice(-6).reverse().map(h => (
              <div key={h.id} className="flex items-center gap-2 text-[10.5px] text-frost-300/65">
                <ItemIcon icon={h.kind === "night" ? "moon" : h.kind === "weekly" ? "wolf" : "fortress"} className="h-3.5 w-3.5 shrink-0" />
                <span className="w-14 shrink-0 text-frost-300/45">Day {h.day}</span>
                <span className="flex-1 truncate">{h.outcome}{h.offline ? " (offline)" : ""}</span>
                <span className="shrink-0 text-frost-300/50">{h.kills} down · {h.injuries} hurt</span>
                <span className={cn("chip shrink-0 text-[8.5px]",
                  h.outcome === "full" ? "bg-moss-400/15 text-moss-400" : h.outcome === "failed" ? "bg-blood-500/15 text-blood-400" : "bg-ember-500/15 text-ember-300")}>
                  {h.outcome}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </Shell>
  );
}

function OfflineReport({ game }: { game: Game }) {
  const s = useGame(game);
  const rep = s.siege.pendingReport;
  if (!rep) return null;
  return (
    <div className="mb-3 rounded border border-ember-400/40 bg-ember-500/10 px-3 py-2.5">
      <div className="flex items-center gap-2">
        <ItemIcon icon="residents" className="h-4 w-4 text-ember-300" />
        <span className="font-display text-[12px] font-bold uppercase tracking-widest text-ember-300">{rep.title}</span>
        <button onClick={() => { s.siege.pendingReport = null; game.bump(); }}
          className="ml-auto text-[11px] font-semibold text-frost-300/60 hover:text-frost-200">Dismiss</button>
      </div>
      <div className="mt-1 space-y-0.5 text-[10.5px] text-frost-300/75">
        {rep.lines.map((l, i) => <div key={i}>{l}</div>)}
      </div>
    </div>
  );
}

// Re-export for convenience in other UI modules
export { readiness, readinessBand, formatCountdown, timeUntil, SIEGE, ENEMY, ITEMS, XP };
export { siegeSummary } from "../game/siege";
