// ── ICEBOUND Phase 6.3: autonomous guard AI & base defense ──────────────────
//
// An explicit warrior state machine layered on the Phase 6.2 settlement. It
// reuses the existing combat numbers (config BAL/ENEMY/ARMOR), the existing
// collision world (actors.collideAt via residents.moveResident), the existing
// enemy entities and the existing kill/loot path (Game.onEnemyKilled). No
// parallel combat simulator exists here: guards damage the same Enemy objects
// the player fights.
//
// Design rules enforced in this file:
//  · every state has explicit entry/exit conditions (see TRANSITIONS doc below)
//  · hysteresis on acquire (confirm), lose (grace) and attack range, so a
//    target drifting around a radius cannot cause state thrash
//  · exactly one damage application per swing (`hitDone` latch), so an attack
//    can never double-hit, and each guard swings on its own cooldown
//  · a hard leash per assignment: a guard never abandons its post to chase
//    across the map
//  · target scans are staggered and interval-based, not per-frame per-guard

import { ARMOR, BAL, ENEMY, ITEMS, WORLD } from "./config";
import { profileOf } from "./difficulty";
import type { Enemy, GameState, ItemId, Vec } from "./types";
import type { Game } from "./engine";
// NOTE: residents.ts imports this module, so nothing from it may be read at
// module-evaluation time here (it would still be in its TDZ). Every binding
// below is used strictly inside functions; the ASSIGNMENTS table is built from
// `config` only, which has no cycle.
import {
  RES_BAL, hurtResident, moveResident, poolCount, poolPay,
  type Resident,
} from "./residents";
import { addItem } from "./state";

// ═══════════════════════════ STATES ════════════════════════════════════════

/**
 * Guard states. Entry/exit summary (all transitions are implemented in
 * `updateGuard`, and only there):
 *
 *  idle     ← no assignment anchor reachable / nothing to do.  → patrol|guard
 *  patrol   ← assignment is a route.      exit: target confirmed → alert
 *  guard    ← assignment is a hold post.  exit: target confirmed → alert
 *  alert    ← a target was detected or an alarm was heard. Faces the threat for
 *             ALERT_CONFIRM seconds. exit: still valid → pursue, else → return
 *  pursue   ← committed to a target.      exit: in range → attack,
 *             target dead/leashed/lost for LOSE_GRACE → return
 *  attack   ← target inside attack range. Runs ONE windup→hit→recover swing.
 *             exit: swing finished → recover
 *  recover  ← post-swing cooldown.        exit: cooldown done →
 *             attack (still in range) | pursue (drifted out) | return (gone)
 *  retreat  ← hp fraction < RETREAT_AT.   exit: reached camp → injured
 *  injured  ← resting at camp.            exit: hp fraction ≥ RETURN_AT → return
 *  return   ← out of position.            exit: at anchor → guard|patrol
 */
export type GuardState =
  | "idle" | "patrol" | "guard" | "alert" | "pursue"
  | "attack" | "recover" | "retreat" | "return" | "injured";

export const GUARD_STATE_LABEL: Record<GuardState, string> = {
  idle: "Standing by",
  patrol: "Patrolling",
  guard: "Holding post",
  alert: "Alert — sighting",
  pursue: "Pursuing",
  attack: "Attacking",
  recover: "Recovering stance",
  retreat: "Retreating — wounded",
  return: "Returning to post",
  injured: "Injured — resting",
};

// ═══════════════════════════ TUNING ════════════════════════════════════════

export const GUARD_AI = {
  /** Seconds a sighting must hold before the guard commits (anti-thrash). */
  alertConfirm: 0.45,
  /** Seconds a lost/unreachable target is remembered before giving up. */
  loseGrace: 2.0,
  /** Attack range is entered at `range` and only left past range × this. */
  rangeHysteresis: 1.35,
  /** Swing shape: windup → the single damage frame → recovery. */
  windup: 0.34,
  recover: 0.3,
  /** hp fraction that forces a retreat, and the (higher) fraction needed to
   *  return to duty. The gap is the anti-flip-flop band. */
  retreatAt: 0.35,
  returnAt: 0.70,
  /** How far a shout/clash carries to other guards. */
  earshot: 520,
  /** Alarm memory. */
  alarmTtl: 12,
  /** Target re-scan interval; staggered per guard so costs never align. */
  scanInterval: 0.3,
  /** Personal space between friendly residents (prevents clumping/doorplugs). */
  separation: 26,
  separationPush: 42,
  /** Guards deal a fraction of the player's weapon damage — they are a screen,
   *  not a replacement for the player. */
  guardDmgMul: 0.55,
  scoutDmgMul: 0.42,
  /** Scouts harry: after a swing they give ground instead of trading blows. */
  scoutBackoff: 0.55,
} as const;

// ═══════════════════════════ ASSIGNMENTS ═══════════════════════════════════

export type AssignmentKind = "hold" | "patrol" | "rally";

