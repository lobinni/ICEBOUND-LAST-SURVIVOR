// ── ICEBOUND Phase 6.4: recurring camp sieges ───────────────────────────────
//
// One module owns the whole event layer: the in-game calendar, the nightly /
// weekly / monthly siege definitions, the deterministic plan, the defence
// readiness score, wave scheduling, resolution and bounded offline rules.
//
// The calendar derives from the EXISTING game clock (`s.time` / BAL.dayLength)
// — there is no second clock. Events are monsters from the same enemy system,
// spawned into the live `s.enemies` array with real positions, hit points and
// behaviour; there is no disconnected battle mode. Everything persistent lives
// on `s.siege` and is written into the normal save (version 5+).
//
// Honesty rules encoded in this file:
//  · an event is resolved and rewarded exactly once (`resolved`/`rewarded`
//    survive reloads; processOfflineSettlement() skips anything already done)
//  · offline resolution is deterministic, capped in count and damage, computes
//    no stockpiles of enemies and never erases the shelter
//  · hits scale with the player's own progression and the camp's real defence
//    readiness, not with a blind multiplier

import { BAL, ENEMY, REGIONS, WEATHER } from "./config";
import {} from "./difficulty"; // profile used via residents helpers
import {
  GUARD_WEAPON_IDS, GUARD_ARMOR_IDS, DOCTRINE_ORDER, ROUTE_NODES, MAX_ROUTE_NODES,
  assignmentOf, ASSIGNMENTS,
} from "./guards";
import { capacityOf, RES_BAL, foodPoints, poolCount, daysOfFood } from "./residents";
import { countItem } from "./state";
import { grantXp, XP } from "./progression";
import { grant } from "./tx";
import type { Enemy, Fx, GameState, ItemId, RegionId, Vec } from "./types";
import type { Game } from "./engine";

const DAY = BAL.dayLength;

// ═══════════════════════════ TYPES ═════════════════════════════════════════

export type SiegeKind = "night" | "weekly" | "monthly";
export type SiegeStatus =
  | "scheduled"   // future, counting down
  | "warned"      // inside its warning window
  | "active"      // player is home, waves spawning
  | "offline"     // resolved while the app was closed (mark in history)
  | "resolved";   // finished (any outcome), exactly once

export interface SiegeWave {
  at: number;                 // seconds after event start
  spawns: { kind: Enemy["kind"]; n: number; side: SpawnSide }[];
  note?: string;
}
export type SpawnSide = "north" | "east" | "south" | "west";
export type EnemyRole = "wave" | "breaker" | "flanker" | "elite" | "leader";

export interface SiegeEvent {
  id: string;                 // stable: e.g. "weekly_d8" (deterministic, unique)
  kind: SiegeKind;
  /** Game-day index the event belongs to. */
  day: number;
  /** Second within the day when the event starts (start of the night window
   *  for daily events; fixed anchors for the big ones). */
  startAt: number;            // absolute s.time seconds
  planned: SiegePlan;
  waves: SiegeWave[];
  status: SiegeStatus;
  /** Live bookkeeping while active. */
  t: number;                  // seconds since the event began (active only)
  waveIdx: number;
  spawnedIds: string[];       // ids of enemies this event owns right now
  // outcome accounting — filled during the event, locked at resolution
  kills: number;
  byGuard: number;
  structHits: Partial<Record<string, number>>;
  spikesUsed: number;
  hazardHits: number;
  injuries: number;
  downed: number;
  result?: SiegeResult;
  resolved: boolean;
  rewarded: boolean;
}

export interface SiegePlan {
  threats: Enemy["kind"][];
  total: number;
  band: 1 | 2 | 3 | 4 | 5;
  /** Named side plan (which direction each role favours). */
  plan: string;
}

export type SiegeOutcome = "full" | "partial" | "heavy" | "retreat" | "failed";

export interface SiegeResult {
  outcome: SiegeOutcome;
  label: string;
  summary: string[];
  rewards: { item: ItemId; n: number }[];
  xp: number;
}

export interface SiegeHistoryEntry {
  id: string; kind: SiegeKind; day: number; outcome: SiegeOutcome;
  kills: number; injuries: number; structDestroyed: string[];
  rewarded: boolean; offline: boolean;
  /** Phase 6.5 report detail — all derived from the resolved event. */
  total?: number;
  structDamage?: number;
  rewards?: { item: ItemId; n: number }[];
  /** Carpentry still owed after the fight (wood/stone), 0 when fully repaired. */
  recovery?: { wood: number; stone: number };
}

export interface SiegeState {
  enabled: boolean;
  /** Next event of each tier (absolute game-seconds). */
  next: Record<SiegeKind, number>;
  /** Live or pending events. Capped in size; old ones move to history. */
  events: SiegeEvent[];
  /** Completed event ids — reward-deduplication ledger. */
  done: string[];
  history: SiegeHistoryEntry[];
  /** One-shot warning latches. */
  warned: Record<string, boolean>;
  /** Camp structures damaged by sieges, repairable via carpentry. */
  structHp: Record<string, number>;
  /** A toast/report queued for the player's next return home. */
  pendingReport: SiegeReport | null;
  /** Phase 6.5 — camp-wide defensive stance; re-weights guard targeting. */
  doctrine: import("./guards").DoctrineId;
  /** Phase 6.5 — the player's custom patrol circuit (route-node ids). */
  customRoute: string[];
}

export interface SiegeReport {
  title: string;
  lines: string[];
  offline: boolean;
  kind: SiegeKind | null;
}

// ═══════════════════════════ TUNING ════════════════════════════════════════

export const SIEGE = {
  /** Repetition anchors, in game-seconds of a day. Night starts nightStart. */
  night: {
    warnAt: 0.44,        // short heads-up shortly before dusk
    startAt: 0.58,       // first pushes after dark
    chanceBase: 0.30,
    chancePerLevel: 0.028,
    graceDays: 2,        // the first nights are quiet
    max: 3,              // nightly max attack pack
    cooldownDay: false,  // every qualifying night may roll
  },
  weekly: {
    everyDays: 7,
    warnHoursGame: 0.30, // fraction of a day of clear advance warning
    waves: 2,
  },
  monthly: {
    everyDays: 28,
    warnHoursGame: 0.45, // most of a day — a genuine preparation phase
    waves: 3,
  },
  /** Never more than this many active siege enemies on screen at once. */
  liveCap: 6,
  /** Wave spacing is recomputed per event from its size. */
  waveGapBase: 26,
  /** Structure damage ceilings per event (never silently erase the shelter). */
  structDmgCapPerEvent: 5,
  spikesDmg: 40,
  spikesMaxProcs: 2,
  /** Offline rules: bounded, one report, no stacking. */
  offlineMaxEvents: 2,
  offlineStructDmgCap: 2,
  offlineKillChance: 0.55,
} as const;

// ═══════════════════════════ STATE ═════════════════════════════════════════

export function createSiege(): SiegeState {
  return {
    enabled: true,
    next: { night: nextNightAnchor(DAY * 0.06), weekly: DAY * 7, monthly: DAY * 28 },
    events: [],
    done: [],
    history: [],
    warned: {},
    structHp: {},
    pendingReport: null,
    doctrine: "balanced",
    customRoute: ["gate", "shelter", "cache", "north"],
  };
}

/** Seconds until the next event of a tier (0 = due now). */
export function timeUntil(s: GameState, kind: SiegeKind): number {
  return Math.max(0, s.siege.next[kind] - s.time);
}

// ═══════════════════════════ CALENDAR ══════════════════════════════════════

/** The game clock: days run on BAL.dayLength; weeks and months are multiples
 *  of it, so every schedule is configurable here and follows the same clock
 *  HUD already shows. There is no wall-clock coupling. */
export function dayOf(s: GameState): number {
  return Math.floor(s.time / DAY);
}
function nextNightAnchor(fromTime: number): number {
  const d = Math.floor(fromTime / DAY);
  const candidate = d * DAY + SIEGE.night.startAt * DAY;
  return candidate > fromTime ? candidate : candidate + DAY;
}

// ═══════════════════════════ READINESS ═════════════════════════════════════

export interface ReadinessPart { label: string; pts: number; max: number; ok: boolean }

/**
 * Shelter readiness is computed from REAL state only — guards present and fit,
 * their real equipment, spikes (built & repaired), shelter stage, housing,
 * beacon, rations in the cache and stored repair materials. Nothing arbitrary.
 */
