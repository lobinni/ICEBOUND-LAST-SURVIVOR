// ── ICEBOUND Phase 6.2: settlement residents — recruitment, work, defense ────
//
// One module owns the whole settlement layer so the rules can never drift:
// recruitment (rescues + the Signal Beacon), housing capacity, worker tasks,
// warrior defence, food upkeep, injuries & recovery and deterministic offline
// progress. Items move ONLY through tx/state helpers (storage + inventory), so
// settlement resources are the same economy as the player's — nothing is
// created from nowhere and production honours input, building and storage
// rules. All tuning lives in RES_BAL / TASKS below, like config.ts does for
// the rest of the game.

import { BAL, ENEMY, ITEMS, WORLD } from "./config";
import { profileOf } from "./difficulty";
import { addItem, countItem, removeItem } from "./state";
import { collideAt } from "./actors";
import type { Enemy, Fx, GameState, ItemId } from "./types";
// Engine type only — type-level import, no runtime cycle.
import type { Game } from "./engine";
// Phase 6.3 guard AI. Only called from inside functions, so the residents ⇄
// guards module pair resolves safely (both sides are hoisted declarations).
import {
  ASSIGNMENTS, GUARD_ARMOR, GUARD_STATE_LABEL, GUARD_WEAPONS, assignmentOf, assignmentLocked,
  raiseAlarm, resetGuardRuntime, separateResidents, updateGuard,
} from "./guards";

// ═══════════════════════════ TYPES ═════════════════════════════════════════

export type ResidentRole = "worker" | "warrior";
export type WarriorSpec = "guard" | "scout";
/** Phase 6.3: assignment ids live in guards.ts (ASSIGNMENTS); kept as a string
 *  so the defensive-position table can grow without touching the save schema. */
export type WarriorPost = string;
export type TaskId = "wood" | "stone" | "ice" | "forage" | "water" | "cook" | "medic" | "stoke";

export type ResidentCondition =
  | "ok" | "working" | "patrolling" | "fighting" | "resting" | "retreating"
  | "injured" | "downed" | "hungry" | "weakened" | "shaken" | "paused" | "blocked";

export interface Resident {
  id: string;
  name: string;
  /** Flavour specialisation shown in the UI, e.g. "Deckhand", "Medic". */
  title: string;
  role: ResidentRole;
  /** Warrior specialisation (weapon + patrol style); undefined for workers. */
  spec?: WarriorSpec;
  /** Current worker task (null = no assignment). Warriors ignore this. */
  task: TaskId | null;
  /** Warrior defensive assignment: gate, building, watchtower, rally or route. */
  post: WarriorPost;
  /** Phase 6.3 — guard AI state machine (see guards.ts). Transient combat
   *  sub-state is never persisted; only the durable state is restored. */
  gs: import("./guards").GuardState;
  gsT: number;
  /** Target-selection policy, player-configurable per guard. */
  priority: import("./guards").GuardPriority;
  /** Real equipment carried by this guard, moved out of the shared pool. */
  gear: { weapon: ItemId | null; armor: ItemId | null };
  /** Swing timer + single-hit latch: one damage event per attack, ever. */
  swingT: number; hitDone: boolean;
  /** Heard-an-alarm timer, lost-target grace, staggered scan countdown. */
  alertT: number; lostT: number; scanT: number;
  /** Lifetime defensive kills (record keeping only). */
  kills: number;
  trait: string;
  traitDesc: string;
  /** Task the trait accelerates (workers), if any. */
  bonusTask?: TaskId;
  bonusMul?: number;
  hp: number;
  maxHp: number;
  /** True while recovering below 35% hp (resting, not assignable to danger). */
  injured: boolean;
  /** True at the hp floor — must rest or be treated; never deleted. */
  downed: boolean;
  /** Consecutive unfed days (drives hungry → weakened). */
  unfed: number;
  paused: boolean;
  /** Seconds left of post-raid shock; blocks work while > 0. */
  shakenT: number;
  // ── runtime position & FSM (saved, so residents resume where they were) ──
  x: number; y: number; face: number; walkPh: number;
  state: "home" | "go" | "work" | "fight" | "flee" | "rest";
  /** Seconds invested into the current production cycle. */
  workT: number;
  atkCd: number; clashCd: number; hurtT: number;
  /** Enemy id currently engaged (warriors). */
  targetId: string | null;
  /** Consecutive seconds of zero movement while ordered to move. */
  stuckT: number;
  /** Index of the next waypoint on a patrol ring. */
  wpi: number;
}

export interface SettlementState {
  residents: Resident[];
  /** Broadcast roster pointer — each recruit is unique, never repeated. */
  rosterIdx: number;
  /** Seconds of Signal Beacon cooldown left (game-time). */
  callCd: number;
  /** Camp work-stock per gathering task (depletes, regrows on a timer). */
  stock: Record<TaskId, number>;
  /** Regrow countdowns per task. */
  stockT: Record<TaskId, number>;
  /** Last in-game day index that upkeep was settled for. */
  lastFeedDay: number;
  /** Lifetime production totals per item id (audit + UI). */
  produced: Record<string, number>;
  /** Wall-clock ms of the last save; basis for deterministic offline math. */
  lastWall: number;
  /** One-shot warning latches so toasts never spam. */
  warned: Record<string, boolean>;
  /** Phase 6.3 — the camp's last alarm. Transient: never restored from save. */
  alarm: { x: number; y: number; t: number; reason: string } | null;
}

/** Plain-data save projection (save.ts wraps it; validated on load). */
export type SettlementSave = Omit<SettlementState, "residents"> & {
  residents: Partial<Resident>[];
};

// ═══════════════════════════ BALANCE ═══════════════════════════════════════

export const RES_BAL = {
  workerSpeed: 96,
  guardSpeed: 92,
  scoutSpeed: 132,
  /** Warrior combat numbers — deliberately below the player's, they are a
   *  defensive screen, not a replacement for expeditions. */
  guard: { hp: 110, dmg: 17, range: 48 },
  scout: { hp: 76, dmg: 12, range: 44 },
  atkCd: 1.5,
  /** Fraction of the enemy's damage a warrior takes per close clash. */
  clashMul: 0.5,
  clashCd: 1.15,
  /** Legacy fallback radii; Phase 6.3 reads watch/leash per assignment. */
  defendR: { guard: 300, scout: 380 },
  /** Retreat below this fraction of max hp. */
  retreatAt: 0.35,
  /** Rest regeneration per second; medic resident doubles it. */
  regen: 2.2,
  /** Upkeep per resident per in-game day (scaled by difficulty hungerMul). */
  foodPerDay: 22,
  thirstPerDay: 18,
  /** Hungry residents still work — at reduced pace. Never lethal. */
  hungrySpeedMul: 0.55,
  /** Signal Beacon cooldown (seconds of game time). */
  callCooldown: 300,
  /** Camp-stock caps for gathering-style posts. */
  offlineCapSec: 8 * 3600,          // production catch-up ceiling
  offlineFeedDays: 3,               // never consume more than 3 days away
  offlineUnitsPerTask: 40,          // per relaunch, per task
  pathBlockedAt: 2.2,               // seconds without progress → report blocked
} as const;