export interface AssignmentDef {
  id: string;
  name: string;
  kind: AssignmentKind;
  desc: string;
  /** Hold posts: the standing spot. Patrols: the ring centre. */
  anchor: Vec;
  /** Ordered waypoints for patrol routes. */
  route?: Vec[];
  /** Detection radius measured from the anchor (or nearest route point). */
  watch: number;
  /** Hard chase limit from the anchor — the guard never goes further. */
  leash: number;
  /** Requires this base build/stage before it can be selected. */
  needsBuild?: "bunks" | "beacon";
  needsStage?: number;
  /** Protected asset weight used by target priority scoring. */
  assetValue: number;
}

/** Fixed, collision-safe defensive positions — the same philosophy as the
 *  game's fixed build sites: a guard post can never block the paths that the
 *  player and workers rely on. */
export const ASSIGNMENTS: Record<string, AssignmentDef> = {
  gate: {
    id: "gate", name: "Gate Watch", kind: "hold",
    desc: "Holds the Expedition Gate — the only way in or out of camp.",
    anchor: { x: WORLD.gate.x + 58, y: WORLD.gate.y + 52 },
    watch: 330, leash: 360, assetValue: 1.0,
  },
  shelter: {
    id: "shelter", name: "Shelter Guard", kind: "hold",
    desc: "Stands at the outpost door, covering the sleeping quarters.",
    anchor: { x: WORLD.shelter.x + 76, y: WORLD.shelter.y + 74 },
    watch: 300, leash: 330, assetValue: 1.0,
  },
  cache: {
    id: "cache", name: "Cache Guard", kind: "hold",
    desc: "Covers the Supply Cache — the settlement's food and materials.",
    anchor: { x: WORLD.storage.x - 8, y: WORLD.storage.y + 72 },
    watch: 290, leash: 320, assetValue: 0.95,
  },
  watchtower: {
    id: "watchtower", name: "Beacon Watchtower", kind: "hold",
    desc: "The Signal Beacon mast doubles as a watchtower: far better sightlines.",
    anchor: { x: WORLD.sites.beacon.x - 46, y: WORLD.sites.beacon.y + 56 },
    watch: 470, leash: 400, needsBuild: "beacon", assetValue: 0.7,
  },
  bunks: {
    id: "bunks", name: "Bunkhouse Guard", kind: "hold",
    desc: "Protects the Bunkhouse where off-duty residents rest.",
    anchor: { x: WORLD.sites.bunks.x + 64, y: WORLD.sites.bunks.y + 56 },
    watch: 300, leash: 330, needsBuild: "bunks", assetValue: 0.9,
  },
  rally: {
    id: "rally", name: "Rally Point", kind: "rally",
    desc: "Musters at the campfire. Short leash — a last line that never leaves.",
    anchor: { x: WORLD.firepit.x - 70, y: WORLD.firepit.y + 70 },
    watch: 300, leash: 240, assetValue: 1.0,
  },
  patrol_inner: {
    id: "patrol_inner", name: "Inner Patrol", kind: "patrol",
    desc: "Walks a tight circuit through the camp core: shelter, fire, cache.",
    anchor: { x: -40, y: -60 },
    route: [
      { x: -300, y: -120 }, { x: -60, y: -300 }, { x: 250, y: -150 },
      { x: 270, y: 95 }, { x: -30, y: 170 }, { x: -330, y: 70 },
    ],
    watch: 320, leash: 330, assetValue: 0.85,
  },
  patrol_outer: {
    id: "patrol_outer", name: "Outer Patrol", kind: "patrol",
    desc: "Wide sweep of the treeline approaches. Meets threats before camp does.",
    anchor: { x: -40, y: -60 },
    route: [
      { x: -560, y: -300 }, { x: 60, y: -520 }, { x: 560, y: -230 },
      { x: 600, y: 180 }, { x: 130, y: 430 }, { x: -520, y: 290 },
    ],
    watch: 360, leash: 520, assetValue: 0.6,
  },
  patrol_custom: {
    id: "patrol_custom", name: "Custom Route", kind: "patrol",
    desc: "A circuit you lay out yourself in the Command Center.",
    anchor: { x: -40, y: -60 },
    route: [],                       // filled live from the player's waypoints
    watch: 340, leash: 520, assetValue: 0.75,
  },
};

export const ASSIGNMENT_ORDER = [
  "gate", "shelter", "cache", "bunks", "watchtower", "rally",
  "patrol_inner", "patrol_outer", "patrol_custom",
] as const;

/** Waypoints the player may string together into a custom patrol route. */
export const ROUTE_NODES: { id: string; name: string; p: Vec }[] = [
  { id: "gate",    name: "Expedition Gate", p: { x: WORLD.gate.x + 58, y: WORLD.gate.y + 52 } },
  { id: "shelter", name: "Outpost Door",    p: { x: WORLD.shelter.x + 76, y: WORLD.shelter.y + 74 } },
  { id: "cache",   name: "Supply Cache",    p: { x: WORLD.storage.x - 8, y: WORLD.storage.y + 72 } },
  { id: "fire",    name: "Campfire",        p: { x: WORLD.firepit.x - 70, y: WORLD.firepit.y + 70 } },
  { id: "bunks",   name: "Bunkhouse",       p: { x: WORLD.sites.bunks.x + 64, y: WORLD.sites.bunks.y + 56 } },
  { id: "beacon",  name: "Signal Beacon",   p: { x: WORLD.sites.beacon.x - 46, y: WORLD.sites.beacon.y + 56 } },
  { id: "north",   name: "North Approach",  p: { x: -60, y: -330 } },
  { id: "east",    name: "East Treeline",   p: { x: 430, y: -40 } },
  { id: "south",   name: "South Trail",     p: { x: -40, y: 260 } },
  { id: "west",    name: "West Ridge",      p: { x: -430, y: 40 } },
];

