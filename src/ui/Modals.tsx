import { useEffect, useMemo, useRef, useState } from "react";
import { Flame } from "lucide-react";
import { BAL, ITEMS, LOGS, RECIPES, REGIONS, REGION_ORDER, WEATHER } from "../game/config";
import { QUALITY_LABEL, type QualityId } from "../game/perf";
import { DIFFICULTIES, DIFFICULTY_ORDER } from "../game/difficulty";
import { gearStats } from "../game/gear";
import type { Recipe } from "../game/config";
import type { Container, ItemId, RegionId } from "../game/types";
import type { Game } from "../game/engine";
import { capacity, countItem, usedSlots } from "../game/state";
import { materialGuidePoint } from "../game/guide";
import { DISCOVERY_ICON, totalDiscoveries } from "../game/discoveries";
import { isTransmission, transmissionEntries } from "../game/story";
import { forestCompletion, nextOutpostMilestone, outpostMilestones, recipeStatus } from "../game/systems";
import { useGame } from "./hooks";
import { ItemIcon } from "./icons";
import { cn } from "@/utils/cn";
import { Shell } from "./Shell";
import { HandbookModal } from "./Handbook";
import { TaskLogModal } from "./TaskLog";
import { ProgressionModal } from "./Progression";
import { SettlementModal } from "./Settlement";
import { DefenseModal } from "./Defense";
import { CommandModal } from "./Command";
import { capacityOf } from "../game/residents";
export { HandbookModal as HelpModal };

function StatBlock({ game, id, compact }: { game: Game; id: ItemId; compact?: boolean }) {
  const s = useGame(game);
  const stats = gearStats(s, id);
  if (stats.length === 0) return null;
  return (
    <div className={cn("flex flex-wrap gap-x-3 gap-y-0.5", compact ? "mt-1" : "mt-1.5")}>
      {stats.map(st => (
        <span key={st.label} className="text-[11px] text-frost-300/70">
          <span className="text-frost-300/45">{st.label}: </span>
          <span className="font-display font-bold text-frost-200">{st.value}</span>
          {st.deltaText && (
            <span className={cn("ml-1", (st.delta ?? 0) > 0 ? "text-moss-400" : "text-blood-400")}>
              ({st.deltaText})
            </span>
          )}
        </span>
      ))}
    </div>
  );
}

function NeedChips({ game, needs }: { game: Game; needs: Partial<Record<ItemId, number>> }) {
  const s = useGame(game);
  return (
    <div className="flex flex-wrap gap-1.5">
      {(Object.entries(needs) as [ItemId, number][]).map(([id, n]) => {
        const have = countItem(s, id);
        const ok = have >= n;
        return (
          <span key={id}
            className={cn("chip border", ok ? "border-frost-400/25 bg-frost-500/10 text-frost-200" : "border-blood-400/40 bg-blood-500/10 text-blood-400")}
            title={ok ? `${ITEMS[id].name}: enough` : `${ITEMS[id].name}: need ${n - have} more`}>
            <ItemIcon icon={ITEMS[id].icon} className="h-3 w-3" color={ITEMS[id].color} />
            {ITEMS[id].name} {have}/{n}
            <span aria-hidden className="font-display font-bold">{ok ? "✓" : "✕"}</span>
          </span>
        );
      })}
    </div>
  );
}

const TIER_LABEL = { early: "Early", mid: "Mid", late: "Advanced" } as const;
const TIER_STYLE = {
  early: "bg-frost-500/15 text-frost-300",
  mid: "bg-ember-500/15 text-ember-300",
  late: "bg-[#b48cff]/15 text-[#c9acff]",
} as const;

function RecipeRow({ game, r }: { game: Game; r: Recipe }) {
  const s = useGame(game);
  const locked = r.reqFlag && !s.flags[r.reqFlag];
  if (locked && r.hideLocked) {
    return (
      <div className="panel-soft flex items-center gap-3 px-3 py-2.5 opacity-55">
        <span className="flex h-10 w-10 items-center justify-center text-frost-300/50"><ItemIcon icon="journal" className="h-5 w-5" /></span>
        <div className="flex-1">
          <div className="font-display text-sm font-bold tracking-wide text-frost-300/70">Unknown pattern</div>
          <div className="text-[11px] text-frost-300/50">Recovered research may reveal this recipe…</div>
        </div>
      </div>
    );
  }
  const st = recipeStatus(s, r);
  const icon = r.makes ? ITEMS[r.makes].icon : r.icon;
  const color = r.makes ? ITEMS[r.makes].color : "#ffb063";
  return (
    <div className="panel-soft flex items-center gap-3 px-3 py-2.5">
      <span className="invslot flex h-11 w-11 shrink-0 items-center justify-center">
        <ItemIcon icon={icon} className="h-5 w-5" color={color} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-display text-[15px] font-bold tracking-wide text-frost-200">{r.name}</span>
          <span className={cn("chip text-[9px]", TIER_STYLE[r.tier])}>{TIER_LABEL[r.tier]}</span>
          {r.atStation && <span className="chip bg-ink-700/80 text-[9px] text-frost-300/70">Workbench</span>}
          {r.atResearch && <span className="chip bg-ink-700/80 text-[9px] text-frost-300/70">Research</span>}
        </div>
        <div className="text-[11px] leading-snug text-frost-300/70">{r.desc}</div>
        {r.makes && <StatBlock game={game} id={r.makes} compact />}
        <div className="mt-1.5"><NeedChips game={game} needs={r.needs} /></div>
        {!st.ok && st.reason && (
          <div className="mt-1 flex items-center gap-1.5 text-[11px] font-semibold text-blood-400">
            <ItemIcon icon="warn" className="h-3 w-3 shrink-0" />
            <span>{st.reason}</span>
          </div>
        )}
      </div>
      <button onClick={() => game.craft(r.id)} disabled={!st.ok}
        title={st.ok ? undefined : st.reason}
        aria-label={st.ok ? undefined : `Unavailable: ${st.reason}`}
        className="btn btn-ember shrink-0 px-4 py-2 text-xs">
        {st.ok ? (r.cat === "outpost" ? "Build" : "Craft") : "Locked"}
      </button>
    </div>
  );
}

// ── inventory ────────────────────────────────────────────────────────────────

const CATS = [
  { id: "all", label: "All" },
  { id: "gear", label: "Gear" },
  { id: "food", label: "Food" },
  { id: "med", label: "Medical" },
  { id: "mat", label: "Materials" },
  { id: "key", label: "Key" },
] as const;