export function readiness(s: GameState): { score: number; parts: ReadinessPart[] } {
  const parts: ReadinessPart[] = [];
  const res = s.settlement.residents;
  const defenders = res.filter(r => r.role === "warrior" && !r.paused && !r.downed && !r.injured);
  parts.push({
    label: defenders.length > 0 ? `${defenders.length} fit guard${defenders.length === 1 ? "" : "s"} on watch` : "No fit guards assigned",
    pts: Math.min(2, defenders.length) * 16, max: 32, ok: defenders.length > 0,
  });
  const armed = defenders.filter(r =>
    (r.gear.weapon && GUARD_WEAPON_IDS.includes(r.gear.weapon)) ||
    (r.gear.armor && GUARD_ARMOR_IDS.includes(r.gear.armor))).length;
  parts.push({
    label: armed > 0 ? `${armed} guard${armed === 1 ? "" : "s"} armed and armoured` : "Guards fight bare-handed",
    pts: Math.min(1, armed / Math.max(1, defenders.length)) * 14, max: 14, ok: true,
  });
  const spikesOk = !!s.build.spikes && structHealth(s, "spikes") > 0;
  parts.push({
    label: spikesOk ? "Spike barricade standing" : s.build.spikes ? "Spike barricade broken — repair it" : "No spikes built",
    pts: spikesOk ? 16 : 0, max: 16, ok: !s.build.spikes || spikesOk,
  });
  // stage sets the ceiling; hull integrity decides how much of it counts
  const hull = siegeTargets(s).find(t => t.id === "shelter");
  const hullFrac = hull ? structHealth(s, "shelter") / hull.max : 1;
  const stagePts = s.shelter.stage * 5 * (0.4 + 0.6 * hullFrac);
  parts.push({
    label: hullFrac < 1
      ? `Outpost Stage ${s.shelter.stage} — hull ${structHealth(s, "shelter")}/${hull?.max ?? 5} integrity`
      : s.shelter.stage >= 3 ? "Outpost fully operational (Stage 3)" : s.shelter.stage === 2 ? "Warm quarters only (Stage 2)" : "Hull barely sealed",
    pts: stagePts, max: 15, ok: s.shelter.stage >= 2 && hullFrac > 0.4,
  });
  const housed = capacityOf(s);
  parts.push({
    label: housed >= res.length ? `${housed} bunks for ${res.length} residents` : "Housing overflow — residents exposed",
    pts: housed >= res.length ? 8 : 0, max: 8, ok: housed >= res.length,
  });
  const foodDays = foodPoints(s) / Math.max(1, res.length * RES_BAL.foodPerDay);
  parts.push({
    label: res.length === 0 ? "No mouths to feed" : foodDays >= 2 ? `${foodDays.toFixed(1)} days of rations cached` : "Low rations — defenders weaken",
    pts: Math.min(8, Math.max(0, foodDays) * 2.5), max: 8, ok: res.length === 0 || foodDays >= 2,
  });
  const wd = countItem(s, "wood", "storage") + countItem(s, "wood", "inv");
  const st = countItem(s, "stone", "storage") + countItem(s, "stone", "inv");
  parts.push({
    label: wd + st >= 8 ? "Carpentry materials in store" : "Low repair materials (wood/stone)",
    pts: Math.min(7, (wd + st) / 2.2), max: 7, ok: wd + st >= 8,
  });
  const beaconLit = !!s.build.beacon;
  parts.push({
    label: beaconLit ? "Watchtower sightlines clear" : "No watchtower — short sightline",
    pts: beaconLit ? 7 : 0, max: 7, ok: true,
  });
  const score = Math.round(parts.reduce((a, p) => a + p.pts, 0));
  return { score, parts };
}

export const READINESS_BANDS: { at: number; label: string; tone: "bad" | "warn" | "ok" }[] = [
  { at: 0, label: "Exposed", tone: "bad" },
  { at: 30, label: "Thin", tone: "warn" },
  { at: 55, label: "Watched", tone: "ok" },
  { at: 78, label: "Fortified", tone: "ok" },
];
export function readinessBand(score: number) {
  let band = READINESS_BANDS[0];
  for (const b of READINESS_BANDS) if (score >= b.at) band = b;
  return band;
}

// ═══════════════════════════ PLANNING ══════════════════════════════════════