export const MAX_ROUTE_NODES = 6;

/** Resolve the player-authored route; falls back to the inner circuit. */
export function customRoute(s: GameState): Vec[] {
  const ids = s.siege?.customRoute ?? [];
  const pts = ids
    .map(id => ROUTE_NODES.find(n => n.id === id))
    .filter((n): n is (typeof ROUTE_NODES)[number] => !!n)
    .map(n => n.p);
  return pts.length >= 2 ? pts : (ASSIGNMENTS.patrol_inner.route ?? []);
}

export function assignmentOf(id: string): AssignmentDef {
  return ASSIGNMENTS[id] ?? ASSIGNMENTS.rally;
}

/** Live assignment definition — the custom route reads the player's waypoints. */
export function liveAssignment(s: GameState, id: string): AssignmentDef {
  const def = assignmentOf(id);
  if (def.id !== "patrol_custom") return def;
  return { ...def, route: customRoute(s) };
}

/** Why an assignment cannot be chosen yet (null = selectable). */
export function assignmentLocked(s: GameState, def: AssignmentDef): string | null {
  if (def.needsBuild && !s.build[def.needsBuild]) {
    return def.needsBuild === "beacon" ? "Requires the Signal Beacon" : "Requires the Bunkhouse";
  }
  if (def.needsStage && s.shelter.stage < def.needsStage) return `Requires Outpost Stage ${def.needsStage}`;
  return null;
}

/** Nearest point of the guard's assignment (route-aware) — the leash origin. */
function postPoint(s: GameState, r: Resident): Vec {
  const def = liveAssignment(s, r.post);
  if (def.kind === "patrol" && def.route && def.route.length > 0) {
    return def.route[Math.min(r.wpi, def.route.length - 1)];
  }
  return def.anchor;
}

// ═══════════════════════════ EQUIPMENT ═════════════════════════════════════

/** Weapons a guard may carry. Only items that genuinely exist in ITEMS are
 *  listed — the game has no bow or ammunition, so no archer spec is offered
 *  and no ammunition rules are invented. Reach comes from the real weapon. */
export const GUARD_WEAPONS: Record<string, { dmg: number; reach: number }> = {
  axe:          { dmg: BAL.attack.dmgAxe,      reach: 46 },
  ironaxe:      { dmg: BAL.attack.dmgIronAxe,  reach: 48 },
  spear:        { dmg: BAL.attack.dmgSpear,    reach: 72 },   // spears reach
  warspear:     { dmg: BAL.attack.dmgWarSpear, reach: 78 },
  crystalblade: { dmg: BAL.attack.dmgBlade,    reach: 58 },
};
export const GUARD_ARMOR = ARMOR;  // parka / coat / thermalsuit — shared table

export const GUARD_WEAPON_IDS = Object.keys(GUARD_WEAPONS) as ItemId[];
export const GUARD_ARMOR_IDS = Object.keys(GUARD_ARMOR) as ItemId[];

/** Bare-handed fallbacks keep an unequipped guard useful but clearly worse. */
const BARE = { dmg: BAL.attack.dmgHand, reach: 42 };

export function guardWeapon(r: Resident) {
  const id = r.gear?.weapon;
  return id && GUARD_WEAPONS[id] ? { id, ...GUARD_WEAPONS[id] } : { id: null as ItemId | null, ...BARE };
}

/** Final per-swing damage: real weapon × spec multiplier × trait. */
export function guardDamage(r: Resident): number {
  const w = guardWeapon(r);
  const specMul = r.spec === "scout" ? GUARD_AI.scoutDmgMul : GUARD_AI.guardDmgMul;
  const trait = r.trait === "Veteran" ? 1.1 : 1;
  return Math.max(1, Math.round(w.dmg * specMul * trait));
}

export function guardReach(r: Resident): number {
  return guardWeapon(r).reach + (r.spec === "guard" ? 6 : 0);
}

/** Damage reduction from real armour (same table the player uses). */
export function guardArmorDR(r: Resident): number {
  const id = r.gear?.armor;
  const dr = id && GUARD_ARMOR[id] ? GUARD_ARMOR[id].dr : 0;
  return Math.min(0.75, dr + (r.trait === "Veteran" ? 0.2 : 0));
}

/** Cold-resistant kit reduces the weather penalty on patrol pace. */
export function guardColdFactor(s: GameState, r: Resident): number {
  const harsh = s.weather.kind === "blizzard" ? 1 : s.weather.kind === "snow" ? 0.4 : 0;
  if (harsh <= 0) return 1;
  const id = r.gear?.armor;
  const cold = id && GUARD_ARMOR[id] ? GUARD_ARMOR[id].cold : 1;  // lower = warmer
  // Unprotected guards slow to 80% in a blizzard; a Thermal Suit nearly negates it.
  return 1 - harsh * 0.2 * cold;
}

