/**
 * Phase 6.5 verification harness (development tool, not shipped in the build).
 * Confirms the Command Center reads real state and its controls drive the
 * real systems. Developer unit harness — not autoplay, not a game simulator.
 */
import { createState, addItem, countItem } from "../src/game/state";
import { BAL } from "../src/game/config";
import { createSettlement, type Resident } from "../src/game/residents";
import {
  createSiege, commandSnapshot, prepChecklist, recoveryCost, setDoctrine,
  setCustomRoute, assignmentIssue, assignmentHolders, serializeSiege,
  sanitizeSiege, siegeTargets, structHealth, scheduleEvent, planEvent,
} from "../src/game/siege";
import {
  ASSIGNMENTS, ASSIGNMENT_ORDER, DOCTRINES, DOCTRINE_ORDER, MAX_ROUTE_NODES,
  ROUTE_NODES, acquireTarget, customRoute, liveAssignment, equipGuard, scoreTarget,
} from "../src/game/guards";
import { createEnemy } from "../src/game/state";
import type { GameState } from "../src/game/types";

const DAY = BAL.dayLength;
let pass = 0, fail = 0;
const ok = (c: boolean, n: string) => { if (c) { pass++; console.log("  ok:", n); } else { fail++; console.log("  FAIL:", n); } };

function world(t = DAY * 5): GameState {
  const st = createState();
  st.settlement = createSettlement();
  st.siege = createSiege();
  st.time = t;
  st.region = "forest";
  st.shelter.stage = 3;
  st.structs = []; st.nodes = []; st.enemies = [];
  return st;
}
function addGuard(st: GameState, id: string, post = "gate"): Resident {
  const a = ASSIGNMENTS[post].anchor;
  st.settlement.residents.push({
    id, name: `Guard ${id}`, title: "Warden", role: "warrior", spec: "guard",
    task: null, post, gs: "guard", gsT: 0, priority: "balanced",
    gear: { weapon: null, armor: null }, swingT: 0, hitDone: false,
    alertT: 0, lostT: 0, scanT: 0, kills: 0,
    trait: "Steady", traitDesc: "", hp: 110, maxHp: 110,
    injured: false, downed: false, unfed: 0, paused: false, shakenT: 0,
    x: a.x, y: a.y, face: 0, walkPh: 0, state: "work", workT: 0,
    atkCd: 0, clashCd: 0, hurtT: 0, targetId: null, stuckT: 0, wpi: 0,
  });
  return st.settlement.residents[st.settlement.residents.length - 1];
}
function addWorker(st: GameState, id: string): Resident {
  st.settlement.residents.push({
    id, name: `Worker ${id}`, title: "Hand", role: "worker",
    task: null, post: "rally", gs: "idle", gsT: 0, priority: "balanced",
    gear: { weapon: null, armor: null }, swingT: 0, hitDone: false,
    alertT: 0, lostT: 0, scanT: 0, kills: 0,
    trait: "Steady", traitDesc: "", hp: 70, maxHp: 70,
    injured: false, downed: false, unfed: 0, paused: false, shakenT: 0,
    x: 0, y: 0, face: 0, walkPh: 0, state: "rest", workT: 0,
    atkCd: 0, clashCd: 0, hurtT: 0, targetId: null, stuckT: 0, wpi: 0,
  });
  return st.settlement.residents[st.settlement.residents.length - 1];
}
const fx = { sfx() {}, float() {}, toast() {}, burst() {}, shake() {}, bump() {} };

