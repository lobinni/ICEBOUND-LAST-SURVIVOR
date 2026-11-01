// ── ICEBOUND: story checklists + in-game daily field assignments ───────────
// Daily means an in-game arctic day (8 minutes at current balance). Time does
// not advance while the game is closed, paused, or a menu is open: no login
// streaks, real-time waiting, or AFK progress.

import { BAL, ITEMS, NODE_INFO, REGIONS, TOOL_TIER, WORLD } from "./config";
import type {
  DailyTask, DailyTaskKind, Fx, GameState, ItemId, RegionId,
} from "./types";
import { countItem } from "./state";
import { grantXp } from "./progression";
import { grant } from "./tx";

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

// ═══════════════════════════ STORY CHECKLISTS ══════════════════════════════

export interface QuestStep {
  id: string;
  label: string;
  current: number;
  goal: number;
  done: boolean;
  icon: string;
  detail?: string;
  region?: RegionId;
  /** Material ID that can be guided manually from the checklist. */
  guide?: ItemId;
}

function step(
  s: GameState,
  questId: string,
  id: string,
  label: string,
  current: number,
  goal: number,
  icon: string,
  detail?: string,
  region?: RegionId,
  guide?: ItemId,
): QuestStep {
  const questDone = s.questsDone.includes(questId);
  const value = questDone ? goal : clamp(current, 0, goal);
  return { id, label, current: value, goal, done: value >= goal, icon, detail, region, guide };
}

const hasCrafted = (s: GameState, id: ItemId) => s.crafted.includes(id) || countItem(s, id) > 0;
const near = (s: GameState, x: number, y: number, r: number) =>
  s.region === "forest" && Math.hypot(s.player.x - x, s.player.y - y) < r;
const foodCount = (s: GameState) =>
  countItem(s, "berry") + countItem(s, "rawmeat") + countItem(s, "cookedmeat") + countItem(s, "stew") + countItem(s, "glowcap");