const SLOTS: { slot: "tool" | "weapon" | "armor" | "gear"; label: string; icon: string }[] = [
  { slot: "tool", label: "Tool", icon: "axe" },
  { slot: "weapon", label: "Weapon", icon: "spear" },
  { slot: "armor", label: "Armour", icon: "parka" },
  { slot: "gear", label: "Gear", icon: "lantern" },
];

function InventoryModal({ game }: { game: Game }) {
  const s = useGame(game);
  const [cat, setCat] = useState<(typeof CATS)[number]["id"]>("all");
  const [sel, setSel] = useState<ItemId | null>(null);

  const entries = useMemo(() => {
    const order = { gear: 0, food: 1, med: 2, key: 3, mat: 4 };
    return (Object.entries(s.inv) as [ItemId, number][])
      .filter(([, n]) => n > 0)
      .filter(([id]) => cat === "all" || ITEMS[id].cat === cat || (cat === "food" && id === "ice"))
      .sort(([a], [b]) => order[ITEMS[a].cat] - order[ITEMS[b].cat] || a.localeCompare(b));
  }, [s.inv, cat]);

  const selDef = sel && ITEMS[sel] ? ITEMS[sel] : null;
  const selCount = sel ? countItem(s, sel) : 0;
  const used = usedSlots(s), cap = capacity(s);

  return (
    <Shell title="Field Pack" icon="backpack" onClose={() => game.closeModal()} wide
      sub={`${used}/${cap} slots used${countItem(s, "pack") > 0 ? " · Expedition Pack equipped" : ""}`}>
      {/* equipment */}
      <div className="mb-3 grid grid-cols-4 gap-2">
        {SLOTS.map(({ slot, label, icon }) => {
          const item = s.equip[slot];
          return (
            <button
              key={slot}
              onClick={() => item && setSel(item)}
              className={cn("panel-soft flex flex-col items-center gap-1 px-1.5 py-2 transition-colors",
                item ? "border-ember-400/40" : "border-frost-400/10")}
            >
              <ItemIcon icon={item ? ITEMS[item].icon : icon} className={cn("h-5 w-5", item ? "" : "opacity-25")}
                color={item ? ITEMS[item].color : undefined} />
              <span className="font-display text-[9px] font-bold uppercase tracking-wider text-frost-300/60">{label}</span>
              <span className="w-full truncate text-center text-[10px] text-frost-200">{item ? ITEMS[item].name : "—"}</span>
            </button>
          );
        })}
      </div>

      <div className="mb-2.5 flex flex-wrap gap-1.5">
        {CATS.map(c => (
          <button key={c.id} onClick={() => setCat(c.id)}
            className={cn("chip border transition-colors",
              cat === c.id ? "border-ember-400/60 bg-ember-500/15 text-ember-300" : "border-frost-400/20 bg-ink-800/60 text-frost-300/70 hover:text-frost-200")}>
            {c.label}
          </button>
        ))}
      </div>

      <div className="statbar mb-3 h-1.5">
        <i style={{ transform: `scaleX(${used / cap})`, background: used >= cap ? "linear-gradient(90deg,#e84848,#ff8a70)" : "linear-gradient(90deg,#1e7fb4,#67c8f4)" }} />
      </div>

      {entries.length === 0 && (
        <div className="py-8 text-center text-sm text-frost-300/55">Nothing here. Gather resources out in the world.</div>
      )}
      <div className="grid grid-cols-5 gap-2 sm:grid-cols-8">
        {entries.map(([id, n]) => (
          <button key={id} onClick={() => setSel(id)} className={cn("invslot flex flex-col items-center justify-center gap-0.5", sel === id && "sel")}>
            <ItemIcon icon={ITEMS[id].icon} className="h-6 w-6" color={ITEMS[id].color} />
            <span className="font-display text-[11px] font-bold tabular-nums text-frost-200">{n}</span>
            {(s.equip.tool === id || s.equip.weapon === id || s.equip.armor === id || s.equip.gear === id) && (
              <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-ember-400 shadow-[0_0_6px_rgba(255,176,99,0.9)]" />
            )}
          </button>
        ))}
      </div>

      {selDef && selCount > 0 && (
        <div className="panel-soft mt-3 animate-rise px-4 py-3">
          <div className="flex items-start gap-3">
            <span className="invslot flex h-12 w-12 shrink-0 items-center justify-center">
              <ItemIcon icon={selDef.icon} className="h-6 w-6" color={selDef.color} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <span className="font-display text-base font-bold tracking-wide text-frost-200">{selDef.name}</span>
                <span className="text-[11px] text-frost-300/60">×{selCount} / {selDef.stack}</span>
              </div>
              <p className="mt-0.5 text-[12px] leading-snug text-frost-300/75">{selDef.desc}</p>
              {selDef.use && ["stew","cookedmeat","glowcap","berry","meltwater","ice","medkit","salve"].includes(sel ?? "") && (
                <p className="mt-1 flex items-center gap-1 text-[10px] uppercase tracking-[0.16em] text-ember-300/80">
                  <ItemIcon icon="bolt" className="h-3 w-3" /> On the ration belt
                </p>
              )}
              <StatBlock game={game} id={sel!} />
            </div>
          </div>
          <div className="mt-2.5 flex gap-2">
            {selDef.use && <button onClick={() => game.use(sel!)} className="btn btn-frost px-4 py-2 text-xs">{selDef.use.label}</button>}
            {selDef.equip && (
              <button onClick={() => game.equip(sel!)} className="btn btn-ghost px-4 py-2 text-xs">
                {s.equip[selDef.equip] === sel ? "Unequip" : "Equip"}
              </button>
            )}
          </div>
        </div>
      )}
    </Shell>
  );
}

// ── crafting ─────────────────────────────────────────────────────────────────

function CraftModal({ game }: { game: Game }) {
  const s = useGame(game);
  const [tab, setTab] = useState<"gear" | "research">("gear");
  const gear = RECIPES.filter(r => r.cat === "gear");
  const research = RECIPES.filter(r => r.cat === "research");
  return (
    <Shell title="Crafting" icon="hammer" onClose={() => game.closeModal()} wide
      sub={s.build.research ? "Workbench + Research Station online" : s.shelter.stage >= 3 ? "Workbench online" : "Field crafting only"}>
      <div className="mb-3 flex gap-1.5">
        {([["gear", "Equipment"], ["research", "Advanced Research"]] as const).map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)}
            className={cn("chip border px-3 py-1 transition-colors",
              tab === id ? "border-ember-400/60 bg-ember-500/15 text-ember-300" : "border-frost-400/20 bg-ink-800/60 text-frost-300/70")}>
            {label}
          </button>
        ))}
      </div>
      <div className="space-y-2">
        {(tab === "gear" ? gear : research).map(r => <RecipeRow key={r.id} game={game} r={r} />)}
      </div>
      {tab === "research" && !s.build.research && (
        <p className="mt-3 text-center text-[11px] text-frost-300/55">
          Build the Research Station at the outpost to unlock advanced crafting.
        </p>
      )}
    </Shell>
  );
}

