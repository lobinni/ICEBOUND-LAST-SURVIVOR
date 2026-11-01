// ── ICEBOUND: Field Handbook — Controls · Resources · Regions ───────────────
// Every entry is derived from the live game configuration and live region
// state, so the handbook can never drift out of sync with the actual game.

import { useState } from "react";
import {
  BAL, ENEMY, ITEMS, LOOT, NODE_INFO, RECIPES, REGIONS, REGION_ORDER, TOOL_TIER,
} from "../game/config";
import type { EnemyKind, ItemId, NodeKind, RegionId } from "../game/types";
import type { Game } from "../game/engine";
import { QUESTS } from "../game/systems";
import { useGame } from "./hooks";
import { ItemIcon } from "./icons";
import { Shell } from "./Shell";
import { cn } from "@/utils/cn";

type Tab = "controls" | "resources" | "regions";

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "controls", label: "Controls", icon: "move" },
  { id: "resources", label: "Resources", icon: "wood" },
  { id: "regions", label: "Regions", icon: "map" },
];

// ── data derivation helpers ────────────────────────────────────────────────

function nodeRegions(game: Game, kind: NodeKind): RegionId[] {
  return REGION_ORDER.filter(r => game.state.regions[r]?.nodes.some(n => n.kind === kind));
}

function usedInRecipes(item: ItemId): string[] {
  const names = RECIPES
    .filter(r => r.needs[item] !== undefined)
    .map(r => r.name);
  return [...new Set(names)];
}

function creatureDrops(): { item: ItemId; from: string[] }[] {
  const map = new Map<ItemId, Set<string>>();
  for (const [kind, drops] of Object.entries(LOOT) as [EnemyKind, { item: ItemId; n: number; chance: number }[]][]) {
    for (const d of drops) {
      if (!map.has(d.item)) map.set(d.item, new Set());
      map.get(d.item)!.add(ENEMY[kind].name);
    }
  }
  return [...map.entries()].map(([item, from]) => ({ item, from: [...from] }));
}

// ── small presentational bits ──────────────────────────────────────────────

function DangerPips({ n }: { n: number }) {
  return (
    <span className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4].map(d => (
        <span key={d} className={cn("h-1 w-3.5",
          d <= n ? (n >= 4 ? "bg-blood-500" : n >= 3 ? "bg-ember-500" : "bg-frost-500") : "bg-ink-700")} />
      ))}
    </span>
  );
}

function RegionChips({ game, ids }: { game: Game; ids: RegionId[] }) {
  const s = useGame(game);
  return (
    <span className="flex flex-wrap gap-1">
      {ids.map(id => {
        const unlocked = s.unlocked.includes(id);
        const visited = unlocked && s.regions[id]?.discovered;
        return (
          <span key={id}
            className={cn("chip border text-[9px]",
              visited ? "border-frost-400/25 bg-frost-500/10 text-frost-300"
                : unlocked ? "border-frost-400/15 bg-ink-800/60 text-frost-300/60"
                : "border-ink-700 bg-ink-800/60 text-frost-300/40")}>
            <ItemIcon icon={REGIONS[id].icon} className="h-2.5 w-2.5" />
            {visited ? REGIONS[id].name : unlocked ? `${REGIONS[id].name} (unvisited)` : "?"}
          </span>
        );
      })}
    </span>
  );
}

// ── tab: controls ──────────────────────────────────────────────────────────