/** Exact, player-readable requirements for every story objective. */
export function questChecklist(s: GameState, id: string): QuestStep[] {
  switch (id) {
    case "q_arrive": return [
      step(s, id, "reach", "Reach the research outpost", near(s, WORLD.shelter.x, WORLD.shelter.y, 175) ? 1 : 0, 1, "shelter", "Follow the packed trail north from the escape pod.", "forest"),
    ];
    case "q_gather": return [
      step(s, id, "wood", "Hold 4 Wood", countItem(s, "wood"), 4, "wood", "Gather fallen branches by hand."),
      step(s, id, "stone", "Hold 3 Stone", countItem(s, "stone"), 3, "stone", "Pry loose rock outcrops by hand."),
    ];
    case "q_repair": return [
      step(s, id, "wood", "Collect 8 Wood", countItem(s, "wood"), 8, "wood", "Branches are immediate; Frost Pines need a Stone Axe."),
      step(s, id, "stone", "Collect 6 Stone", countItem(s, "stone"), 6, "stone", "Look for grey rock outcrops."),
      step(s, id, "build", "Build: Repair Shelter", s.shelter.stage >= 1 ? 1 : 0, 1, "hammer", "Interact with the outpost, then choose Repair Shelter.", "forest"),
    ];
    case "q_fire": return [
      step(s, id, "wood", "Collect 5 Wood", countItem(s, "wood"), 5, "wood", undefined, undefined, "wood"),
      step(s, id, "stone", "Collect 3 Stone", countItem(s, "stone"), 3, "stone", undefined, undefined, "stone"),
      step(s, id, "ice", "Collect 2 Ice", countItem(s, "ice"), 2, "ice", "Blue Ice Shard deposits sit on the Frozen River shore north of camp; the early Ice Shore route is marked from the outpost roadmap.", "forest", "ice"),
      step(s, id, "build", "Build the Campfire", s.shelter.fire.built ? 1 : 0, 1, "fire", "Use the outpost construction menu.", "forest"),
    ];
    case "q_warm": return [
      step(s, id, "built", "Campfire built", s.shelter.fire.built ? 1 : 0, 1, "fire"),
      step(s, id, "lit", "Add Wood and light the fire", s.shelter.fire.lit ? 1 : 0, 1, "wood", "Interact with the Campfire; add fuel before lighting."),
      step(s, id, "temp", "Raise Body Temperature to 80", Math.floor(s.player.temp), 80, "temp", "Stand inside the orange firelight radius."),
    ];
    case "q_tools": return [
      step(s, id, "axe", "Craft 1 Stone Axe", hasCrafted(s, "axe") ? 1 : 0, 1, "axe", "Recipe: 3 Wood + 2 Stone."),
      step(s, id, "spear", "Craft 1 Hunting Spear", hasCrafted(s, "spear") ? 1 : 0, 1, "spear", "Recipe: 3 Wood + 3 Stone."),
    ];
    case "q_howl": return [
      step(s, id, "weapon", "Equip a spear", s.equip.weapon ? 1 : 0, 1, "spear", "Equip it from the Field Pack before engaging."),
      step(s, id, "kill", "Defeat 1 hostile creature", s.stats.kills, 1, "wolf", "Dodge the red lunge warning, then punish the recovery window.", "forest"),
    ];
    case "q_stage3": return [
      step(s, id, "warm", "Reach Outpost Stage 2", s.shelter.stage, 2, "shelter", "Warm Quarters: 6 Wood + 4 Stone + 2 Ice. Ice comes from the Frozen River shore north of camp."),
      step(s, id, "ice", "Hold 4 Ice for Stage 3", countItem(s, "ice"), 4, "ice", "Harvest the blue Ice Shard deposits; the Ice Shore guide marker can show the closest one.", "forest", "ice"),
      step(s, id, "stage3", "Reach Outpost Stage 3", s.shelter.stage, 3, "research", "Storage & Workbench: 12 Wood + 8 Stone + 4 Ice."),
    ];
    case "q_gate": return [
      step(s, id, "gate", "Reach the Expedition Gate", near(s, WORLD.gate.x, WORLD.gate.y, 150) ? 1 : 0, 1, "map", "The timber map-gate stands west of the shelter.", "forest"),
      step(s, id, "open", "Open the Expedition Map", s.flags.sawGate ? 1 : 0, 1, "compass", "Interact with the gate."),
    ];
    case "q_stock": return [
      step(s, id, "food", "Carry 3 Food", foodCount(s), 3, "meat", "Berries, meat, stew and glowcaps all count."),
      step(s, id, "water", "Carry 2 Water or Ice", countItem(s, "meltwater") + countItem(s, "ice"), 2, "water", "Meltwater is safer than raw ice."),
      step(s, id, "medical", "Carry 1 Medical Item", countItem(s, "salve") + countItem(s, "medkit"), 1, "salve", "Craft Salve from 2 Frostleaf."),
    ];
    case "q_ship": return [
      step(s, id, "travel", "Travel to the Frozen Shipwreck", s.regions.ship.discovered ? 1 : 0, 1, "ship", "Use the Expedition Gate.", "ship"),
      step(s, id, "scrap", "Recover 6 Scrap Metal or raid the Cargo Hold", s.flags.shipCargo ? 6 : countItem(s, "scrap"), 6, "scrap", "Salvage rusted scrap piles around the hull."),
    ];
    case "q_cargo": return [
      step(s, id, "crowbar", "Craft 1 Crowbar", hasCrafted(s, "crowbar") ? 1 : 0, 1, "crowbar", "Recipe: 3 Scrap Metal + 1 Wood."),
      step(s, id, "cargo", "Open the Cargo Hold", s.flags.shipCargo ? 1 : 0, 1, "crate", "The blue cargo section is inside the ship's stern.", "ship"),
    ];
    case "q_lantern": return [
      step(s, id, "scrap", "Collect 2 Scrap Metal", countItem(s, "scrap"), 2, "scrap"),
      step(s, id, "wood", "Collect 2 Wood", countItem(s, "wood"), 2, "wood"),
      step(s, id, "pelt", "Collect 1 Wolf Pelt", countItem(s, "pelt"), 1, "pelt", "Dropped by Ice Wolves."),
      step(s, id, "lantern", "Craft the Storm Lantern", hasCrafted(s, "lantern") ? 1 : 0, 1, "lantern", "Open Crafting → Equipment."),
    ];
    case "q_cave": {
      const resonators = s.regions.cave.devices.filter(d => d.kind === "resonator" && d.on).length;
      return [
        step(s, id, "lantern", "Bring a Storm Lantern", countItem(s, "lantern"), 1, "lantern", "Required to enter the cave."),
        step(s, id, "resonators", "Attune 3 Resonant Crystals", resonators, 3, "crystal", "Find and interact with α, β and γ throughout the cave.", "cave"),
        step(s, id, "vault", "Open the north-chamber Vault", s.flags.caveVault ? 1 : 0, 1, "crate", "The seal releases after all 3 crystals are attuned.", "cave"),
      ];
    }
    case "q_research": return [
      step(s, id, "scrap", "Collect 8 Scrap Metal", countItem(s, "scrap"), 8, "scrap", "Best found around the Frozen Shipwreck."),
      step(s, id, "crystal", "Collect 2 Ice Crystals", countItem(s, "crystal"), 2, "crystal", "Loot cave caches or defeat Ice Crawlers."),
      step(s, id, "wood", "Collect 6 Wood", countItem(s, "wood"), 6, "wood"),
      step(s, id, "build", "Build the Research Station", s.build.research ? 1 : 0, 1, "research", "Use the outpost construction menu.", "forest"),
    ];
    case "q_station": {
      const a = s.regions.station.devices.find(d => d.id === "brk_a")?.on ? 1 : 0;
      const b = s.regions.station.devices.find(d => d.id === "brk_b")?.on ? 1 : 0;
      const terminal = s.regions.station.devices.find(d => d.id === "term")?.on ? 1 : 0;
      return [
        step(s, id, "a", "Engage Breaker A", a, 1, "bolt", "Search the west side of the station yard.", "station"),
        step(s, id, "b", "Engage Breaker B", b, 1, "bolt", "Search the south-east side of the station yard.", "station"),
        step(s, id, "terminal", "Restore power at the Grid Terminal", terminal, 1, "research", "Use it after both breakers are online.", "station"),
      ];
    }
    case "q_lab": return [
      step(s, id, "power", "Open the Sealed Laboratory", s.flags.labOpen ? 1 : 0, 1, "keycard", "Restore station power first.", "station"),
      step(s, id, "log", "Recover the Director's Log", s.logs.includes("log_lab") ? 1 : 0, 1, "journal", "Open the Laboratory Case inside.", "station"),
    ];
    case "q_suit": return [
      step(s, id, "suit", "Craft 1 Thermal Suit", hasCrafted(s, "thermalsuit") ? 1 : 0, 1, "suit", "Research recipe: 4 Crystal + 3 Chitin + 2 Bear Hide."),
      step(s, id, "blade", "Craft 1 Crystal Blade", hasCrafted(s, "crystalblade") ? 1 : 0, 1, "blade", "Research recipe: 5 Crystal + 4 Scrap + 2 Chitin."),
    ];
    case "q_sigils": return [
      step(s, id, "sigils", "Acquire 2 Frost Sigils", s.flags.sigilGate ? 2 : countItem(s, "sigil"), 2, "sigil", "One is in the station lab; one is in a fortress cache."),
      step(s, id, "gate", "Place the Sigils in the Inner Gate", s.flags.sigilGate ? 1 : 0, 1, "fortress", "Interact with the sealed gate at the fortress wall.", "fortress"),
    ];
    case "q_boss": return [
      step(s, id, "gate", "Open the Inner Gate", s.flags.sigilGate ? 1 : 0, 1, "sigil"),
      step(s, id, "boss", "Defeat the Frost Guardian", s.stats.bosses, 1, "core", "Dodge each marked attack; strike only while the core is exposed.", "fortress"),
    ];
    case "q_finale": return [
      step(s, id, "core", "Carry the Guardian Core", countItem(s, "core"), 1, "core", "The Frost Guardian drops it."),
      step(s, id, "home", "Return to the Frozen Forest", s.region === "forest" ? 1 : 0, 1, "shelter", "Use the fortress Expedition Gate.", "forest"),
      step(s, id, "station", "Deliver it to the Research Station", s.flags.finale ? 1 : 0, 1, "research", "Interact with the built Research Station.", "forest"),
    ];
    default: return [];
  }
}

