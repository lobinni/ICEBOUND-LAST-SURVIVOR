// ── ICEBOUND Phase 6.2: settlement management UI ────────────────────────────
// One modal, five sections: Overview (housing + defense + warnings), Residents
// (identities, health, assignments, recruitment), Work (task cards, production
// status, blocked reasons), Warriors (specialisations & posts), Supplies
// (upkeep & rations). Every control routes through Game → residents.ts.

import { useMemo, useState } from "react";
import { ITEMS } from "../game/config";
import type { ItemId } from "../game/types";
import type { Game } from "../game/engine";
import {
  CALL_COST, RESCUES, RES_BAL, TASKS, WARRIOR_SPECS,
  capacityBreakdown, capacityOf, callStatus, conditionOf, dailyFoodDemand,
  daysOfFood, defenseSummary, foodPoints, poolCount, taskStatus,
  type RescueDef, type Resident, type TaskId,
} from "../game/residents";
import {
  ASSIGNMENTS, ASSIGNMENT_ORDER, GUARD_AI, GUARD_ARMOR_IDS, GUARD_STATE_LABEL,
  GUARD_WEAPON_IDS, PRIORITY_LABEL, assignmentLocked, assignmentOf, guardArmorDR,
  guardDamage, guardReach, guardWatchRadius, type GuardPriority,
} from "../game/guards";
import { ENEMY } from "../game/config";
import { countItem } from "../game/state";
import { useGame } from "./hooks";
import { ItemIcon } from "./icons";
import { Shell } from "./Shell";
import { cn } from "@/utils/cn";

const TABS = [
  { id: "overview", label: "Overview", icon: "residents" },
  { id: "residents", label: "Residents", icon: "recruit" },
  { id: "work", label: "Work", icon: "hammer" },
  { id: "warriors", label: "Warriors", icon: "spear" },
  { id: "supplies", label: "Supplies", icon: "stew" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export function SettlementModal({ game }: { game: Game }) {
  const s = useGame(game);
  const [tab, setTab] = useState<TabId>("overview");
  const set = s.settlement;
  const cap = capacityOf(s);
  const def = defenseSummary(s);
  const alerts = useMemo(() => {
    const out: { label: string; tone: "bad" | "warn" }[] = [];
    for (const r of set.residents) {
      if (r.downed) out.push({ label: `${r.name} is down — treat with medicine`, tone: "bad" });
      else if (r.injured) out.push({ label: `${r.name} is wounded`, tone: "warn" });
      else if (r.unfed >= 2) out.push({ label: `${r.name} hasn't eaten in ${r.unfed} days`, tone: "bad" });
      else if (r.stuckT > RES_BAL.pathBlockedAt) out.push({ label: `${r.name}: path to post is blocked`, tone: "warn" });
    }
    const days = daysOfFood(s);
    if (set.residents.length > 0 && days < 2) {
      out.push({ label: days <= 0 ? "No stored food left" : `Only ~${Math.max(0.1, days).toFixed(1)} days of rations left`, tone: days <= 0 ? "bad" : "warn" });
    }
    return out.slice(0, 5);
  }, [s, set]);

  return (
    <Shell title="Settlement" icon="residents" onClose={() => game.closeModal()} wide
      sub={`${set.residents.length}/${cap} residents · ${def.ready}/${def.total} defenders ready · ${daysLabel(daysOfFood(s))}`}>
      {/* tab rail */}
      <div className="mb-3 flex gap-1 overflow-x-auto pb-0.5">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={cn("btn shrink-0 px-3 py-2 text-[10px]",
              tab === t.id ? "btn-frost" : "btn-ghost")}>
            <ItemIcon icon={t.icon} className="h-3.5 w-3.5" /> {t.label}
          </button>
        ))}
      </div>

      {alerts.length > 0 && (
        <div className="mb-3 space-y-1">
          {alerts.map((a, i) => (
            <div key={i} className={cn("flex items-center gap-2 rounded px-2.5 py-1.5 text-[11px] font-semibold",
              a.tone === "bad" ? "bg-blood-500/15 text-blood-400" : "bg-ember-500/12 text-ember-300")}>
              <ItemIcon icon="warn" className="h-3.5 w-3.5 shrink-0" /> {a.label}
            </div>
          ))}
        </div>
      )}

      {tab === "overview" && <OverviewTab game={game} />}
      {tab === "residents" && <ResidentsTab game={game} />}
      {tab === "work" && <WorkTab game={game} />}
      {tab === "warriors" && <WarriorsTab game={game} />}
      {tab === "supplies" && <SuppliesTab game={game} />}
    </Shell>
  );
}

function daysLabel(days: number) {
  return !isFinite(days) ? "no mouths to feed" : `~${Math.max(0, days).toFixed(1)} days of rations`;
}

// ═══════════════════════════ OVERVIEW ══════════════════════════════════════