// Camp geography — posts sit on open outpost ground so paths stay clear.
export const CAMPSITES = {
  bunksHome: { x: -430, y: -160 },   // Bunkhouse build site
  yardHome: { x: -120, y: -110 },    // shelter yard fallback
  gatePost: { x: -455, y: -60 },
  campPost: { x: -60, y: -80 },
  ring: [
    { x: -330, y: -250 }, { x: 230, y: -290 }, { x: 380, y: 60 }, { x: -30, y: 210 },
  ],
} as const;

export interface TaskDef {
  id: TaskId; name: string; icon: string; desc: string;
  /** Seconds of work per produced unit. */
  time: number;
  /** Inputs consumed from STORAGE per unit. */
  input?: Partial<Record<ItemId, number>>;
  /** Output item + amount per unit (absent for service tasks). */
  output?: { item: ItemId; n: number };
  /** Gathering-style stock: the camp site holds N units, regrows over time. */
  stock?: { max: number; regrow: number };
  /** Requirements, evaluated live (buildings can be damaged conceptually —
   *  here required structures must simply exist / be at stage). */
  needsStage?: number;
  needsBuild?: "cookpot" | "beacon" | "bunks";
  needsFire?: boolean;
  /** Only this resident may hold the task (specialists like the Medic). */
  specialistId?: string;
  /** Standing position at the work post. */
  post: { x: number; y: number };
}

export const TASKS: Record<TaskId, TaskDef> = {
  wood: {
    id: "wood", name: "Timber Detail", icon: "wood",
    desc: "Cuts the deadfall pile and sledges timber into the Supply Cache.",
    time: 42, output: { item: "wood", n: 1 },
    stock: { max: 5, regrow: 150 }, post: { x: -240, y: 330 },
  },
  stone: {
    id: "stone", name: "Stone Sled", icon: "stone",
    desc: "Breaks glacial rock at the moraine lip and hauls it to storage.",
    time: 58, output: { item: "stone", n: 1 },
    stock: { max: 4, regrow: 190 }, post: { x: 420, y: 40 },
  },
  ice: {
    id: "ice", name: "Ice Sawyer", icon: "ice",
    desc: "Saws clear blocks off the frozen seep for meltwater stock.",
    time: 52, output: { item: "ice", n: 1 },
    stock: { max: 4, regrow: 175 }, post: { x: 130, y: -420 },
  },
  forage: {
    id: "forage", name: "Foraging Round", icon: "berry",
    desc: "Walks the sheltered hollow for frostberries and frostleaf.",
    time: 60, output: { item: "berry", n: 1 },
    stock: { max: 4, regrow: 210 }, post: { x: -420, y: 260 },
  },
  water: {
    id: "water", name: "Water Tender", icon: "water",
    desc: "Melts stored ice at the campfire. Consumes 2 Clear Ice per Meltwater.",
    time: 48, input: { ice: 2 }, output: { item: "meltwater", n: 1 },
    needsFire: true, post: { x: 250, y: -24 },
  },
  cook: {
    id: "cook", name: "Camp Cook", icon: "stew",
    desc: "Cooks raw meat over the pot. Consumes 1 Raw Meat per Cooked Meat.",
    time: 50, input: { rawmeat: 1 }, output: { item: "cookedmeat", n: 1 },
    needsBuild: "cookpot", post: { x: 352, y: 105 },
  },
  medic: {
    id: "medic", name: "Field Medic", icon: "salve",
    desc: "Brews salves from stored frostleaf and tends wounds twice as fast.",
    time: 150, input: { frostleaf: 1 }, output: { item: "salve", n: 1 },
    specialistId: "rescue_sv_station", post: { x: -300, y: -255 },
  },
  stoke: {
    id: "stoke", name: "Fire Tender", icon: "fire",
    desc: "Feeds 1 stored Wood into the campfire and keeps it burning.",
    time: 90, input: { wood: 1 }, needsFire: true, post: { x: 160, y: -18 },
  },
};

export const WARRIOR_SPECS: Record<WarriorSpec, {
  name: string; weapon: string; weaponIcon: string; desc: string;
}> = {
  guard: {
    name: "Spear Guard", weapon: "Ironwood Spear", weaponIcon: "spear",
    desc: "Holds a post. Engages predators that stalk the camp; heavy, steady.",
  },
  scout: {
    name: "Kite Scout", weapon: "Hand Axe & Hook", weaponIcon: "axe",
    desc: "Fast perimeter patrol. Intercepts threats earlier but hits lighter.",
  },
};

// ── recruitment content ─────────────────────────────────────────────────────

export interface RescueDef {
  /** Container id in the world — opened state persists in the save, so a
   *  rescue can never be rewarded twice. */
  containerId: string;
  region: string; regionLabel: string;
  cost: Partial<Record<ItemId, number>>;
  costLabel: string;
  needsFlag?: string; needsLabel?: string;
  resident: ResidentSeed;
}

export interface ResidentSeed {
  id: string; name: string; title: string; role: ResidentRole; spec?: WarriorSpec;
  trait: string; traitDesc: string; bonusTask?: TaskId; bonusMul?: number;
}

export const RESCUES: RescueDef[] = [
  {
    containerId: "sv_ship", region: "ship", regionLabel: "Frozen Shipwreck",
    cost: { meltwater: 1, berry: 2 }, costLabel: "1 Meltwater + 2 Frostberries",
    resident: {
      id: "rescue_sv_ship", name: "Maren Solberg", title: "Deckhand", role: "worker",
      trait: "Sled-trained", traitDesc: "Hauling habit: Timber & Stone posts work 20% faster.",
      bonusTask: "stone", bonusMul: 1.2,
    },
  },
  {
    containerId: "sv_cave", region: "cave", regionLabel: "Crystal Cave",
    cost: { meltwater: 2, salve: 1 }, costLabel: "2 Meltwater + 1 Herbal Salve",
    resident: {
      id: "rescue_sv_cave", name: "Ilya Ren", title: "Surveyor", role: "worker",
      trait: "Pathfinder", traitDesc: "Foraging & Ice posts work 20% faster.",
      bonusTask: "forage", bonusMul: 1.2,
    },
  },
  {
    containerId: "sv_station", region: "station", regionLabel: "Research Station",
    cost: { medkit: 1 }, costLabel: "1 Field Medkit",
    needsFlag: "labOpen", needsLabel: "restore the station grid (sealed lab)",
    resident: {
      id: "rescue_sv_station", name: "Dr. Ada Vishnev", title: "Station Medic", role: "worker",
      trait: "Triage", traitDesc: "Unlocks the Field Medic task; everyone recovers twice as fast.",
    },
  },
  {
    containerId: "sv_fortress", region: "fortress", regionLabel: "Frost Fortress",
    cost: { stew: 1, medkit: 1 }, costLabel: "1 Hot Stew + 1 Field Medkit",
    resident: {
      id: "rescue_sv_fortress", name: "Jorah Vale", title: "Containment Warden", role: "warrior", spec: "guard",
      trait: "Veteran", traitDesc: "Takes 20% less damage in camp defence.",
    },
  },
];