// ── outpost / building ───────────────────────────────────────────────────────

function OutpostModal({ game }: { game: Game }) {
  const s = useGame(game);
  const stage = s.shelter.stage;
  const addons = RECIPES.filter(r => r.cat === "outpost" && r.builds);
  const built = addons.filter(r => s.build[r.builds!]).length;
  const milestones = outpostMilestones(s);
  const progress = forestCompletion(s);
  const next = nextOutpostMilestone(s);
  const nextRecipe = next ? RECIPES.find(r => r.id === next.recipeId) : null;

  return (
    <Shell title="Research Outpost" icon="shelter" onClose={() => game.closeModal()} wide
      sub={`Map 1 restoration ${progress.complete}/${progress.total} · Stage ${stage}/3 · ${built}/${addons.length} facilities`}>

      {/* Map 1 restoration route */}
      <div className="panel-soft mb-3 px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-ember-300">
              <ItemIcon icon={progress.done ? "done" : "shelter"} className="h-5 w-5" />
              <span className="font-display text-sm font-bold uppercase tracking-[0.18em]">
                {progress.done ? "Map 1 restored" : "Map 1 — Restore the Outpost"}
              </span>
            </div>
            <p className="mt-1 text-[11px] leading-snug text-frost-300/65">
              {progress.done
                ? "The base is operational. Use the Expedition Gate west of the shelter to reveal the Frozen Shipwreck route."
                : "Complete these construction milestones in order. Every material is available in the Frozen Forest."}
            </p>
          </div>
          <span className={cn("font-display text-xl font-bold", progress.done ? "text-moss-400" : "text-ember-300")}>
            {Math.round(progress.pct * 100)}%
          </span>
        </div>
        <div className="statbar mt-2.5 h-2.5">
          <i style={{
            transform: `scaleX(${progress.pct})`,
            background: progress.done ? "linear-gradient(90deg,#3fae6c,#9be2b5)" : "linear-gradient(90deg,#e76f1e,#ffb063)",
          }} />
        </div>
      </div>

      <div className="space-y-1.5">
        {milestones.map((m, i) => {
          const isNext = next?.id === m.id;
          return (
            <div key={m.id} className={cn("panel-soft flex items-start gap-3 px-3 py-2.5",
              isNext && "border-ember-400/50 shadow-[0_0_18px_rgba(255,143,61,0.1)]",
              m.done && "border-moss-400/25")}>
              <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center", m.done ? "text-moss-400" : isNext ? "text-ember-400" : "text-frost-300/30")}>
                <ItemIcon icon={m.done ? "done" : m.icon} className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className={cn("font-display text-[14px] font-bold tracking-wide", m.done ? "text-frost-300/60" : "text-frost-200")}>{m.title}</span>
                  {isNext && <span className="chip bg-ember-500/15 text-[8px] text-ember-300">Build next</span>}
                </div>
                <div className="text-[11px] text-frost-300/60">{m.desc}</div>
                {(m.done || isNext) && <div className="mt-0.5 text-[10.5px] leading-snug text-frost-300/50">{m.benefit}</div>}
              </div>
              <span className="font-display text-xs font-bold text-frost-300/40">{i + 1}/{milestones.length}</span>
            </div>
          );
        })}
      </div>

      {nextRecipe ? (
        <div className="mt-3">
          <div className="mb-2 flex items-center gap-2">
            <span className="font-display text-[11px] font-bold uppercase tracking-[0.2em] text-ember-300">Current construction objective</span>
            <span className="h-px flex-1 bg-ember-400/20" />
          </div>
          <RecipeRow game={game} r={nextRecipe} />
          {recipeStatus(s, nextRecipe).reason === "Missing materials" && (
            <div className="mt-2 border-t border-frost-400/10 pt-2">
              <div className="mb-1 font-display text-[9px] font-bold uppercase tracking-[0.2em] text-blood-400">Missing materials</div>
              <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-3">
                {(Object.entries(nextRecipe.needs) as [ItemId, number][]).map(([id, needed]) => {
                  const have = countItem(s, id);
                  if (have >= needed) return null;
                  const isIce = id === "ice";
                  const srcType = isIce ? "ice" : id === "wood" ? "wood" : id === "stone" ? "stone" : null;
                  const source = srcType ? materialGuidePoint(s, srcType) : null;
                  const nav = source ? `Guide: ${Math.max(1, Math.round(Math.hypot(source.x - s.player.x, source.y - s.player.y) / 40))}m (${source.label})` : "See Field Handbook";
                  return (
                    <button key={id}
                      onClick={() => srcType && game.guideToMaterial(srcType)}
                      className="panel-soft border-blood-400/35 px-2.5 py-2 text-left transition-colors hover:border-ember-400/50">
                      <div className="flex items-center gap-2">
                        <ItemIcon icon={ITEMS[id].icon} className="h-4.5 w-4.5" color={ITEMS[id].color} />
                        <div className="font-display text-[11px] font-bold text-frost-200">{ITEMS[id].name}</div>
                        <div className="ml-auto text-[10px] text-blood-400">{have}/{needed}</div>
                      </div>
                      <div className="mt-1 flex items-center justify-between text-[9px] text-frost-300/60">
                        <span>{nav}</span>
                        {source && <span className="text-ember-300">Guide</span>}
                      </div>
                    </button>
                  );
                })}
              </div>
              <div className="mt-2 flex items-start gap-2 px-0.5 text-[10px] text-frost-300/55">
                <ItemIcon icon="ice" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-frost-300" />
                <span>
                  Ice is the insulation material for Stage 2 and Stage 3. Blue Ice Shard deposits sit on the Frozen River bank north of camp; a small Ice Shore route near the shelter is available early. Guides take you there; gathering is manual.
                </span>
              </div>
            </div>
          )}
          <div className="mt-2 grid grid-cols-3 gap-1.5 text-center text-[10px] text-frost-300/60">
            <button onClick={() => game.openModal("help")} className="panel-soft px-2 py-2 transition-colors hover:border-frost-400/35">
              <ItemIcon icon="wood" className="mx-auto mb-1 h-4 w-4 text-[#c98d5a]" />Branches & Pines
            </button>
            <button onClick={() => game.openModal("help")} className="panel-soft px-2 py-2 transition-colors hover:border-frost-400/35">
              <ItemIcon icon="stone" className="mx-auto mb-1 h-4 w-4 text-[#9fb0c4]" />Rock Outcrops
            </button>
            <button onClick={() => game.openModal("help")} className="panel-soft px-2 py-2 transition-colors hover:border-frost-400/35">
              <ItemIcon icon="ice" className="mx-auto mb-1 h-4 w-4 text-[#7fd8ff]" />Frozen River
            </button>
          </div>
        </div>
      ) : (
        <div className="panel-soft mt-3 border-moss-400/40 px-4 py-3">
          <div className="flex items-center gap-2 text-moss-400">
            <ItemIcon icon="done" className="h-5 w-5" />
            <span className="font-display text-sm font-bold tracking-wide">Forest operations complete</span>
          </div>
          <p className="mt-1 text-[11px] text-frost-300/65">Storage and Workbench are online. The Expedition Gate can now reveal Map 2: Frozen Shipwreck.</p>
          <button onClick={() => game.openModal("map")} className="btn btn-frost mt-2.5 w-full px-4 py-2.5 text-xs">
            <ItemIcon icon="map" className="h-4 w-4" /> View Expedition Map
          </button>
        </div>
      )}

      {/* settlement shortcut — residents live behind the housing build line */}
      {s.shelter.stage >= 2 && (
        <button onClick={() => game.openModal("settlement")}
          className="panel-soft mt-3 flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:border-frost-400/40">
          <span className="invslot flex h-10 w-10 shrink-0 items-center justify-center">
            <ItemIcon icon="residents" className="h-5 w-5" color="#8be8ff" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-display text-[13px] font-bold tracking-wide text-frost-200">Settlement &amp; Residents (N)</span>
            <span className="block text-[10.5px] text-frost-300/60">
              {s.settlement.residents.length}/{capacityOf(s)} housed — rescue survivors, assign work, manage warriors and rations.
            </span>
          </span>
          <ItemIcon icon="play" className="h-4 w-4 shrink-0 text-ember-300" />
        </button>
      )}

      <p className="mb-2 mt-4 text-[11px] uppercase tracking-[0.16em] text-frost-300/50">
        Optional facilities <span className="normal-case text-frost-300/40">(built at marked sites after their stage unlocks)</span>
      </p>
      <div className="space-y-2">{addons.map(r => <RecipeRow key={r.id} game={game} r={r} />)}</div>

      {s.shelter.fire.built && (
        <button onClick={() => game.openModal("fire")} className="btn btn-ghost mt-3 w-full px-4 py-2.5 text-xs">
          <Flame className="h-4 w-4 text-ember-400" /> Manage Campfire
        </button>
      )}
    </Shell>
  );
}