export function guardSpeed(s: GameState, r: Resident): number {
  let v = r.spec === "scout" ? RES_BAL.scoutSpeed : RES_BAL.guardSpeed;
  if (r.trait === "Swift") v *= 1.25;
  return v * guardColdFactor(s, r);
}

export function guardWatchRadius(s: GameState, r: Resident): number {
  const def = liveAssignment(s, r.post);
  let radius = def.watch;
  if (r.spec === "scout") radius += 60;
  if (r.trait === "Watchful") radius += 70;
  // The player's own lamps light the approaches; darkness shortens sightlines.
  const night = s.weather.kind === "blizzard" ? 0.75 : 1;
  return radius * night * (s.build.lamp ? 1.1 : 1);
}

/**
 * Equip a guard from the shared settlement pool (storage first, then pack).
 * The item is physically moved onto the resident, so nothing is duplicated and
 * the same spear cannot arm two guards. Returns false with a reason.
 */
export function equipGuard(
  s: GameState, residentId: string, slot: "weapon" | "armor", id: ItemId | null,
  fx?: { toast(t: { title: string; sub?: string; kind: "info" | "warn" | "error" | "quest" | "good" | "discovery"; icon?: string }): void; sfx(n: string): void; bump(): void },
): boolean {
  const r = s.settlement.residents.find(x => x.id === residentId);
  if (!r || r.role !== "warrior") return false;
  const table = slot === "weapon" ? GUARD_WEAPONS : GUARD_ARMOR;
  const current = r.gear[slot];

  // Unequip: hand the item back to the settlement pool.
  if (id === null) {
    if (!current) return false;
    r.gear[slot] = null;
    if (addItem(s, current, 1, "storage") <= 0 && addItem(s, current, 1, "inv") <= 0) {
      // Both bags are full: keep it equipped rather than destroying the item.
      r.gear[slot] = current;
      fx?.toast({ title: "No room to stow it", sub: `Free a slot before unequipping the ${ITEMS[current].name}.`, kind: "warn", icon: "warn" });
      fx?.sfx("error");
      return false;
    }
    fx?.sfx("ui"); fx?.bump();
    return true;
  }

  if (!table[id]) return false;
  if (poolCount(s, id) <= 0) {
    fx?.toast({ title: `No ${ITEMS[id].name} available`, sub: "Craft one, or keep it in the Supply Cache.", kind: "warn", icon: "warn" });
    fx?.sfx("error");
    return false;
  }
  if (!poolPay(s, { [id]: 1 } as Partial<Record<ItemId, number>>)) { fx?.sfx("error"); return false; }
  // Return whatever they were holding so gear is never lost.
  if (current) {
    if (addItem(s, current, 1, "storage") <= 0) addItem(s, current, 1, "inv");
  }
  r.gear[slot] = id;
  fx?.sfx("equip");
  fx?.toast({ title: `${r.name} equips ${ITEMS[id].name}`, sub: slot === "weapon" ? `${guardDamage(r)} damage · ${Math.round(guardReach(r) / 10)}m reach` : `${Math.round(guardArmorDR(r) * 100)}% damage reduction`, kind: "good", icon: ITEMS[id].icon });
  fx?.bump();
  return true;
}

// ═══════════════════════════ ALARMS ════════════════════════════════════════

/** Raise a camp alarm at a location. Nearby guards hear it; distant ones do
 *  not. This is the only way a guard learns about a threat it cannot see. */
export function raiseAlarm(s: GameState, x: number, y: number, reason: string) {
  s.settlement.alarm = { x, y, t: GUARD_AI.alarmTtl, reason };
  for (const r of s.settlement.residents) {
    if (r.role !== "warrior" || r.downed || r.paused) continue;
    if (Math.hypot(r.x - x, r.y - y) > GUARD_AI.earshot) continue;
    r.alertT = Math.max(r.alertT, GUARD_AI.alarmTtl * 0.5);
  }
}

// ═══════════════════════════ DETECTION ═════════════════════════════════════

const dist = (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, ay - by);

/** Hostile = a live, non-hidden, non-prey creature. Dead or still-buried
 *  crawlers are never valid targets. */
export function isHostile(e: Enemy): boolean {
  return !e.dead && e.hp > 0 && e.state !== "hidden" && e.kind !== "hare";
}

/**
 * Sightline test against the solid world. Large props (ruins, hulls, pillars,
 * the shelter) genuinely block vision, so guards cannot see through walls —
 * and because the same structures block movement, a blocked sightline also
 * means no straight path.
 */
function hasSight(s: GameState, ax: number, ay: number, bx: number, by: number): boolean {
  const dx = bx - ax, dy = by - ay;
  const len = Math.hypot(dx, dy);
  if (len < 1) return true;
  for (const st of s.structs) {
    if (st.solid < 40) continue;                    // only big props block sight
    if (st.id.startsWith("site_") && !s.build[st.kind]) continue;
    // distance from the structure centre to the segment
    const t = Math.max(0, Math.min(1, ((st.x - ax) * dx + (st.y - ay) * dy) / (len * len)));
    const px = ax + dx * t, py = ay + dy * t;
    if (dist(px, py, st.x, st.y) < st.solid * 0.85) return false;
  }
  return true;
}