/** One-way broadcast pool for the Signal Beacon — each voice answers once. */
export const ROSTER: ResidentSeed[] = [
  { id: "call_0", name: "Anja Iversen", title: "Provisioner", role: "worker",
    trait: "Field Cook", traitDesc: "Cooking post works 25% faster.", bonusTask: "cook", bonusMul: 1.25 },
  { id: "call_1", name: "Lars Halvorsen", title: "Frost Veteran", role: "warrior", spec: "guard",
    trait: "Stalwart", traitDesc: "+20 maximum health." },
  { id: "call_2", name: "Nadia Kovac", title: "Longrunner", role: "warrior", spec: "scout",
    trait: "Swift", traitDesc: "Moves 25% faster; spots threats further out." },
  { id: "call_3", name: "Torsten Beck", title: "Lumberjack", role: "worker",
    trait: "Timberwright", traitDesc: "Timber post works 25% faster.", bonusTask: "wood", bonusMul: 1.25 },
  { id: "call_4", name: "Freya Nystrom", title: "Herbalist", role: "worker",
    trait: "Green Hollow", traitDesc: "Foraging & Water posts work 20% faster.", bonusTask: "forage", bonusMul: 1.2 },
  { id: "call_5", name: "Bjorn Falk", title: "Night Watcher", role: "warrior", spec: "scout",
    trait: "Watchful", traitDesc: "Wider interception radius." },
];

/** Payment pools: settlement operations draw on camp supplies — storage first,
 *  then the pack — so the player's inventory and the settlement share one
 *  economy instead of a parallel one. */
export function poolCount(s: GameState, id: ItemId): number {
  return countItem(s, id, "storage") + countItem(s, id, "inv");
}
export function poolHas(s: GameState, needs: Partial<Record<ItemId, number>>): boolean {
  return (Object.entries(needs) as [ItemId, number][]).every(([id, n]) => poolCount(s, id) >= n);
}
export function poolPay(s: GameState, needs: Partial<Record<ItemId, number>>): boolean {
  if (!poolHas(s, needs)) return false;
  for (const [id, n] of Object.entries(needs) as [ItemId, number][]) {
    let left = n;
    const fromStorage = Math.min(countItem(s, id, "storage"), left);
    if (fromStorage > 0) { removeItem(s, id, fromStorage, "storage"); left -= fromStorage; }
    if (left > 0) removeItem(s, id, left, "inv");
  }
  return true;
}

// ═══════════════════════════ STATE ═════════════════════════════════════════

export function createSettlement(): SettlementState {
  return {
    residents: [],
    rosterIdx: 0,
    callCd: 0,
    stock: {
      wood: TASKS.wood.stock!.max, stone: TASKS.stone.stock!.max,
      ice: TASKS.ice.stock!.max, forage: TASKS.forage.stock!.max,
      water: 0, cook: 0, medic: 0, stoke: 0,
    },
    stockT: { wood: 0, stone: 0, ice: 0, forage: 0, water: 0, cook: 0, medic: 0, stoke: 0 },
    lastFeedDay: Math.floor(BAL.dayLength * 0.06 / BAL.dayLength),
    produced: {},
    lastWall: Date.now(),
    warned: {},
    alarm: null,
  };
}

/** Housing capacity — deliberately explicit so the UI can explain each seat. */
export function capacityBreakdown(s: GameState): { label: string; n: number }[] {
  const out: { label: string; n: number }[] = [];
  if (s.shelter.stage >= 2) out.push({ label: "Warm Quarters (Stage 2)", n: 2 });
  if (s.shelter.stage >= 3) out.push({ label: "Operational Outpost (Stage 3)", n: 2 });
  if (s.build.bunks) out.push({ label: "Bunkhouse", n: 3 });
  return out;
}
export const capacityOf = (s: GameState) =>
  capacityBreakdown(s).reduce((a, b) => a + b.n, 0);

/** Defense readiness figures for the Overview/Warriors panels. */
export function defenseSummary(s: GameState): { warriors: number; ready: number; total: number } {
  const warriors = s.settlement.residents.filter(r => r.role === "warrior");
  return {
    warriors: warriors.length,
    total: warriors.length,
    ready: warriors.filter(w => !w.paused && !w.injured && !w.downed && w.unfed < 2).length,
  };
}

export function homeAnchor(s: GameState, i: number): { x: number; y: number } {
  const base = s.build.bunks ? CAMPSITES.bunksHome : CAMPSITES.yardHome;
  const a = (i * 2.399) % (Math.PI * 2);              // golden-angle fan-out
  return { x: base.x + Math.cos(a) * 34, y: base.y + Math.sin(a) * 22 };
}

function makeResident(seed: ResidentSeed, s: GameState): Resident {
  const spec = seed.spec;
  const maxHp = seed.role === "warrior"
    ? (spec === "guard" ? RES_BAL.guard.hp : RES_BAL.scout.hp) + (seed.trait === "Stalwart" ? 20 : 0)
    : 70;
  const home = homeAnchor(s, s.settlement.residents.length);
  return {
    id: seed.id, name: seed.name, title: seed.title,
    role: seed.role, spec: seed.spec,
    task: null,
    // Scouts start on the outer sweep, heavies hold the gate.
    post: seed.role === "warrior" ? (seed.spec === "scout" ? "patrol_outer" : "gate") : "rally",
    gs: "return", gsT: 0,
    priority: "balanced",
    gear: { weapon: null, armor: null },
    swingT: 0, hitDone: false,
    alertT: 0, lostT: 0, scanT: 0, kills: 0,
    trait: seed.trait, traitDesc: seed.traitDesc,
    bonusTask: seed.bonusTask, bonusMul: seed.bonusMul,
    hp: maxHp, maxHp,
    injured: false, downed: false, unfed: 0, paused: false, shakenT: 0,
    x: home.x, y: home.y, face: 0, walkPh: 0,
    state: "home", workT: 0,
    atkCd: 0, clashCd: 0, hurtT: 0,
    targetId: null, stuckT: 0, wpi: 0,
  };
}

// ═══════════════════════════ RECRUITMENT ═══════════════════════════════════

export interface RecruitCheck { ok: boolean; reasons: string[] }

/** Why the Signal Beacon cannot be used right now — every reason listed. */
export function callStatus(s: GameState): RecruitCheck & { next: ResidentSeed | null } {
  const reasons: string[] = [];
  const set = s.settlement;
  if (!s.build.beacon) reasons.push("Requires the Signal Beacon (build via the Outpost)");
  if (s.shelter.stage < 3) reasons.push("Requires an operational Outpost (Stage 3)");
  const cap = capacityOf(s);
  if (set.residents.length >= cap) {
    reasons.push(cap <= 0
      ? "No housing — build Warm Quarters first"
      : `Housing full (${set.residents.length}/${cap}) — build the Bunkhouse`);
  }
  if (set.rosterIdx >= ROSTER.length) reasons.push("No one else answers — every known survivor is here");
  if (set.callCd > 0) reasons.push(`Beacon cooling down (${Math.ceil(set.callCd)}s)`);
  if (!poolHas(s, CALL_COST)) reasons.push("Needs supplies (storage or pack): 2 Hot Stew + 1 Field Medkit");
  return { ok: reasons.length === 0, reasons, next: set.rosterIdx < ROSTER.length ? ROSTER[set.rosterIdx] : null };
}

export const CALL_COST: Partial<Record<ItemId, number>> = { stew: 2, medkit: 1 };