function OverviewTab({ game }: { game: Game }) {
  const s = useGame(game);
  const set = s.settlement;
  const cap = capacityOf(s);
  const parts = capacityBreakdown(s);
  const def = defenseSummary(s);

  return (
    <div className="space-y-3">
      {/* housing capacity */}
      <section className="panel-soft px-4 py-3">
        <div className="mb-1 flex items-center justify-between">
          <span className="font-display text-[11px] font-bold uppercase tracking-[0.2em] text-frost-300/75">
            Housing capacity
          </span>
          <span className={cn("font-display text-lg font-bold", set.residents.length >= cap ? "text-blood-400" : "text-frost-200")}>
            {set.residents.length}/{cap}
          </span>
        </div>
        <div className="statbar h-2.5">
          <i style={{ transform: `scaleX(${cap > 0 ? set.residents.length / cap : 1})`, background: "linear-gradient(90deg,#1e7fb4,#a5e0ff)" }} />
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {parts.map(p => (
            <span key={p.label} className="chip border border-frost-400/25 bg-frost-500/10 text-frost-200">
              <ItemIcon icon="bunks" className="h-3 w-3" /> {p.label} +{p.n}
            </span>
          ))}
          {!s.build.bunks && (
            <span className="chip border border-frost-400/15 bg-ink-700/60 text-frost-300/55">
              Bunkhouse +3 (buildable)
            </span>
          )}
        </div>
        {cap === 0 && (
          <p className="mt-2 text-[11px] leading-snug text-frost-300/60">
            Residents need real housing: finish <b className="text-frost-200">Warm Quarters</b> (Outpost Stage 2) to house your first two survivors, <b className="text-frost-200">Stage 3</b> for two more, then the <b className="text-frost-200">Bunkhouse</b> for three.
          </p>
        )}
        {set.residents.length >= cap && cap > 0 && (
          <p className="mt-2 flex items-start gap-1.5 text-[11px] text-blood-400">
            <ItemIcon icon="warn" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Housing full — recruitment is unavailable until capacity grows. Recruits never teleport in and never exceed capacity.
          </p>
        )}
      </section>

      {/* defense readiness */}
      <section className="panel-soft px-4 py-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="font-display text-[11px] font-bold uppercase tracking-[0.2em] text-frost-300/75">Defense readiness</span>
          <span className="font-display text-sm font-bold text-frost-200">{def.ready}/{def.total} fit</span>
        </div>
        <div className="grid grid-cols-3 gap-1.5 text-center">
          <div className="panel-soft px-2 py-2.5">
            <ItemIcon icon="spear" className="mx-auto mb-1 h-4 w-4 text-ember-300" />
            <div className="font-display text-lg font-bold text-frost-200">{def.warriors}</div>
            <div className="text-[9.5px] uppercase tracking-widest text-frost-300/55">Warriors</div>
          </div>
          <div className="panel-soft px-2 py-2.5">
            <ItemIcon icon="spikes" className="mx-auto mb-1 h-4 w-4 text-frost-300" />
            <div className="font-display text-lg font-bold text-frost-200">{s.build.spikes ? "Built" : "—"}</div>
            <div className="text-[9.5px] uppercase tracking-widest text-frost-300/55">Spikes</div>
          </div>
          <div className="panel-soft px-2 py-2.5">
            <ItemIcon icon="lantern" className="mx-auto mb-1 h-4 w-4 text-ember-300" />
            <div className="font-display text-lg font-bold text-frost-200">{s.build.lamp ? "Lit" : "—"}</div>
            <div className="text-[9.5px] uppercase tracking-widest text-frost-300/55">Perimeter lamps</div>
          </div>
        </div>
        <p className="mt-2 text-[10.5px] leading-snug text-frost-300/55">
          Guards hold or patrol an assigned position and intercept predators that enter their own watch radius — they do not see the whole map. Wounded defenders fall back, recover, and return to duty; residents can be hurt, never lost for good.
        </p>
        {def.total > 0 && (
          <div className="mt-2 space-y-1">
            {s.settlement.residents.filter(r => r.role === "warrior").map(w => (
              <div key={w.id} className="flex items-center gap-2 text-[10.5px]">
                <span className={cn("font-display font-bold uppercase tracking-wider",
                  STATE_TONE[w.gs] ?? "text-frost-300/70")}>{GUARD_STATE_LABEL[w.gs]}</span>
                <span className="truncate text-frost-300/60">{w.name} — {assignmentOf(w.post).name}</span>
                <span className="ml-auto shrink-0 font-display text-[10px] font-bold tabular-nums text-frost-300/50">
                  {Math.round(w.hp)}/{w.maxHp}
                </span>
              </div>
            ))}
          </div>
        )}
        <button onClick={() => game.openModal("defense")} className="btn btn-frost mt-2.5 w-full px-3 py-2 text-[10px]">
          <ItemIcon icon="bunks" className="h-3.5 w-3.5" /> Open Defence Board (D)
        </button>
      </section>

      {/* production snapshot */}
      <section className="panel-soft px-4 py-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="font-display text-[11px] font-bold uppercase tracking-[0.2em] text-frost-300/75">Production snapshot</span>
          <span className="text-[10px] text-frost-300/50">all output lands in the Supply Cache</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(Object.entries(set.produced) as [ItemId, number][]).filter(([, n]) => n > 0).map(([id, n]) => (
            <span key={id} className="chip border border-frost-400/25 bg-frost-500/10 text-frost-200">
              <ItemIcon icon={ITEMS[id].icon} className="h-3 w-3" color={ITEMS[id].color} /> {ITEMS[id].name} ×{n}
            </span>
          ))}
          {Object.values(set.produced).every(n => n <= 0) && (
            <span className="text-[11px] text-frost-300/55">Nothing produced yet — assign workers on the Work tab.</span>
          )}
        </div>
      </section>
    </div>
  );
}

// ═══════════════════════════ RESIDENTS + RECRUIT ═══════════════════════════

