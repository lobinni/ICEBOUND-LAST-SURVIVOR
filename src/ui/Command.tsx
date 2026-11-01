// ── ICEBOUND Phase 6.5: Command Center ──────────────────────────────────────
// A single board that connects construction, residents, warriors, resources,
// repairs and the siege calendar. Every number is read live from game state;
// every control routes to the real system. Nothing here spends resources or
// builds anything on its own — recommendations navigate, the player decides.

import { useState } from "react";
import { BAL, ITEMS } from "../game/config";
import type { Game } from "../game/engine";
import type { ItemId } from "../game/types";
import {
  ASSIGNMENTS, ASSIGNMENT_ORDER, DOCTRINES, DOCTRINE_ORDER, GUARD_STATE_LABEL,
  MAX_ROUTE_NODES, ROUTE_NODES, assignmentOf, guardDamage, type DoctrineId,
} from "../game/guards";
import {
  commandSnapshot, formatCountdown, prepChecklist, readiness, siegeTargets,
  structHealth, type ChecklistItem,
} from "../game/siege";
import type { Resident } from "../game/residents";
import { useGame } from "./hooks";
import { ItemIcon } from "./icons";
import { Shell } from "./Shell";
import { cn } from "@/utils/cn";

const TABS = [
  { id: "status", label: "Status", icon: "bunks" },
  { id: "prep", label: "Checklist", icon: "prep" },
  { id: "orders", label: "Orders", icon: "spear" },
  { id: "reports", label: "Reports", icon: "journal" },
] as const;
type TabId = (typeof TABS)[number]["id"];

export function CommandModal({ game }: { game: Game }) {
  const s = useGame(game);
  const [tab, setTab] = useState<TabId>("status");
  const snap = commandSnapshot(s);

  return (
    <Shell title="Command Center" icon="bunks" onClose={() => game.closeModal()} wide
      sub={`Day ${snap.day} · ${snap.phaseLabel} · readiness ${snap.readinessScore}/100${snap.live ? " · UNDER ATTACK" : ""}`}>

      {snap.live && (
        <div className="mb-3 rounded border border-blood-400/50 bg-blood-500/15 px-3 py-2">
          <div className="flex flex-wrap items-center gap-2 font-display text-[13px] font-bold text-blood-400">
            <ItemIcon icon="warn" className="h-4 w-4 animate-pulse" />
            UNDER ATTACK — {snap.live.kind === "night" ? "night pack" : snap.live.kind === "weekly" ? "weekly horde" : "Great Beast Tide"}
            <span className="ml-auto text-[11px] text-frost-300/75">
              {snap.live.kills}/{snap.live.planned.total} down
            </span>
          </div>
        </div>
      )}

      <div className="mb-3 flex gap-1 overflow-x-auto pb-0.5">
        {TABS.map(t => {
          const badge = t.id === "prep" && snap.critical > 0 ? snap.critical : undefined;
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={cn("btn relative shrink-0 px-3 py-2 text-[10px]", tab === t.id ? "btn-frost" : "btn-ghost")}>
              <ItemIcon icon={t.icon} className="h-3.5 w-3.5" /> {t.label}
              {badge !== undefined && (
                <span className="ml-1 rounded bg-blood-500/80 px-1 font-display text-[9px] text-frost-200">{badge}</span>
              )}
            </button>
          );
        })}
      </div>

      {tab === "status" && <StatusTab game={game} />}
      {tab === "prep" && <PrepTab game={game} />}
      {tab === "orders" && <OrdersTab game={game} />}
      {tab === "reports" && <ReportsTab game={game} />}
    </Shell>
  );
}

// ═══════════════════════════ STATUS ════════════════════════════════════════

function Metric({ icon, label, value, sub, tone }: {
  icon: string; label: string; value: string; sub?: string; tone?: "bad" | "warn" | "ok";
}) {
  return (
    <div className="panel-soft px-2.5 py-2">
      <div className="flex items-center gap-1.5">
        <ItemIcon icon={icon} className={cn("h-3.5 w-3.5 shrink-0",
          tone === "bad" ? "text-blood-400" : tone === "warn" ? "text-ember-300" : "text-frost-300/70")} />
        <span className="truncate text-[9.5px] uppercase tracking-widest text-frost-300/55">{label}</span>
      </div>
      <div className={cn("mt-0.5 font-display text-[17px] font-bold leading-none",
        tone === "bad" ? "text-blood-400" : tone === "warn" ? "text-ember-300" : "text-frost-200")}>{value}</div>
      {sub && <div className="mt-0.5 truncate text-[9.5px] text-frost-300/50">{sub}</div>}
    </div>
  );
}