export type GuardPriority = "balanced" | "protect" | "hold";

// ── camp doctrine (Phase 6.5) ───────────────────────────────────────────────
// A settlement-wide defensive stance set from the Command Center. Unlike the
// per-guard policy it re-weights WHICH ASSET the whole watch values, and can
// put wall-breakers at the top of the list. It is read live by scoreTarget,
// so changing it changes real targeting on the very next scan.

export type DoctrineId = "balanced" | "shelter" | "storage" | "housing" | "gate" | "breakers";

export interface DoctrineDef {
  id: DoctrineId; name: string; desc: string;
  /** Multiplier applied to each protected asset's weight. */
  weights: Partial<Record<"gate" | "shelter" | "cache" | "bunks" | "watchtower", number>>;
  /** Extra score for beasts that damage structures (breakers / leaders). */
  breakerBias: number;
}

export const DOCTRINES: Record<DoctrineId, DoctrineDef> = {
  balanced: {
    id: "balanced", name: "Balanced Defence",
    desc: "No asset is favoured. Guards answer whatever is most dangerous nearby.",
    weights: {}, breakerBias: 0,
  },
  shelter: {
    id: "shelter", name: "Protect the Shelter",
    desc: "The outpost comes first — guards collapse toward anything threatening the hull.",
    weights: { shelter: 2.2, bunks: 1.1 }, breakerBias: 120,
  },
  storage: {
    id: "storage", name: "Protect the Stores",
    desc: "The Supply Cache feeds the camp. Threats near it outrank everything else.",
    weights: { cache: 2.4 }, breakerBias: 120,
  },
  housing: {
    id: "housing", name: "Protect the Residents",
    desc: "Bunkhouse and quarters first — the watch screens where people sleep.",
    weights: { bunks: 2.4, shelter: 1.4 }, breakerBias: 60,
  },
  gate: {
    id: "gate", name: "Hold the Main Gate",
    desc: "The gate is the throat of the camp. Guards refuse to be drawn off it.",
    weights: { gate: 2.6 }, breakerBias: 60,
  },
  breakers: {
    id: "breakers", name: "Kill the Wall-Breakers",
    desc: "Bears and tide-leaders that smash structures are hunted before the rest.",
    weights: {}, breakerBias: 900,
  },
};

export const DOCTRINE_ORDER: DoctrineId[] = ["balanced", "shelter", "storage", "housing", "gate", "breakers"];

/** The camp's live doctrine (defaults to balanced on older saves). */
export function doctrineOf(s: GameState): DoctrineDef {
  const id = s.siege?.doctrine;
  return (id && DOCTRINES[id]) || DOCTRINES.balanced;
}

export const PRIORITY_LABEL: Record<GuardPriority, { name: string; desc: string }> = {
  balanced: { name: "Balanced", desc: "Weighs personal danger, civilians and camp assets evenly." },
  protect: { name: "Protect People", desc: "Prioritises beasts attacking residents above everything else." },
  hold: { name: "Hold the Line", desc: "Prioritises whatever is closest to the assigned post; rarely steps away." },
};

const THREAT: Record<string, number> = { guardian: 3, bear: 2.2, crawler: 1.3, wolf: 1 };

/**
 * Score a candidate target. Implements the required priority ladder:
 *   1 attacking this guard · 2 attacking a civilian · 3 at a critical structure
 *   4 threatening settlement buildings · 5 any other hostile in the area.
 * Distance is a tiebreaker only, so a guard does not swap targets every step.
 */
/** Priority score for one candidate. Exported so the ladder and the camp
 *  doctrine can be verified directly — acquireTarget ranks purely by this. */