// ═══════════════════════════ DAILY TASKS ═══════════════════════════════════

export type DailyEvent =
  | { type: "gather"; item: ItemId; n: number }
  | { type: "craft"; item?: ItemId; n: number }
  | { type: "cook"; item: ItemId; n: number }
  | { type: "kill"; n: number }
  | { type: "container"; n: number }
  | { type: "travel"; region: RegionId };

interface TaskDraft {
  kind: DailyTaskKind;
  target?: ItemId | RegionId;
  title: string;
  instruction: string;
  icon: string;
  goal: number;
}

function rngFor(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function bestOwnedToolTier(s: GameState) {
  let tier = 0;
  for (const [id, t] of Object.entries(TOOL_TIER)) {
    if (countItem(s, id as ItemId) > 0) tier = Math.max(tier, t);
  }
  return tier;
}

function gatherCandidates(s: GameState): ItemId[] {
  const tier = bestOwnedToolTier(s);
  const found = new Set<ItemId>();
  for (const id of s.unlocked) {
    const reg = s.regions[id];
    if (!reg || !Array.isArray(reg.nodes)) continue;   // defend against bad save data
    for (const n of reg.nodes) {
      const info = NODE_INFO[n.kind];
      if ((info.toolTier ?? 0) <= tier) found.add(info.yieldItem);
    }
  }
  return [...found];
}

function rewardFor(s: GameState, day: number, index: number): { item: ItemId; n: number } {
  const pool: { item: ItemId; n: number }[] = [
    { item: "berry", n: 2 }, { item: "wood", n: 3 }, { item: "meltwater", n: 1 },
    { item: "frostleaf", n: 2 }, { item: "cookedmeat", n: 1 }, { item: "salve", n: 1 },
  ];
  if (s.unlocked.includes("ship")) pool.push({ item: "scrap", n: 2 });
  if (s.unlocked.includes("cave")) pool.push({ item: "glowcap", n: 2 });
  return pool[(day * 3 + index * 5) % pool.length];
}

function makeTask(s: GameState, day: number, index: number, d: TaskDraft): DailyTask {
  return {
    id: `day_${day}_${index}_${d.kind}_${d.target ?? "any"}`,
    ...d,
    progress: 0,
    reward: rewardFor(s, day, index),
    complete: false,
    rewarded: false,
  };
}

/** Generate three tasks that are possible with the player's current unlocks. */
function generateDailyTasks(s: GameState, day: number): DailyTask[] {
  const rand = rngFor(day * 7919 + s.unlocked.length * 313 + s.shelter.stage * 47);
  const gatherItems = gatherCandidates(s);
  const specific = gatherItems[Math.floor(rand() * Math.max(1, gatherItems.length))] ?? "wood";
  const pool: TaskDraft[] = [
    {
      kind: "gather_any", title: "Supply Run", icon: "backpack",
      instruction: "Gather resources from depleted world nodes; loot and existing stock do not count.",
      goal: 8 + (day % 3) * 2,
    },
    {
      kind: "gather_item", target: specific, title: `Gather ${ITEMS[specific].name}`, icon: ITEMS[specific].icon,
      instruction: `Collect ${ITEMS[specific].name} from world sources. See the Field Handbook for regions and tools.`,
      goal: specific === "crystal" ? 3 : 5 + (day % 2),
    },
    {
      kind: "craft_any", title: "Keep the Bench Busy", icon: "hammer",
      instruction: "Craft equipment, medicine, or an outpost upgrade.", goal: 1 + (day % 2),
    },
  ];

  if (s.shelter.fire.built) pool.push({
    kind: "cook_any", title: "Hot Meals", icon: "stew",
    instruction: "Cook meat, melt ice, or prepare stew at the lit campfire.", goal: 2,
  });
  if (s.equip.weapon || hasCrafted(s, "spear")) pool.push({
    kind: "hunt_any", title: "Thin the Pack", icon: "wolf",
    instruction: "Defeat hostile creatures. Arctic Hares do not count.", goal: s.unlocked.length >= 3 ? 2 : 1,
  });
  const unopened = s.unlocked.some(id => s.regions[id].containers.some(c => !c.opened));
  if (unopened) pool.push({
    kind: "open_container", title: "Search and Salvage", icon: "crate",
    instruction: "Open an unused crate, locker, cargo hold, case, cache, or vault.", goal: 1,
  });
  if (s.unlocked.length > 1) {
    const choices = s.unlocked.filter(id => id !== s.region);
    const target = choices[Math.floor(rand() * Math.max(1, choices.length))] ?? "forest";
    pool.push({
      kind: "visit_region", target, title: `Expedition: ${REGIONS[target].name}`, icon: REGIONS[target].icon,
      instruction: `Use an Expedition Gate and arrive in ${REGIONS[target].name}.`, goal: 1,
    });
  }

  // Deterministic Fisher-Yates: saved tasks remain fixed for the whole day.
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, 3).map((d, i) => makeTask(s, day, i, d));
}