function ControlsTab() {
  const rows: [string, string][] = [
    ["Move", "WASD / arrows · left stick"],
    ["Sprint", "Hold Shift · push stick to the rim"],
    ["Interact / gather", "E or F · hand button"],
    ["Attack", "Space · sword button"],
    ["Dodge", "Q · wind button"],
    ["Inventory / Craft", "I / C"],
    ["Map / Logs", "M / J"],
    ["Settlement", "N · HUD people icon · Bunkhouse/Beacon"],
    ["Ration belt: eat / drink / heal", "1 / 2 / 3 · tap belt icons"],
    ["Pause", "Esc"],
  ];
  return (
    <div>
      <div className="space-y-1.5">
        {rows.map(([a, b]) => (
          <div key={a} className="panel-soft flex items-center justify-between gap-3 px-3 py-2">
            <span className="font-display text-[13px] font-bold tracking-wide text-frost-200">{a}</span>
            <span className="text-right text-[12px] text-frost-300/75">{b}</span>
          </div>
        ))}
      </div>
      <div className="mt-3 space-y-1.5 text-[12px] leading-snug text-frost-300/75">
        <p>· <span className="text-frost-200">Temperature</span> falls faster at night, in blizzards and in harsh regions. Fire, shelter, better coats and the Heat Core slow the loss.</p>
        <p>· <span className="text-frost-200">Enemies telegraph.</span> Wolves lunge, bears slam a marked circle, crawlers ambush from the ice, the Guardian cycles three readable attacks.</p>
        <p>· <span className="text-frost-200">The ration belt</span> reads your pack live: it always picks your best food, drink and medicine first — raw meat is never auto-eaten.</p>
        <p>· <span className="text-frost-200">Expedition Log</span> contains the guided Story checklist and three optional Daily Tasks. Daily means an in-game day; there is no login streak or real-world timer.</p>
        <p>· <span className="text-frost-200">Survivor Record (P)</span> tracks your level. Gathering, crafting, building, fighting, discovering sites and completing objectives all grant experience; each level gives one upgrade point for health, stamina, cold resistance, carrying capacity, gathering, combat or rationing.</p>
        <p>· <span className="text-frost-200">Settlement (N)</span> — once the Warm Quarters stand, rescue stranded survivors (pod beacons glint in outer regions) or raise the Signal Beacon and broadcast. Workers run camp posts that deliver to the Supply Cache; residents eat from the cache each dawn, and the wounded recover at camp or can be treated with stored medicine.</p>
        <p>· <span className="text-frost-200">Guards defend the camp on their own.</span> Assign each warrior a position — Gate Watch, Shelter, Cache, Bunkhouse, Beacon Watchtower, Rally Point, or an inner/outer patrol route. They only see threats inside their own watch radius, shout to nearby guards when they engage, and never chase past their assignment's leash. Give them real weapons and armour from the Settlement screen: spears add reach, better blades add damage, armour cuts the damage they take. Wounded guards fall back and return to duty once they have healed.</p>
        <p>· <span className="text-frost-200">The camp draws the wild.</span> Some nights a small pack prowls in (short warning); every seventh day a Horde gathers at the treeline (long preparation window, several waves, wall-breakers); every fourth week the Great Beast Tide rolls in (three timed waves ending in a pack leader). The Defence board (D) shows countdowns, expected sizes, species and your readiness. Sieges only strike while you're home — a night pack you never answer melts away at dawn, and a major attack never begins without anyone to answer it. Damage to camp structures is repaired with wood and stone from the same board.</p>
        <p>· <span className="text-frost-200">Difficulty</span> (Story / Survival / Hardcore) scales survival drain, recovery, enemy damage and health, hazards and gathering together. Change it any time in Settings — switching never grants rewards or alters your statistics.</p>
        <p>· <span className="text-frost-200">If you are defeated</span> you can recover at the outpost. Story progress, unlocks, equipment, base and survivor level are always kept; only a share of carried raw materials is lost (none on Story).</p>
        <p>· <span className="text-frost-200">The story runs across six chapters.</span> The Expedition Log's Story tab tracks the main route; the Side tab holds optional objectives that reward exploration and never block progress.</p>
        <p>· <span className="text-frost-200">Recovered signals</span> join your research logs in the journal as the story advances, filling in what the station's last hours sounded like.</p>
        <p>· <span className="text-frost-200">Contextual hints</span> appear once each for new systems. Turn them off — or replay them — in Settings.</p>
        <p>· <span className="text-frost-200">Points of interest</span> are hidden across every region. They shimmer faintly as you get close — walk to one to record it, claim its supplies and read its note. Recorded sites are listed on the Expedition Map.</p>
        <p>· Progress autosaves every {BAL.autosaveEvery}s, on milestones and when you travel.</p>
      </div>
    </div>
  );
}

// ── tab: resources ─────────────────────────────────────────────────────────

interface ResRow {
  kind: NodeKind;
  yieldId: ItemId;
  verb: string;
  toolId: ItemId | null;
  toolName: string | null;
  tier: number;
  strikes: number;
  respawn: number;
}