export function scoreTarget(s: GameState, r: Resident, e: Enemy, anchor: Vec): number {
  const def = liveAssignment(s, r.post);
  const dToGuard = dist(r.x, r.y, e.x, e.y);
  const dToPost = dist(e.x, e.y, anchor.x, anchor.y);
  const pri = r.priority ?? "balanced";
  let score = 100;

  // 1 — the beast is engaging this guard
  if (e.alerted && dToGuard < ENEMY[e.kind].attackR + 70) score += 1000;

  // 2 — the beast is ATTACKING a civilian. An idle animal that merely happens
  // to stand near someone does not count: it must be roused and genuinely in
  // striking distance, otherwise every nearby beast would score as an attack.
  let civ = 0;
  if (e.alerted) {
    for (const o of s.settlement.residents) {
      if (o.id === r.id) continue;
      const dc = dist(o.x, o.y, e.x, e.y);
      if (dc < ENEMY[e.kind].attackR + 30) {
        civ = Math.max(civ, o.role === "worker" || o.downed ? 1 : 0.6);
      }
    }
  }
  // "Hold the Line" deliberately down-weights this: that policy exists for a
  // player who wants the post covered no matter what happens further out.
  score += civ * (pri === "protect" ? 1400 : pri === "hold" ? 400 : 800);

  // 3/4 — the beast is in reach of a critical structure (gate, shelter, cache,
  // bunkhouse, beacon). Enemies in this game do not damage buildings, so the
  // honest metric is proximity to the asset rather than invented structure HP.
  // The camp doctrine re-weights which asset the whole watch values most.
  const doc = doctrineOf(s);
  const w = doc.weights;
  const assets: { p: Vec; w: number }[] = [
    { p: ASSIGNMENTS.gate.anchor, w: 1 * (w.gate ?? 1) },
    { p: ASSIGNMENTS.shelter.anchor, w: 1 * (w.shelter ?? 1) },
    { p: ASSIGNMENTS.cache.anchor, w: 0.95 * (w.cache ?? 1) },
  ];
  if (s.build.bunks) assets.push({ p: ASSIGNMENTS.bunks.anchor, w: 0.9 * (w.bunks ?? 1) });
  if (s.build.beacon) assets.push({ p: ASSIGNMENTS.watchtower.anchor, w: 0.7 * (w.watchtower ?? 1) });
  let asset = 0;
  for (const a of assets) {
    const da = dist(e.x, e.y, a.p.x, a.p.y);
    if (da < 260) asset = Math.max(asset, a.w * (1 - da / 260));
  }
  score += asset * 600 * def.assetValue;

  // Doctrine: hunt the beasts that actually break structures first. The role
  // tag is set by the siege scheduler, so this only fires on real breakers.
  const role = (e as Enemy & { siegeRole?: string }).siegeRole;
  if (role === "breaker" || role === "leader") score += doc.breakerBias;

  // 5 — any other hostile inside the watched area, weighted by how dangerous
  //     the species actually is (parenthesised: `??` binds looser than `*`)
  score += (THREAT[e.kind] ?? 1) * 40;

  // Tiebreakers. "Hold" weights distance-from-post heavily enough to dominate
  // the ladder, which is exactly what that policy advertises; the other
  // policies use a soft blend of range-to-guard and range-to-post.
  score -= pri === "hold" ? dToPost * 1.5 : (dToGuard * 0.6 + dToPost * 0.4) * 0.5;

  // a wounded beast is worth finishing
  if (e.hp < e.max * 0.35) score += 60;
  return score;
}

/**
 * Pick the best target for this guard. Rules: inside the watch radius of the
 * assignment, inside the hard leash, visible (or very close — a beast at arm's
 * length is noticed regardless), and alive. Guards do NOT see the whole map.
 */
export function acquireTarget(s: GameState, r: Resident): Enemy | null {
  const anchor = postPoint(s, r);
  const watch = guardWatchRadius(s, r);
  const def = liveAssignment(s, r.post);
  let best: Enemy | null = null;
  let bestScore = -Infinity;

  for (const e of s.enemies) {
    if (!isHostile(e)) continue;
    const dPost = dist(e.x, e.y, anchor.x, anchor.y);
    const dGuard = dist(r.x, r.y, e.x, e.y);
    // inside the watched area, or already inside the leash and alerted at us
    const inArea = dPost <= watch || (e.alerted && dPost <= def.leash);
    if (!inArea) continue;
    // an alarm widens awareness but never beyond the leash
    if (dGuard > 90 && !hasSight(s, r.x, r.y, e.x, e.y) && r.alertT <= 0) continue;
    const sc = scoreTarget(s, r, e, anchor);
    if (sc > bestScore) { bestScore = sc; best = e; }
  }
  // Sticky targeting: keep the current target unless the new one is clearly
  // better. Prevents oscillation between two equidistant wolves.
  if (r.targetId && best && r.targetId !== best.id) {
    const cur = s.enemies.find(e => e.id === r.targetId);
    if (cur && isHostile(cur)) {
      const curScore = scoreTarget(s, r, cur, anchor);
      const curInLeash = dist(cur.x, cur.y, anchor.x, anchor.y) <= def.leash;
      if (curInLeash && curScore > bestScore - 150) return cur;
    }
  }
  return best;
}

// ═══════════════════════════ FSM ═══════════════════════════════════════════

function setState(r: Resident, next: GuardState) {
  if (r.gs === next) return;
  r.gs = next;
  r.gsT = 0;
  // Leaving a swing always clears its transient latches — an interrupted
  // attack can never resume mid-swing and double-apply damage.
  if (next !== "attack") { r.swingT = 0; r.hitDone = false; }
}