/** Broadcast a recruitment call. Pays only on success, never twice. */
export function broadcastCall(s: GameState, fx: Fx): boolean {
  const chk = callStatus(s);
  if (!chk.ok || !chk.next) {
    fx.toast({ title: "No answer", sub: chk.reasons[0] ?? "Unavailable.", kind: "warn", icon: "warn" });
    fx.sfx("error");
    return false;
  }
  if (!poolPay(s, CALL_COST)) { fx.sfx("error"); return false; }
  const r = makeResident(chk.next, s);
  s.settlement.residents.push(r);
  s.settlement.rosterIdx++;
  s.settlement.callCd = RES_BAL.callCooldown;
  fx.sfx("discover");
  fx.burst(r.x, r.y - 20, "craft", 18);
  fx.toast({
    title: `${r.name} reached the outpost`,
    sub: `${r.title} · ${r.trait} — ${r.traitDesc}`,
    kind: "good", icon: "residents",
  });
  fx.bump();
  return true;
}

/** Rescue a specific stranded survivor (world container). Duplicate-safe. */
export function rescueStatus(s: GameState, def: RescueDef): RecruitCheck {
  const reasons: string[] = [];
  if (s.settlement.residents.some(r => r.id === def.resident.id)) reasons.push("Already rescued");
  const cap = capacityOf(s);
  if (s.settlement.residents.length >= cap) {
    reasons.push(cap <= 0 ? "No housing at the outpost — build Warm Quarters first"
      : `Housing full (${s.settlement.residents.length}/${cap})`);
  }
  if (def.needsFlag && !s.flags[def.needsFlag]) reasons.push(`Requires ${def.needsLabel}`);
  if (!poolHas(s, def.cost)) reasons.push(`Needs supplies: ${def.costLabel}`);
  return { ok: reasons.length === 0, reasons };
}

export function rescueSurvivor(s: GameState, def: RescueDef, fx: Fx): boolean {
  const chk = rescueStatus(s, def);
  if (!chk.ok) {
    fx.toast({ title: "Rescue unavailable", sub: chk.reasons[0], kind: "warn", icon: "warn" });
    fx.sfx("error");
    return false;
  }
  if (!poolPay(s, def.cost)) { fx.sfx("error"); return false; }
  const r = makeResident(def.resident, s);
  s.settlement.residents.push(r);
  fx.sfx("quest");
  fx.toast({
    title: `${r.name} rescued — joins the outpost`,
    sub: `${r.title} · ${r.trait} — ${r.traitDesc}`,
    kind: "quest", icon: "residents",
  });
  fx.bump();
  return true;
}

// ═══════════════════════════ ASSIGNMENT ════════════════════════════════════

export function taskStatus(s: GameState, r: Resident, task: TaskDef): string | null {
  if (task.specialistId && task.specialistId !== r.id) return "Requires the Station Medic (rescue Dr. Vishnev)";
  if (r.downed) return "Downed — treat with medicine";
  if (r.injured) return "Injured — resting";
  if (r.paused) return "Paused";
  if (r.shakenT > 0) return "Shaken — recovering";
  if (r.unfed >= 2) return "Weakened — needs food (resting)";
  if (task.needsStage && s.shelter.stage < task.needsStage) return `Needs Outpost Stage ${task.needsStage}`;
  if (task.needsBuild && !s.build[task.needsBuild]) {
    return `Needs the ${task.needsBuild === "cookpot" ? "Cooking Pot" : task.needsBuild === "beacon" ? "Signal Beacon" : "Bunkhouse"}`;
  }
  if (task.needsFire && !s.shelter.fire.built) return "Needs the campfire built";
  if (task.input) {
    for (const [id, n] of Object.entries(task.input) as [ItemId, number][]) {
      if (countItem(s, id, "storage") < n) return `Missing input — ${ITEMS[id].name} in storage (${countItem(s, id, "storage")}/${n})`;
    }
  }
  if (task.stock && s.settlement.stock[task.id] <= 0) {
    return "Site depleted — regrowing";
  }
  if (task.output) {
    if (addItemRoom(s, task.output.item) <= 0) return "Storage full — free space in the Supply Cache";
  }
  if (task.id === "stoke") {
    if (countItem(s, "wood", "storage") < 1) return "Missing input — Wood in storage (0/1)";
    if (s.shelter.fire.fuel >= BAL.fire.fuelMax) return "Fire is fully fuelled";
  }
  return null;
}

/** Storage room for one item type (stack ceiling ×4 like any storage bag). */
function addItemRoom(s: GameState, id: ItemId): number {
  return Math.max(0, ITEMS[id].stack * 4 - countItem(s, id, "storage"));
}

export function assignTask(s: GameState, residentId: string, task: TaskId | null, fx?: Fx): boolean {
  const r = s.settlement.residents.find(r => r.id === residentId);
  if (!r || r.role !== "worker") return false;
  if (task) {
    const def = TASKS[task];
    if (def.specialistId && def.specialistId !== r.id) {
      fx?.toast({ title: "Specialist task", sub: "Only Dr. Vishnev can hold the Field Medic post.", kind: "warn", icon: "salve" });
      return false;
    }
    // conflicting assignments: one resident per task
    const held = s.settlement.residents.find(o => o.id !== r.id && o.task === task && !o.paused);
    if (held) {
      fx?.toast({ title: "Post occupied", sub: `${held.name} already runs ${def.name}. Pause their assignment first.`, kind: "warn", icon: "warn" });
      fx?.sfx("error");
      return false;
    }
  }
  r.task = task;
  r.workT = 0;
  r.stuckT = 0;
  r.state = "go";
  fx?.sfx("ui");
  fx?.bump();
  return true;
}

/** Assign a defensive position / patrol route. Locked posts are refused with
 *  a reason instead of silently failing. */
export function setWarriorPost(s: GameState, residentId: string, post: WarriorPost, fx?: Fx): boolean {
  const r = s.settlement.residents.find(r => r.id === residentId);
  if (!r || r.role !== "warrior") return false;
  const def = ASSIGNMENTS[post];
  if (!def) return false;
  const locked = assignmentLocked(s, def);
  if (locked) {
    fx?.toast({ title: `${def.name} unavailable`, sub: locked, kind: "warn", icon: "warn" });
    fx?.sfx("error");
    return false;
  }
  r.post = post;
  r.wpi = 0;
  r.stuckT = 0;
  r.targetId = null;
  // Re-enter through the ReturnToAssignment state so the guard walks to the
  // new post legally instead of teleporting into a combat state.
  r.gs = "return";
  r.gsT = 0;
  r.state = "go";
  fx?.sfx("ui"); fx?.bump();
  return true;
}

/** Target-selection policy for one guard. */
export function setGuardPriority(s: GameState, residentId: string, p: Resident["priority"], fx?: Fx): void {
  const r = s.settlement.residents.find(r => r.id === residentId);
  if (!r || r.role !== "warrior") return;
  r.priority = p;
  r.targetId = null;         // re-evaluate under the new policy
  fx?.sfx("ui"); fx?.bump();
}

export function togglePause(s: GameState, residentId: string, fx?: Fx): void {
  const r = s.settlement.residents.find(r => r.id === residentId);
  if (!r) return;
  r.paused = !r.paused;
  if (r.paused) { r.state = "rest"; r.targetId = null; }
  else r.state = "go";
  fx?.sfx("ui"); fx?.bump();
}