function ResidentsTab({ game }: { game: Game }) {
  const s = useGame(game);
  const set = s.settlement;
  return (
    <div className="space-y-3">
      {set.residents.length === 0 && (
        <div className="panel-soft px-4 py-3 text-[11.5px] leading-relaxed text-frost-300/70">
          Nobody else has answered the cold yet. <b className="text-frost-200">Rescue survivors</b> on your expeditions (listen for pod beacons in the Shipwreck, Cave, Station and Fortress), or build the <b className="text-frost-200">Signal Beacon</b> and broadcast a call. Housing decides how many can stay.
        </div>
      )}
      {set.residents.map(r => <ResidentCard key={r.id} game={game} r={r} />)}
      <RecruitmentPanel game={game} />
    </div>
  );
}

function ResidentCard({ game, r }: { game: Game; r: Resident }) {
  const s = useGame(game);
  const cond = conditionOf(s, r);
  const task = r.task ? TASKS[r.task] : null;
  const spec = r.spec ? WARRIOR_SPECS[r.spec] : null;
  return (
    <div className="panel-soft px-3 py-2.5">
      <div className="flex items-start gap-3">
        <span className={cn("invslot flex h-11 w-11 shrink-0 items-center justify-center",
          (r.injured || r.downed) && "animate-pulse-warn border-blood-400/50")}>
          <ItemIcon icon={r.role === "warrior" ? "spear" : "residents"} className="h-5 w-5"
            color={r.downed ? "#ff6b6b" : r.injured ? "#ff9d8a" : r.role === "warrior" ? "#c9d6e2" : "#8be8ff"} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-display text-[15px] font-bold tracking-wide text-frost-200">{r.name}</span>
            <span className="chip bg-ink-700/80 text-[9px] text-frost-300/70">{r.title}</span>
            <span className={cn("chip text-[9px]", r.role === "warrior" ? "bg-ember-500/15 text-ember-300" : "bg-frost-500/15 text-frost-300")}>
              {r.role === "warrior" ? spec?.name : "Worker"}
            </span>
          </div>
          <div className="mt-0.5 text-[10.5px] text-frost-300/55">{r.trait} — {r.traitDesc}</div>

          {/* health */}
          <div className="mt-1.5 flex items-center gap-2">
            <ItemIcon icon="heart" className="h-3 w-3 text-blood-400" />
            <div className="statbar h-2 flex-1">
              <i style={{
                transform: `scaleX(${Math.max(0, r.hp / r.maxHp)})`,
                background: r.hp / r.maxHp > 0.5 ? "linear-gradient(90deg,#3fae6c,#9be2b5)" : "linear-gradient(90deg,#e84848,#ff8a70)",
              }} />
            </div>
            <span className="font-display text-[10px] font-bold tabular-nums text-frost-300/75">{Math.round(r.hp)}/{r.maxHp}</span>
          </div>

          {/* assignment + condition */}
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[10.5px]">
            <span className={cn("chip border",
              cond.tone === "bad" ? "border-blood-400/40 bg-blood-500/10 text-blood-400"
                : cond.tone === "warn" ? "border-ember-400/40 bg-ember-500/10 text-ember-300"
                : "border-moss-400/40 bg-moss-400/10 text-moss-400")}>
              <ItemIcon icon={cond.id === "blocked" ? "warn" : cond.id === "fighting" ? "spear" : cond.id === "paused" ? "pause" : cond.id === "working" ? "hammer" : cond.id === "injured" || cond.id === "downed" ? "salve" : "residents"} className="h-3 w-3" />
              {cond.label}{r.stuckT > RES_BAL.pathBlockedAt ? " · Path blocked" : ""}
            </span>
          </div>
          {r.role === "worker" && (
            <div className="mt-1 text-[10.5px] text-frost-300/60">
              Assignment: <b className="text-frost-300">{task ? task.name : "none"}</b>
              {task && <span className="text-frost-300/45"> · {taskIconText(task)}</span>}
            </div>
          )}
          {r.role === "warrior" && (
            <div className="mt-1 text-[10.5px] text-frost-300/60">
              Weapon: <b className="text-frost-300">{r.gear.weapon ? ITEMS[r.gear.weapon].name : "bare hands"}</b>
              {r.gear.armor && <> · Armour: <b className="text-frost-300">{ITEMS[r.gear.armor].name}</b></>}
              {" "}· Post: <b className="text-frost-300">{assignmentOf(r.post).name}</b>
            </div>
          )}
        </div>

        {/* controls */}
        <div className="flex shrink-0 flex-col gap-1.5">
          <button onClick={() => game.pauseResident(r.id)}
            className={cn("btn px-2.5 py-1.5 text-[9.5px]", r.paused ? "btn-ember" : "btn-ghost")}>
            <ItemIcon icon={r.paused ? "play" : "pause"} className="h-3 w-3" />{r.paused ? "Resume" : "Pause"}
          </button>
          <button onClick={() => game.treatResidentById(r.id)}
            disabled={!r.injured && !r.downed}
            className="btn btn-frost px-2.5 py-1.5 text-[9.5px]"
            title={`Medkits in reach: ${poolCount(s, "medkit")} · Salves: ${poolCount(s, "salve")}`}>
            <ItemIcon icon="salve" className="h-3 w-3" /> Treat
          </button>
        </div>
      </div>
    </div>
  );
}