/** The swing: windup → exactly one damage application → recovery. */
function performSwing(g: Game, r: Resident, target: Enemy, dt: number) {
  const s = g.state;
  r.swingT += dt;
  const reach = guardReach(r);

  // the single damage frame
  if (!r.hitDone && r.swingT >= GUARD_AI.windup) {
    r.hitDone = true;                                  // latch: one hit per swing
    const d = dist(r.x, r.y, target.x, target.y);
    // Hit detection: the target must still be alive and inside reach at the
    // moment of the strike, exactly like the player's arc test.
    if (isHostile(target) && d <= reach * GUARD_AI.rangeHysteresis) {
      const dmg = guardDamage(r);
      target.hp -= dmg;
      target.hitT = 0.32;
      g.fx.float(target.x, target.y - 42, `${dmg}`, "#a5e0ff");
      g.fx.sfx("hit");
      // knockback, mirroring the player's melee feel (not for the boss)
      if (target.kind !== "guardian") {
        const kd = Math.atan2(target.y - r.y, target.x - r.x);
        target.vx += Math.cos(kd) * BAL.attack.knock * 0.45;
        target.vy += Math.sin(kd) * BAL.attack.knock * 0.45;
      }
      if (target.hp <= 0) {
        // Reuse the game's single kill path: loot, XP, stats, respawn timer.
        g.onEnemyKilled(target);
        r.targetId = null;
        r.kills = (r.kills ?? 0) + 1;
        g.fx.toast({ title: `${r.name} drove off a threat`, sub: `${ENEMY[target.kind].name} defeated at the ${assignmentOf(r.post).name}.`, kind: "good", icon: "residents" });
      } else {
        // the beast turns on its attacker
        if (["idle", "patrol", "return", "prowl"].includes(target.state)) {
          target.state = "chase"; target.stateT = 0; target.alerted = true;
        }
        // A real clash cuts both ways; armour genuinely reduces it.
        const mul = profileOf(s.difficulty).enemyDmgMul;
        const raw = ENEMY[target.kind].dmg * RES_BAL.clashMul * mul;
        const taken = Math.max(1, Math.round(raw * (1 - guardArmorDR(r))));
        hurtResident(g, r, taken, ENEMY[target.kind].name);
        raiseAlarm(s, r.x, r.y, `${r.name} is fighting a ${ENEMY[target.kind].name}`);
      }
    }
  }

  if (r.swingT >= GUARD_AI.windup + GUARD_AI.recover) {
    r.atkCd = RES_BAL.atkCd * (r.spec === "scout" ? 0.8 : 1);
    setState(r, "recover");
  }
}

/** Keep friendly units from stacking on one tile or plugging a doorway. */
export function separateResidents(s: GameState, dt: number) {
  const list = s.settlement.residents;
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i], b = list[j];
      if (a.downed && b.downed) continue;
      let dx = b.x - a.x, dy = b.y - a.y;
      let d = Math.hypot(dx, dy);
      if (d > GUARD_AI.separation) continue;
      // Perfectly stacked units have no separation axis of their own (this
      // happens after a load, or when several guards share a rally point), so
      // nudge them apart along a deterministic per-pair angle instead.
      if (d < 0.001) {
        const ang = ((i * 7 + j * 13) % 360) * (Math.PI / 180);
        dx = Math.cos(ang); dy = Math.sin(ang); d = 1;
      }
      const push = (GUARD_AI.separation - d) / d * GUARD_AI.separationPush * dt;
      const mx = dx * push * 0.5, my = dy * push * 0.5;
      if (!a.downed) { a.x -= mx; a.y -= my; }
      if (!b.downed) { b.x += mx; b.y += my; }
    }
  }
}

/**
 * One guard, one frame. Movement runs every frame (cheap: a vector plus the
 * shared collision resolve), while target acquisition — the only costly step —
 * runs on a staggered interval per guard.
 */