// ── campfire ─────────────────────────────────────────────────────────────────

function FireModal({ game }: { game: Game }) {
  const s = useGame(game);
  const fire = s.shelter.fire;
  return (
    <Shell title={fire.lit ? "Campfire — burning" : "Campfire"} icon="fire" onClose={() => game.closeModal()}>
      <div className="mb-3">
        <div className="mb-1 flex justify-between">
          <span className="font-display text-[11px] font-bold uppercase tracking-[0.16em] text-frost-300/70">Fuel</span>
          <span className="font-display text-[12px] font-bold text-ember-300">{Math.round(fire.fuel)} / {BAL.fire.fuelMax}</span>
        </div>
        <div className="statbar h-3"><i style={{ transform: `scaleX(${fire.fuel / BAL.fire.fuelMax})`, background: "linear-gradient(90deg,#e76f1e,#ffb063)" }} /></div>
        <p className="mt-1.5 text-[11px] text-frost-300/60">A burning fire warms everything within ~6 metres and keeps predators at bay.</p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button onClick={() => game.fire("add")} disabled={countItem(s, "wood") <= 0 || fire.fuel >= BAL.fire.fuelMax} className="btn btn-frost px-3 py-2.5 text-xs">
          <ItemIcon icon="wood" className="h-4 w-4" /> Add wood ({countItem(s, "wood")})
        </button>
        {!fire.lit ? (
          <button onClick={() => game.fire("light")} disabled={fire.fuel <= 0} className="btn btn-ember px-3 py-2.5 text-xs">
            <Flame className="h-4 w-4" /> Light fire
          </button>
        ) : (
          <div className="btn px-3 py-2.5 text-xs" style={{ background: "rgba(255,143,61,0.16)", color: "#ffb063", border: "1px solid rgba(255,143,61,0.35)" }}>
            <Flame className="h-4 w-4 animate-pulse" /> Burning
          </div>
        )}
        <button onClick={() => game.fire("cook")} disabled={!fire.lit || countItem(s, "rawmeat") <= 0} className="btn btn-ghost px-3 py-2.5 text-xs">
          <ItemIcon icon="meat" className="h-4 w-4" /> Cook meat ({countItem(s, "rawmeat")})
        </button>
        <button onClick={() => game.fire("melt")} disabled={!fire.lit || countItem(s, "ice") <= 0} className="btn btn-ghost px-3 py-2.5 text-xs">
          <ItemIcon icon="water" className="h-4 w-4" /> Melt ice ({countItem(s, "ice")})
        </button>
        <button onClick={() => game.fire("stew")} disabled={!fire.lit || !s.build.cookpot}
          className="btn btn-ghost col-span-2 px-3 py-2.5 text-xs">
          <ItemIcon icon="stew" className="h-4 w-4 text-ember-300" />
          {s.build.cookpot ? "Cook Hot Stew (meat + berry + ice)" : "Hot Stew — requires the Cooking Pot"}
        </button>
      </div>
    </Shell>
  );
}

// ── storage ──────────────────────────────────────────────────────────────────

function StorageModal({ game }: { game: Game }) {
  const s = useGame(game);
  const bag = (Object.entries(s.inv) as [ItemId, number][]).filter(([, n]) => n > 0);
  const cache = (Object.entries(s.storage) as [ItemId, number][]).filter(([, n]) => n > 0);
  const grid = (list: [ItemId, number][], toStorage: boolean, label: string) => (
    <div className="flex-1">
      <div className="mb-1.5 font-display text-[11px] font-bold uppercase tracking-[0.16em] text-frost-300/60">{label}</div>
      <div className="grid grid-cols-4 gap-1.5">
        {list.map(([id, n]) => (
          <button key={id} title={`Move 1 ${ITEMS[id].name}`} onClick={() => game.transfer(id, toStorage)} className="invslot flex flex-col items-center justify-center gap-0.5">
            <ItemIcon icon={ITEMS[id].icon} className="h-5 w-5" color={ITEMS[id].color} />
            <span className="font-display text-[10px] font-bold text-frost-200">{n}</span>
          </button>
        ))}
        {list.length === 0 && <div className="col-span-4 py-5 text-center text-[11px] text-frost-300/45">Empty</div>}
      </div>
    </div>
  );
  return (
    <Shell title="Supply Cache" icon="crate" onClose={() => game.closeModal()} wide
      sub={`Pack ${usedSlots(s)}/${capacity(s)} slots · cache holds 4× stacks`}>
      <p className="mb-3 text-[11px] text-frost-300/60">Tap an item to move one between your pack and the cache. Store surplus before an expedition to keep slots free.</p>
      <div className="flex gap-4">{grid(bag, true, "Pack")}{grid(cache, false, "Cache")}</div>
    </Shell>
  );
}