function taskIconText(task: (typeof TASKS)[TaskId]): string {
  if (task.output) return `${task.input ? Object.entries(task.input).map(([id, n]) => `${n} ${ITEMS[id as ItemId].name}`).join(" + ") + " → " : ""}${task.output.n} ${ITEMS[task.output.item].name} / ${task.time}s`;
  return `1 Wood from storage → fire fuel / ${task.time}s`;
}

// ── recruitment ─────────────────────────────────────────────────────────────

function PoolChips({ game, needs }: { game: Game; needs: Partial<Record<ItemId, number>> }) {
  const s = useGame(game);
  return (
    <div className="flex flex-wrap gap-1">
      {(Object.entries(needs) as [ItemId, number][]).map(([id, n]) => {
        const have = poolCount(s, id);
        const ok = have >= n;
        return (
          <span key={id} title={`${ITEMS[id].name}: storage ${countItem(s, id, "storage")} + pack ${countItem(s, id, "inv")}`}
            className={cn("chip border text-[9.5px]", ok ? "border-frost-400/25 bg-frost-500/10 text-frost-200" : "border-blood-400/40 bg-blood-500/10 text-blood-400")}>
            <ItemIcon icon={ITEMS[id].icon} className="h-3 w-3" color={ITEMS[id].color} />
            {have}/{n}<span aria-hidden className="font-display font-bold">{ok ? "✓" : "✕"}</span>
          </span>
        );
      })}
    </div>
  );
}

function RecruitmentPanel({ game }: { game: Game }) {
  const s = useGame(game);
  const chk = callStatus(s);
  const cap = capacityOf(s);
  return (
    <section className="panel-soft border-frost-400/20 px-4 py-3">
      <div className="mb-2 flex items-center gap-2">
        <ItemIcon icon="recruit" className="h-4 w-4 text-ember-300" />
        <span className="font-display text-[11px] font-bold uppercase tracking-[0.2em] text-frost-300/75">Recruitment</span>
        <span className="ml-auto font-display text-[10px] font-bold text-frost-300/55">{s.settlement.residents.length}/{cap} housed</span>
      </div>

      {/* Signal Beacon broadcast */}
      <div className="panel-soft flex items-start gap-3 px-3 py-2.5">
        <span className="invslot flex h-10 w-10 shrink-0 items-center justify-center">
          <ItemIcon icon="beacon" className="h-5 w-5" color="#8be8ff" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="font-display text-[13px] font-bold text-frost-200">Broadcast a call</div>
          <div className="text-[10.5px] leading-snug text-frost-300/60">
            {chk.next
              ? <>Next voice on the band: <b className="text-frost-300">{chk.next.name}</b>, {chk.next.title} — {chk.next.trait}.</>
              : "Every known survivor already lives at the outpost."}
          </div>
          <div className="mt-1"><PoolChips game={game} needs={CALL_COST} /></div>
          {!chk.ok && chk.reasons.length > 0 && (
            <div className="mt-1 space-y-0.5">
              {chk.reasons.slice(0, 3).map((r, i) => (
                <div key={i} className="flex items-center gap-1.5 text-[10px] font-semibold text-ember-300">
                  <ItemIcon icon="warn" className="h-3 w-3 shrink-0" />{r}
                </div>
              ))}
            </div>
          )}
        </div>
        <button onClick={() => game.callRescue()} disabled={!chk.ok}
          className="btn btn-ember shrink-0 px-3 py-2 text-[10px]">
          Call
        </button>
      </div>

      {/* expedition rescues */}
      <div className="mt-2 space-y-1.5">
        {RESCUES.map(def => <RescueRow key={def.containerId} game={game} def={def} />)}
      </div>
    </section>
  );
}

function RescueRow({ game, def }: { game: Game; def: RescueDef }) {
  const s = useGame(game);
  const rescued = s.settlement.residents.some(r => r.id === def.resident.id);
  const chk = game.rescueCheck(def);
  const regionId = def.region as keyof typeof s.regions;
  const region = s.regions[regionId];
  const site = region?.containers.find(c => c.id === def.containerId);
  const unlocked = s.unlocked.includes(regionId);
  const canGuide = !rescued && unlocked && !!site;
  const guide = () => {
    if (!site) return;
    if (s.region === regionId) {
      game.guideTo(site.x, site.y, `Rescue: ${def.resident.name}`, "#ffd2a0");
    } else {
      // the objective lives in another region — point at the local gate instead
      const gate = s.structs.find(st => st.kind === "gate" && st.to === regionId)
        ?? s.structs.find(st => st.kind === "gate");
      if (gate) game.guideTo(gate.x, gate.y, `GATE — travel to ${regionId === "ship" ? "the Shipwreck" : regionId === "cave" ? "the Crystal Cave" : regionId === "station" ? "the Research Station" : "the Frost Fortress"}`, "#ffd2a0");
      else game.openModal("map");
    }
  };
  return (
    <div className={cn("panel-soft flex items-start gap-3 px-3 py-2.5", rescued && "opacity-60")}>
      <span className="invslot flex h-10 w-10 shrink-0 items-center justify-center">
        <ItemIcon icon={rescued ? "done" : "residents"} className="h-4.5 w-4.5" color={rescued ? "#7fd6a4" : "#ffb063"} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-display text-[13px] font-bold text-frost-200">{def.resident.name}</span>
          <span className="chip bg-ink-700/80 text-[9px] text-frost-300/70">{def.regionLabel}</span>
          <span className={cn("chip text-[9px]", def.resident.role === "warrior" ? "bg-ember-500/15 text-ember-300" : "bg-frost-500/15 text-frost-300")}>
            {def.resident.role === "warrior" ? "Warrior" : "Worker"}
          </span>
        </div>
        <div className="text-[10.5px] text-frost-300/60">{def.resident.title} · {def.resident.trait} — {def.resident.traitDesc}</div>
        {!rescued && (
          <>
            <div className="mt-1"><PoolChips game={game} needs={def.cost} /></div>
            {!chk.ok && (
              <div className="mt-1 flex items-start gap-1.5 text-[10px] font-semibold text-ember-300">
                <ItemIcon icon="warn" className="mt-px h-3 w-3 shrink-0" />{chk.reasons[0]}
              </div>
            )}
          </>
        )}
      </div>
      {rescued
        ? <span className="chip border border-moss-400/40 bg-moss-400/10 text-moss-400">Rescued</span>
        : canGuide
          ? (
            <button onClick={guide} className="btn btn-frost shrink-0 px-3 py-2 text-[10px]">
              <ItemIcon icon="compass" className="h-3.5 w-3.5" /> Guide
            </button>
          )
          : <span className="chip bg-ink-700/80 text-[9px] text-frost-300/50">Find the route</span>}
    </div>
  );
}