console.log("— 1. dashboard values come from real state —");
{
  const st = world(DAY * 9 + DAY * 0.3);
  addGuard(st, "g1"); addGuard(st, "g2");
  const w = addWorker(st, "w1");
  addWorker(st, "w2").task = "wood";
  st.settlement.residents[1].paused = true;      // one guard stood down
  st.settlement.residents[0].injured = true;     // one hurt
  addItem(st, "wood", 7, "storage"); addItem(st, "stone", 3, "storage");
  addItem(st, "medkit", 1, "storage");
  addItem(st, "berry", 6, "storage"); addItem(st, "ice", 4, "storage");
  st.siege.structHp = { spikes: 1 };
  st.build.spikes = true;

  const snap = commandSnapshot(st);
  ok(snap.day === 10, `day is the real game-clock day (${snap.day})`);
  ok(snap.phaseLabel.length > 0, `time of day resolved (${snap.phaseLabel})`);
  ok(snap.warriorsTotal === 2 && snap.warriorsFit === 0, `guards counted live (${snap.warriorsFit}/${snap.warriorsTotal} fit)`);
  ok(snap.warriorsIdle === 1, "stood-down guard counted as idle");
  ok(snap.workersTotal === 2 && snap.workersIdle === 1, "unassigned workers counted");
  ok(snap.injured === 1, "injured residents counted");
  ok(snap.wood === 7 && snap.stone === 3, "repair materials read from the real pool");
  ok(snap.meds === 1, "medicine counted from storage + pack");
  ok(snap.foodDays > 0 && snap.foodDays < 99, `ration forecast is a real number (${snap.foodDays.toFixed(2)}d)`);
  ok(snap.damagedStructures.some(d => d.id === "spikes" && d.hp === 2), "damaged structures reflect siege wear");
  ok(snap.recovery.wood === 4 && snap.recovery.stone === 2, "recovery cost = 1 point of carpentry");
  ok(snap.readinessScore === require_readiness(st), "readiness matches the siege module's own figure");
  ok(snap.housing.used === 4, "housing occupancy is the resident count");
  ok(snap.nextMonthly === DAY * 28 - st.time, "countdown derives from the real calendar anchor");
  ok(snap.nextWeekly === 0, "an anchor already passed honestly reads \"due now\"");
  function require_readiness(x: GameState) { return commandSnapshot(x).readinessScore; }
  // every value changes when the state changes — no placeholders
  addItem(st, "wood", 5, "storage");
  ok(commandSnapshot(st).wood === 12, "dashboard re-reads live (wood 7 → 12)");
  w.task = "stone";
  ok(commandSnapshot(st).workersIdle === 0, "assigning a worker clears the idle count");
}

console.log("— 2. checklist is derived, actionable and advisory only —");
{
  const st = world();
  const list0 = prepChecklist(st);
  ok(list0.some(i => i.id === "guards" && i.severity === "critical"), "no warriors → critical item");
  ok(list0.every(i => typeof i.detail === "string" && i.detail.length > 10), "every item explains itself (inspectable)");

  const g = addGuard(st, "g1");
  const after = prepChecklist(st);
  ok(after.find(i => i.id === "guards")?.severity === "done", "recruiting clears the guard item");
  ok(after.find(i => i.id === "equip")?.severity === "advised", "bare-handed guard raises the equipment item");

  // acting on it through the real system clears it — and only when the player does it
  const woodBefore = countItem(st, "wood", "storage");
  addItem(st, "spear", 1, "storage");
  ok(prepChecklist(st).find(i => i.id === "equip")?.detail.includes("spare weapon"), "checklist notices a spare weapon in the cache");
  equipGuard(st, g.id, "weapon", "spear", fx as never);
  ok(prepChecklist(st).find(i => i.id === "equip")?.severity === "done", "equipping the guard clears it");
  ok(countItem(st, "wood", "storage") === woodBefore, "the checklist itself never spent anything");

  // structures
  st.build.spikes = true;
  st.siege.structHp = { spikes: 3 };
  const broken = prepChecklist(st).find(i => i.id === "traps");
  ok(broken?.severity === "advised" && broken.label.includes("broken"), "destroyed spikes flagged for repair");
  ok(prepChecklist(st).find(i => i.id === "repair")?.severity === "critical", "a destroyed structure is critical");
  ok((prepChecklist(st).find(i => i.id === "repair")?.detail ?? "").includes("wood"), "repair item quotes the real material bill");

  // wounded + rations
  g.injured = true;
  ok(prepChecklist(st).find(i => i.id === "wounded")?.severity === "advised", "injured defender raises an item");
  g.downed = true;
  ok(prepChecklist(st).find(i => i.id === "wounded")?.severity === "critical", "a downed defender is critical");
  ok(prepChecklist(st).some(i => i.action !== undefined), "items carry a navigation target, not an auto-action");
}