// ── expedition map / travel ──────────────────────────────────────────────────

function MapModal({ game }: { game: Game }) {
  const s = useGame(game);
  const [sel, setSel] = useState<RegionId>(s.region);
  const def = REGIONS[sel];
  const chk = game.canTravel(sel);
  const here = sel === s.region;
  const firstLocked = REGION_ORDER.find(id => !s.unlocked.includes(id));
  const map1 = forestCompletion(s);

  const readiness = [
    { label: "Food", ok: countItem(s, "berry") + countItem(s, "cookedmeat") + countItem(s, "stew") + countItem(s, "glowcap") >= 2, icon: "meat" },
    { label: "Water", ok: countItem(s, "meltwater") + countItem(s, "ice") >= 2, icon: "water" },
    { label: "Medical", ok: countItem(s, "salve") + countItem(s, "medkit") >= 1, icon: "salve" },
    { label: "Weapon", ok: !!s.equip.weapon, icon: "spear" },
    { label: "Warm clothing", ok: !!s.equip.armor, icon: "parka" },
    { label: "Free slots", ok: capacity(s) - usedSlots(s) >= 3, icon: "backpack" },
  ];
  const ready = readiness.filter(r => r.ok).length;

  return (
    <Shell title="Expedition Map" icon="map" onClose={() => game.closeModal()} wide
      sub={`Currently in ${REGIONS[s.region].name} · ${WEATHER[s.weather.kind].name}`}>
      <div className="grid gap-2 sm:grid-cols-2">
        {REGION_ORDER.map(id => {
          const r = REGIONS[id];
          const unlocked = s.unlocked.includes(id);
          const discovered = s.regions[id]?.discovered;
          const previewable = unlocked || id === firstLocked;
          return (
            <button key={id} onClick={() => previewable && setSel(id)} disabled={!previewable}
              className={cn("panel-soft flex items-start gap-2.5 px-3 py-2.5 text-left transition-all",
                sel === id && previewable && "border-ember-400/60 shadow-[0_0_18px_rgba(255,143,61,0.14)]",
                !previewable && "opacity-35",
                !unlocked && previewable && "border-frost-400/20 opacity-75")}>
              <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center",
                id === s.region ? "text-ember-400" : unlocked ? "text-frost-300" : "text-frost-300/40")}>
                <ItemIcon icon={previewable ? r.icon : "warn"} className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="font-display text-sm font-bold tracking-wide text-frost-200">
                    {unlocked ? r.name : previewable ? `${r.name}` : "Undiscovered region"}
                    {!unlocked && (
                      <span className="ml-1 inline-flex items-center gap-1 text-[9px] uppercase tracking-wider text-blood-400">
                        <ItemIcon icon="warn" className="h-2.5 w-2.5" />locked
                      </span>
                    )}
                  </span>
                  {id === s.region && <span className="chip bg-ember-500/20 text-[9px] text-ember-300">Here</span>}
                </div>
                <div className="text-[10px] text-frost-300/60">
                  {unlocked
                    ? (discovered ? r.subtitle : "Never visited")
                    : id === "ship" ? `Restore Map 1: ${map1.complete}/${map1.total}`
                    : previewable ? "Complete the current story chapter" : "Complete objectives to reveal"}
                </div>
                <div className="mt-1 flex items-center gap-0.5">
                  {[1, 2, 3, 4].map(d => (
                    <span key={d} className={cn("h-1 w-4", d <= r.danger ? (r.danger >= 4 ? "bg-blood-500" : r.danger >= 3 ? "bg-ember-500" : "bg-frost-500") : "bg-ink-700")} />
                  ))}
                  <span className="ml-1.5 text-[9px] uppercase tracking-wider text-frost-300/45">threat</span>
                  {unlocked && (
                    <span className="ml-auto flex items-center gap-1 text-[9px] text-frost-300/60">
                      <ItemIcon icon="compass" className="h-2.5 w-2.5" />
                      {s.regions[id]?.discoveries.filter(x => x.found).length ?? 0}/{totalDiscoveries(id)}
                    </span>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <div className="panel-soft mt-3 px-4 py-3">
        <div className="flex items-center gap-2">
          <ItemIcon icon={def.icon} className="h-5 w-5 text-ember-400" />
          <h3 className="font-display text-base font-bold tracking-wide text-frost-200">{def.name}</h3>
        </div>
        <p className="mt-1 text-[12px] leading-snug text-frost-300/75">{def.desc}</p>
        <div className="mt-2 grid gap-1 text-[11px] sm:grid-cols-2">
          <div className="text-blood-400"><span className="text-frost-300/50">Dangers: </span>{def.dangers}</div>
          <div className="text-moss-400"><span className="text-frost-300/50">Resources: </span>{def.loot}</div>
        </div>

        {!s.unlocked.includes(sel) && sel === "ship" && (
          <div className="mt-3 border-t border-frost-400/10 pt-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="font-display text-[10px] font-bold uppercase tracking-[0.18em] text-ember-300">Unlock Map 2</span>
              <span className="font-display text-xs font-bold text-ember-300">{map1.complete}/{map1.total}</span>
            </div>
            <div className="space-y-1">
              {outpostMilestones(s).map(m => (
                <div key={m.id} className="flex items-center gap-2 text-[11px]">
                  <ItemIcon icon={m.done ? "done" : m.icon} className={cn("h-3.5 w-3.5", m.done ? "text-moss-400" : "text-frost-300/40")} />
                  <span className={cn("flex-1", m.done ? "text-frost-300/55 line-through" : "text-frost-200")}>{m.title}</span>
                  <span className={m.done ? "text-moss-400" : "text-frost-300/45"}>{m.done ? "Done" : m.desc}</span>
                </div>
              ))}
            </div>
            <p className="mt-2 text-[10.5px] leading-snug text-frost-300/55">After all four milestones, interact with the Expedition Gate west of the shelter to reveal this route.</p>
            <button onClick={() => game.openModal("outpost")} className="btn btn-ember mt-2.5 w-full px-3 py-2.5 text-xs">
              <ItemIcon icon="hammer" className="h-4 w-4" /> Open Outpost Roadmap
            </button>
          </div>
        )}

        {s.unlocked.includes(sel) && (() => {
          const list = s.regions[sel]?.discoveries ?? [];
          const found = list.filter(d => d.found);
          return (
            <div className="mt-3 border-t border-frost-400/10 pt-2.5">
              <div className="mb-1.5 flex items-center justify-between">
                <span className="font-display text-[10px] font-bold uppercase tracking-[0.18em] text-frost-300/55">
                  Recorded sites
                </span>
                <span className={cn("font-display text-[11px] font-bold",
                  found.length === list.length && list.length > 0 ? "text-moss-400" : "text-frost-300/60")}>
                  {found.length}/{list.length}
                </span>
              </div>
              {found.length === 0 ? (
                <p className="text-[11px] text-frost-300/55">
                  Nothing recorded yet. Explore the region on foot — points of interest shimmer faintly as you approach.
                </p>
              ) : (
                <div className="space-y-1">
                  {found.map(d => (
                    <div key={d.id} className="panel-soft px-2.5 py-1.5">
                      <div className="flex items-center gap-2">
                        <ItemIcon icon={DISCOVERY_ICON[d.kind]} className="h-3.5 w-3.5 shrink-0 text-ember-300" />
                        <span className="font-display text-[12px] font-bold tracking-wide text-frost-200">{d.name}</span>
                      </div>
                      <p className="mt-0.5 text-[10.5px] italic leading-snug text-frost-300/65">{d.note}</p>
                    </div>
                  ))}
                  {found.length < list.length && (
                    <p className="pt-0.5 text-[10px] text-frost-300/45">
                      {list.length - found.length} site{list.length - found.length === 1 ? "" : "s"} still unrecorded in this region.
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })()}

        {def.advise.length > 0 && !here && (
          <div className="mt-3">
            <div className="mb-1.5 font-display text-[10px] font-bold uppercase tracking-[0.18em] text-frost-300/55">Recommended preparation</div>
            <ul className="space-y-0.5">
              {def.advise.map(a => (
                <li key={a} className="flex items-start gap-1.5 text-[11px] text-frost-300/75">
                  <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-ember-400" />{a}
                </li>
              ))}
            </ul>
          </div>
        )}

        {!here && (
          <>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {readiness.map(r => (
                <span key={r.label} className={cn("chip border", r.ok ? "border-moss-400/40 bg-moss-400/10 text-moss-400" : "border-blood-400/40 bg-blood-500/10 text-blood-400")}>
                  <ItemIcon icon={r.icon} className="h-3 w-3" />{r.label}
                </span>
              ))}
            </div>
            <div className="mt-2 text-[11px] text-frost-300/60">Readiness {ready}/{readiness.length} — travelling unprepared is survivable, but rarely wise.</div>
          </>
        )}

        <button onClick={() => game.travelTo(sel)} disabled={!chk.ok}
          className={cn("btn mt-3 w-full px-4 py-3 text-sm", chk.ok ? "btn-ember" : "btn-ghost")}>
          <ItemIcon icon="compass" className="h-4 w-4" />
          {here ? "You are here" : chk.ok ? `Travel to ${def.name}` : chk.reason}
        </button>
      </div>
    </Shell>
  );
}

// ── loot result ──────────────────────────────────────────────────────────────

function LootModal({ game }: { game: Game }) {
  const s = useGame(game);
  const [data, setData] = useState<{ container: Container; got: { item: ItemId; n: number }[] } | null>(null);
  useEffect(() => game.on("loot", (p) => setData(p as { container: Container; got: { item: ItemId; n: number }[] })), [game]);
  const c = data?.container ?? s.containers.find(x => x.id === s.lootOpen);
  const got = data?.got ?? [];
  const title = c?.kind === "vault" ? "Vault opened" : c?.kind === "labcase" ? "Laboratory case" : c?.kind === "cargo" ? "Cargo hold" : "Container opened";
  return (
    <Shell title={title} icon="crate" onClose={() => game.closeModal()}>
      {got.length === 0 ? (
        <p className="py-6 text-center text-sm text-frost-300/60">Empty — someone got here first.</p>
      ) : (
        <>
          <p className="mb-3 text-[12px] text-frost-300/70">Salvage recovered:</p>
          <div className="space-y-1.5">
            {got.map((g, i) => (
              <div key={i} className="panel-soft animate-rise flex items-center gap-3 px-3 py-2" style={{ animationDelay: `${i * 70}ms` }}>
                <span className="invslot flex h-10 w-10 items-center justify-center">
                  <ItemIcon icon={ITEMS[g.item].icon} className="h-5 w-5" color={ITEMS[g.item].color} />
                </span>
                <div className="flex-1">
                  <div className="font-display text-sm font-bold tracking-wide text-frost-200">{ITEMS[g.item].name}</div>
                  <div className="text-[11px] text-frost-300/60">{ITEMS[g.item].desc}</div>
                </div>
                <span className="font-display text-lg font-bold text-ember-300">×{g.n}</span>
              </div>
            ))}
          </div>
        </>
      )}
      {c?.log && LOGS[c.log] && (
        <div className="panel-soft mt-3 border-[#b48cff]/40 px-4 py-3">
          <div className="mb-1 flex items-center gap-2 text-[#c9acff]">
            <ItemIcon icon="journal" className="h-4 w-4" />
            <span className="font-display text-[11px] font-bold uppercase tracking-[0.18em]">Research log recovered</span>
          </div>
          <div className="font-display text-sm font-bold text-frost-200">{LOGS[c.log].title}</div>
          <p className="mt-1 text-[12px] italic leading-relaxed text-frost-300/80">“{LOGS[c.log].text}”</p>
        </div>
      )}
      <button onClick={() => game.closeModal()} className="btn btn-frost mt-4 w-full px-4 py-2.5 text-sm">Take all & close</button>
    </Shell>
  );
}

// ── journal ──────────────────────────────────────────────────────────────────

function JournalModal({ game }: { game: Game }) {
  const s = useGame(game);
  // Research logs are found in the world; transmissions arrive as the story
  // advances. Both read through one journal.
  const ALL = { ...LOGS, ...transmissionEntries() } as Record<string, { title: string; where: string; text: string }>;
  const ids = Object.keys(ALL);
  return (
    <Shell title="Research Logs" icon="journal" onClose={() => game.closeModal()} wide
      sub={`${s.logs.length}/${ids.length} recovered`}>
      <div className="space-y-2">
        {ids.map(id => {
          const l = ALL[id];
          const found = s.logs.includes(id);
          return (
            <div key={id} className={cn("panel-soft px-3.5 py-3", !found && "opacity-50")}>
              <div className="flex items-center gap-2">
                <ItemIcon icon={found ? (isTransmission(id) ? "bolt" : "journal") : "warn"}
                  className={cn("h-4 w-4", found ? (isTransmission(id) ? "text-ember-300" : "text-[#c9acff]") : "text-frost-300/40")} />
                <span className="font-display text-sm font-bold tracking-wide text-frost-200">
                  {found ? l.title : isTransmission(id) ? "Unrecovered signal" : "Unrecovered log"}
                </span>
                <span className="ml-auto text-[10px] uppercase tracking-wider text-frost-300/45">{found ? l.where : "???"}</span>
              </div>
              <p className="mt-1.5 text-[12px] italic leading-relaxed text-frost-300/80">
                {found ? `“${l.text}”`
                  : isTransmission(id) ? "A fragment of the station's dead comms net. It surfaces as the story advances."
                  : "Search containers and terminals across the regions to recover this record."}
              </p>
            </div>
          );
        })}
      </div>
      {s.logs.length === ids.length && (
        <div className="panel-soft mt-3 border-moss-400/40 px-4 py-3 text-center">
          <p className="font-display text-sm font-bold tracking-wide text-moss-400">All records recovered</p>
          <p className="mt-1 text-[12px] text-frost-300/75">
            The lattice powered the grid. The Guardian frame was the failsafe. The aurora woke it, and the station died in a night.
          </p>
        </div>
      )}
    </Shell>
  );
}

// ── pause / settings / help ──────────────────────────────────────────────────

function PauseModal({ game, goto }: { game: Game; goto: (m: "settings" | "help") => void }) {
  const s = useGame(game);
  return (
    <Shell title="Paused" icon="pause" onClose={() => game.closeModal()} sub={`${REGIONS[s.region].name} · Day ${Math.floor(s.time / BAL.dayLength) + 1}`}>
      <div className="space-y-2">
        <button onClick={() => game.closeModal()} className="btn btn-frost w-full px-4 py-3 text-sm">Resume</button>
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => game.openModal("journal")} className="btn btn-ghost px-4 py-3 text-sm"><ItemIcon icon="journal" className="h-4 w-4" /> Logs</button>
          <button onClick={() => game.openModal("map")} className="btn btn-ghost px-4 py-3 text-sm"><ItemIcon icon="map" className="h-4 w-4" /> Map</button>
        </div>
        <button onClick={() => game.openModal("progress")} className="btn btn-ghost w-full px-4 py-3 text-sm">
          <ItemIcon icon="progress" className="h-4 w-4" /> Survivor Record
          {s.progression.points > 0 && (
            <span className="chip ml-1 bg-ember-500/20 text-[9px] text-ember-300">{s.progression.points} pt</span>
          )}
        </button>
        <button onClick={() => game.saveNow(true)} className="btn btn-ghost w-full px-4 py-3 text-sm"><ItemIcon icon="save" className="h-4 w-4" /> Save progress</button>
        <button onClick={() => goto("settings")} className="btn btn-ghost w-full px-4 py-3 text-sm"><ItemIcon icon="settings" className="h-4 w-4" /> Settings</button>
        <button onClick={() => goto("help")} className="btn btn-ghost w-full px-4 py-3 text-sm"><ItemIcon icon="help" className="h-4 w-4" /> Field Handbook</button>
        <div className="border-t border-frost-400/10 pt-2">
          <button onClick={() => game.backToMenu()} className="btn btn-danger w-full px-4 py-3 text-sm"><ItemIcon icon="exit" className="h-4 w-4" /> Save & return to menu</button>
        </div>
      </div>
    </Shell>
  );
}

function Slider({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <div className="mb-1 flex justify-between">
        <span className="font-display text-[12px] font-bold uppercase tracking-[0.16em] text-frost-300/75">{label}</span>
        <span className="font-display text-[12px] font-bold text-frost-200">{Math.round(value * 100)}%</span>
      </div>
      <input type="range" min={0} max={100} value={Math.round(value * 100)}
        onChange={(e) => onChange(Number(e.target.value) / 100)}
        className="fslider w-full" style={{ ["--fill" as string]: `${Math.round(value * 100)}%` }} />
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <span className="font-display text-[10px] font-bold uppercase tracking-[0.24em] text-frost-300/55">{title}</span>
        <span className="h-px flex-1 bg-frost-400/15" />
      </div>
      <div className="space-y-2.5">{children}</div>
    </div>
  );
}

function Toggle({ label, on, onClick, hint }: { label: string; on: boolean; onClick: () => void; hint?: string }) {
  return (
    <button onClick={onClick} className="panel-soft flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left transition-colors hover:border-frost-400/35">
      <span className="min-w-0">
        <span className="block font-display text-[13px] font-bold tracking-wide text-frost-200">{label}</span>
        {hint && <span className="block text-[11px] text-frost-300/60">{hint}</span>}
      </span>
      <span className={cn("relative h-6 w-11 shrink-0 rounded-full border transition-colors",
        on ? "border-moss-400/60 bg-moss-400/25" : "border-frost-400/25 bg-ink-800")}>
        <span className={cn("absolute top-0.5 h-4 w-4 rounded-full transition-all",
          on ? "left-[22px] bg-moss-400" : "left-0.5 bg-frost-300/50")} />
      </span>
    </button>
  );
}

export function SettingsModal({ game, onBack }: { game: Game; onBack: () => void }) {
  const s = useGame(game);
  const [confirmReset, setConfirmReset] = useState(false);
  const qualities: QualityId[] = ["auto", "low", "med", "high"];
  return (
    <Shell title="Settings" icon="settings" onClose={onBack} wide>
      <div className="space-y-5">
        <Section title="Difficulty">
          <div className="grid grid-cols-3 gap-1.5">
            {DIFFICULTY_ORDER.map(id => (
              <button key={id} onClick={() => game.setDifficulty(id)}
                className={cn("btn px-2 py-2.5 text-[11px]", s.difficulty === id ? "btn-ember" : "btn-ghost")}>
                {DIFFICULTIES[id].name}
              </button>
            ))}
          </div>
          <div className="panel-soft px-3 py-2.5">
            <p className="text-[11px] font-semibold text-frost-200">{DIFFICULTIES[s.difficulty].tagline}</p>
            <ul className="mt-1.5 space-y-0.5">
              {DIFFICULTIES[s.difficulty].effects.map(e => (
                <li key={e} className="flex items-start gap-1.5 text-[11px] leading-snug text-frost-300/70">
                  <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-ember-400" />{e}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[10px] leading-snug text-frost-300/50">
              Change this whenever you like — there is no restriction and no penalty. Difficulty
              only scales live values, so switching never grants rewards or alters your statistics.
            </p>
          </div>
        </Section>

        <Section title="Audio">
          {!game.audioReady && (
            <div className="panel-soft border-ember-400/40 px-3 py-2">
              <p className="text-[11px] leading-snug text-ember-300">
                Audio is waiting for your first tap — mobile browsers block sound until you
                interact. These sliders will apply as soon as it starts.
              </p>
            </div>
          )}
          <Slider label="Master volume" value={s.settings.master} onChange={(v) => game.setSetting({ master: v })} />
          <Slider label="Music" value={s.settings.music} onChange={(v) => game.setSetting({ music: v })} />
          <Slider label="Sound effects" value={s.settings.sfx} onChange={(v) => game.setSetting({ sfx: v })} />
          <Slider label="Ambience (wind & fire)" value={s.settings.ambient} onChange={(v) => game.setSetting({ ambient: v })} />
        </Section>

        <Section title="Graphics">
          <div>
            <div className="mb-1.5 flex items-baseline justify-between">
              <span className="font-display text-[12px] font-bold uppercase tracking-[0.16em] text-frost-300/75">Effects quality</span>
              <span className="font-display text-[11px] font-bold text-frost-300/60">
                {s.settings.quality === "auto" ? `Auto → ${QUALITY_LABEL[game.activeTier]}` : ""} {Math.round(game.perf.fps)} FPS
              </span>
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {qualities.map(q => (
                <button key={q} onClick={() => game.setSetting({ quality: q })}
                  className={cn("btn px-2 py-2 text-[11px]", s.settings.quality === q ? "btn-frost" : "btn-ghost")}>
                  {QUALITY_LABEL[q]}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-[11px] text-frost-300/55">
              Auto watches the frame rate and adjusts particles, lighting and snowfall for you.
            </p>
          </div>
          <Slider label="Snowfall density" value={s.settings.snow} onChange={(v) => game.setSetting({ snow: v })} />
          <Toggle label="Screen shake" hint="Camera impact on hits and slams" on={s.settings.shake} onClick={() => game.setSetting({ shake: !s.settings.shake })} />
        </Section>

        <Section title="Controls & display">
          <div>
            <div className="mb-1.5 font-display text-[12px] font-bold uppercase tracking-[0.16em] text-frost-300/75">Joystick side</div>
            <div className="grid grid-cols-2 gap-1.5">
              {(["left", "right"] as const).map(side => (
                <button key={side} onClick={() => game.setSetting({ joyHand: side })}
                  className={cn("btn px-3 py-2.5 text-xs", s.settings.joyHand === side ? "btn-frost" : "btn-ghost")}>
                  {side === "left" ? "Left-hand stick" : "Right-hand stick"}
                </button>
              ))}
            </div>
          </div>
          <Toggle label="Larger interface text" hint="Bigger HUD and menu type for small screens"
            on={s.settings.bigText} onClick={() => game.setSetting({ bigText: !s.settings.bigText })} />
          <Toggle label="High contrast interface" hint="Stronger panel backgrounds and brighter text"
            on={s.settings.highContrast} onClick={() => game.setSetting({ highContrast: !s.settings.highContrast })} />
          <Toggle label="Contextual hints" hint="Short situational tips for new players"
            on={s.settings.tips} onClick={() => game.setSetting({ tips: !s.settings.tips })} />
          <button onClick={() => game.replayTips()} className="btn btn-ghost w-full px-4 py-2.5 text-xs">
            <ItemIcon icon="reset" className="h-4 w-4" /> Replay all hints
          </button>
        </Section>

        <Section title="Save data">
        <div>
          {!confirmReset ? (
            <button onClick={() => setConfirmReset(true)} className="btn btn-danger w-full px-4 py-2.5 text-xs">
              <ItemIcon icon="trash" className="h-4 w-4" /> Erase expedition save
            </button>
          ) : (
            <div className="panel-soft border-blood-400/50 p-3">
              <p className="mb-2 text-[12px] text-blood-400">This permanently deletes your saved expedition. Are you sure?</p>
              <div className="flex gap-2">
                <button onClick={() => { game.resetSave(); setConfirmReset(false); }} className="btn btn-danger flex-1 px-3 py-2 text-xs">Yes, erase it</button>
                <button onClick={() => setConfirmReset(false)} className="btn btn-ghost flex-1 px-3 py-2 text-xs">Cancel</button>
              </div>
            </div>
          )}
          <p className="mt-2 text-[11px] text-frost-300/55">
            Progress is stored on this device only — there is no cloud sync and no account.
          </p>
        </div>
        </Section>
        <p className="text-center text-[10px] text-frost-300/40">ICEBOUND: LAST SURVIVOR · v6.6 · fully offline</p>
      </div>
    </Shell>
  );
}

// ── router ───────────────────────────────────────────────────────────────────

export function Modals({ game }: { game: Game }) {
  const s = useGame(game);
  const returnTo = useRef<"pause" | null>(null);
  useEffect(() => { if (s.modal === "pause") returnTo.current = null; }, [s.modal]);

  const goto = (m: "settings" | "help") => {
    if (s.modal === "pause") returnTo.current = "pause";
    game.openModal(m);
  };
  const back = () => {
    if (returnTo.current === "pause") { returnTo.current = null; game.openModal("pause"); }
    else game.closeModal();
  };

  switch (s.modal) {
    case "inv": return <InventoryModal game={game} />;
    case "craft": return <CraftModal game={game} />;
    case "quest": return <TaskLogModal game={game} />;
    case "outpost": case "build": return <OutpostModal game={game} />;
    case "fire": return <FireModal game={game} />;
    case "storage": return <StorageModal game={game} />;
    case "map": return <MapModal game={game} />;
    case "loot": return <LootModal game={game} />;
    case "journal": return <JournalModal game={game} />;
    case "progress": return <ProgressionModal game={game} />;
    case "settlement": return <SettlementModal game={game} />;
    case "defense": return <DefenseModal game={game} />;
    case "command": return <CommandModal game={game} />;
    case "pause": return <PauseModal game={game} goto={goto} />;
    case "settings": return <SettingsModal game={game} onBack={back} />;
    case "help": return <HandbookModal game={game} onBack={back} />;
    default: return null;
  }
}