// ═══════════════════════════ WORK / PRODUCTION ═════════════════════════════

function WorkTab({ game }: { game: Game }) {
  const s = useGame(game);
  const workers = s.settlement.residents.filter(r => r.role === "worker");
  return (
    <div className="space-y-1.5">
      <p className="px-0.5 pb-1 text-[10.5px] leading-snug text-frost-300/55">
        Workers walk to their post, work the cycle, and deliver everything to the <b className="text-frost-300">Supply Cache</b> — no hidden stores. Gathering posts deplete and regrow; cook, water, medic and the fire tender consume stored input. Full storage or missing input blocks the cycle with a visible reason.
      </p>
      {workers.length === 0 && (
        <div className="panel-soft px-4 py-3 text-[11px] text-frost-300/60">No workers yet — recruit survivors first (Residents tab). Warriors are managed on the Warriors tab.</div>
      )}
      {(Object.keys(TASKS) as TaskId[]).map(id => <TaskCard key={id} game={game} id={id} />)}
      {workers.length > 0 && <UnassignedNote game={game} />}
    </div>
  );
}

function UnassignedNote({ game }: { game: Game }) {
  const s = useGame(game);
  const idle = s.settlement.residents.filter(r => r.role === "worker" && !r.task);
  if (idle.length === 0) return null;
  return (
    <div className="panel-soft mt-1 px-3 py-2 text-[10.5px] text-frost-300/60">
      Idle hands: {idle.map(r => r.name.split(" ")[0]).join(", ")} — open a post above to assign them.
    </div>
  );
}