function StatusTab({ game }: { game: Game }) {
  const s = useGame(game);
  const snap = commandSnapshot(s);
  const r = readiness(s);

  return (
    <div className="space-y-3">
      {/* readiness headline */}
      <section className="panel-soft px-4 py-3">
        <div className="mb-1 flex items-center justify-between">
          <span className="font-display text-[11px] font-bold uppercase tracking-[0.2em] text-frost-300/75">Shelter readiness</span>
          <span className={cn("font-display text-xl font-bold",
            snap.readinessTone === "bad" ? "text-blood-400" : snap.readinessTone === "warn" ? "text-ember-300" : "text-moss-400")}>
            {snap.readinessScore} <span className="text-[11px] text-frost-300/50">{snap.readinessBand}</span>
          </span>
        </div>
        <div className="statbar h-2.5">
          <i style={{
            transform: `scaleX(${snap.readinessScore / 100})`,
            background: snap.readinessTone === "bad" ? "linear-gradient(90deg,#e84848,#ff8a70)"
              : snap.readinessTone === "warn" ? "linear-gradient(90deg,#e76f1e,#ffb063)"
              : "linear-gradient(90deg,#3fae6c,#9be2b5)",
          }} />
        </div>
        <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5">
          {r.parts.filter(p => !p.ok).slice(0, 3).map(p => (
            <span key={p.label} className="text-[10px] text-blood-400">✕ {p.label}</span>
          ))}
          {r.parts.every(p => p.ok) && <span className="text-[10px] text-moss-400">✓ No outstanding weaknesses</span>}
        </div>
      </section>

      {/* countdowns */}
      <section className="panel-soft px-4 py-3">
        <div className="mb-2 font-display text-[11px] font-bold uppercase tracking-[0.2em] text-frost-300/75">Next attacks</div>
        <div className="grid grid-cols-3 gap-1.5">
          <Metric icon="moon" label="Night pack" value={formatCountdown(snap.nextNight)} sub="short warning" />
          <Metric icon="wolf" label="Horde" value={formatCountdown(snap.nextWeekly)} sub={`every ${7} days`} tone={snap.nextWeekly < BAL.dayLength ? "warn" : undefined} />
          <Metric icon="fortress" label="Beast Tide" value={formatCountdown(snap.nextMonthly)} sub="every 28 days" tone={snap.nextMonthly < BAL.dayLength ? "bad" : undefined} />
        </div>
        {snap.upcoming && (
          <div className="mt-2 rounded border border-ember-400/35 bg-ember-500/10 px-2.5 py-2 text-[10.5px] text-ember-300">
            <b>{snap.upcoming.planned.total} beasts</b> expected · {snap.upcoming.planned.plan} ·{" "}
            {snap.upcoming.waves.length} wave{snap.upcoming.waves.length === 1 ? "" : "s"} ·{" "}
            impact in {formatCountdown(Math.max(0, snap.upcoming.startAt - s.time))}
          </div>
        )}
      </section>

      {/* live camp metrics — every number from real state */}
      <section className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
        <Metric icon="spear" label="Guards fit" value={`${snap.warriorsFit}/${snap.warriorsTotal}`}
          sub={snap.warriorsIdle ? `${snap.warriorsIdle} stood down` : "all on duty"}
          tone={snap.warriorsTotal === 0 ? "bad" : snap.warriorsFit < snap.warriorsTotal ? "warn" : "ok"} />
        <Metric icon="residents" label="Workers" value={`${snap.workersTotal}`}
          sub={snap.workersIdle ? `${snap.workersIdle} unassigned` : "all posted"}
          tone={snap.workersIdle > 0 ? "warn" : undefined} />
        <Metric icon="heart" label="Casualties" value={`${snap.injured + snap.downed}`}
          sub={snap.downed ? `${snap.downed} down` : snap.injured ? "injured" : "none"}
          tone={snap.downed ? "bad" : snap.injured ? "warn" : "ok"} />
        <Metric icon="hammer" label="Damaged" value={`${snap.damagedStructures.length}`}
          sub={snap.damagedStructures.length ? snap.damagedStructures.map(d => d.name).join(", ") : "all intact"}
          tone={snap.damagedStructures.some(d => d.hp <= 0) ? "bad" : snap.damagedStructures.length ? "warn" : "ok"} />
        <Metric icon="wood" label="Repair stock" value={`${snap.wood}w ${snap.stone}s`}
          sub={snap.recovery.wood > 0 ? `need ${snap.recovery.wood}w ${snap.recovery.stone}s` : "nothing owed"}
          tone={snap.recovery.wood > snap.wood || snap.recovery.stone > snap.stone ? "warn" : "ok"} />
        <Metric icon="stew" label="Rations" value={snap.foodDays === Infinity ? "—" : `${snap.foodDays.toFixed(1)}d`}
          sub={`${snap.meds} medicine`} tone={snap.foodDays < 1 ? "bad" : snap.foodDays < 2 ? "warn" : "ok"} />
        <Metric icon="bunks" label="Housing" value={`${snap.housing.used}/${snap.housing.cap}`}
          sub={snap.housing.used >= snap.housing.cap ? "full" : "space free"} />
        <Metric icon="shelter" label="Outpost" value={`Stage ${s.shelter.stage}`}
          sub={s.shelter.fire.lit ? "fire burning" : "fire out"} tone={s.shelter.fire.lit ? "ok" : "warn"} />
        <Metric icon="prep" label="Checklist" value={`${snap.critical + snap.advised}`}
          sub={snap.critical ? `${snap.critical} critical` : "advisories only"}
          tone={snap.critical ? "bad" : snap.advised ? "warn" : "ok"} />
      </section>

      {/* damaged structures with direct repair */}
      {snap.damagedStructures.length > 0 && (
        <section className="panel-soft px-4 py-3">
          <div className="mb-2 font-display text-[11px] font-bold uppercase tracking-[0.2em] text-frost-300/75">Damaged structures</div>
          <div className="space-y-1.5">
            {snap.damagedStructures.map(d => (
              <div key={d.id} className="flex items-center gap-2">
                <span className="w-32 shrink-0 truncate text-[11px] text-frost-300/70">{d.name}</span>
                <div className="statbar h-2 flex-1">
                  <i style={{
                    transform: `scaleX(${d.hp / d.max})`,
                    background: d.hp <= 0 ? "linear-gradient(90deg,#e84848,#ff8a70)" : "linear-gradient(90deg,#e76f1e,#ffb063)",
                  }} />
                </div>
                <span className="w-10 shrink-0 text-right font-display text-[10px] font-bold tabular-nums text-frost-300/60">{d.hp}/{d.max}</span>
                <button onClick={() => game.repairStructure(d.id)}
                  className="btn btn-ghost shrink-0 px-2 py-1.5 text-[9px]" title="4 Wood + 2 Stone from storage, then pack">
                  Repair
                </button>
              </div>
            ))}
          </div>
          <p className="mt-1.5 text-[9.5px] text-frost-300/45">Repairs are paid per point and only when you press Repair — nothing is spent automatically.</p>
        </section>
      )}
    </div>
  );
}