/** Treat an injured/downed resident with medicine from storage or the pack. */
export function treatResident(s: GameState, residentId: string, fx: Fx): boolean {
  const r = s.settlement.residents.find(r => r.id === residentId);
  if (!r) return false;
  if (!r.injured && !r.downed && r.hp >= r.maxHp) {
    fx.toast({ title: `${r.name} is healthy`, kind: "info", icon: "heart" });
    return false;
  }
  const healMul = profileOf(s.difficulty).healMul;
  if (poolCount(s, "medkit") > 0) {
    poolPay(s, { medkit: 1 });
    r.hp = Math.min(r.maxHp, r.hp + 60 * healMul);
  } else if (poolCount(s, "salve") > 0) {
    poolPay(s, { salve: 1 });
    r.hp = Math.min(r.maxHp, r.hp + 30 * healMul);
  } else {
    fx.toast({ title: "No medicine", sub: "Needs a Field Medkit or Herbal Salve (storage or pack).", kind: "warn", icon: "salve" });
    fx.sfx("error");
    return false;
  }
  r.downed = false;
  if (r.hp >= r.maxHp * RES_BAL.retreatAt) r.injured = false;
  if (r.hp >= r.maxHp) r.hp = r.maxHp;
  r.state = "rest";
  fx.sfx("heal");
  fx.float(r.x, r.y - 30, "+ Treated", "#7fd6a4");
  fx.bump();
  return true;
}

/** Live condition label — single source used by HUD, modal and canvas badge. */
export function conditionOf(s: GameState, r: Resident): { id: ResidentCondition; label: string; tone: "ok" | "warn" | "bad" } {
  if (r.downed) return { id: "downed", label: "Downed — needs treatment", tone: "bad" };
  if (r.injured) return { id: "injured", label: "Injured — recovering", tone: "bad" };
  if (r.unfed >= 2) return { id: "weakened", label: "Weakened — hungry", tone: "bad" };
  if (r.paused) return { id: "paused", label: "Paused", tone: "warn" };
  if (r.shakenT > 0) return { id: "shaken", label: "Shaken — resting", tone: "warn" };
  if (r.state === "fight") return { id: "fighting", label: "Engaging threat", tone: "warn" };
  const task = r.task ? TASKS[r.task] : null;
  if (task) {
    const blocked = taskStatus(s, r, task);
    if (blocked) return { id: "blocked", label: blocked, tone: "warn" };
    return { id: r.unfed >= 1 ? "hungry" : "working", label: (r.unfed >= 1 ? "Hungry — half pace · " : "") + `Working: ${task.name}`, tone: r.unfed >= 1 ? "warn" : "ok" };
  }
  if (r.role === "warrior") {
    const post = assignmentOf(r.post).name;
    const st = GUARD_STATE_LABEL[r.gs] ?? "On duty";
    const hot = r.gs === "attack" || r.gs === "pursue" || r.gs === "alert" || r.gs === "recover";
    return {
      id: hot ? "fighting" : r.gs === "patrol" ? "patrolling" : "ok",
      label: `${st} · ${post}`,
      tone: hot ? "warn" : "ok",
    };
  }
  return { id: "ok", label: "Awaiting assignment", tone: "warn" };
}

// ═══════════════════════════ UPKEEP ════════════════════════════════════════

/** Food value of a storage-resident ration (hunger points). */
const RATION_ORDER: ItemId[] = ["berry", "glowcap", "cookedmeat", "stew", "rawmeat"];
const DRINK_ORDER: ItemId[] = ["ice", "meltwater"];

export function foodPoints(s: GameState): number {
  let p = 0;
  for (const id of RATION_ORDER) p += countItem(s, id, "storage") * (ITEMS[id].use?.hunger ?? 0) * (id === "rawmeat" ? 0.5 : 1);
  return p;
}
export function drinkPoints(s: GameState): number {
  let p = 0;
  for (const id of DRINK_ORDER) p += countItem(s, id, "storage") * (ITEMS[id].use?.thirst ?? 0) * (id === "ice" ? 0.6 : 1);
  return p;
}
export function dailyFoodDemand(s: GameState): number {
  const mul = profileOf(s.difficulty).hungerMul;
  return s.settlement.residents.length * RES_BAL.foodPerDay * mul;
}
export function daysOfFood(s: GameState): number {
  const d = dailyFoodDemand(s);
  return d <= 0 ? Infinity : foodPoints(s) / d;
}

/** Eat `points` hunger from storage following RATION_ORDER. Returns true if fully fed. */
function eatFromStorage(s: GameState, points: number): boolean {
  for (const id of RATION_ORDER) {
    const value = (ITEMS[id].use?.hunger ?? 0) * (id === "rawmeat" ? 0.5 : 1);
    if (value <= 0) continue;
    while (points > 0.01 && countItem(s, id, "storage") > 0) {
      removeItem(s, id, 1, "storage");
      points -= value;
    }
    if (points <= 0.01) return true;
  }
  return points <= 0.01;
}
function drinkFromStorage(s: GameState, points: number): boolean {
  for (const id of DRINK_ORDER) {
    const value = (ITEMS[id].use?.thirst ?? 0) * (id === "ice" ? 0.6 : 1);
    if (value <= 0) continue;
    while (points > 0.01 && countItem(s, id, "storage") > 0) {
      removeItem(s, id, 1, "storage");
      points -= value;
    }
    if (points <= 0.01) return true;
  }
  return points <= 0.01;
}

/** One upkeep day: every resident eats and drinks from the Supply Cache.
 *  Missed meals never kill — they slow work, then rest the resident. */
export function settleUpkeepDay(s: GameState, silent = false, fx?: Fx) {
  const mul = profileOf(s.difficulty).hungerMul;
  let fedCount = 0;
  for (const r of s.settlement.residents) {
    const ate = eatFromStorage(s, RES_BAL.foodPerDay * mul);
    const drank = drinkFromStorage(s, RES_BAL.thirstPerDay * mul);
    if (ate && drank) { r.unfed = 0; fedCount++; }
    else r.unfed++;
  }
  if (!silent && fx) {
    const n = s.settlement.residents.length;
    if (n === 0) return;
    if (fedCount === n) {
      delete s.settlement.warned.hungerLow;
      fx.toast({ title: "Residents fed", sub: `${fedCount}/${n} ate from the Supply Cache.`, kind: "info", icon: "hunger" });
    } else {
      fx.toast({
        title: "Not enough stored food",
        sub: `${n - fedCount} resident(s) missed rations — hungry residents work half pace, then rest. Stock the Supply Cache.`,
        kind: "warn", icon: "hunger",
      });
      fx.sfx("warn");
    }
  }
  // forward warning independent of the daily line
  const days = daysOfFood(s);
  if (s.settlement.residents.length > 0 && days < 2 && !s.settlement.warned.hungerLow && fx && !silent) {
    s.settlement.warned.hungerLow = true;
    fx.toast({ title: "Rations running low", sub: days <= 0 ? "Stored food is gone." : `~${days.toFixed(1)} days of stored food left.`, kind: "warn", icon: "hunger" });
  } else if (days >= 2) delete s.settlement.warned.hungerLow;
}

// ═══════════════════════════ SIMULATION ════════════════════════════════════