export function inGameDay(s: GameState) {
  return Math.floor(s.time / BAL.dayLength) + 1;
}

export function dailySecondsRemaining(s: GameState) {
  return Math.max(0, BAL.dayLength - (s.time % BAL.dayLength));
}

/** Ensure today's assignments exist; called before all gameplay events. */
export function ensureDailyTasks(s: GameState, fx?: Fx) {
  const day = inGameDay(s);
  if (s.daily.day === day && s.daily.tasks.length === 3) return;
  const previousDay = s.daily.day;
  s.daily.day = day;
  s.daily.tasks = generateDailyTasks(s, day);
  if (previousDay >= 0 && fx) {
    fx.toast({
      title: `Day ${day}: new field assignments`,
      sub: "Three optional tasks are now in the Expedition Log.",
      kind: "info", icon: "quests",
    });
    fx.sfx("ui");
  }
  fx?.bump();
}

function taskDelta(task: DailyTask, event: DailyEvent): number {
  switch (task.kind) {
    case "gather_any": return event.type === "gather" ? event.n : 0;
    case "gather_item": return event.type === "gather" && event.item === task.target ? event.n : 0;
    case "craft_any": return event.type === "craft" ? event.n : 0;
    case "cook_any": return event.type === "cook" ? event.n : 0;
    case "hunt_any": return event.type === "kill" ? event.n : 0;
    case "open_container": return event.type === "container" ? event.n : 0;
    case "visit_region": return event.type === "travel" && event.region === task.target ? 1 : 0;
  }
}