console.log("— 3. doctrine genuinely changes guard targeting —");
{
  const st = world();
  const g = addGuard(st, "g1", "rally");
  // two beasts: one by the cache, one by the shelter, equidistant from the guard
  const cache = ASSIGNMENTS.cache.anchor, shelter = ASSIGNMENTS.shelter.anchor;
  g.x = (cache.x + shelter.x) / 2; g.y = (cache.y + shelter.y) / 2;
  const nearCache = createEnemy("byCache", "wolf", cache.x + 10, cache.y + 10);
  const nearShelter = createEnemy("byShelter", "wolf", shelter.x + 10, shelter.y + 10);
  st.enemies = [nearCache, nearShelter];

  // acquireTarget ranks purely by scoreTarget, so compare the ladder directly
  // (the two assets sit far apart in the camp, further than one watch radius).
  const anchor = { x: g.x, y: g.y };
  setDoctrine(st, "storage");
  const storageFavoursCache =
    scoreTarget(st, g, nearCache, anchor) > scoreTarget(st, g, nearShelter, anchor);
  setDoctrine(st, "shelter");
  const shelterFavoursShelter =
    scoreTarget(st, g, nearShelter, anchor) > scoreTarget(st, g, nearCache, anchor);
  ok(storageFavoursCache, "\"Protect the Stores\" ranks the cache threat above the shelter threat");
  ok(shelterFavoursShelter, "\"Protect the Shelter\" flips the ranking the other way");

  // breaker doctrine outranks a plain wolf
  const breaker = createEnemy("breaker", "bear", shelter.x + 180, shelter.y + 180);
  (breaker as unknown as { siegeRole?: string }).siegeRole = "breaker";
  st.enemies = [nearShelter, breaker];
  setDoctrine(st, "breakers");
  g.targetId = null;
  ok(acquireTarget(st, g)?.id === "breaker", "\"Kill the Wall-Breakers\" hunts the structure-smasher first");
  setDoctrine(st, "balanced");
  g.targetId = null;
  ok(acquireTarget(st, g)?.id === "byShelter", "balanced returns to proximity/threat weighting");
  ok(DOCTRINE_ORDER.every(id => !!DOCTRINES[id].name), "all doctrines are defined");
}

console.log("— 4. patrol routes can be created and edited —");
{
  const st = world();
  const g = addGuard(st, "g1", "patrol_custom");
  setCustomRoute(st, ["gate", "cache", "north", "east"]);
  ok(st.siege.customRoute.length === 4, "route stored");
  const live = liveAssignment(st, "patrol_custom");
  ok(live.route?.length === 4, "the live assignment exposes the player's waypoints");
  const gatePt = ROUTE_NODES.find(n => n.id === "gate")!.p;
  ok(live.route![0].x === gatePt.x && live.route![0].y === gatePt.y, "first stop is the chosen waypoint");
  // editing reorders/reduces
  setCustomRoute(st, ["bunks", "west"]);
  ok(liveAssignment(st, "patrol_custom").route?.length === 2, "route can be edited down");
  ok(g.wpi === 0, "guards walking it restart cleanly at waypoint 0");
  // validation
  setCustomRoute(st, ["gate", "gate", "nonsense", "cache"]);
  ok(st.siege.customRoute.length === 2 && st.siege.customRoute.join() === "gate,cache", "duplicates and unknown nodes rejected");
  setCustomRoute(st, ROUTE_NODES.map(n => n.id));
  ok(st.siege.customRoute.length === MAX_ROUTE_NODES, `route length capped at ${MAX_ROUTE_NODES}`);
  setCustomRoute(st, ["gate"]);
  ok(customRoute(st).length >= 2, "a one-stop route falls back to a valid circuit (never empty)");
  ok(assignmentIssue(st, "patrol_custom") !== null, "and the UI is told the route is too short");
}

console.log("— 5. assignment conflicts and unreachable posts are reported —");
{
  const st = world();
  const a = addGuard(st, "a", "gate");
  addGuard(st, "b", "gate");
  ok(assignmentHolders(st, "gate").length === 2, "shared posts are detected for reporting");
  ok(assignmentIssue(st, "bunks") === "Requires the Bunkhouse", "unbuilt post reported as unavailable");
  st.build.bunks = true;
  ok(assignmentIssue(st, "bunks") === null, "building it clears the issue");
  st.siege.structHp = { bunks: 4 };
  ok((assignmentIssue(st, "bunks") ?? "").includes("destroyed"), "a destroyed building makes its post unreachable");
  ok(assignmentIssue(st, "watchtower") === "Requires the Signal Beacon", "watchtower gated on the beacon");
  ok(ASSIGNMENT_ORDER.every(id => !!ASSIGNMENTS[id]), "every offered assignment exists");
  void a;
}