const dist = (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, ay - by);

/**
 * Move a resident toward a point through world collision. If movement is
 * ordered but nothing moves (a tree, building or debris blocks the way), the
 * resident STOPS and reports a blocked path instead of grinding forever.
 * Returns true when the point is reached.
 */
export function moveResident(g: Game, r: Resident, tx: number, ty: number, speed: number, dt: number): boolean {
  const s = g.state;
  const d = dist(r.x, r.y, tx, ty);
  if (d <= 14) { r.stuckT = 0; return true; }
  const ux = (tx - r.x) / d, uy = (ty - r.y) / d;
  const before = { x: r.x, y: r.y };
  const pos = collideAt(s, r.x + ux * speed * dt, r.y + uy * speed * dt, 11);
  const moved = dist(before.x, before.y, pos.x, pos.y);
  r.x = pos.x; r.y = pos.y;
  r.face = Math.atan2(uy, ux);
  r.walkPh += moved * 0.09;
  if (moved < speed * dt * 0.25) r.stuckT += dt; else r.stuckT = 0;
  return false;
}

/** Shared hostility test (also used by the worker scatter check). */
export const isHostileBeast = (e: Enemy) => !e.dead && e.hp > 0 && e.state !== "hidden" && e.kind !== "hare";

/** Apply damage to a resident. Residents never die: at the floor they are
 *  downed and recover slowly, always treatable, never silently removed. */
export function hurtResident(g: Game, r: Resident, dmg: number, source: string) {
  r.hp = Math.max(1, r.hp - dmg);
  r.hurtT = 0.5;
  g.fx.float(r.x, r.y - 40, `-${Math.round(dmg)}`, "#ff8a70");
  // Anyone being hurt is an alarm: nearby guards hear it and respond. This is
  // how a worker under attack gets defended without global enemy awareness.
  raiseAlarm(g.state, r.x, r.y, `${r.name} is under attack`);
  if (r.hp / r.maxHp <= RES_BAL.retreatAt && !r.injured) {
    r.injured = true;
    r.state = "flee";
    g.fx.toast({ title: `${r.name} is wounded`, sub: `${source}. Retreating to camp — recovery is automatic, treatment is faster.`, kind: "warn", icon: "heart" });
    g.fx.sfx("warn");
  }
  if (r.hp <= 1.001) {
    r.downed = true;
    r.state = "flee";
    g.fx.toast({ title: `${r.name} is down!`, sub: "They crawl back to camp. Treat with a Medkit or Salve — nobody dies, but they cannot work until stable.", kind: "error", icon: "heart" });
  }
}

function updateWorker(g: Game, r: Resident, dt: number) {
  const s = g.state;
  const i = s.settlement.residents.indexOf(r);
  const home = homeAnchor(s, i);

  // predators at camp scatter workers
  if (!r.injured && !r.downed) {
    for (const e of s.enemies) {
      if (!isHostileBeast(e) || !e.alerted) continue;
      if (dist(r.x, r.y, e.x, e.y) < ENEMY[e.kind].attackR + 34 && r.clashCd <= 0) {
        r.clashCd = RES_BAL.clashCd;
        hurtResident(g, r, Math.max(2, Math.round(ENEMY[e.kind].dmg * RES_BAL.clashMul * profileOf(s.difficulty).enemyDmgMul)), ENEMY[e.kind].name);
        r.state = "flee";
        break;
      }
    }
  }
  if (r.state === "flee" && !r.injured && !r.downed) {
    // shaken residents head home and take a breath
    if (moveResident(g, r, home.x, home.y, RES_BAL.workerSpeed * 1.15, dt)) {
      r.state = "rest";
      r.shakenT = Math.max(r.shakenT, 25);
    }
    return;
  }

  const task = r.task ? TASKS[r.task] : null;
  const blocked = task ? taskStatus(s, r, task) : null;

  if (!task || blocked) {
    r.state = moveResident(g, r, home.x, home.y, RES_BAL.workerSpeed * 0.5, dt) ? "rest" : "go";
    if (r.state === "rest") r.face += dt * 0.2;
    return;
  }

  // at the post → work; else walk there
  if (!moveResident(g, r, task.post.x, task.post.y, RES_BAL.workerSpeed * (r.unfed >= 1 ? 0.8 : 1), dt)) {
    r.state = "go";
    return;
  }
  r.state = "work";

  let speed = r.unfed >= 1 ? RES_BAL.hungrySpeedMul : 1;
  if (r.bonusTask === task.id) speed *= r.bonusMul ?? 1;
  advanceProduction(g, r, task, dt * speed, false);
}

/** Advance one production cycle. Shared verbatim by the live tick and the
 *  offline catch-up, so both paths honour identical rules. Returns units made. */
function advanceProduction(g: Game | null, r: Resident, task: TaskDef, dt: number, offline: boolean): number {
  const s = (g as { state: GameState } | null)?.state ?? offlineState!;
  const set = s.settlement;
  let made = 0;
  r.workT += dt;
  const guard = offline ? RES_BAL.offlineUnitsPerTask : 4;
  while (r.workT >= task.time && made < guard) {
    // inputs from storage only
    if (task.input) {
      let ok = true;
      for (const [id, n] of Object.entries(task.input) as [ItemId, number][]) {
        if (countItem(s, id, "storage") < n) { ok = false; break; }
      }
      if (!ok) break;
    }
    if (task.stock && set.stock[task.id] <= 0) break;
    if (task.output && addItemRoom(s, task.output.item) < task.output.n) break;
    if (task.id === "stoke" && s.shelter.fire.fuel >= BAL.fire.fuelMax) break;

    if (task.input) for (const [id, n] of Object.entries(task.input) as [ItemId, number][]) removeItem(s, id, n, "storage");
    if (task.stock) set.stock[task.id] = Math.max(0, set.stock[task.id] - 1);

    if (task.id === "stoke") {
      s.shelter.fire.fuel = Math.min(BAL.fire.fuelMax, s.shelter.fire.fuel + 40);
      if (s.shelter.fire.built && s.shelter.fire.fuel > 0) s.shelter.fire.lit = true;
      if (!offline && g) g.fx.float(r.x, r.y - 34, "+Fuel", "#ffb063");
    } else if (task.output) {
      addItem(s, task.output.item, task.output.n, "storage");
      set.produced[task.output.item] = (set.produced[task.output.item] ?? 0) + task.output.n;
      if (!offline && g) {
        g.fx.float(r.x, r.y - 34, `+${task.output.n} ${ITEMS[task.output.item].name}`, ITEMS[task.output.item].color);
        if (Math.random() < 0.35) g.fx.sfx("gather");
      }
    }
    r.workT -= task.time;
    made++;
  }
  // a fully-blocked cycle must not bank infinite progress
  if (r.workT > task.time) r.workT = task.time;
  return made;
}

// scratch reference used by offline production (engine-free call path)
let offlineState: GameState | null = null;