function TaskCard({ game, id }: { game: Game; id: TaskId }) {
  const s = useGame(game);
  const task = TASKS[id];
  const holder = s.settlement.residents.find(r => r.task === id && r.role === "worker");
  const workers = s.settlement.residents.filter(r => r.role === "worker");
  const blocked = holder ? taskStatus(s, holder, task) : null;
  const stockMax = task.stock?.max ?? 0;
  const stock = s.settlement.stock[id];
  const pct = holder ? Math.min(1, holder.workT / task.time) : 0;

  return (
    <div className="panel-soft px-3 py-2.5">
      <div className="flex items-start gap-3">
        <span className="invslot flex h-11 w-11 shrink-0 items-center justify-center">
          <ItemIcon icon={task.icon} className="h-5 w-5" color={task.output ? ITEMS[task.output.item].color : "#ffb063"} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-display text-[14px] font-bold tracking-wide text-frost-200">{task.name}</span>
            {task.needsFire && <span className="chip bg-ink-700/80 text-[9px] text-frost-300/70">Campfire</span>}
            {task.needsBuild && <span className="chip bg-ink-700/80 text-[9px] text-frost-300/70">{task.needsBuild === "cookpot" ? "Cooking Pot" : task.needsBuild}</span>}
            {task.specialistId && <span className="chip bg-moss-400/15 text-[9px] text-moss-400">Medic only</span>}
            {task.stock && (
              <span className={cn("chip border text-[9px]",
                stock > 0 ? "border-frost-400/25 bg-frost-500/10 text-frost-200" : "border-ember-400/40 bg-ember-500/10 text-ember-300")}>
                Site {stock}/{stockMax}{stock <= 0 ? " · regrowing" : ""}
              </span>
            )}
          </div>
          <div className="text-[10.5px] leading-snug text-frost-300/60">{task.desc}</div>
          <div className="mt-1 text-[10px] text-frost-300/50">{taskIconText(task)}</div>

          {/* live production bar */}
          {holder && !blocked && (
            <div className="mt-1.5">
              <div className="mb-0.5 flex items-center justify-between">
                <span className="text-[9.5px] uppercase tracking-widest text-frost-300/55">{holder.name} · producing</span>
                <span className="font-display text-[10px] font-bold text-frost-300/80">{Math.round(pct * 100)}%</span>
              </div>
              <div className="statbar h-1.5">
                <i style={{ transform: `scaleX(${pct})`, background: "linear-gradient(90deg,#1e7fb4,#a5e0ff)" }} />
              </div>
            </div>
          )}
          {holder && blocked && !holder.paused && (
            <div className="mt-1.5 flex items-start gap-1.5 text-[10.5px] font-semibold text-blood-400">
              <ItemIcon icon="warn" className="mt-px h-3.5 w-3.5 shrink-0" />
              {blocked}
            </div>
          )}
          {holder?.paused && (
            <div className="mt-1.5 flex items-center gap-1.5 text-[10.5px] font-semibold text-ember-300">
              <ItemIcon icon="pause" className="h-3.5 w-3.5" /> Paused by you — resume any time
            </div>
          )}
        </div>

        {/* assignment select — one worker per post prevents conflicts */}
        <div className="flex w-[128px] shrink-0 flex-col gap-1">
          <select
            value={holder?.id ?? ""}
            onChange={e => {
              const val = e.target.value;
              if (val === "") { if (holder) game.assignTask(holder.id, null); }
              else game.assignTask(val, id);
            }}
            aria-label={`Assign worker to ${task.name}`}
            className="w-full rounded border border-frost-400/25 bg-ink-800 px-2 py-2 text-[11px] text-frost-200 outline-none focus:border-frost-400/60">
            <option value="">— unassigned —</option>
            {workers.map(w => {
              const specialistBlocked = !!task.specialistId && task.specialistId !== w.id;
              return (
                <option key={w.id} value={w.id} disabled={specialistBlocked || w.downed}>
                  {w.name}{w.task && w.task !== id ? ` (${TASKS[w.task].name})` : ""}{specialistBlocked ? " — medic only" : ""}
                </option>
              );
            })}
          </select>
          {holder && (
            <button onClick={() => game.pauseResident(holder.id)}
              className={cn("btn px-2 py-1 text-[9px]", holder.paused ? "btn-ember" : "btn-ghost")}>
              <ItemIcon icon={holder.paused ? "play" : "pause"} className="h-3 w-3" />{holder.paused ? "Resume" : "Pause"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════ WARRIORS / DEFENSE ════════════════════════════

function WarriorsTab({ game }: { game: Game }) {
  const s = useGame(game);
  const warriors = s.settlement.residents.filter(r => r.role === "warrior");
  const alarm = s.settlement.alarm;
  return (
    <div className="space-y-1.5">
      <p className="px-0.5 pb-1 text-[10.5px] leading-snug text-frost-300/55">
        Guards run an autonomous watch: they hold a post or walk a route, sight threats inside their own watch radius (they do not see the whole map), commit after a moment's confirmation, fight with their real equipment, and return to duty afterwards. They never chase beyond their assignment's leash.
      </p>
      {alarm && (
        <div className="flex items-center gap-2 rounded bg-blood-500/15 px-2.5 py-1.5 text-[11px] font-semibold text-blood-400">
          <ItemIcon icon="warn" className="h-3.5 w-3.5 shrink-0 animate-pulse" /> Camp alarm: {alarm.reason}
        </div>
      )}
      {warriors.length === 0 && (
        <div className="panel-soft px-4 py-3 text-[11px] text-frost-300/60">
          No warriors yet. Jorah Vale survives in the <b className="text-frost-200">Frost Fortress</b>; two more veterans answer the Signal Beacon.
        </div>
      )}
      {warriors.map(w => <WarriorCard key={w.id} game={game} w={w} />)}
      {warriors.length > 0 && <WarriorLegend />}
    </div>
  );
}

function WarriorLegend() {
  return (
    <div className="panel-soft mt-2 px-3 py-2.5 text-[10px] leading-relaxed text-frost-300/50">
      <b className="text-frost-300">Spear Guard</b> — tougher, heavier hit, holds ground between strikes.{" "}
      <b className="text-frost-300">Kite Scout</b> — faster, wider sightline, gives ground after each strike.{" "}
      Guards fall back at {Math.round(GUARD_AI.retreatAt * 100)}% health and only return to duty above {Math.round(GUARD_AI.returnAt * 100)}%.
      No bow or ammunition exists in this game, so there is no archer specialisation — reach comes from real spears.
    </div>
  );
}

const STATE_TONE: Record<string, string> = {
  attack: "text-blood-400", pursue: "text-ember-300", alert: "text-ember-300",
  recover: "text-ember-300", retreat: "text-blood-400", injured: "text-blood-400",
  patrol: "text-moss-400", guard: "text-moss-400", return: "text-frost-300/70", idle: "text-frost-300/50",
};

function WarriorCard({ game, w }: { game: Game; w: Resident }) {
  const s = useGame(game);
  const spec = WARRIOR_SPECS[w.spec ?? "guard"];
  const post = assignmentOf(w.post);
  const dmg = guardDamage(w);
  const reach = guardReach(w);
  const dr = guardArmorDR(w);
  const watch = guardWatchRadius(s, w);
  const target = w.targetId ? s.enemies.find(e => e.id === w.targetId) : null;

  return (
    <div className="panel-soft px-3 py-2.5">
      <div className="flex items-start gap-3">
        <span className={cn("invslot flex h-11 w-11 shrink-0 items-center justify-center",
          (w.injured || w.downed) && "animate-pulse-warn border-blood-400/50")}>
          <ItemIcon icon={w.gear.weapon ? ITEMS[w.gear.weapon].icon : spec.weaponIcon} className="h-5 w-5"
            color={w.downed ? "#ff6b6b" : w.gear.weapon ? ITEMS[w.gear.weapon].color : "#c9d6e2"} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-display text-[15px] font-bold text-frost-200">{w.name}</span>
            <span className="chip bg-ember-500/15 text-[9px] text-ember-300">{spec.name}</span>
            {w.trait && <span className="chip bg-ink-700/80 text-[9px] text-frost-300/70" title={w.traitDesc}>{w.trait}</span>}
            {w.kills > 0 && <span className="chip bg-ink-700/80 text-[9px] text-frost-300/60">{w.kills} driven off</span>}
          </div>

          {/* live AI state */}
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10.5px]">
            <span className={cn("font-display font-bold uppercase tracking-wider", STATE_TONE[w.gs] ?? "text-frost-300/70")}>
              {GUARD_STATE_LABEL[w.gs]}
            </span>
            <span className="text-frost-300/45">·</span>
            <span className="text-frost-300/65">{post.name}</span>
            {target && <><span className="text-frost-300/45">·</span><span className="text-blood-400">engaging {ENEMY[target.kind].name}</span></>}
            {w.stuckT > 2.2 && <><span className="text-frost-300/45">·</span><span className="text-ember-300">route blocked</span></>}
          </div>

          {/* health */}
          <div className="mt-1.5 flex items-center gap-2">
            <ItemIcon icon="heart" className="h-3 w-3 text-blood-400" />
            <div className="statbar h-2 flex-1">
              <i style={{
                transform: `scaleX(${Math.max(0, w.hp / w.maxHp)})`,
                background: w.hp / w.maxHp > 0.5 ? "linear-gradient(90deg,#3fae6c,#9be2b5)" : "linear-gradient(90deg,#e84848,#ff8a70)",
              }} />
            </div>
            <span className="font-display text-[10px] font-bold tabular-nums text-frost-300/75">{Math.round(w.hp)}/{w.maxHp}</span>
          </div>

          {/* derived combat stats — all from real equipment */}
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] text-frost-300/55">
            <span>Damage <b className="text-frost-300">{dmg}</b></span>
            <span>Reach <b className="text-frost-300">{(reach / 10).toFixed(1)}m</b></span>
            <span>Armour <b className="text-frost-300">{Math.round(dr * 100)}%</b></span>
            <span>Watch <b className="text-frost-300">{Math.round(watch / 10)}m</b></span>
            <span>Leash <b className="text-frost-300">{Math.round(post.leash / 10)}m</b></span>
          </div>

          {/* equipment — real items, moved out of the shared pool */}
          <div className="mt-2 grid grid-cols-2 gap-1.5">
            <GearSelect game={game} w={w} slot="weapon" ids={GUARD_WEAPON_IDS} label="Weapon" />
            <GearSelect game={game} w={w} slot="armor" ids={GUARD_ARMOR_IDS} label="Armour" />
          </div>
        </div>

        {/* assignment + priority + treat */}
        <div className="flex w-[132px] shrink-0 flex-col gap-1">
          <select value={w.post} onChange={e => game.warriorPost(w.id, e.target.value)}
            aria-label={`Set assignment for ${w.name}`}
            className="w-full rounded border border-frost-400/25 bg-ink-800 px-2 py-2 text-[11px] text-frost-200 outline-none focus:border-frost-400/60">
            {ASSIGNMENT_ORDER.map(id => {
              const def = ASSIGNMENTS[id];
              const locked = assignmentLocked(s, def);
              return (
                <option key={id} value={id} disabled={!!locked}>
                  {def.name}{locked ? " — locked" : ""}
                </option>
              );
            })}
          </select>
          <select value={w.priority} onChange={e => game.guardPriority(w.id, e.target.value as GuardPriority)}
            aria-label={`Set target priority for ${w.name}`}
            title={PRIORITY_LABEL[w.priority].desc}
            className="w-full rounded border border-frost-400/25 bg-ink-800 px-2 py-2 text-[11px] text-frost-200 outline-none focus:border-frost-400/60">
            {(Object.keys(PRIORITY_LABEL) as GuardPriority[]).map(p => (
              <option key={p} value={p}>{PRIORITY_LABEL[p].name}</option>
            ))}
          </select>
          <div className="grid grid-cols-2 gap-1">
            <button onClick={() => game.pauseResident(w.id)}
              className={cn("btn px-1 py-1 text-[9px]", w.paused ? "btn-ember" : "btn-ghost")}>
              <ItemIcon icon={w.paused ? "play" : "pause"} className="h-3 w-3" />{w.paused ? "Resume" : "Stand down"}
            </button>
            <button onClick={() => game.treatResidentById(w.id)} disabled={!w.injured && !w.downed}
              className="btn btn-frost px-1 py-1 text-[9px]">
              <ItemIcon icon="salve" className="h-3 w-3" /> Treat
            </button>
          </div>
        </div>
      </div>
      <p className="mt-1.5 text-[10px] leading-snug text-frost-300/45">{post.desc}</p>
    </div>
  );
}

/** Equipment picker. Only items the settlement actually holds are offered. */
function GearSelect({ game, w, slot, ids, label }: {
  game: Game; w: Resident; slot: "weapon" | "armor"; ids: ItemId[]; label: string;
}) {
  const s = useGame(game);
  const equipped = w.gear[slot];
  return (
    <label className="block">
      <span className="mb-0.5 block text-[9px] uppercase tracking-widest text-frost-300/45">{label}</span>
      <select value={equipped ?? ""}
        onChange={e => game.guardEquip(w.id, slot, e.target.value === "" ? null : e.target.value as ItemId)}
        aria-label={`${label} for ${w.name}`}
        className="w-full rounded border border-frost-400/25 bg-ink-800 px-2 py-1.5 text-[11px] text-frost-200 outline-none focus:border-frost-400/60">
        <option value="">{slot === "weapon" ? "— bare hands —" : "— no armour —"}</option>
        {equipped && <option value={equipped}>{ITEMS[equipped].name} (worn)</option>}
        {ids.filter(id => id !== equipped).map(id => {
          const have = poolCount(s, id);
          return (
            <option key={id} value={id} disabled={have <= 0}>
              {ITEMS[id].name}{have > 0 ? ` ×${have}` : " — none"}
            </option>
          );
        })}
      </select>
    </label>
  );
}

// ═══════════════════════════ SUPPLIES / UPKEEP ═════════════════════════════

function SuppliesTab({ game }: { game: Game }) {
  const s = useGame(game);
  const n = s.settlement.residents.length;
  const demandFood = dailyFoodDemand(s);
  const demandDrink = n * RES_BAL.thirstPerDay;
  const food = foodPoints(s);
  const days = daysOfFood(s);
  const rationIds: ItemId[] = ["stew", "cookedmeat", "berry", "glowcap", "rawmeat"];
  const drinkIds: ItemId[] = ["meltwater", "ice"];

  return (
    <div className="space-y-3">
      <section className="panel-soft px-4 py-3">
        <div className="mb-1 flex items-center justify-between">
          <span className="font-display text-[11px] font-bold uppercase tracking-[0.2em] text-frost-300/75">Ration forecast</span>
          <span className={cn("font-display text-sm font-bold", days <= 0 ? "text-blood-400" : days < 2 ? "text-ember-300" : "text-moss-400")}>
            {n === 0 ? "no residents" : days <= 0 ? "stores empty" : `~${days.toFixed(1)} days`}
          </span>
        </div>
        <div className="statbar h-2.5">
          <i style={{
            transform: `scaleX(${Math.min(1, days / 5)})`,
            background: days <= 0 ? "#e84848" : days < 2 ? "linear-gradient(90deg,#e76f1e,#ffb063)" : "linear-gradient(90deg,#3fae6c,#9be2b5)",
          }} />
        </div>
        <p className="mt-2 text-[10.5px] leading-snug text-frost-300/60">
          Each resident eats ≈{Math.round(RES_BAL.foodPerDay)} food value and ≈{RES_BAL.thirstPerDay} drink value <b className="text-frost-300">per in-game day</b>, taken from the <b className="text-frost-300">Supply Cache</b> at dawn (Story mode eats ~40% less). Current demand: <b className="text-frost-200">{Math.round(demandFood)}</b> food &amp; <b className="text-frost-200">{Math.round(demandDrink)}</b> drink per day.
        </p>
        <p className="mt-1.5 text-[10.5px] leading-snug text-frost-300/60">
          Missing rations are handled gently and honestly: hungry residents work at half pace for a day, then rest until fed. Residents never starve to death and are never silently removed.
        </p>
      </section>

      <section className="panel-soft px-4 py-3">
        <div className="mb-2 font-display text-[11px] font-bold uppercase tracking-[0.2em] text-frost-300/75">Stored rations</div>
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
          {rationIds.map(id => (
            <div key={id} className="panel-soft flex items-center gap-2 px-2.5 py-2">
              <ItemIcon icon={ITEMS[id].icon} className="h-4 w-4" color={ITEMS[id].color} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[10.5px] text-frost-300/70">{ITEMS[id].name}</div>
                <div className={cn("font-display text-[13px] font-bold", countItem(s, id, "storage") > 0 ? "text-frost-200" : "text-blood-400")}>
                  {countItem(s, id, "storage")}<span className="text-[9px] text-frost-300/40"> in cache</span>
                </div>
              </div>
            </div>
          ))}
          {drinkIds.map(id => (
            <div key={id} className="panel-soft flex items-center gap-2 px-2.5 py-2">
              <ItemIcon icon={ITEMS[id].icon} className="h-4 w-4" color={ITEMS[id].color} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[10.5px] text-frost-300/70">{ITEMS[id].name}</div>
                <div className={cn("font-display text-[13px] font-bold", countItem(s, id, "storage") > 0 ? "text-frost-200" : "text-blood-400")}>
                  {countItem(s, id, "storage")}<span className="text-[9px] text-frost-300/40"> in cache</span>
                </div>
              </div>
            </div>
          ))}
        </div>
        <p className="mt-2 text-[10px] text-frost-300/50">
          Larder: {Math.round(food)} food value stored. Raw meat counts at half value (it can hurt to eat raw); ice melts slow. Drop supplies into the Supply Cache — workers and upkeep draw from it automatically.
        </p>
      </section>

      <section className="panel-soft px-4 py-3">
        <div className="mb-1 font-display text-[11px] font-bold uppercase tracking-[0.2em] text-frost-300/75">While you're away</div>
        <p className="text-[10.5px] leading-snug text-frost-300/60">
          When the game is closed, the camp keeps working from the saved timestamp: workers finish at most {RES_BAL.offlineUnitsPerTask} units per post, upkeep settles at most {RES_BAL.offlineFeedDays} missed days, and everything past {RES_BAL.offlineCapSec / 3600}h of absence is simply not accrued. A clock that moves backwards accrues nothing.
        </p>
      </section>
    </div>
  );
}