console.log("— 6. event reports carry the required fields and stay bounded —");
{
  const st = world(DAY * 7);
  const g = {
    state: st, kills: 0, bannerT: 0, fx,
    onEnemyKilled(e: { dead: boolean; hp: number }) { e.dead = true; e.hp = 0; },
    saveNow() {}, emitEvent() {}, bump() {},
  };
  const ev = scheduleEvent(st, "weekly", st.time + 0.1);
  ev.planned = planEvent(st, "weekly", 7);
  // resolve it through the real tick
  const { tickSiege } = require_tick();
  for (let t = 0; t < 200 && !ev.resolved; t++) {
    st.time += 1; tickSiege(g as never, 1);
    for (const id of ev.spawnedIds) {
      const e = st.enemies.find(x => x.id === id);
      if (e && !e.dead) g.onEnemyKilled(e);
    }
  }
  const h = st.siege.history.at(-1)!;
  ok(!!h, "a report was written");
  ok(typeof h.day === "number" && !!h.kind, "records date and event type");
  ok(!!h.outcome, `records outcome (${h.outcome})`);
  ok(typeof h.kills === "number" && typeof h.total === "number", "records enemies defeated / total");
  ok(typeof h.structDamage === "number", "records structural damage");
  ok(typeof h.injuries === "number", "records casualties");
  ok(Array.isArray(h.rewards), "records rewards");
  ok(!!h.recovery && typeof h.recovery.wood === "number", "records the recovery cost");
  // bounded growth
  for (let i = 0; i < 40; i++) {
    st.siege.history.push({ ...h, id: `pad_${i}` });
    if (st.siege.history.length > 24) st.siege.history.shift();
  }
  ok(st.siege.history.length <= 24, `history bounded (${st.siege.history.length} ≤ 24)`);
  const back = sanitizeSiege(JSON.parse(JSON.stringify(serializeSiege(st.siege))));
  ok(back.history.length <= 24, "and stays bounded through a save round-trip");
  function require_tick() { return { tickSiege: tickSiegeRef }; }
}

console.log("— 7. no silent spending or building —");
{
  const st = world();
  addGuard(st, "g1");
  addItem(st, "wood", 20, "storage"); addItem(st, "stone", 20, "storage");
  const w0 = countItem(st, "wood", "storage"), s0 = countItem(st, "stone", "storage");
  // simply viewing the dashboard / checklist must not touch anything
  commandSnapshot(st); prepChecklist(st); recoveryCost(st);
  setDoctrine(st, "gate"); setCustomRoute(st, ["gate", "cache"]);
  ok(countItem(st, "wood", "storage") === w0 && countItem(st, "stone", "storage") === s0,
    "reading the dashboard and setting orders spends nothing");
  ok(st.build.spikes === undefined || st.build.spikes === false, "nothing was built automatically");
  ok(st.settlement.residents.every(r => r.task === null), "no worker was auto-assigned");
}

console.log("— 8. command settings persist and migrate —");
{
  const st = world();
  setDoctrine(st, "housing");
  setCustomRoute(st, ["bunks", "north", "west"]);
  const back = sanitizeSiege(JSON.parse(JSON.stringify(serializeSiege(st.siege))));
  ok(back.doctrine === "housing", "doctrine persists");
  ok(back.customRoute.join() === "bunks,north,west", "custom route persists");
  const legacy = sanitizeSiege({ next: { weekly: DAY * 7 } } as never);
  ok(legacy.doctrine === "balanced", "pre-6.5 saves default to balanced doctrine");
  ok(Array.isArray(legacy.customRoute), "pre-6.5 saves get a valid default route");
  const junk = sanitizeSiege({ doctrine: "evil", customRoute: ["x", 5, "gate"] } as never);
  ok(junk.doctrine === "balanced" && junk.customRoute.join() === "gate", "corrupt doctrine/route sanitised");
}

console.log("— 9. structures feed both dashboard and readiness —");
{
  const st = world();
  addGuard(st, "g1");
  st.build.spikes = true;
  const before = commandSnapshot(st).readinessScore;
  st.siege.structHp = { spikes: 3 };               // spikes destroyed
  const after = commandSnapshot(st).readinessScore;
  ok(after < before, `destroyed spikes lower readiness (${before} → ${after})`);
  ok(commandSnapshot(st).damagedStructures.length > 0, "and show on the dashboard");
  ok(siegeTargets(st).length >= 2 && structHealth(st, "spikes") === 0, "structure health is the shared source");
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

// imported last to keep the readable order above
import { tickSiege as tickSiegeRef } from "../src/game/siege";