function ResourcesTab({ game }: { game: Game }) {
  const s = useGame(game);
  const ownedToolTier = s.equip.tool ? TOOL_TIER[s.equip.tool] ?? 0 : 0;

  const rows: ResRow[] = (Object.entries(NODE_INFO) as [NodeKind, typeof NODE_INFO[NodeKind]][])
    .map(([kind, info]) => ({
      kind,
      yieldId: info.yieldItem,
      verb: info.verb,
      toolId: info.tool ?? null,
      toolName: info.tool ? ITEMS[info.tool].name : null,
      tier: info.toolTier ?? 0,
      strikes: info.strikes,
      respawn: info.respawn,
    }));

  return (
    <div>
      {/* how gathering works */}
      <div className="panel-soft mb-3 px-3.5 py-3">
        <div className="mb-1.5 flex items-center gap-2 font-display text-[11px] font-bold uppercase tracking-[0.2em] text-ember-300">
          <ItemIcon icon="axe" className="h-4 w-4" /> How gathering works
        </div>
        <ul className="space-y-1 text-[12px] leading-snug text-frost-300/80">
          <li>· Walk close and press <span className="text-frost-200">E / the hand button</span> — the survivor chops until the source is depleted or you move.</li>
          <li>· Sources show <span className="text-frost-200">remaining strikes</span> next to the prompt, then regrow after the listed recovery time.</li>
          <li>· Better tools strike faster; from the <span className="text-frost-200">Salvaged Axe</span> up they yield +1 wood/stone per strike.</li>
          <li>· Some sources need a tool tier — the handbook marks what you currently lack.</li>
        </ul>
      </div>

      {/* resource table */}
      <div className="space-y-2">
        {rows.map(r => {
          const def = ITEMS[r.yieldId];
          const missing = r.tier > 0 && r.tier > ownedToolTier;
          const can = !missing;
          const uses = usedInRecipes(r.yieldId);
          const regions = nodeRegions(game, r.kind);
          // crystal nodes also drop from crawlers — surface that in its row
          const extra = r.kind === "ice"
            ? "Ice is the insulation material for Warm Quarters and Stage 3. Search the blue shore deposits on the Frozen River north of camp."
            : r.kind === "crystal" ? "Also dropped by Ice Crawlers." : null;
          return (
            <div key={r.kind} className="panel-soft px-3 py-2.5">
              <div className="flex items-start gap-3">
                <span className="invslot flex h-11 w-11 shrink-0 items-center justify-center">
                  <ItemIcon icon={def.icon} className="h-5 w-5" color={def.color} />
                </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="font-display text-[15px] font-bold tracking-wide text-frost-200">{def.name}</span>
                {regions.length > 0 && (
                  <span className="chip bg-ember-500/15 text-[9px] text-ember-300">
                    Found in {regions.length} region{regions.length > 1 ? "s" : ""}
                  </span>
                )}
                {r.toolId && (
                      <span className={cn("chip border text-[9px]",
                        can ? "border-frost-400/25 bg-frost-500/10 text-frost-300" : "border-blood-400/50 bg-blood-500/10 text-blood-400")}>
                        <ItemIcon icon={ITEMS[r.toolId].icon} className="h-2.5 w-2.5" />
                        {can ? r.toolName : `needs ${r.toolName}`}
                      </span>
                    )}
                    {!r.toolId && <span className="chip border border-moss-400/30 bg-moss-400/10 text-[9px] text-moss-400">by hand</span>}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-frost-300/70">
                    <span><span className="text-frost-300/50">Verb: </span>{r.verb}</span>
                    <span><span className="text-frost-300/50">Strikes: </span>{r.strikes}</span>
                    <span><span className="text-frost-300/50">Respawn: </span>~{r.respawn}s</span>
                  </div>
                  <div className="mt-1.5"><RegionChips game={game} ids={regions} /></div>
                  {uses.length > 0 && (
                    <div className="mt-1.5 text-[11px] text-frost-300/60">
                      <span className="text-frost-300/45">Used for: </span>
                      {uses.slice(0, 3).join(" · ")}{uses.length > 3 ? ` · +${uses.length - 3} more` : ""}
                    </div>
                  )}
                  {extra && <div className="mt-0.5 text-[11px] text-frost-300/55">{extra}</div>}
                  {missing && !can && (
                    <div className="mt-1 text-[11px] font-semibold text-blood-400">
                      Craft {r.toolName} to harvest this.
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* creature sources */}
      <div className="mb-1.5 mt-4 flex items-center gap-2 font-display text-[11px] font-bold uppercase tracking-[0.2em] text-ember-300">
        <ItemIcon icon="wolf" className="h-4 w-4" /> From creatures
      </div>
      <div className="space-y-2">
        {creatureDrops().map(d => {
          const def = ITEMS[d.item];
          return (
            <div key={d.item} className="panel-soft flex items-center gap-3 px-3 py-2.5">
              <span className="invslot flex h-10 w-10 shrink-0 items-center justify-center">
                <ItemIcon icon={def.icon} className="h-5 w-5" color={def.color} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="font-display text-sm font-bold tracking-wide text-frost-200">{def.name}</div>
                <div className="text-[11px] text-frost-300/70">
                  <span className="text-frost-300/45">Dropped by: </span>{d.from.join(" · ")}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── tab: regions ───────────────────────────────────────────────────────────

function RegionsTab({ game }: { game: Game }) {
  const s = useGame(game);
  return (
    <div>
      <div className="panel-soft mb-3 px-3.5 py-3 text-[12px] leading-snug text-frost-300/80">
        <span className="font-display font-bold uppercase tracking-[0.18em] text-ember-300">Travelling: </span>
        every expedition begins and ends at the <span className="text-frost-200">Expedition Gate</span> at your
        camp. Open the travel map (M) from any gate. Harsher regions demand better gear — read the
        readiness list before you go.
      </div>
      <div className="space-y-2">
        {REGION_ORDER.map(id => {
          const r = REGIONS[id];
          const unlocked = s.unlocked.includes(id);
          const discovered = s.regions[id]?.discovered;
          const unlockQuest = QUESTS.find(q => q.unlocks === id);
          return (
            <div key={id} className={cn("panel-soft px-3.5 py-2.5", !unlocked && "opacity-70")}>
              <div className="flex items-start gap-3">
                <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center", unlocked ? "text-ember-400" : "text-frost-300/40")}>
                  <ItemIcon icon={r.icon} className="h-6 w-6" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-display text-[15px] font-bold tracking-wide text-frost-200">
                      {unlocked ? r.name : "Undiscovered region"}
                    </span>
                    {unlocked && <DangerPips n={r.danger} />}
                    {s.region === id && <span className="chip bg-ember-500/20 text-[9px] text-ember-300">Here</span>}
                    {unlocked && !discovered && <span className="chip bg-frost-500/15 text-[9px] text-frost-300">Never visited</span>}
                  </div>
                  {unlocked ? (
                    <>
                      <p className="mt-0.5 text-[11px] leading-snug text-frost-300/70">{r.desc}</p>
                      <div className="mt-1 grid gap-x-3 gap-y-0.5 text-[11px] sm:grid-cols-2">
                        <span className="text-blood-400"><span className="text-frost-300/45">Threats: </span>{r.dangers}</span>
                        <span className="text-moss-400"><span className="text-frost-300/45">Resources: </span>{r.loot}</span>
                      </div>
                      {r.reqItem && (
                        <div className="mt-1 text-[11px] text-frost-300/65">
                          <span className="text-frost-300/45">Entry requires: </span>
                          <ItemIcon icon={ITEMS[r.reqItem].icon} className="mb-0.5 inline h-3 w-3" color={ITEMS[r.reqItem].color} /> {r.reqLabel}
                        </div>
                      )}
                    </>
                  ) : (
                    <p className="mt-0.5 text-[11px] text-frost-300/60">
                      {unlockQuest ? `Revealed by the objective “${unlockQuest.title}”.` : "Revealed as the story advances."}
                    </p>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── modal ──────────────────────────────────────────────────────────────────

export function HandbookModal({ game, onBack }: { game: Game; onBack: () => void }) {
  const s = useGame(game);
  void s;
  const [tab, setTab] = useState<Tab>("resources");
  return (
    <Shell title="Field Handbook" icon="help" onClose={onBack} wide
      sub="Controls, resources, gathering and the expedition map">
      <div className="mb-3 flex gap-1.5">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={cn("btn flex-1 px-2 py-2 text-[11px]", tab === t.id ? "btn-ember" : "btn-ghost")}>
            <ItemIcon icon={t.icon} className="h-3.5 w-3.5" />
            {t.label}
          </button>
        ))}
      </div>
      {tab === "controls" && <ControlsTab />}
      {tab === "resources" && <ResourcesTab game={game} />}
      {tab === "regions" && <RegionsTab game={game} />}
    </Shell>
  );
}