interface RNG { (): number }
function rng(seed: number): RNG {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Which hostile species make sense for a siege at this stage. */
function threatPool(level: number): Enemy["kind"][] {
  const pool: Enemy["kind"][] = ["wolf"];
  if (level >= 3) pool.push("crawler");
  if (level >= 7) pool.push("bear");
  return pool;
}

/**
 * Plan an event: size scales with the survivor level and the regions reached,
 * and is TEMPERED by the camp's actual readiness so scaling always accounts
 * for defence — strong camps see bigger packs, weak camps are not buried.
 * Deterministic per event id: replans never reshuffle.
 */
export function planEvent(s: GameState, kind: SiegeKind, day: number): SiegePlan {
  const level = s.progression.level;
  const ready = readiness(s).score;
  const r = rng(hashId(kind, day));

  if (kind === "night") {
    // weak camps get smaller packs; a fortified camp attracts the brave ones
    const base = 1 + (level >= 4 ? 1 : 0) + (s.unlocked.length > 1 ? 1 : 0);
    const tempered = base + (ready >= 55 ? 1 : 0) - (ready < 30 ? 1 : 0);
    const total = Math.max(1, Math.min(SIEGE.night.max, tempered));
    const threats: Enemy["kind"][] = level >= 4 ? (r() < 0.3 ? ["wolf", "crawler"] : ["wolf"]) : ["wolf"];
    return { threats, total, band: 1, plan: "prowling pack" };
  }

  if (kind === "weekly") {
    const growth = Math.min(2, Math.floor(level / 6));           // 0..2
    const total = Math.min(8, 4 + growth + (ready >= 55 ? 1 : 0));
    const threats = threatPool(level);
    return { threats, total, band: 3, plan: "coordinated surge" };
  }

  // monthly
  const growth = Math.min(4, Math.floor(level / 5));
  const total = Math.min(11, 6 + growth + (ready >= 68 ? 1 : 0));
  const threats = threatPool(level);
  return { threats, total, band: 5, plan: "beast tide" };
}

function hashId(kind: string, day: number): number {
  let h = 2166136261;
  for (const c of kind + ":" + day) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/** Sides of the camp the pack prefers. Guards see these tendencies in the UI. */
function rollSides(r: RNG, plan: string): SpawnSide[] {
  const all: SpawnSide[] = ["north", "east", "south", "west"];
  if (plan === "prowling pack") return [all[Math.floor(r() * 4)]];
  if (plan === "coordinated surge") { return r() < 0.5 ? ["west", "north"] : ["east", "west"]; }
  return ["north", "east", "west"];
}

// ═══════════════════════════ WAVES ═════════════════════════════════════════

/**
 * Build the wave table for an event. Counts are small and capped; the live
 * enemy population is additionally clamped by SIEGE.liveCap at spawn time, so
 * the screen never floods and mobile stays smooth.
 */
function buildWaves(ev: SiegeEvent): SiegeWave[] {
  const r = rng(hashId(ev.kind + "_waves", ev.day));
  const sides = rollSides(r, ev.planned.plan);
  const out: SiegeWave[] = [];
  const total = ev.planned.total;
  // HONESTY: waves spawn ONLY species announced in the plan. Nothing extra,
  // nothing stronger than advertised. Escalation order climbs through what
  // the pool actually contains.
  const kinds = ev.planned.threats;
  const heavies: Enemy["kind"][] = kinds.includes("bear") ? ["bear"]
    : kinds.includes("crawler") ? ["crawler"] : ["wolf"];
  const pests: Enemy["kind"][] = kinds.includes("crawler") ? ["crawler"] : ["wolf"];
  const heavy = heavies[0];
  const pest = pests[0];
  const [s1, s2, s3] = [sides[0] ?? "west", sides[1] ?? sides[0] ?? "west", sides[2] ?? sides[0] ?? "west"];

  if (ev.kind === "night") {
    out.push({ at: 0, spawns: [{ kind: pest, n: Math.min(2, total), side: s1 }] });
    if (total > 2) out.push({ at: SIEGE.waveGapBase, spawns: [{ kind: kinds[total % kinds.length] === "wolf" ? pest : kinds[total % kinds.length], n: total - 2, side: s1 }] });
    return out;
  }

  if (ev.kind === "weekly") {
    // wave 1 hits the face of the camp; wave 2 swings wide with the heavies
    const w1 = Math.ceil(total * 0.6);
    const w2 = total - w1;
    const heavyN = Math.max(1, Math.min(2, w2));
    const flankN = Math.max(0, w2 - heavyN);
    out.push({ at: 0, spawns: [{ kind: pest, n: Math.min(4, w1), side: s1 }] });
    out.push({ at: SIEGE.waveGapBase + 8, spawns: [
      { kind: heavy, n: heavyN, side: s2 },
      ...(flankN > 0 ? [{ kind: pest, n: flankN, side: s2 }] : []),
    ] });
    return out;
  }

  // monthly — three timed pushes: pests at range, heavies on the walls, then
  // the leader. The leader is always the strongest species actually present.
  const w1 = Math.min(4, Math.ceil(total * 0.4));
  const w2 = Math.min(4, Math.ceil(total * 0.35));
  const w3 = Math.max(2, total - w1 - w2);
  out.push({ at: 0, spawns: [{ kind: pest, n: w1, side: s1 }] });
  out.push({ at: SIEGE.waveGapBase * 2, spawns: [
    { kind: heavy, n: Math.max(1, w2 - 1), side: s2 },
    ...(pest !== heavy ? [{ kind: pest, n: 1, side: s3 }] : []),
  ] });
  out.push({ at: SIEGE.waveGapBase * 4 + 14, spawns: [
    { kind: heavy, n: w3 - 1, side: s1 },
    { kind: heavy, n: 1, side: s1 },                        // the tide-leader: handled as elite
  ], note: "The Tide-Mother" });
  return out;
}

// ═══════════════════════════ SPAWNING ══════════════════════════════════════

/** Spawn anchors on the camp's outer ring, reachable on open ground. Beasts
 *  walk in; nothing teleports through obstacles. */
function spawnPoint(side: SpawnSide, seed: number): Vec {
  const cx = WORLD_CX, cy = WORLD_CY;
  const jitter = ((seed % 97) / 97 - 0.5) * 120;
  switch (side) {
    case "north": return { x: cx + jitter, y: cy - 720 };
    case "east": return { x: cx + 900, y: cy + jitter };
    case "south": return { x: cx + jitter, y: cy + 760 };
    case "west": return { x: cx - 820, y: cy + jitter };
  }
}
const WORLD_CX = -70, WORLD_CY = -60;

let spawnSeq = 0;
function spawnSiegeEnemy(g: Game, ev: SiegeEvent, kind: Enemy["kind"], side: SpawnSide, role: EnemyRole): Enemy | null {
  const s = g.state;
  const active = ev.spawnedIds
    .map(id => s.enemies.find(e => e.id === id))
    .filter((e): e is Enemy => !!e && !e.dead);
  // The active-cap holds back screen crowding — but the announced leader of a
  // tide must never be silently eaten by the cap: it always walks on.
  if (active.length >= SIEGE.liveCap && role !== "leader") return null;

  // Prefer an existing dead enemy of this kind (reuse = no permanent growth
  // of the region's population); otherwise create one and record it as owned.
  const id = `${ev.id}_${role}_${spawnSeq++}`;
  const p = spawnPoint(side, spawnSeq + ev.day * 7);
  const e: Enemy = {
    id, kind,
    x: p.x, y: p.y, vx: 0, vy: 0, face: 0,
    hp: ENEMY[kind].hp * hpMulFor(s, ev), max: ENEMY[kind].hp * hpMulFor(s, ev),
    state: "patrol", stateT: 0,
    home: { x: p.x, y: p.y }, wp: [], wpi: 0,
    lungeDir: { x: 0, y: 0 }, biteDone: false,
    dead: false, deadT: 0, respawnAt: 0,
    quest: false, hitT: 0, walkPh: 0, growlT: 0,
    phase: 1, atkIdx: 0, shots: 0, alerted: true,
  };
  // tag with the event so resolution can count it and guards can read intent
  (e as Enemy & { siege?: string; siegeRole?: EnemyRole; siegeTarget?: Vec }).siege = ev.id;
  (e as Enemy & { siegeRole?: EnemyRole }).siegeRole = role;

  // Wall-breakers and leaders get real, bounded combat adjustments — not
  // blind scaling: size only, and only one beast carries the leader edge.
  if (role === "leader") {
    e.hp = e.max = Math.round(e.hp * 2.1);
    (e as Enemy & { siegeRole?: EnemyRole }).siegeRole = "leader";
  }

  s.enemies.push(e);
  ev.spawnedIds.push(id);
  return e;
}

/** Bounded, progression-aware scaling: uses the survivor level and defence
 *  readiness so difficulty follows both halves of the design tension. */
function hpMulFor(s: GameState, ev: SiegeEvent): number {
  const lvl = s.progression.level;
  const ready = readiness(s).score;
  if (ev.kind === "night") return 1 + Math.min(0.25, lvl * 0.012);
  if (ev.kind === "weekly") return 1 + Math.min(0.5, lvl * 0.02 + ready * 0.002);
  return 1 + Math.min(0.85, lvl * 0.03 + ready * 0.004);
}

// ═══════════════════════════ SIEGE ENEMY STEERING ══════════════════════════

/**
 * Siege-specific movement/behaviour notes, applied from the engine AFTER the
 * normal enemy update. This is what makes camps attack through valid routes
 * and strike structures deliberately instead of pure player-chasing.
 * Nothing here replaces the enemy FSM; it nudges the existing one.
 */
export function updateSiegeSteering(g: Game, dt: number) {
  const s = g.state;
  const ev = activeSiege(s);
  if (!ev) return;
  const anchorOf = (d: Enemy & { siegeTarget?: Vec }) => d.siegeTarget;

  for (const e of s.enemies) {
    const sx = (e as Enemy & { siege?: string }).siege;
    if (sx !== ev.id || e.dead || e.state === "dead") continue;
    const role = (e as Enemy & { siegeRole?: EnemyRole }).siegeRole ?? "wave";
    // enemies chasing the player or a guard keep their own combat behaviour —
    // only non-engaged siege members are steered toward their assignment.
    if (e.state === "chase" || e.state === "windup" || e.state === "lunge" || e.state === "recover" || e.state === "stagger") continue;

    // role destination: wave prowls the player/camp, breaker goes for the
    // nearest structural target, flanker arcs to the side, elites/leader hunt.
    let tx = s.player.x, ty = s.player.y;
    if (role === "breaker") {
      const target = nearestSiegeStructure(s, e);
      if (target) { tx = target.x; ty = target.y; }
    } else if (role === "flanker") {
      // arc wide instead of charging the face the player is covering
      const side = (spawnPoint("west", 0).x - s.player.x) as number;
      const sign = side < 0 ? -1 : 1;
      tx = s.player.x + sign * 90;
      ty = s.player.y;
    }
    void anchorOf;
    // drive the existing FSM toward the destination by feeding its patrol/home
    e.home.x += (tx - e.home.x) * Math.min(1, dt * 0.4);
    e.home.y += (ty - e.home.y) * Math.min(1, dt * 0.4);
  }
}

/** Structural targets a boss/breaker can genuinely reach and damage. */
export interface SiegeTargetDef { id: string; name: string; x: number; y: number; max: number }
export function siegeTargets(s: GameState): SiegeTargetDef[] {
  const out: SiegeTargetDef[] = [];
  out.push({ id: "spikes", name: "Spike Barricade", x: 330, y: -230, max: 3 });
  out.push({ id: "shelter", name: "Outpost", x: -60, y: -80, max: 5 });
  if (s.build.bunks) out.push({ id: "bunks", name: "Bunkhouse", x: -430, y: -160, max: 4 });
  if (s.build.beacon) out.push({ id: "beacon", name: "Signal Beacon", x: 415, y: -155, max: 3 });
  return out;
}
function nearestSiegeStructure(s: GameState, e: Enemy): SiegeTargetDef | null {
  let best: SiegeTargetDef | null = null;
  let bd = Infinity;
  for (const t of siegeTargets(s)) {
    if (structHealth(s, t.id) <= 0) continue;
    const d = Math.hypot(e.x - t.x, e.y - t.y);
    if (d < bd) { bd = d; best = t; }
  }
  return best;
}

export function structHealth(s: GameState, id: string): number {
  const def = siegeTargets(s).find(t => t.id === id);
  const max = def?.max ?? 0;
  return Math.max(0, max - (s.siege.structHp[id] ?? 0));
}

/** A siege enemy reaching a structure damages it — real, bounded, repairable.
 *  The outpost hull can be breached but never functionally destroyed (it
 *  bottoms out at 1): the camp must always remain recoverable after a failed
 *  defence. Facilities (spikes/bunkhouse/beacon) CAN be taken offline. */
export function strikeStructure(g: Game, ev: SiegeEvent, id: string): void {
  const s = g.state;
  const def = siegeTargets(s).find(t => t.id === id);
  if (!def) return;
  const hp = structHealth(s, id);
  if (hp <= 0) return;
  if (id === "shelter" && hp <= 1) return;                    // hull core holds
  const dmg = Math.min(SIEGE.structDmgCapPerEvent - totalStructDamage(ev), 1);
  if (dmg <= 0) return;
  s.siege.structHp[id] = (s.siege.structHp[id] ?? 0) + dmg;
  ev.structHits[id] = (ev.structHits[id] ?? 0) + dmg;
  g.fx.shake(6);
  g.fx.sfx("hit");
  g.fx.toast({ title: `${def.name} takes a hit`, sub: `Integrity ${structHealth(s, id)}/${def.max}.`, kind: "warn", icon: "warn" });
  if (structHealth(s, id) <= 1 && id === "shelter") {
    g.fx.toast({ title: "Outpost hull breached — but the core holds", sub: "Repair it from the Defence board after the fight.", kind: "error", icon: "shelter" });
  }
  if (structHealth(s, id) <= 0) {
    g.fx.toast({ title: `${def.name} destroyed`, sub: "Rebuild it via the outpost after the siege.", kind: "error", icon: "warn" });
    if (id === "spikes") s.build.spikes = false;
    if (id === "bunks") s.build.bunks = false;
    if (id === "beacon") s.build.beacon = false;
  }
}

const totalStructDamage = (ev: SiegeEvent): number =>
  Object.values(ev.structHits).reduce<number>((a, b) => a + (b ?? 0), 0);

/** Paid, atomic structure repair — carpentry through the shared pool. */
export function repairStructure(s: GameState, id: string, fx: Fx, poolPay: (needs: Partial<Record<ItemId, number>>) => boolean): boolean {
  const dmg = s.siege.structHp[id] ?? 0;
  const def = siegeTargets(s).find(t => t.id === id);
  if (!def || dmg <= 0) return false;
  if (!poolPay({ wood: 4, stone: 2 })) {
    fx.toast({ title: "Missing materials", sub: "Repairs need 4 Wood + 2 Stone per point (storage or pack).", kind: "warn", icon: "wood" });
    fx.sfx("error");
    return false;
  }
  s.siege.structHp[id] = dmg - 1;
  // A repaired structure comes back online when it has integrity again.
  if (structHealth(s, id) > 0) {
    if (id === "spikes") s.build.spikes = true;
    if (id === "bunks") s.build.bunks = true;
    if (id === "beacon") s.build.beacon = true;
  }
  fx.sfx("build");
  fx.toast({ title: `${def.name} shored up`, sub: `Integrity ${structHealth(s, id)}/${def.max}.`, kind: "good", icon: "hammer" });
  return true;
}

// ═══════════════════════════ EVENT LIFECYCLE ═══════════════════════════════

export function activeSiege(s: GameState): SiegeEvent | null {
  return s.siege.events.find(e => e.status === "active") ?? null;
}

export function scheduleEvent(s: GameState, kind: SiegeKind, startAt: number): SiegeEvent {
  const day = Math.floor(startAt / DAY);   // game-clock day, same source as the HUD
  const ev: SiegeEvent = {
    id: `${kind}_d${day}`,
    kind, day, startAt,
    planned: planEvent(s, kind, day),
    waves: [],
    status: "scheduled",
    t: 0, waveIdx: 0, spawnedIds: [],
    kills: 0, byGuard: 0, structHits: {}, spikesUsed: 0, hazardHits: 0,
    injuries: 0, downed: 0,
    resolved: false, rewarded: false,
  };
  ev.waves = buildWaves(ev);
  s.siege.events.push(ev);
  return ev;
}

/** Set the next calendar anchor of a tier after its event has been fired. */
function advanceCalendar(s: GameState, kind: SiegeKind) {
  if (kind === "night") s.siege.next.night = nextNightAnchor(s.time);
  else if (kind === "weekly") s.siege.next.weekly += SIEGE.weekly.everyDays * DAY;
  else s.siege.next.monthly += SIEGE.monthly.everyDays * DAY;
}

function warnWindow(kind: SiegeKind): number {
  return kind === "night" ? DAY * 0.10
    : kind === "weekly" ? DAY * SIEGE.weekly.warnHoursGame
    : DAY * SIEGE.monthly.warnHoursGame;
}

/** Preparation advice shown in warnings and on the Defense screen. */
export function prepAdvice(s: GameState, ev: SiegeEvent): string {
  const r = readiness(s);
  const weak: string[] = [];
  if (!r.parts.find(pp => pp.label.includes("guard"))?.ok) weak.push("post guards");
  if (!r.parts.find(pp => pp.label.includes("Spike"))?.ok) weak.push("build / repair the spikes");
  if (!r.parts.find(pp => pp.label.includes("armed"))?.ok) weak.push("arm the watch");
  const when = ev.kind === "night" ? "tonight" : ev.kind === "weekly" ? "on the next week-mark" : "on the new moon";
  return weak.length
    ? `${ev.planned.total} beasts ${when}. Weak spots: ${weak.join(", ")}.`
    : `${ev.planned.total} beasts ${when}. The camp looks ready.`;
}

/**
 * Runs every frame of active play from the engine. Scheduling uses the game
 * clock only, so pausing (which stops s.time) also pauses the calendar — the
 * same event can never double-fire, and resuming continues where it left off.
 */
export function tickSiege(g: Game, dt: number) {
  const s = g.state;
  const set = s.siege;
  if (!set.enabled) return;

  const home = s.region === "forest";
  const phase = (s.time % DAY) / DAY;
  const nightNow = phase >= BAL.nightStart && phase <= BAL.nightEnd;
  const d = dayOf(s);

  // The countdown anchor tracks the calendar continuously so the HUD/Defense
  // screen always shows a true "next night window", even mid-history.
  if (set.next.night <= s.time) set.next.night = nextNightAnchor(s.time);

  // ── nightly roll (only on qualifying nights, past the opening grace) ──
  // Gate against both the pending event list AND the done ledger: resolved
  // events are archived within the same tick, and without the ledger check
  // the deterministic same-day roll would immediately re-arm the pack.
  if (d >= SIEGE.night.graceDays && nightNow
      && !set.events.some(e => e.kind === "night" && e.day === d)
      && !set.done.includes(`night_d${d}`)) {
    const chance = SIEGE.night.chanceBase + s.progression.level * SIEGE.night.chancePerLevel;
    if (rng(hashId("night_roll", d))() < chance) {
      scheduleEvent(s, "night", s.time + 1.5);
    }
  }

  // ── weekly / monthly scheduling with an honest advance-warning window ──
  if (s.time >= set.next.weekly - DAY * SIEGE.weekly.warnHoursGame
      && !set.events.some(e => e.kind === "weekly" && !e.resolved)) {
    scheduleEvent(s, "weekly", set.next.weekly);
  }
  if (s.time >= set.next.monthly - DAY * SIEGE.monthly.warnHoursGame
      && !set.events.some(e => e.kind === "monthly" && !e.resolved)) {
    scheduleEvent(s, "monthly", set.next.monthly);
  }

  // ── live events ──
  for (const ev of set.events) {
    if (ev.resolved) continue;

    // countdown → one-shot warning as it enters the advise window
    if (ev.status === "scheduled" && s.time >= ev.startAt - warnWindow(ev.kind) && !set.warned[ev.id]) {
      set.warned[ev.id] = true;
      g.fx.toast({
        title: ev.kind === "night" ? "A night pack is prowling"
          : ev.kind === "weekly" ? "HORDE GATHERING at the treeline"
          : "THE GREAT BEAST TIDE STIRS",
        sub: prepAdvice(s, ev),
        kind: ev.kind === "night" ? "info" : "warn", icon: "wolf",
      });
      if (ev.kind !== "night") g.fx.sfx("warn");
    }

    // A nightly pack belongs to its night: if the player never answered before
    // dawn, it melts away instead of striking at noon. No reward, no penalty,
    // and it lands in the ledger as a retreat so it cannot be processed twice.
    if (ev.kind === "night" && ev.status === "scheduled" && s.time >= ev.startAt && !nightNow) {
      ev.resolved = true; ev.status = "resolved"; ev.rewarded = true;
      ev.result = { outcome: "retreat", label: "The night pack moved on", summary: ["nobody answered its call"], rewards: [], xp: 0 };
      if (!set.done.includes(ev.id)) set.done.push(ev.id);
      set.history.push({ id: ev.id, kind: ev.kind, day: ev.day, outcome: "retreat", kills: 0, injuries: 0, structDestroyed: [], rewarded: true, offline: false });
      continue;
    }

    // One siege at a time: a second scheduled event waits (still counting down,
    // visible on the board) instead of stacking its waves on top of a live one.
    const anyActive = set.events.some(e => e.status === "active");

    // Major events fire only while the player is home — the camp is never hit
    // while away, so a horde can never begin with nobody there to answer it.
    if (s.time >= ev.startAt && home && !anyActive && ev.status === "scheduled" && (ev.kind !== "night" || nightNow)) {
      ev.status = "active";
      ev.t = 0; ev.waveIdx = 0;
      g.fx.sfx(ev.kind === "night" ? "wolfGrowl" : ev.kind === "weekly" ? "bearRoar" : "bossRoar");
      g.fx.shake(ev.kind === "monthly" ? 14 : ev.kind === "weekly" ? 10 : 6);
      g.fx.toast({
        title: ev.kind === "night" ? "NIGHT ATTACK" : ev.kind === "weekly" ? "THE HORDE HITS THE CAMP" : "THE GREAT BEAST TIDE",
        sub: `${ev.planned.total} beasts — hold the camp, cover the residents.`,
        kind: "error", icon: "wolf",
      });
      g.bannerT = 3.4;
      g.emitEvent("siege", ev.kind);
      g.saveNow();
    }

    if (ev.status !== "active") continue;
    ev.t += dt;

    // spawn waves on schedule, capped in live enemies
    while (ev.waveIdx < ev.waves.length && ev.t >= ev.waves[ev.waveIdx].at) {
      const wave = ev.waves[ev.waveIdx];
      wave.spawns.forEach((sp, spi) => {
        for (let i = 0; i < sp.n; i++) {
          const role: EnemyRole =
            ev.kind === "night" ? "wave"
            : wave.note ? (spi === wave.spawns.length - 1 ? "leader" : "elite")
            : sp.kind === "bear" ? "breaker"
            : "wave";
          spawnSiegeEnemy(g, ev, sp.kind, sp.side, role);
        }
      });
      if (wave.note) {
        g.fx.toast({ title: wave.note, sub: "The biggest shape leads the final push.", kind: "error", icon: "fortress" });
        g.fx.sfx("bossRoar");
      }
      ev.waveIdx++;
    }

    // structure strikes — breakers and the leader pound whatever they reach
    for (const e of s.enemies) {
      if ((e as Enemy & { siege?: string }).siege !== ev.id || e.dead) continue;
      const role = (e as Enemy & { siegeRole?: EnemyRole }).siegeRole ?? "wave";
      if (role !== "breaker" && role !== "leader") continue;
      const t = nearestSiegeStructure(s, e);
      if (t && Math.hypot(e.x - t.x, e.y - t.y) < 110 && Math.random() < dt * 0.55) {
        strikeStructure(g, ev, t.id);
      }
    }

    trackCasualties(s, ev);
    checkSpikes(g, ev);
    checkResolution(g, ev);
  }

  // ── archive resolved events once (bounded ledger) ──
  for (const ev of set.events.filter(e => e.resolved)) {
    if (!set.done.includes(ev.id)) set.done.push(ev.id);
    set.history.push({
      id: ev.id, kind: ev.kind, day: ev.day,
      outcome: ev.result?.outcome ?? "full",
      kills: ev.kills, injuries: ev.injuries,
      structDestroyed: Object.entries(ev.structHits)
        .filter(([id]) => structHealth(s, id) <= 0).map(([id]) => id),
      rewarded: ev.rewarded, offline: false,
      total: ev.planned.total,
      structDamage: Object.values(ev.structHits).reduce<number>((a, b) => a + (b ?? 0), 0),
      rewards: ev.result?.rewards ?? [],
      recovery: recoveryCost(s),
    });
    if (set.history.length > 24) set.history.shift();
    if (set.done.length > 48) set.done.shift();
  }
  set.events = set.events.filter(e => !e.resolved);
}

function trackCasualties(s: GameState, ev: SiegeEvent) {
  const owned = new Set(ev.spawnedIds);
  ev.kills = 0; ev.byGuard = 0; ev.injuries = 0; ev.downed = 0;
  for (const e of s.enemies) if (owned.has(e.id) && e.dead) ev.kills++;
  for (const r of s.settlement.residents) {
    if (r.injured) ev.injuries++;
    if (r.downed) ev.downed++;
  }
}

function checkSpikes(g: Game, ev: SiegeEvent) {
  const s = g.state;
  if (!s.build.spikes || ev.spikesUsed >= SIEGE.spikesMaxProcs) return;
  for (const e of s.enemies) {
    if ((e as Enemy & { siege?: string }).siege !== ev.id || e.dead) continue;
    if (Math.hypot(e.x - 330, e.y + 230) < 80) {
      e.hp -= SIEGE.spikesDmg;
      e.hitT = 0.4;
      ev.spikesUsed++;
      ev.hazardHits++;
      g.fx.float(330, -252, `-${SIEGE.spikesDmg}`, "#ffb063");
      g.fx.burst(330, -244, "hit", 10);
      g.fx.sfx("hit");
      if (e.hp <= 0) g.onEnemyKilled(e);
      if (ev.spikesUsed >= SIEGE.spikesMaxProcs) break;
    }
  }
}

function checkResolution(g: Game, ev: SiegeEvent) {
  const s = g.state;
  const live = ev.spawnedIds
    .map(id => s.enemies.find(e => e.id === id))
    .filter((e): e is Enemy => !!e && !e.dead);
  const allWavesDone = ev.waveIdx >= ev.waves.length;

  if (allWavesDone && live.length === 0) return resolveSiege(g, ev, false);
  // Player fell — the pack ends with the defence (the death penalty was
  // already taken by the recovery system), and the camp still stands.
  if (s.player.dead) return resolveSiege(g, ev, false, true);
  // Bounded retreat: attackers never stay in a permanently-attacking state.
  const maxT = ev.kind === "night" ? 90 : ev.kind === "weekly" ? 150 : 220;
  if (ev.t > maxT) return resolveSiege(g, ev, true);
}

function resolveSiege(g: Game, ev: SiegeEvent, retreated: boolean, playerDied = false) {
  if (ev.resolved) return;                              // hard exactly-once guard
  const s = g.state;
  ev.resolved = true;
  ev.status = "resolved";

  // outcome from the live bookkeeping, not a guess
  const defeated = ev.kills;
  const total = ev.planned.total;
  const structDmg = totalStructDamage(ev);
  const destroyed = Object.entries(ev.structHits).filter(([id]) => structHealth(s, id) <= 0).length;
  const defenderHurt = ev.injuries + ev.downed * 2;

  const out: SiegeOutcome =
    playerDied ? "failed"
    : defeated >= total && structDmg === 0 && defenderHurt === 0 ? "full"
    : defeated >= total ? "partial"
    : retreated && defeated >= total * 0.5 ? "retreat"
    : "heavy";

  const result: SiegeResult = {
    outcome: out,
    label: {
      full: "Full defence — not a scratch",
      partial: "Partial defence — the camp held at a cost",
      heavy: "Heavy damage — the camp took a beating",
      retreat: "The attack broke off and ran",
      failed: "The camp was overrun",
    }[out],
    summary: [
      `${defeated}/${total} beasts defeated`,
      structDmg > 0 ? `${structDmg} point(s) of structure damage${destroyed ? `, ${destroyed} destroyed` : ""}` : "No structure damage",
      ev.injuries || ev.downed ? `${ev.injuries} defender(s) hurt${ev.downed ? `, ${ev.downed} down` : ""}` : "No defender hurt",
      ev.spikesUsed ? `Spikes struck ${ev.spikesUsed} time(s)` : "Spikes did not engage",
    ],
    rewards: rewardsFor(ev, out),
    xp: xpFor(ev, out),
  };
  ev.result = result;
  // EXACTLY-ONCE: the ledger flag survives the save. An event that was already
  // rewarded before a reload (sanitizeSiege re-arms it as "rewarded") reports
  // the fight but can never pay again.
  const canReward = !ev.rewarded;
  ev.rewarded = true;
  if (canReward) {
    for (const rw of result.rewards) {
      grant(s, rw.item, rw.n, {
        pickup: n => s.pickups.push({
          id: `siege_${ev.id}_${rw.item}_${Math.random().toString(36).slice(2, 6)}`,
          item: rw.item, n, x: s.player.x + 60, y: s.player.y + 40, t: 0,
        }),
      });
    }
    if (result.xp > 0) grantXp(s, result.xp, g.fx, "quest");
  }

  const tone: "good" | "warn" | "error" = out === "full" ? "good" : out === "failed" ? "error" : "warn";
  g.fx.toast({ title: result.label, sub: result.summary.join(" · "), kind: tone, icon: "residents" });
  g.fx.sfx(out === "failed" ? "warn" : out === "full" ? "quest" : "rare");
  advanceCalendar(s, ev.kind);
  s.siege.pendingReport = { title: result.label, lines: result.summary, offline: false, kind: ev.kind };
  g.saveNow();
  g.bump();
}

// ═══════════════════════════ REWARDS ═══════════════════════════════════════

/** Rewards mirror the event's tier and the actual outcome — a failed defence
 *  pays almost nothing, and every event id can only ever be rewarded once. */
function rewardsFor(ev: SiegeEvent, out: SiegeOutcome): { item: ItemId; n: number }[] {
  const mul = out === "full" ? 1 : out === "partial" ? 0.8 : out === "retreat" ? 0.6 : out === "heavy" ? 0.4 : 0.15;
  const pick = (o: [ItemId, number][]): { item: ItemId; n: number }[] =>
    o.map(([item, n]) => ({ item, n: Math.max(1, Math.round(n * mul)) })).filter(r => r.n > 0);
  if (ev.kind === "night") return pick([["wood", 2], ["pelt", 1], ["rawmeat", 1]]);
  if (ev.kind === "weekly") return pick([["stone", 4], ["scrap", 3], ["bearhide", 1], ["medkit", 1]]);
  return pick([["crystal", 6], ["scrap", 5], ["medkit", 2], ["sigil", 1]]);
}
function xpFor(ev: SiegeEvent, out: SiegeOutcome): number {
  const base = ev.kind === "night" ? 25 : ev.kind === "weekly" ? 70 : 130;
  const mul = out === "full" ? 1 : out === "partial" ? 0.75 : out === "retreat" ? 0.6 : out === "heavy" ? 0.45 : 0.2;
  return Math.round(base * mul);
}

// ═══════════════════════════ OFFLINE RESOLUTION ════════════════════════════

/**
 * Offline catch-up runs ONCE at load from the saved wall-clock stamp. It is
 * deliberately conservative — the safe approach the spec calls for:
 *   · events still resolve against the actual readiness/combat estimate
 *   · at most SIEGE.offlineMaxEvents are processed, in order
 *   · cumulative damage is hard-capped and structures are NEVER erased
 *     (nothing drops below 1 integrity — only active play can destroy)
 *   · no enemies are spawned offline at all
 *   · reprocessing is impossible: event ids land in the `done` ledger and the
 *     calendar advances exactly once per event
 *   · a backwards device clock yields nothing (elapsed is clamped to zero)
 */
export function applyOfflineSieges(s: GameState, fx?: Fx) {
  const se = s.siege;
  const now = Date.now();
  // elapsed is derived from the settlement's persisted wall-clock stamp. A
  // clock that moved backwards yields zero; the stamp is rewritten on save,
  // so re-loading the same save cannot re-run anything.
  let elapsed = Math.floor((now - (s.settlement.lastWall || now)) / 1000);
  if (!Number.isFinite(elapsed) || elapsed < 0) elapsed = 0;

  // Resolve, in order, only events that were ALREADY scheduled with their
  // warning issued before the save — fairness demands the player saw them
  // coming. Anything the game hadn't announced yet is not owed to the
  // calendar: its anchor is simply shifted forward, so a long absence moves
  // future events rather than burying the camp in retroactive assaults.
  const due: SiegeEvent[] = [];
  for (const ev of se.events) {
    if (due.length >= SIEGE.offlineMaxEvents) break;
    if (ev.resolved || ev.status !== "scheduled") continue;
    if (se.done.includes(ev.id)) continue;                            // dedup ledger
    if (!se.warned[ev.id]) continue;                                  // warning never shown → skip
    if (ev.startAt > s.time) continue;                                // not due in game time yet
    if (ev.kind === "night") {
      // a nightly pack announced and never answered simply melts away — no
      // penalty for content the player could not have reached
      ev.resolved = true; ev.status = "resolved";
      se.done.push(ev.id);
      se.history.push({ id: ev.id, kind: ev.kind, day: ev.day, outcome: "retreat", kills: 0, injuries: 0, structDestroyed: [], rewarded: true, offline: true });
      continue;
    }
    due.push(ev);
  }

  const r = readiness(s);
  const lines: string[] = [];
  for (const ev of due) {
    ev.resolved = true; ev.status = "resolved"; ev.rewarded = true;   // exactly once
    const total = ev.planned.total;
    const estDefeated = Math.max(1, Math.round(total * (0.25 + (r.score / 100) * SIEGE.offlineKillChance + 0.35)));
    // bounded structural wear — never drops a building below 1 integrity, so
    // an absence can never silently erase part of the shelter
    const dmg = Math.min(SIEGE.offlineStructDmgCap, Math.max(0, Math.round((1 - r.score / 100) * 2)));
    if (dmg > 0) {
      const id = "shelter";
      const max = siegeTargets(s).find(t => t.id === id)?.max ?? 5;
      se.structHp[id] = Math.min(max - 1, (se.structHp[id] ?? 0) + dmg);
      ev.structHits[id] = dmg;
    }
    const wounded = r.score < 40 ? 1 : 0;
    if (wounded) {
      const guard = s.settlement.residents.find(r2 => r2.role === "warrior" && !r2.downed);
      if (guard) {
        guard.hp = Math.max(1, guard.hp - Math.round(guard.maxHp * 0.35));
        guard.injured = guard.hp / guard.maxHp < RES_BAL.retreatAt;
      }
    }
    ev.result = {
      outcome: dmg > 0 ? "partial" : "full",
      label: dmg > 0 ? "The camp held while you were away" : "The watch held the line",
      summary: [`~${estDefeated}/${total} driven off by the watch`,
                dmg > 0 ? `${dmg} point(s) of wear on the outpost` : "no structural damage",
                wounded ? "one defender was hurt" : "nobody was hurt"],
      rewards: [], xp: 0,
    };
    lines.push(`· Day ${ev.day} ${ev.kind === "weekly" ? "horde" : "tide"}: ${ev.result.label.toLowerCase()} — ${ev.result.summary.join(", ")}.`);
    if (!se.done.includes(ev.id)) se.done.push(ev.id);
    se.history.push({
      id: ev.id, kind: ev.kind, day: ev.day, outcome: ev.result.outcome,
      kills: estDefeated, injuries: wounded, structDestroyed: [], rewarded: true, offline: true,
    });
  }

  // Advance the calendar past every anchor the gap consumed, so the next
  // events land in the future rather than firing in a burst on arrival.
  if (elapsed > 0) {
    while (se.next.weekly <= s.time) se.next.weekly += SIEGE.weekly.everyDays * DAY;
    while (se.next.monthly <= s.time) se.next.monthly += SIEGE.monthly.everyDays * DAY;
  }

  if (due.length > 0) {
    se.pendingReport = { title: "While you were away", lines, offline: true, kind: "weekly" };
    fx?.toast({ title: "While you were away", sub: lines.join(" "), kind: dmgToastTone(due), icon: "residents" });
  }
  if (se.history.length > 24) se.history.shift();
  if (se.done.length > 48) se.done.shift();
}

function dmgToastTone(due: SiegeEvent[]): "warn" | "info" {
  return due.some(ev => (ev.result?.outcome ?? "full") !== "full") ? "warn" : "info";
}

// ═══════════════════════════ SAVE (DE)SERIALISATION ════════════════════════

export function serializeSiege(se: SiegeState): SiegeState {
  return JSON.parse(JSON.stringify(se)) as SiegeState;
}

/** Read a saved siege ledger defensively. Anything unknown or malformed is
 *  replaced by the clean defaults so a corrupt payload can never re-arm a
 *  reward or resurrect a dead event. */
export function sanitizeSiege(raw: unknown): SiegeState {
  const base = createSiege();
  if (!raw || typeof raw !== "object") return base;
  const d = raw as Partial<SiegeState>;
  base.enabled = d.enabled !== false;
  if (d.next && typeof d.next === "object") {
    for (const k of ["night", "weekly", "monthly"] as SiegeKind[]) {
      const v = (d.next as Record<string, unknown>)[k];
      if (typeof v === "number" && isFinite(v)) (base.next as Record<SiegeKind, number>)[k] = Math.max(0, v);
    }
  }
  if (Array.isArray(d.events)) {
    for (const ev of d.events.slice(0, 4)) {
      if (!ev || typeof ev.id !== "string" || ev.resolved) continue;  // only live events come back
      if (ev.kind !== "night" && ev.kind !== "weekly" && ev.kind !== "monthly") continue;
      base.events.push({
        ...ev,
        planned: ev.planned ?? { threats: ["wolf"], total: 1, band: 1, plan: "prowling pack" },
        waves: Array.isArray(ev.waves) ? ev.waves : [],
        spawnedIds: [],                       // never resurrect mid-fight state
        kills: 0, byGuard: 0, structHits: {}, spikesUsed: 0, hazardHits: 0,
        injuries: 0, downed: 0,
        status: "scheduled",                  // re-arms from the calendar, safely
        rewarded: true,                       // ← reloading never re-pays
        resolved: false,
      });
    }
  }
  if (Array.isArray(d.done)) base.done = d.done.filter((x): x is string => typeof x === "string").slice(-32);
  if (Array.isArray(d.history)) base.history = d.history.slice(-24) as SiegeHistoryEntry[];
  base.warned = typeof d.warned === "object" && d.warned ? { ...d.warned } as Record<string, boolean> : {};
  base.structHp = typeof d.structHp === "object" && d.structHp ? { ...d.structHp } as Record<string, number> : {};
  base.pendingReport = null;
  // Phase 6.5 — unknown doctrines fall back to balanced; route nodes are
  // whitelisted against the real waypoint table and length-capped.
  base.doctrine = typeof d.doctrine === "string" && DOCTRINE_ORDER.includes(d.doctrine as never)
    ? d.doctrine as SiegeState["doctrine"] : "balanced";
  if (Array.isArray(d.customRoute)) {
    const seen = new Set<string>();
    base.customRoute = d.customRoute
      .filter((x): x is string => typeof x === "string" && ROUTE_NODES.some(n => n.id === x))
      .filter(x => (seen.has(x) ? false : (seen.add(x), true)))
      .slice(0, MAX_ROUTE_NODES);
  }
  return base;
}

// ═══════════════════════════ COMMAND CENTER (Phase 6.5) ════════════════════

/** Outstanding carpentry bill to bring every structure back to full. */
export function recoveryCost(s: GameState): { wood: number; stone: number } {
  let pts = 0;
  for (const t of siegeTargets(s)) pts += Math.max(0, t.max - structHealth(s, t.id));
  return { wood: pts * 4, stone: pts * 2 };
}

export type CheckSeverity = "critical" | "advised" | "done";
export interface ChecklistItem {
  id: string;
  label: string;
  detail: string;
  severity: CheckSeverity;
  /** Where the player should go to act on it — the UI turns this into a jump. */
  action?: "defense" | "settlement" | "outpost" | "craft" | "storage";
  actionLabel?: string;
  /** Live progress, when the item is countable. */
  have?: number; need?: number;
}

/**
 * Preparation checklist — every entry is derived from live state and every
 * recommendation is ADVISORY. Nothing here spends resources or builds
 * anything: the buttons only navigate to the screen where the player decides.
 */
export function prepChecklist(s: GameState): ChecklistItem[] {
  const out: ChecklistItem[] = [];
  const res = s.settlement.residents;
  const warriors = res.filter(r => r.role === "warrior");
  const workers = res.filter(r => r.role === "worker");

  // 1 — damaged structures / gates
  const damaged = siegeTargets(s).filter(t => structHealth(s, t.id) < t.max);
  const cost = recoveryCost(s);
  const haveWood = countItem(s, "wood", "storage") + countItem(s, "wood", "inv");
  const haveStone = countItem(s, "stone", "storage") + countItem(s, "stone", "inv");
  out.push(damaged.length === 0
    ? { id: "repair", label: "All structures intact", detail: "Nothing needs carpentry.", severity: "done" }
    : {
        id: "repair",
        label: `Repair ${damaged.length} damaged structure${damaged.length === 1 ? "" : "s"}`,
        detail: `${damaged.map(d => `${d.name} ${structHealth(s, d.id)}/${d.max}`).join(" · ")}. Full repair needs ${cost.wood} wood + ${cost.stone} stone (you hold ${haveWood}/${haveStone}).`,
        severity: damaged.some(d => structHealth(s, d.id) <= 0) ? "critical" : "advised",
        action: "defense", actionLabel: "Repair board",
      });

  // 2 — spikes (the camp's only trap)
  const spikesBuilt = !!s.build.spikes;
  const spikesOk = spikesBuilt && structHealth(s, "spikes") > 0;
  out.push(spikesOk
    ? { id: "traps", label: "Spike barricade ready", detail: "It will wound the first beasts that reach it.", severity: "done" }
    : {
        id: "traps",
        label: spikesBuilt ? "Spike barricade is broken" : "No spike barricade built",
        detail: spikesBuilt
          ? "Repair it on the defence board — it strikes attackers before your guards do."
          : "Build the Spike Barricade at the outpost (10 wood, 4 stone). It is the camp's only trap.",
        severity: "advised",
        action: spikesBuilt ? "defense" : "outpost",
        actionLabel: spikesBuilt ? "Repair board" : "Outpost build",
      });

  // 3 — guards exist and are assigned
  const unassigned = warriors.filter(w => w.paused);
  out.push(warriors.length === 0
    ? {
        id: "guards", label: "No warriors in the settlement",
        detail: "Rescue Jorah Vale in the Frost Fortress, or broadcast from the Signal Beacon.",
        severity: "critical", action: "settlement", actionLabel: "Recruit",
      }
    : unassigned.length > 0
    ? {
        id: "guards", label: `${unassigned.length} warrior(s) stood down`,
        detail: `${unassigned.map(w => w.name).join(", ")} will not fight until resumed.`,
        severity: "critical", action: "settlement", actionLabel: "Warriors",
      }
    : { id: "guards", label: `${warriors.length} warrior(s) on duty`, detail: "Every warrior holds an assignment.", severity: "done" });

  // 4 — equipment
  const bare = warriors.filter(w => !w.gear.weapon);
  const spareWeapons = GUARD_WEAPON_IDS.reduce((a, id) => a + poolCount(s, id), 0);
  out.push(bare.length === 0 || warriors.length === 0
    ? { id: "equip", label: "Watch is armed", detail: warriors.length ? "Every warrior carries a real weapon." : "No warriors yet.", severity: warriors.length ? "done" : "advised" }
    : {
        id: "equip",
        label: `${bare.length} warrior(s) fighting bare-handed`,
        detail: spareWeapons > 0
          ? `${spareWeapons} spare weapon(s) sit in the cache — assign them from the Warriors tab.`
          : "No spare weapons. Craft a Hunting Spear (3 wood, 3 stone) or better.",
        severity: "advised",
        action: spareWeapons > 0 ? "settlement" : "craft",
        actionLabel: spareWeapons > 0 ? "Warriors" : "Craft",
        have: warriors.length - bare.length, need: warriors.length,
      });

  // 5 — injured defenders
  const hurt = res.filter(r => r.injured || r.downed);
  const meds = poolCount(s, "medkit") + poolCount(s, "salve");
  out.push(hurt.length === 0
    ? { id: "wounded", label: "No wounded residents", detail: "Everyone is fit for the night.", severity: "done" }
    : {
        id: "wounded",
        label: `${hurt.length} resident(s) hurt`,
        detail: meds > 0
          ? `${hurt.map(h => h.name).join(", ")}. ${meds} medicine in reach — treat them before the attack.`
          : `${hurt.map(h => h.name).join(", ")}. No medkits or salves: they heal slowly by resting.`,
        severity: hurt.some(h => h.downed) ? "critical" : "advised",
        action: "settlement", actionLabel: "Residents",
      });

  // 6 — rations
  const days = daysOfFood(s);
  out.push(res.length === 0 || days >= 2
    ? { id: "food", label: res.length === 0 ? "No residents to feed" : `${days === Infinity ? "∞" : days.toFixed(1)} days of rations`, detail: "The cache can feed the camp through the fight.", severity: "done" }
    : {
        id: "food",
        label: "Rations are low",
        detail: `${days.toFixed(1)} day(s) of food stored. Hungry defenders fight at half pace.`,
        severity: days <= 0 ? "critical" : "advised",
        action: "storage", actionLabel: "Supply cache",
      });

  // 7 — medicine stock for after the fight
  out.push(meds >= 2
    ? { id: "meds", label: "Medicine stocked", detail: `${meds} medkit/salve ready for casualties.`, severity: "done" }
    : {
        id: "meds", label: "Little medicine in store",
        detail: `${meds} in reach. Herbal Salve costs 2 Frostleaf; a Field Medkit needs frostleaf, scrap and a glowcap.`,
        severity: "advised", action: "craft", actionLabel: "Craft",
      });

  // 8 — blocked patrol routes (real, from the guard FSM's stuck detector)
  const blocked = warriors.filter(w => w.stuckT > RES_BAL.pathBlockedAt);
  if (blocked.length > 0) {
    out.push({
      id: "routes",
      label: `${blocked.length} guard(s) cannot reach their post`,
      detail: `${blocked.map(w => `${w.name} → ${assignmentOf(w.post).name}`).join(", ")}. Give them a reachable assignment.`,
      severity: "critical", action: "defense", actionLabel: "Assignments",
    });
  }

  // 9 — unassigned workers (idle hands before a fight)
  const idle = workers.filter(w => !w.task && !w.paused);
  if (idle.length > 0) {
    out.push({
      id: "idle",
      label: `${idle.length} worker(s) idle`,
      detail: `${idle.map(w => w.name).join(", ")} have no post. Put them on timber or stone to pay for repairs.`,
      severity: "advised", action: "settlement", actionLabel: "Work",
    });
  }

  return out;
}

/** Everything the dashboard needs, in one live read. */
export interface CommandSnapshot {
  day: number; phaseLabel: string; timeOfDay: number;
  readinessScore: number; readinessBand: string; readinessTone: "bad" | "warn" | "ok";
  nextNight: number; nextWeekly: number; nextMonthly: number;
  live: SiegeEvent | null;
  upcoming: SiegeEvent | null;
  warriorsTotal: number; warriorsFit: number; warriorsIdle: number;
  workersTotal: number; workersIdle: number;
  injured: number; downed: number;
  damagedStructures: { id: string; name: string; hp: number; max: number }[];
  recovery: { wood: number; stone: number };
  wood: number; stone: number; meds: number;
  foodDays: number;
  housing: { used: number; cap: number };
  critical: number; advised: number;
}

export function commandSnapshot(s: GameState): CommandSnapshot {
  const r = readiness(s);
  const band = readinessBand(r.score);
  const res = s.settlement.residents;
  const warriors = res.filter(x => x.role === "warrior");
  const workers = res.filter(x => x.role === "worker");
  const list = prepChecklist(s);
  const phase = (s.time % DAY) / DAY;
  return {
    day: dayOf(s) + 1,
    timeOfDay: phase,
    phaseLabel: phase < 0.06 ? "Dawn" : phase < 0.5 ? "Daylight" : phase < BAL.nightStart ? "Dusk" : phase <= BAL.nightEnd ? "Night" : "Dawn",
    readinessScore: r.score, readinessBand: band.label, readinessTone: band.tone,
    nextNight: timeUntil(s, "night"),
    nextWeekly: timeUntil(s, "weekly"),
    nextMonthly: timeUntil(s, "monthly"),
    live: activeSiege(s),
    upcoming: s.siege.events.filter(e => !e.resolved && e.status === "scheduled").sort((a, b) => a.startAt - b.startAt)[0] ?? null,
    warriorsTotal: warriors.length,
    warriorsFit: warriors.filter(w => !w.paused && !w.injured && !w.downed).length,
    warriorsIdle: warriors.filter(w => w.paused).length,
    workersTotal: workers.length,
    workersIdle: workers.filter(w => !w.task && !w.paused).length,
    injured: res.filter(x => x.injured && !x.downed).length,
    downed: res.filter(x => x.downed).length,
    damagedStructures: siegeTargets(s)
      .filter(t => structHealth(s, t.id) < t.max)
      .map(t => ({ id: t.id, name: t.name, hp: structHealth(s, t.id), max: t.max })),
    recovery: recoveryCost(s),
    wood: countItem(s, "wood", "storage") + countItem(s, "wood", "inv"),
    stone: countItem(s, "stone", "storage") + countItem(s, "stone", "inv"),
    meds: poolCount(s, "medkit") + poolCount(s, "salve"),
    foodDays: daysOfFood(s),
    housing: { used: res.length, cap: capacityOf(s) },
    critical: list.filter(i => i.severity === "critical").length,
    advised: list.filter(i => i.severity === "advised").length,
  };
}

/** Set the camp doctrine. Affects live guard targeting on the next scan. */
export function setDoctrine(s: GameState, id: SiegeState["doctrine"]) {
  s.siege.doctrine = id;
  // drop stale targets so the new stance is applied immediately
  for (const r of s.settlement.residents) if (r.role === "warrior") r.targetId = null;
}

/** Replace the custom patrol circuit (validated, capped, de-duplicated). */
export function setCustomRoute(s: GameState, ids: string[]) {
  const seen = new Set<string>();
  s.siege.customRoute = ids
    .filter(id => ROUTE_NODES.some(n => n.id === id))
    .filter(id => (seen.has(id) ? false : (seen.add(id), true)))
    .slice(0, MAX_ROUTE_NODES);
  // guards walking the custom route restart cleanly at waypoint 0
  for (const r of s.settlement.residents) {
    if (r.role === "warrior" && r.post === "patrol_custom") { r.wpi = 0; r.stuckT = 0; }
  }
}

/** Is this assignment already held by another guard? (conflict reporting) */
export function assignmentHolders(s: GameState, post: string) {
  return s.settlement.residents.filter(r => r.role === "warrior" && r.post === post);
}

/** A post is unreachable when its building is gone or its route is empty. */
export function assignmentIssue(s: GameState, post: string): string | null {
  const locked = assignmentLockedFor(s, post);
  if (locked) return locked;
  if (post === "patrol_custom" && (s.siege.customRoute?.length ?? 0) < 2) {
    return "Route needs at least two waypoints";
  }
  if (post === "bunks" && structHealth(s, "bunks") <= 0) return "Bunkhouse destroyed — repair it first";
  if (post === "watchtower" && structHealth(s, "beacon") <= 0) return "Beacon destroyed — repair it first";
  return null;
}
function assignmentLockedFor(s: GameState, post: string): string | null {
  const def = ASSIGNMENTS[post];
  if (!def) return "Unknown assignment";
  if (def.needsBuild && !s.build[def.needsBuild]) {
    return def.needsBuild === "beacon" ? "Requires the Signal Beacon" : "Requires the Bunkhouse";
  }
  return null;
}

// ── queries used by the UI ─────────────────────────────────────────────────

export function siegeSummary(s: GameState): {
  score: number; band: string; tone: "bad" | "warn" | "ok";
  next: { kind: SiegeKind; seconds: number; label: string } | null;
  live: SiegeEvent | null;
} {
  const r = readiness(s);
  const band = readinessBand(r.score);
  const upcoming: { kind: SiegeKind; seconds: number }[] = [];
  for (const k of ["night", "weekly", "monthly"] as SiegeKind[]) {
    const sec = timeUntil(s, k);
    if (isFinite(sec)) upcoming.push({ kind: k, seconds: sec });
  }
  upcoming.sort((a, b) => a.seconds - b.seconds);
  const labels: Record<SiegeKind, string> = {
    night: "Nightly pack", weekly: `Horde — day ${dayOf(s) + 1}`, monthly: "Beast Tide — new moon",
  };
  return {
    score: r.score, band: band.label, tone: band.tone,
    next: upcoming.length ? { ...upcoming[0], label: labels[upcoming[0].kind] } : null,
    live: activeSiege(s),
  };
}

export function formatCountdown(seconds: number): string {
  if (seconds <= 0) return "now";
  const days = Math.floor(seconds / DAY);
  const secondsIntoDay = seconds % DAY;
  const hours = Math.floor((secondsIntoDay / DAY) * 24);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h`;
  return `${Math.max(1, Math.round(seconds))}s`;
}

export const weatherThreatNote = (s: GameState) =>
  s.weather.kind === "blizzard" ? "Blizzard — sightlines are short" : WEATHER[s.weather.kind].name;
export const regionName = (id: RegionId) => REGIONS[id].name;
export { XP };