/** Main settlement tick — called from the engine frame while actively playing. */
export function tickSettlement(g: Game, dt: number) {
  const s = g.state;
  const set = s.settlement;
  if (set.residents.length === 0) { set.callCd = Math.max(0, set.callCd - dt); return; }

  // beacon cooldown runs on game time
  set.callCd = Math.max(0, set.callCd - dt);

  // camp alarm decays; it is a transient signal, never a saved state
  if (set.alarm) {
    set.alarm.t -= dt;
    if (set.alarm.t <= 0) set.alarm = null;
  }

  // camp-stock regrowth
  for (const id of Object.keys(TASKS) as TaskId[]) {
    const t = TASKS[id];
    if (!t.stock) continue;
    if (set.stock[id] < t.stock.max) {
      set.stockT[id] += dt;
      if (set.stockT[id] >= t.stock.regrow) { set.stockT[id] = 0; set.stock[id]++; }
    } else set.stockT[id] = 0;
  }

  // daily upkeep — once per in-game day boundary
  const day = Math.floor(s.time / BAL.dayLength);
  if (day !== set.lastFeedDay) {
    set.lastFeedDay = day;
    settleUpkeepDay(s, false, g.fx);
  }

  const inForest = s.region === "forest";
  const medicActive = set.residents.some(r => r.id === "rescue_sv_station" && !r.downed);

  set.residents.forEach((r, idx) => {
    r.atkCd = Math.max(0, r.atkCd - dt);
    r.clashCd = Math.max(0, r.clashCd - dt);
    r.hurtT = Math.max(0, r.hurtT - dt);
    r.shakenT = Math.max(0, r.shakenT - dt);

    // recovery never stops, on-screen or off
    if (r.hp < r.maxHp) {
      const resting = r.injured || r.downed || r.state === "rest" || r.paused;
      if (resting) {
        r.hp = Math.min(r.maxHp, r.hp + RES_BAL.regen * (medicActive ? 2 : 1) * dt);
        if (r.downed && r.hp >= r.maxHp * 0.25) r.downed = false;
        if (r.injured && r.hp >= r.maxHp * RES_BAL.retreatAt) {
          r.injured = false;
          g.fx.toast({ title: `${r.name} is back on their feet`, sub: "Ready for assignment.", kind: "good", icon: "heart" });
        }
      }
    }

    if (!inForest) {
      // Away from home the camp keeps working — time-accurate production,
      // without running the visual walk/combat sim for an off-screen region.
      if (r.role === "worker" && r.task && !r.paused && !r.injured && !r.downed && r.unfed < 2 && r.shakenT <= 0) {
        const task = TASKS[r.task];
        if (!taskStatus(s, r, task)) {
          let speed = r.unfed >= 1 ? RES_BAL.hungrySpeedMul : 1;
          if (r.bonusTask === task.id) speed *= r.bonusMul ?? 1;
          offlineState = s;
          advanceProduction(null, r, task, dt * speed, false);
          offlineState = null;
        }
      }
      return;
    }

    // A paused resident is stood down: no AI, no combat, no production. They
    // walk home and wait. Resuming re-enters through a valid state, so pausing
    // and resuming can never double-run or duplicate an AI update.
    if (r.paused) {
      const home = homeAnchor(s, idx);
      r.state = moveResident(g, r, home.x, home.y, RES_BAL.workerSpeed * 0.55, dt) ? "rest" : "go";
      if (r.role === "warrior") { r.gs = "idle"; r.targetId = null; r.swingT = 0; r.hitDone = false; }
      return;
    }

    if (r.role === "warrior") {
      // The guard FSM owns its own stuck handling, retreat and injury states.
      r.state = r.gs === "attack" || r.gs === "pursue" || r.gs === "recover" ? "fight"
        : r.gs === "retreat" ? "flee"
        : r.gs === "injured" || r.gs === "idle" ? "rest"
        : "work";
      updateGuard(g, r, dt, idx);
      return;
    }

    // ── workers ──
    // Blocked path: stop and report instead of grinding into the obstacle.
    if (r.stuckT > RES_BAL.pathBlockedAt) {
      r.stuckT += dt;
      if (r.stuckT > 6) r.stuckT = 0;   // retry the route periodically
      return;
    }
    if (r.downed || (r.injured && r.hp < r.maxHp)) {
      const home = homeAnchor(s, idx);
      r.state = moveResident(g, r, home.x, home.y, RES_BAL.workerSpeed * 0.55, dt) ? "rest" : "go";
      return;
    }
    updateWorker(g, r, dt);
  });

  // Keep friendlies from stacking into one tile or plugging the gate mouth.
  separateResidents(s, dt);
}

// ═══════════════════════════ OFFLINE CATCH-UP ══════════════════════════════

/**
 * Deterministic offline progress. Runs ONCE at load, from saved elapsed wall-
 * clock seconds — not a background simulation; reloading repeatedly cannot
 * duplicate anything because lastWall is persisted with each save.
 */
export function applyOfflineSettlement(s: GameState, fx?: Fx) {
  const set = s.settlement;
  const now = Date.now();
  let elapsed = Math.floor((now - (set.lastWall || now)) / 1000);
  if (!Number.isFinite(elapsed) || elapsed < 0) elapsed = 0;   // clock rollback
  elapsed = Math.min(elapsed, RES_BAL.offlineCapSec);          // hard ceiling
  set.lastWall = now;
  if (set.residents.length === 0 || elapsed < 45) return;

  // upkeep: at most N missed days, so long absences never gut the camp
  const missedDays = Math.min(RES_BAL.offlineFeedDays, Math.floor(elapsed / BAL.dayLength));
  for (let d = 0; d < missedDays; d++) settleUpkeepDay(s, true);

  // stock regrowth over the gap
  for (const id of Object.keys(TASKS) as TaskId[]) {
    const t = TASKS[id];
    if (!t.stock) continue;
    set.stock[id] = Math.min(t.stock.max, set.stock[id] + Math.floor(elapsed / t.stock.regrow));
  }

  // recovery ticks (compressed, capped)
  for (const r of set.residents) {
    const medic = set.residents.some(o => o.id === "rescue_sv_station" && !o.downed);
    if (r.injured || r.downed || r.hp < r.maxHp) {
      r.hp = Math.min(r.maxHp, r.hp + RES_BAL.regen * (medic ? 2 : 1) * Math.min(elapsed, 3600));
      if (r.downed && r.hp >= r.maxHp * 0.25) r.downed = false;
      if (r.injured && r.hp >= r.maxHp * RES_BAL.retreatAt) r.injured = false;
    }
    r.shakenT = 0;
    r.state = "rest";
  }

  // production: the same unit-completion loop as live play
  const before = { ...set.produced };
  for (const r of set.residents) {
    if (r.role !== "worker" || !r.task || r.paused || r.injured || r.downed || r.unfed >= 2) continue;
    const task = TASKS[r.task];
    if (taskStatus(s, r, task)) { r.workT = 0; continue; }
    let speed = r.unfed >= 1 ? RES_BAL.hungrySpeedMul : 1;
    if (r.bonusTask === task.id) speed *= r.bonusMul ?? 1;
    offlineState = s;
    advanceProduction(null, r, task, elapsed * speed, true);
    offlineState = null;
  }
  set.lastFeedDay = Math.floor(s.time / BAL.dayLength);

  if (fx) {
    const gained = (Object.keys(set.produced) as ItemId[])
      .map(id => ({ id, n: set.produced[id] - (before[id] ?? 0) }))
      .filter(g => g.n > 0);
    const unfed = set.residents.filter(r => r.unfed > 0).length;
    if (gained.length > 0 || missedDays > 0) {
      fx.toast({
        title: "While you were away",
        sub: (gained.length ? gained.map(g => `+${g.n} ${ITEMS[g.id].name}`).join(" · ") : "The camp held position.")
          + (unfed ? ` ${unfed} resident(s) ran out of rations.` : ""),
        kind: gained.length ? "good" : "info", icon: "residents",
      });
    }
  }
}