function deliverReward(s: GameState, task: DailyTask, fx: Fx) {
  const { item, n } = task.reward;
  const res = grant(s, item, n, {
    pickup: dropped => s.pickups.push({
      id: `daily_${s.daily.day}_${task.id}`,
      item, n: dropped, x: s.player.x + 28, y: s.player.y + 12, t: 0,
    }),
  });
  const stored = res.stored;
  const dropped = res.dropped;
  task.rewarded = true;
  s.daily.completedTotal++;
  grantXp(s, 35, fx);
  fx.sfx("quest");
  fx.toast({
    title: `Daily task complete: ${task.title}`,
    sub: dropped > 0
      ? `Reward: ${n}× ${ITEMS[item].name} (${dropped} dropped beside you)`
      : stored > 0
      ? `Reward: ${n}× ${ITEMS[item].name} (${stored} sent to Supply Cache)`
      : `Reward: ${n}× ${ITEMS[item].name}`,
    kind: "quest", icon: task.icon,
  });
}

/** Record a deliberate player action. There is no passive or AFK progress. */
export function recordDailyEvent(s: GameState, event: DailyEvent, fx: Fx) {
  ensureDailyTasks(s, fx);
  let changed = false;
  for (const task of s.daily.tasks) {
    if (task.complete) continue;
    const delta = taskDelta(task, event);
    if (delta <= 0) continue;
    task.progress = Math.min(task.goal, task.progress + delta);
    changed = true;
    if (task.progress >= task.goal) {
      task.complete = true;
      deliverReward(s, task, fx);
    }
  }
  if (changed) fx.bump();
}