export function updateGuard(g: Game, r: Resident, dt: number, index: number) {
  const s = g.state;
  r.gsT += dt;
  r.alertT = Math.max(0, r.alertT - dt);
  r.atkCd = Math.max(0, r.atkCd - dt);

  const def = liveAssignment(s, r.post);
  const anchor = postPoint(s, r);
  const home = ASSIGNMENTS.rally.anchor;
  const speed = guardSpeed(s, r);

  // ── unconditional overrides (injury first: safety beats orders) ──────────
  if (r.downed) {
    r.targetId = null;
    if (!moveResident(g, r, home.x, home.y, speed * 0.45, dt)) setState(r, "retreat");
    else setState(r, "injured");
    return;
  }
  if (r.gs !== "injured" && r.gs !== "retreat" && r.hp / r.maxHp < GUARD_AI.retreatAt) {
    r.targetId = null;
    setState(r, "retreat");
  }

  if (r.gs === "retreat") {
    // disengage to the rally point; no attacking while withdrawing
    if (moveResident(g, r, home.x, home.y, speed * 1.05, dt)) setState(r, "injured");
    return;
  }
  if (r.gs === "injured") {
    // Rests until clearly fit again (returnAt ≫ retreatAt ⇒ no flip-flop).
    moveResident(g, r, home.x, home.y, speed * 0.4, dt);
    if (!r.injured && r.hp / r.maxHp >= GUARD_AI.returnAt) setState(r, "return");
    return;
  }

  // ── staggered target acquisition ─────────────────────────────────────────
  r.scanT -= dt;
  let target: Enemy | null = r.targetId ? s.enemies.find(e => e.id === r.targetId) ?? null : null;
  if (target && !isHostile(target)) { target = null; r.targetId = null; }
  if (r.scanT <= 0) {
    r.scanT = GUARD_AI.scanInterval + (index % 5) * 0.03;   // de-synchronise costs
    const found = acquireTarget(s, r);
    if (found) { target = found; r.targetId = found.id; r.lostT = 0; }
    else if (!found && r.targetId) {
      // grace period before forgetting — stops blink-in/blink-out thrash
      r.lostT += GUARD_AI.scanInterval;
      if (r.lostT >= GUARD_AI.loseGrace) { r.targetId = null; target = null; r.lostT = 0; }
    }
  }

  // leash enforcement: never chase past the assignment's limit
  if (target && dist(target.x, target.y, anchor.x, anchor.y) > def.leash) {
    target = null;
    r.targetId = null;
  }

  // ── state machine ────────────────────────────────────────────────────────
  switch (r.gs) {
    case "idle":
    case "guard":
    case "patrol": {
      if (target) { setState(r, "alert"); break; }
      if (def.kind === "patrol" && def.route && def.route.length > 0) {
        setState(r, "patrol");
        const wp = def.route[r.wpi % def.route.length];
        if (moveResident(g, r, wp.x, wp.y, speed * 0.8, dt)) {
          r.wpi = (r.wpi + 1) % def.route.length;
        } else if (r.stuckT > RES_BAL.pathBlockedAt) {
          // Route blocked: skip to the next waypoint instead of grinding into
          // the obstacle. If the whole ring is unreachable the guard will end
          // up idling safely at the anchor rather than walking through walls.
          r.wpi = (r.wpi + 1) % def.route.length;
          r.stuckT = 0;
        }
      } else {
        const d = dist(r.x, r.y, anchor.x, anchor.y);
        if (d > 26) {
          setState(r, "guard");
          if (!moveResident(g, r, anchor.x, anchor.y, speed * 0.7, dt) && r.stuckT > RES_BAL.pathBlockedAt) {
            setState(r, "idle");           // cannot reach the post — wait safely
            r.stuckT = 0;
          }
        } else {
          setState(r, "guard");
          r.face += dt * 0.35;             // slow scan of the approaches
        }
      }
      break;
    }

    case "alert": {
      if (!target) {
        if (r.gsT > GUARD_AI.alertConfirm) setState(r, "return");
        break;
      }
      r.face = Math.atan2(target.y - r.y, target.x - r.x);
      if (r.gsT >= GUARD_AI.alertConfirm) {
        if (r.gsT < GUARD_AI.alertConfirm + dt) {
          g.fx.sfx("warn");
          raiseAlarm(s, target.x, target.y, `${r.name} sighted a ${ENEMY[target.kind].name}`);
        }
        setState(r, "pursue");
      }
      break;
    }

    case "pursue": {
      if (!target) { setState(r, "return"); break; }
      const d = dist(r.x, r.y, target.x, target.y);
      const reach = guardReach(r);
      if (d <= reach && r.atkCd <= 0) { setState(r, "attack"); break; }
      if (d <= reach) { r.face = Math.atan2(target.y - r.y, target.x - r.x); break; }
      if (!moveResident(g, r, target.x, target.y, speed, dt) && r.stuckT > RES_BAL.pathBlockedAt) {
        // cannot path to it (wall between us) — drop and resume duty
        r.targetId = null;
        r.stuckT = 0;
        setState(r, "return");
      }
      break;
    }

    case "attack": {
      if (!target) { setState(r, "return"); break; }
      r.face = Math.atan2(target.y - r.y, target.x - r.x);
      performSwing(g, r, target, dt);
      break;
    }

    case "recover": {
      if (!target) { setState(r, "return"); break; }
      const d = dist(r.x, r.y, target.x, target.y);
      const reach = guardReach(r);
      // Scouts give ground between strikes; guards hold the line.
      if (r.spec === "scout" && r.gsT < GUARD_AI.scoutBackoff) {
        const ang = Math.atan2(r.y - target.y, r.x - target.x);
        moveResident(g, r, r.x + Math.cos(ang) * 40, r.y + Math.sin(ang) * 40, speed * 0.9, dt);
      }
      if (r.atkCd > 0) break;
      // Hysteresis: only leave attack range once clearly outside it.
      if (d <= reach) setState(r, "attack");
      else if (d <= reach * GUARD_AI.rangeHysteresis) { /* hold, do not thrash */ }
      else setState(r, "pursue");
      break;
    }

    case "return": {
      if (target && r.hp / r.maxHp >= GUARD_AI.returnAt) { setState(r, "alert"); break; }
      const d = dist(r.x, r.y, anchor.x, anchor.y);
      if (d <= 26 || moveResident(g, r, anchor.x, anchor.y, speed * 0.85, dt)) {
        setState(r, def.kind === "patrol" ? "patrol" : "guard");
      } else if (r.stuckT > RES_BAL.pathBlockedAt) {
        setState(r, "idle");
        r.stuckT = 0;
      }
      break;
    }
  }
}

/** Load-time normalisation: no transient combat state is ever restored. */
export function resetGuardRuntime(r: Resident) {
  r.swingT = 0;
  r.hitDone = false;
  r.targetId = null;
  r.atkCd = 0;
  r.clashCd = 0;
  r.hurtT = 0;
  r.alertT = 0;
  r.lostT = 0;
  r.stuckT = 0;
  r.scanT = 0;
  r.gsT = 0;
  // Always resume in a valid, non-combat state and walk back to the post.
  r.gs = r.downed || r.injured ? "injured" : "return";
}