// ═══════════════════════════ SAVE (DE)SERIALISATION ════════════════════════

export function serializeSettlement(st: SettlementState): SettlementSave {
  st.lastWall = Date.now();
  return {
    ...st,
    // The alarm is a live signal, not progress: it is never written to disk.
    alarm: null,
    // Durable resident record. Transient combat fields (swing timer, hit
    // latch, current target, cooldowns) are written but deliberately reset by
    // sanitizeSettlement/resetGuardRuntime on load.
    residents: st.residents.map(r => ({ ...r, gear: { ...r.gear } })),
    stock: { ...st.stock },
    stockT: { ...st.stockT },
    produced: { ...st.produced },
    warned: { ...st.warned },
  };
}

/** Rebuild settlement state from save data — invalid entries are dropped,
 *  never silently half-restored. Residents always keep identity + health. */
export function sanitizeSettlement(raw: unknown): SettlementState {
  const base = createSettlement();
  if (!raw || typeof raw !== "object") return base;
  const d = raw as Partial<SettlementSave>;
  base.rosterIdx = clampInt(d.rosterIdx, 0, ROSTER.length);
  base.callCd = clampNum(d.callCd, 0, RES_BAL.callCooldown);
  base.lastFeedDay = Math.floor(clampNum(d.lastFeedDay, 0, 1e9));
  base.lastWall = typeof d.lastWall === "number" && isFinite(d.lastWall) ? d.lastWall : Date.now();
  if (d.produced && typeof d.produced === "object") {
    for (const [k, v] of Object.entries(d.produced)) {
      if (Object.prototype.hasOwnProperty.call(ITEMS, k) && typeof v === "number" && v > 0 && isFinite(v)) {
        base.produced[k] = Math.min(99999, Math.floor(v));
      }
    }
  }
  for (const id of Object.keys(TASKS) as TaskId[]) {
    const max = TASKS[id].stock?.max ?? 0;
    base.stock[id] = clampNum(d.stock?.[id], 0, max);
    base.stockT[id] = clampNum(d.stockT?.[id], 0, TASKS[id].stock?.regrow ?? 1);
  }
  if (Array.isArray(d.residents)) {
    for (const rr of d.residents.slice(0, 12)) {
      if (!rr || typeof rr.id !== "string" || typeof rr.name !== "string") continue;
      const role: ResidentRole = rr.role === "warrior" ? "warrior" : "worker";
      const spec: WarriorSpec | undefined = role === "warrior" ? (rr.spec === "scout" ? "scout" : "guard") : undefined;
      const maxHp = clampNum(rr.maxHp,
        role === "warrior" ? 40 : 40,
        role === "warrior" ? 200 : 120) || (role === "warrior" ? (spec === "guard" ? RES_BAL.guard.hp : RES_BAL.scout.hp) : 70);
      const task = rr.task && Object.prototype.hasOwnProperty.call(TASKS, rr.task) ? (rr.task as TaskId) : null;
      base.residents.push({
        id: rr.id.slice(0, 24), name: rr.name.slice(0, 32),
        title: typeof rr.title === "string" ? rr.title.slice(0, 32) : "Survivor",
        role, spec, task,
        // Phase 6.2 post ids ("camp"/"perimeter") map onto 6.3 assignments.
        post: sanitizePost(rr.post, role, spec),
        // Durable guard fields only — transient combat state is rebuilt below.
        gs: "return", gsT: 0,
        priority: rr.priority === "protect" || rr.priority === "hold" ? rr.priority : "balanced",
        gear: {
          weapon: isGuardItem(rr.gear?.weapon, "weapon") ? rr.gear!.weapon! : null,
          armor: isGuardItem(rr.gear?.armor, "armor") ? rr.gear!.armor! : null,
        },
        swingT: 0, hitDone: false,
        alertT: 0, lostT: 0, scanT: 0,
        kills: clampInt(rr.kills, 0, 99999),
        trait: typeof rr.trait === "string" ? rr.trait.slice(0, 32) : "Steady",
        traitDesc: typeof rr.traitDesc === "string" ? rr.traitDesc.slice(0, 80) : "",
        bonusTask: rr.bonusTask && Object.prototype.hasOwnProperty.call(TASKS, rr.bonusTask) ? rr.bonusTask : undefined,
        bonusMul: typeof rr.bonusMul === "number" && isFinite(rr.bonusMul) ? Math.min(2, Math.max(0.5, rr.bonusMul)) : undefined,
        hp: clampNum(rr.hp, 1, maxHp), maxHp,
        injured: !!rr.injured, downed: !!rr.downed,
        unfed: clampInt(rr.unfed, 0, 9), paused: !!rr.paused,
        shakenT: clampNum(rr.shakenT, 0, 60),
        x: clampNum(rr.x, WORLD.minX + 60, WORLD.maxX - 60),
        y: clampNum(rr.y, WORLD.minY + 60, WORLD.maxY - 60),
        face: clampNum(rr.face, -Math.PI * 2, Math.PI * 2),
        walkPh: 0,
        state: "rest",
        workT: clampNum(rr.workT, 0, task ? TASKS[task].time : 0),
        atkCd: 0, clashCd: 0, hurtT: 0,
        targetId: null, stuckT: 0, wpi: clampInt(rr.wpi, 0, 5),
      });
    }
  }
  // Normalise every restored guard: no transient attack/animation state is
  // ever resurrected, and each resumes in a valid state heading to its post.
  for (const r of base.residents) if (r.role === "warrior") resetGuardRuntime(r);
  return base;
}

/** Restore a defensive assignment, migrating Phase 6.2 ids and rejecting
 *  anything unknown so a corrupt post can never strand a guard. */
function sanitizePost(raw: unknown, role: ResidentRole, spec?: WarriorSpec): string {
  if (role !== "warrior") return "rally";
  const legacy: Record<string, string> = { camp: "shelter", perimeter: "patrol_outer", gate: "gate" };
  const id = typeof raw === "string" ? (legacy[raw] ?? raw) : "";
  if (Object.prototype.hasOwnProperty.call(ASSIGNMENTS, id)) return id;
  return spec === "scout" ? "patrol_outer" : "gate";
}

/** Only real, equippable guard items survive a load. */
function isGuardItem(raw: unknown, slot: "weapon" | "armor"): raw is ItemId {
  if (typeof raw !== "string" || !Object.prototype.hasOwnProperty.call(ITEMS, raw)) return false;
  return slot === "weapon"
    ? Object.prototype.hasOwnProperty.call(GUARD_WEAPONS, raw)
    : Object.prototype.hasOwnProperty.call(GUARD_ARMOR, raw);
}

function clampNum(v: unknown, lo: number, hi: number): number {
  return typeof v === "number" && isFinite(v) ? Math.min(hi, Math.max(lo, v)) : lo;
}
function clampInt(v: unknown, lo: number, hi: number): number {
  return Math.floor(clampNum(v, lo, hi));
}