// ═══════════════════════════ CHECKLIST ═════════════════════════════════════

const SEV_STYLE: Record<ChecklistItem["severity"], string> = {
  critical: "border-blood-400/45 bg-blood-500/10",
  advised: "border-ember-400/35 bg-ember-500/8",
  done: "border-moss-400/25 bg-moss-400/5",
};

function PrepTab({ game }: { game: Game }) {
  const s = useGame(game);
  const items = prepChecklist(s);
  const [open, setOpen] = useState<string | null>(null);
  const todo = items.filter(i => i.severity !== "done");
  const done = items.filter(i => i.severity === "done");

  return (
    <div className="space-y-1.5">
      <p className="px-0.5 pb-1 text-[10.5px] leading-snug text-frost-300/55">
        Preparation advice built from live state. These are <b className="text-frost-300">recommendations only</b> — tapping one takes you to the screen where you decide. Nothing here spends resources or builds anything by itself.
      </p>
      {todo.length === 0 && (
        <div className="panel-soft border-moss-400/40 px-4 py-3 text-[11.5px] text-moss-400">
          ✓ The camp is as ready as it can be with what you have.
        </div>
      )}
      {[...todo, ...done].map(it => (
        <div key={it.id} className={cn("panel-soft border px-3 py-2.5", SEV_STYLE[it.severity])}>
          <button onClick={() => setOpen(open === it.id ? null : it.id)} className="flex w-full items-center gap-2 text-left">
            <span className={cn("font-display text-sm font-bold",
              it.severity === "critical" ? "text-blood-400" : it.severity === "advised" ? "text-ember-300" : "text-moss-400")}>
              {it.severity === "done" ? "✓" : it.severity === "critical" ? "!" : "•"}
            </span>
            <span className={cn("min-w-0 flex-1 truncate font-display text-[13px] font-bold tracking-wide",
              it.severity === "done" ? "text-frost-300/60" : "text-frost-200")}>{it.label}</span>
            {it.have !== undefined && it.need !== undefined && (
              <span className="shrink-0 font-display text-[10px] tabular-nums text-frost-300/50">{it.have}/{it.need}</span>
            )}
            <span className="shrink-0 text-[10px] text-frost-300/40">{open === it.id ? "▾" : "▸"}</span>
          </button>
          {open === it.id && (
            <div className="mt-1.5 border-t border-frost-400/10 pt-1.5">
              <p className="text-[10.5px] leading-snug text-frost-300/70">{it.detail}</p>
              {it.action && (
                <button onClick={() => game.openModal(it.action!)}
                  className="btn btn-frost mt-2 w-full px-3 py-2 text-[10px]">
                  <ItemIcon icon="compass" className="h-3.5 w-3.5" /> Go to {it.actionLabel ?? it.action}
                </button>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════ ORDERS ════════════════════════════════════════

function OrdersTab({ game }: { game: Game }) {
  const s = useGame(game);
  const warriors = s.settlement.residents.filter(r => r.role === "warrior");
  const doctrine = s.siege.doctrine;

  return (
    <div className="space-y-3">
      {/* doctrine */}
      <section className="panel-soft px-4 py-3">
        <div className="mb-1.5 font-display text-[11px] font-bold uppercase tracking-[0.2em] text-frost-300/75">Defence priority</div>
        <p className="mb-2 text-[10px] leading-snug text-frost-300/55">
          Sets what the whole watch values most. This changes real target selection on the next scan — not a cosmetic label.
        </p>
        <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
          {DOCTRINE_ORDER.map(id => {
            const d = DOCTRINES[id];
            const on = doctrine === id;
            return (
              <button key={id} onClick={() => game.setDoctrine(id as DoctrineId)}
                className={cn("panel-soft px-2.5 py-2 text-left transition-colors",
                  on ? "border-ember-400/60 bg-ember-500/10" : "hover:border-frost-400/35")}>
                <div className={cn("font-display text-[12px] font-bold", on ? "text-ember-300" : "text-frost-200")}>
                  {on ? "● " : "○ "}{d.name}
                </div>
                <div className="mt-0.5 text-[9.5px] leading-snug text-frost-300/55">{d.desc}</div>
              </button>
            );
          })}
        </div>
      </section>

      {/* assignments */}
      <section className="panel-soft px-4 py-3">
        <div className="mb-1.5 font-display text-[11px] font-bold uppercase tracking-[0.2em] text-frost-300/75">Guard assignments</div>
        {warriors.length === 0 ? (
          <p className="text-[11px] text-frost-300/60">No warriors yet — recruit from the Settlement screen.</p>
        ) : (
          <div className="space-y-1.5">
            {warriors.map(w => <AssignRow key={w.id} game={game} w={w} />)}
          </div>
        )}
      </section>

      {/* route editor */}
      <RouteEditor game={game} />
    </div>
  );
}

function AssignRow({ game, w }: { game: Game; w: Resident }) {
  const s = useGame(game);
  const issue = game.assignmentIssue(w.post);
  const sharing = game.assignmentHolders(w.post).filter(o => o.id !== w.id);
  return (
    <div className="panel-soft px-2.5 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="min-w-0 flex-1">
          <span className="block truncate font-display text-[12.5px] font-bold text-frost-200">{w.name}</span>
          <span className="block truncate text-[9.5px] text-frost-300/55">
            {GUARD_STATE_LABEL[w.gs]} · {guardDamage(w)} dmg
            {w.gear.weapon ? ` · ${ITEMS[w.gear.weapon].name}` : " · bare hands"}
          </span>
        </span>
        <select value={w.post} onChange={e => game.warriorPost(w.id, e.target.value)}
          aria-label={`Assignment for ${w.name}`}
          className="w-[150px] shrink-0 rounded border border-frost-400/25 bg-ink-800 px-2 py-1.5 text-[11px] text-frost-200 outline-none focus:border-frost-400/60">
          {ASSIGNMENT_ORDER.map(id => {
            const bad = game.assignmentIssue(id);
            return <option key={id} value={id} disabled={!!bad}>{ASSIGNMENTS[id].name}{bad ? " — n/a" : ""}</option>;
          })}
        </select>
      </div>
      {(issue || sharing.length > 0) && (
        <div className="mt-1 space-y-0.5">
          {issue && (
            <div className="flex items-center gap-1.5 text-[9.5px] font-semibold text-blood-400">
              <ItemIcon icon="warn" className="h-3 w-3 shrink-0" /> Unreachable: {issue}
            </div>
          )}
          {sharing.length > 0 && (
            <div className="flex items-center gap-1.5 text-[9.5px] text-ember-300">
              <ItemIcon icon="warn" className="h-3 w-3 shrink-0" />
              Shares {assignmentOf(w.post).name} with {sharing.map(o => o.name).join(", ")} — fine for a wide post, wasteful on a narrow one.
            </div>
          )}
        </div>
      )}
      {w.stuckT > 2.2 && (
        <div className="mt-1 flex items-center gap-1.5 text-[9.5px] font-semibold text-blood-400">
          <ItemIcon icon="warn" className="h-3 w-3 shrink-0" /> Cannot reach this post right now.
        </div>
      )}
      <div className="mt-1 text-[9.5px] text-frost-300/45">{assignmentOf(w.post).desc}</div>
      {void s}
    </div>
  );
}

function RouteEditor({ game }: { game: Game }) {
  const s = useGame(game);
  const route = s.siege.customRoute ?? [];
  const onCustom = s.settlement.residents.filter(r => r.role === "warrior" && r.post === "patrol_custom");

  const toggle = (id: string) => {
    const next = route.includes(id) ? route.filter(x => x !== id) : [...route, id];
    game.setPatrolRoute(next);
  };

  return (
    <section className="panel-soft px-4 py-3">
      <div className="mb-1 flex items-center justify-between">
        <span className="font-display text-[11px] font-bold uppercase tracking-[0.2em] text-frost-300/75">Custom patrol route</span>
        <span className={cn("font-display text-[10px] font-bold", route.length < 2 ? "text-blood-400" : "text-frost-300/60")}>
          {route.length}/{MAX_ROUTE_NODES} stops
        </span>
      </div>
      <p className="mb-2 text-[10px] leading-snug text-frost-300/55">
        Tap waypoints to build a circuit, in order. Guards on <b className="text-frost-300">Custom Route</b> walk it and
        defend whatever they meet. Needs at least two stops.
      </p>
      <div className="flex flex-wrap gap-1">
        {ROUTE_NODES.map(n => {
          const idx = route.indexOf(n.id);
          const on = idx >= 0;
          return (
            <button key={n.id} onClick={() => toggle(n.id)}
              disabled={!on && route.length >= MAX_ROUTE_NODES}
              className={cn("chip border px-2 py-1 text-[10px] transition-colors disabled:opacity-35",
                on ? "border-ember-400/55 bg-ember-500/15 text-ember-300" : "border-frost-400/20 bg-ink-700/60 text-frost-300/70")}>
              {on && <span className="font-display font-bold">{idx + 1}.</span>} {n.name}
            </button>
          );
        })}
      </div>
      {route.length >= 2 && (
        <div className="mt-2 text-[9.5px] text-frost-300/50">
          Circuit: {route.map(id => ROUTE_NODES.find(n => n.id === id)?.name).filter(Boolean).join(" → ")} → (repeat)
        </div>
      )}
      <div className="mt-1.5 flex items-center gap-2">
        <button onClick={() => game.setPatrolRoute([])} className="btn btn-ghost px-2.5 py-1.5 text-[9.5px]">Clear</button>
        <span className="text-[9.5px] text-frost-300/50">
          {onCustom.length > 0 ? `${onCustom.length} guard(s) walking this route` : "No guard assigned to it yet"}
        </span>
      </div>
    </section>
  );
}

// ═══════════════════════════ REPORTS ═══════════════════════════════════════

function ReportsTab({ game }: { game: Game }) {
  const s = useGame(game);
  const hist = [...s.siege.history].reverse();
  const targets = siegeTargets(s);

  return (
    <div className="space-y-1.5">
      <p className="px-0.5 pb-1 text-[10.5px] leading-snug text-frost-300/55">
        Every resolved attack, newest first. The log keeps the last 24 entries so the save cannot grow without bound.
      </p>
      {hist.length === 0 && (
        <div className="panel-soft px-4 py-3 text-[11px] text-frost-300/60">
          No attacks yet. The first nights are quiet; the wild notices the camp as it grows.
        </div>
      )}
      {hist.map(h => (
        <div key={h.id} className="panel-soft px-3 py-2.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <ItemIcon icon={h.kind === "night" ? "moon" : h.kind === "weekly" ? "wolf" : "fortress"}
              className="h-4 w-4 shrink-0 text-frost-300/70" />
            <span className="font-display text-[12.5px] font-bold text-frost-200">Day {h.day}</span>
            <span className="chip bg-ink-700/80 text-[9px] text-frost-300/60">
              {h.kind === "night" ? "Night pack" : h.kind === "weekly" ? "Horde" : "Beast Tide"}
            </span>
            <span className={cn("chip text-[9px]",
              h.outcome === "full" ? "bg-moss-400/15 text-moss-400"
                : h.outcome === "failed" ? "bg-blood-500/15 text-blood-400"
                : "bg-ember-500/15 text-ember-300")}>
              {h.outcome}
            </span>
            {h.offline && <span className="chip bg-ink-700/80 text-[9px] text-frost-300/50">resolved offline</span>}
          </div>
          <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[10px] text-frost-300/65 sm:grid-cols-3">
            <span>Defeated: <b className="text-frost-300">{h.kills}{h.total ? `/${h.total}` : ""}</b></span>
            <span>Casualties: <b className="text-frost-300">{h.injuries}</b></span>
            <span>Structure damage: <b className="text-frost-300">{h.structDamage ?? 0}</b></span>
            {h.structDestroyed.length > 0 && (
              <span className="col-span-2 text-blood-400 sm:col-span-3">
                Destroyed: {h.structDestroyed.map(id => targets.find(t => t.id === id)?.name ?? id).join(", ")}
              </span>
            )}
            {h.rewards && h.rewards.length > 0 && (
              <span className="col-span-2 sm:col-span-3">
                Rewards: {h.rewards.map(rw => `${rw.n}× ${ITEMS[rw.item as ItemId]?.name ?? rw.item}`).join(", ")}
              </span>
            )}
            {h.recovery && (h.recovery.wood > 0 || h.recovery.stone > 0) && (
              <span className="col-span-2 text-ember-300 sm:col-span-3">
                Recovery cost at the time: {h.recovery.wood} wood + {h.recovery.stone} stone
              </span>
            )}
          </div>
        </div>
      ))}
      {hist.length > 0 && (
        <div className="panel-soft mt-1 px-3 py-2 text-[10px] text-frost-300/50">
          Current outstanding repairs:{" "}
          {targets.filter(t => structHealth(s, t.id) < t.max).length === 0
            ? "none — every structure is whole."
            : targets.filter(t => structHealth(s, t.id) < t.max)
                .map(t => `${t.name} ${structHealth(s, t.id)}/${t.max}`).join(" · ")}
        </div>
      )}
    </div>
  );
}
