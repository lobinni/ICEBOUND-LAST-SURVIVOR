/**
 * Phase 6.3 verification harness (development tool, not shipped in the build).
 * Run with:  npx esbuild tools/phase63.test.ts --bundle --platform=node \
 *              --format=esm --outfile=/tmp/g63.mjs && node /tmp/g63.mjs
 *
 * This exercises the guard AI through the real settlement tick — it is a test
 * harness for the developer, NOT an in-game autoplay or bot system.
 */
import { createState, createEnemy, addItem, countItem } from "../src/game/state";
import { WORLD } from "../src/game/config";
import {
  tickSettlement, createSettlement, setWarriorPost, setGuardPriority, togglePause,
  serializeSettlement, sanitizeSettlement, hurtResident,
} from "../src/game/residents";
import {
  ASSIGNMENTS, ASSIGNMENT_ORDER, GUARD_AI, acquireTarget, assignmentLocked, equipGuard,
  guardDamage, guardReach, guardArmorDR, isHostile, raiseAlarm, separateResidents, liveAssignment,
} from "../src/game/guards";
import type { GameState } from "../src/game/types";
import type { Resident } from "../src/game/residents";

let pass = 0, fail = 0;
const ok = (c: boolean, n: string) => { if (c) { pass++; console.log("  ok:", n); } else { fail++; console.log("  FAIL:", n); } };

function mock(s: GameState) {
  return {
    state: s, kills: 0,
    fx: { sfx() {}, float() {}, toast() {}, burst() {}, shake() {}, bump() {} },
    onEnemyKilled(e: { dead: boolean; hp: number; state: string }) { e.dead = true; e.hp = 0; e.state = "dead"; this.kills++; },
  };
}
function world(): GameState {
  const st = createState();
  st.settlement = createSettlement();
  st.region = "forest";
  st.shelter.stage = 3;
  st.structs = []; st.nodes = []; st.enemies = [];
  return st;
}
function addGuard(st: GameState, id = "g1", spec: "guard" | "scout" = "guard", post = "gate"): Resident {
  const a = ASSIGNMENTS[post].anchor;
  st.settlement.residents.push({
    id, name: "Test Guard", title: "Warden", role: "warrior", spec,
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
const tick = (g: ReturnType<typeof mock>, secs: number, dt = 0.05) => {
  for (let t = 0; t < secs; t += dt) tickSettlement(g as never, dt);
};

console.log("— 1. assignments are real, valid destinations —");
{
  const st = world();
  ok(ASSIGNMENT_ORDER.length === 9, `9 assignable positions incl. the Phase 6.5 custom route (${ASSIGNMENT_ORDER.length})`);
  let allValid = true;
  for (const id of ASSIGNMENT_ORDER) {
    const d = ASSIGNMENTS[id];
    if (!isFinite(d.anchor.x) || !isFinite(d.anchor.y)) allValid = false;
    if (d.anchor.x <= WORLD.minX || d.anchor.x >= WORLD.maxX) allValid = false;
    if (d.anchor.y <= WORLD.minY || d.anchor.y >= WORLD.maxY) allValid = false;
  }
  ok(allValid, "every assignment anchor is finite and inside the world");
  const routes = ASSIGNMENT_ORDER.filter(id => ASSIGNMENTS[id].kind === "patrol");
  ok(routes.length === 3, "three patrol assignments (inner, outer, custom)");
  const fixed = routes.filter(id => id !== "patrol_custom");
  ok(fixed.every(id => (ASSIGNMENTS[id].route?.length ?? 0) >= 4), "fixed patrol routes have ≥4 waypoints");
  // the custom route is authored by the player and resolved live
  ok((ASSIGNMENTS.patrol_custom.route?.length ?? 0) === 0, "custom route holds no static waypoints");
  ok(liveAssignment(st, "patrol_custom").route!.length >= 2, "and resolves live to a valid circuit");
  ok(!!assignmentLocked(st, ASSIGNMENTS.watchtower), "watchtower locked without the beacon");
  st.build.beacon = true;
  ok(!assignmentLocked(st, ASSIGNMENTS.watchtower), "watchtower unlocks with the beacon");
}

console.log("— 2. guards receive assignments —");
{
  const st = world(); const g = mock(st); const w = addGuard(st);
  ok(setWarriorPost(st, w.id, "patrol_outer"), "assigned to outer patrol");
  ok(w.post === "patrol_outer" && w.gs === "return", "post stored, re-enters via ReturnToAssignment");
  ok(!setWarriorPost(st, w.id, "watchtower", g.fx as never), "locked assignment refused");
  ok(w.post === "patrol_outer", "refused assignment did not apply");
  ok(!setWarriorPost(st, w.id, "nonexistent"), "unknown assignment refused");
}

console.log("— 3. patrol uses waypoints and advances —");
{
  const st = world(); const g = mock(st); const w = addGuard(st, "p1", "scout", "patrol_inner");
  const start = { x: w.x, y: w.y };
  tick(g, 25);
  const moved = Math.hypot(w.x - start.x, w.y - start.y);
  ok(moved > 60, `patroller actually walks (${moved.toFixed(0)}u)`);
  ok(w.gs === "patrol" || w.gs === "return", `in a patrol state (${w.gs})`);
  tick(g, 60);
  ok(w.wpi > 0 || w.gs === "patrol", "advances along the route");
}

console.log("— 4. detection rules: no global awareness —");
{
  const st = world(); const w = addGuard(st, "d1", "guard", "gate");
  const far = createEnemy("far", "wolf", 1500, 1200);
  const near = createEnemy("near", "wolf", ASSIGNMENTS.gate.anchor.x + 120, ASSIGNMENTS.gate.anchor.y + 60);
  st.enemies = [far, near];
  ok(acquireTarget(st, w)?.id === "near", "only the nearby beast is detected");
  st.enemies = [far];
  ok(acquireTarget(st, w) === null, "distant beast across the map is NOT detected");
  const hare = createEnemy("h", "hare", ASSIGNMENTS.gate.anchor.x + 60, ASSIGNMENTS.gate.anchor.y);
  const dead = createEnemy("dw", "wolf", ASSIGNMENTS.gate.anchor.x + 60, ASSIGNMENTS.gate.anchor.y);
  dead.dead = true; dead.hp = 0;
  st.enemies = [hare, dead];
  ok(acquireTarget(st, w) === null, "hares and dead beasts are not targets");
  ok(!isHostile(dead) && !isHostile(hare), "isHostile rejects dead + prey");
  const hid = createEnemy("c", "crawler", ASSIGNMENTS.gate.anchor.x + 60, ASSIGNMENTS.gate.anchor.y);
  hid.state = "hidden";
  st.enemies = [hid];
  ok(acquireTarget(st, w) === null, "buried crawler is not targeted until it emerges");
}

console.log("— 5. line of sight is blocked by solid structures —");
{
  const st = world(); const w = addGuard(st, "los", "guard", "gate");
  const a = ASSIGNMENTS.gate.anchor;
  const e = createEnemy("behind", "wolf", a.x + 200, a.y);
  st.enemies = [e];
  ok(acquireTarget(st, w)?.id === "behind", "sees it with a clear sightline");
  st.structs = [{ id: "wall", kind: "ruin", x: a.x + 100, y: a.y, r: 90, solid: 86, seed: 1 }];
  ok(acquireTarget(st, w) === null, "cannot see through a solid wall");
}

console.log("— 6. target priority ladder —");
{
  const st = world(); const w = addGuard(st, "pr", "guard", "shelter");
  const a = ASSIGNMENTS.shelter.anchor;
  st.settlement.residents.push({ ...w, id: "civ", role: "worker", spec: undefined, x: a.x + 150, y: a.y + 40 });
  const nearIdle = createEnemy("idle", "wolf", a.x + 40, a.y + 10);
  const onCiv = createEnemy("onciv", "wolf", a.x + 155, a.y + 45);
  onCiv.alerted = true;
  st.enemies = [nearIdle, onCiv];
  setGuardPriority(st, w.id, "protect");
  ok(acquireTarget(st, w)?.id === "onciv", "Protect People picks the beast mauling a civilian over a closer idle one");
  setGuardPriority(st, w.id, "hold");
  ok(acquireTarget(st, w)?.id === "idle", "Hold the Line picks the threat nearest the post");
}

console.log("— 7. leash: guards never abandon the post —");
{
  const st = world(); const g = mock(st); const w = addGuard(st, "l1", "guard", "gate");
  const a = ASSIGNMENTS.gate.anchor;
  const bait = createEnemy("bait", "wolf", a.x + 150, a.y);
  st.enemies = [bait];
  tick(g, 2);
  ok(w.targetId === "bait", "engaged the intruder");
  bait.x = a.x + 1500; bait.y = a.y + 900;
  tick(g, 6);
  const dFromPost = Math.hypot(w.x - a.x, w.y - a.y);
  ok(dFromPost <= ASSIGNMENTS.gate.leash + 40, `stayed within leash (${dFromPost.toFixed(0)} ≤ ${ASSIGNMENTS.gate.leash})`);
  ok(w.targetId === null, "dropped the out-of-leash target");
}

console.log("— 8. combat: real damage, one hit per swing —");
{
  const st = world(); const g = mock(st); const w = addGuard(st, "c1", "guard", "gate");
  const a = ASSIGNMENTS.gate.anchor;
  const wolf = createEnemy("w", "wolf", a.x + 30, a.y);
  st.enemies = [wolf];
  const hp0 = wolf.hp;
  tick(g, GUARD_AI.alertConfirm + GUARD_AI.windup + 0.2, 0.05);
  const afterOne = wolf.hp;
  ok(afterOne < hp0, `swing dealt real damage (${hp0.toFixed(0)} → ${afterOne.toFixed(0)})`);
  const dealt = hp0 - afterOne;
  ok(Math.abs(dealt - guardDamage(w)) < 0.001, `exactly one application of ${guardDamage(w)} dmg (no double-hit)`);
  tick(g, 0.2, 0.05);
  ok(Math.abs((hp0 - wolf.hp) - dealt) < 0.001, "the same swing cannot re-apply damage");
}

console.log("— 9. kill handling: defeated targets are dropped —");
{
  const st = world(); const g = mock(st); const w = addGuard(st, "k1", "guard", "gate");
  const a = ASSIGNMENTS.gate.anchor;
  const wolf = createEnemy("wk", "wolf", a.x + 30, a.y);
  wolf.hp = 1;
  st.enemies = [wolf];
  tick(g, 3);
  ok(wolf.dead, "beast was killed through the shared onEnemyKilled path");
  ok(g.kills === 1, "kill routed exactly once");
  ok(w.targetId === null, "guard released the dead target");
  ok(w.kills === 1, "defensive kill recorded on the guard");
  const hpAfter = wolf.hp;
  tick(g, 3);
  ok(wolf.hp === hpAfter, "dead beast is never attacked again");
}

console.log("— 10. equipment affects damage, reach, armour; items are real —");
{
  const st = world(); const g = mock(st); const w = addGuard(st, "e1", "guard", "gate");
  const bareDmg = guardDamage(w), bareReach = guardReach(w);
  ok(!equipGuard(st, w.id, "weapon", "warspear", g.fx as never), "cannot equip an item the camp does not have");
  addItem(st, "warspear", 1, "storage");
  ok(equipGuard(st, w.id, "weapon", "warspear", g.fx as never), "equips a real Reinforced Spear from storage");
  ok(countItem(st, "warspear", "storage") === 0, "item was moved out of the pool (not duplicated)");
  ok(guardDamage(w) > bareDmg, `better weapon → more damage (${bareDmg} → ${guardDamage(w)})`);
  ok(guardReach(w) > bareReach, `spear → longer reach (${bareReach} → ${guardReach(w)})`);
  addItem(st, "coat", 1, "storage");
  const dr0 = guardArmorDR(w);
  equipGuard(st, w.id, "armor", "coat", g.fx as never);
  ok(guardArmorDR(w) > dr0, `armour → damage reduction (${(dr0 * 100).toFixed(0)}% → ${(guardArmorDR(w) * 100).toFixed(0)}%)`);
  equipGuard(st, w.id, "weapon", null, g.fx as never);
  ok(countItem(st, "warspear", "storage") === 1, "unequipping returns the item to storage");
  ok(w.gear.weapon === null, "slot cleared");
  const a = ASSIGNMENTS.gate.anchor;
  st.enemies = [createEnemy("b", "bear", a.x + 30, a.y)];
  const before = w.hp;
  tick(g, 3);
  ok(w.hp < before, "guard takes real clash damage in melee");
}

console.log("— 11. no friendly fire —");
{
  const st = world(); const g = mock(st);
  const w = addGuard(st, "f1", "guard", "shelter");
  const a = ASSIGNMENTS.shelter.anchor;
  st.settlement.residents.push({ ...w, id: "civ2", role: "worker", spec: undefined, hp: 70, maxHp: 70, x: a.x + 10, y: a.y + 10 });
  const civ = st.settlement.residents[1];
  const hp0 = civ.hp;
  tick(g, 8);
  ok(civ.hp === hp0, "guard never damages a fellow resident");
  ok(w.targetId === null, "residents are never acquired as targets");
}

console.log("— 12. separation prevents clustering —");
{
  const st = world();
  const a = ASSIGNMENTS.rally.anchor;
  for (let i = 0; i < 4; i++) {
    const r = addGuard(st, "s" + i, "guard", "rally");
    r.x = a.x; r.y = a.y;
  }
  for (let i = 0; i < 40; i++) separateResidents(st, 0.05);
  let minD = Infinity;
  const rs = st.settlement.residents;
  for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) {
    minD = Math.min(minD, Math.hypot(rs[i].x - rs[j].x, rs[i].y - rs[j].y));
  }
  ok(minD > 8, `stacked guards pushed apart (min spacing ${minD.toFixed(1)}u)`);
}

console.log("— 13. retreat / recovery hysteresis (no flip-flop) —");
{
  const st = world(); const g = mock(st); const w = addGuard(st, "r1", "guard", "gate");
  ok(GUARD_AI.returnAt > GUARD_AI.retreatAt + 0.2, "a wide band separates retreat from return-to-duty");
  const a = ASSIGNMENTS.gate.anchor;
  st.enemies = [createEnemy("rw", "wolf", a.x + 40, a.y)];
  w.hp = w.maxHp * 0.3;
  tick(g, 1);
  ok(w.gs === "retreat" || w.gs === "injured", `wounded guard disengages (${w.gs})`);
  ok(w.targetId === null, "stops aggressive behaviour while hurt");
  w.hp = w.maxHp * (GUARD_AI.retreatAt + 0.1);
  w.injured = false;
  tick(g, 4);
  ok(w.gs === "injured" || w.gs === "retreat", "does not resume duty inside the hysteresis band");
  w.hp = w.maxHp;
  tick(g, 6);
  ok(w.gs !== "injured" && w.gs !== "retreat", `returns to duty once recovered (${w.gs})`);
}

console.log("— 14. state stability at the detection boundary —");
{
  const st = world(); const g = mock(st); const w = addGuard(st, "t1", "guard", "gate");
  const a = ASSIGNMENTS.gate.anchor;
  const e = createEnemy("edge", "wolf", a.x, a.y + ASSIGNMENTS.gate.watch - 4);
  st.enemies = [e];
  let changes = 0; let prev = w.gs;
  for (let i = 0; i < 200; i++) {
    e.y = a.y + ASSIGNMENTS.gate.watch + (i % 2 === 0 ? -8 : 8);
    tickSettlement(g as never, 0.05);
    if (w.gs !== prev) { changes++; prev = w.gs; }
  }
  ok(changes < 25, `state changes stay bounded across 10s of boundary jitter (${changes})`);
}

console.log("— 15. alarm propagation is local, not global —");
{
  const st = world();
  const near = addGuard(st, "an", "guard", "shelter");
  const far = addGuard(st, "af", "guard", "gate");
  far.x = 3000; far.y = 3000;
  raiseAlarm(st, near.x + 50, near.y, "test");
  ok(near.alertT > 0, "guard within earshot hears the alarm");
  ok(far.alertT === 0, "guard out of earshot does not");
  ok(st.settlement.alarm?.reason === "test", "alarm recorded for the UI");
}

console.log("— 16. hurting a civilian raises an alarm —");
{
  const st = world(); const g = mock(st);
  const guard = addGuard(st, "ag", "guard", "shelter");
  const a = ASSIGNMENTS.shelter.anchor;
  st.settlement.residents.push({ ...guard, id: "civ3", role: "worker", spec: undefined, x: a.x + 60, y: a.y, hp: 70, maxHp: 70 });
  const civ = st.settlement.residents[1];
  hurtResident(g as never, civ, 5, "wolf");
  ok(st.settlement.alarm !== null, "an attack on a worker raises the camp alarm");
  ok(guard.alertT > 0, "the nearby guard is alerted by it");
}

console.log("— 17. pause / resume does not duplicate AI —");
{
  const st = world(); const g = mock(st); const w = addGuard(st, "pz", "guard", "gate");
  const a = ASSIGNMENTS.gate.anchor;
  const wolf = createEnemy("pw", "wolf", a.x + 30, a.y);
  st.enemies = [wolf];
  togglePause(st, w.id);
  const hp0 = wolf.hp;
  tick(g, 5);
  ok(wolf.hp === hp0, "a stood-down guard does not fight");
  ok(w.gs === "idle" && w.targetId === null && w.swingT === 0, "paused guard holds a clean idle state");
  togglePause(st, w.id);
  // A stood-down guard walks home, so resuming includes the march back.
  tick(g, 12);
  ok(wolf.hp < hp0, "resumes fighting after resume");
  const st2 = world(); const g2 = mock(st2); const w2 = addGuard(st2, "pz2", "guard", "gate");
  const wolf2 = createEnemy("pw2", "wolf", a.x + 30, a.y);
  st2.enemies = [wolf2];
  const h0 = wolf2.hp;
  tick(g2, GUARD_AI.alertConfirm + GUARD_AI.windup + 0.2, 0.05);
  ok(Math.abs((h0 - wolf2.hp) - guardDamage(w2)) < 0.001, "one swing = one damage event, same as before pausing");
}

console.log("— 18. save/load: durable state kept, transient dropped —");
{
  const st = world(); const g = mock(st); const w = addGuard(st, "sv", "scout", "patrol_outer");
  addItem(st, "spear", 1, "storage"); addItem(st, "parka", 1, "storage");
  equipGuard(st, w.id, "weapon", "spear", g.fx as never);
  equipGuard(st, w.id, "armor", "parka", g.fx as never);
  setGuardPriority(st, w.id, "protect");
  w.hp = 60; w.injured = true; w.wpi = 3; w.kills = 4;
  w.gs = "attack"; w.swingT = 0.2; w.hitDone = true; w.targetId = "wolf_x"; w.alertT = 9; w.atkCd = 1.2;
  const back = sanitizeSettlement(JSON.parse(JSON.stringify(serializeSettlement(st.settlement))));
  const r = back.residents[0];
  ok(r.id === "sv" && r.role === "warrior" && r.spec === "scout", "identity + role + spec restored");
  ok(r.post === "patrol_outer" && r.wpi === 3, "assignment and patrol progress restored");
  ok(r.gear.weapon === "spear" && r.gear.armor === "parka", "equipment restored");
  ok(r.hp === 60 && r.injured === true, "health and injury restored");
  ok(r.priority === "protect", "priority policy restored");
  ok(r.kills === 4, "record restored");
  ok(r.gs === "injured", `injured guard resumes in a valid resting state (${r.gs})`);
  ok(r.swingT === 0 && r.hitDone === false && r.targetId === null && r.atkCd === 0, "transient attack state was NOT persisted");
  ok(back.alarm === null, "the camp alarm is never saved");
  const w2 = addGuard(st, "sv2", "guard", "cache");
  w2.gs = "attack"; w2.hitDone = true;
  const back2 = sanitizeSettlement(JSON.parse(JSON.stringify(serializeSettlement(st.settlement))));
  ok(back2.residents.find(x => x.id === "sv2")!.gs === "return", "healthy guard resumes via ReturnToAssignment");
  const junk = sanitizeSettlement({
    residents: [{
      id: "x", name: "X", role: "warrior", post: "nowhere",
      gear: { weapon: "banana", armor: "medkit" }, priority: "evil", gs: "attack",
    }],
  } as never);
  const rj = junk.residents[0];
  ok(rj.post === "gate", "unknown assignment falls back to a valid post");
  ok(rj.gear.weapon === null && rj.gear.armor === null, "non-equipment items rejected");
  ok(rj.priority === "balanced", "unknown priority rejected");
}

console.log("— 19. legacy Phase 6.2 saves migrate —");
{
  const old = sanitizeSettlement({
    residents: [
      { id: "a", name: "A", role: "warrior", spec: "guard", post: "camp", hp: 90, maxHp: 110 },
      { id: "b", name: "B", role: "warrior", spec: "scout", post: "perimeter", hp: 70, maxHp: 76 },
    ],
  } as never);
  ok(old.residents[0].post === "shelter", "old 'camp' post → Shelter Guard");
  ok(old.residents[1].post === "patrol_outer", "old 'perimeter' post → Outer Patrol");
  ok(old.residents.every(r => !!r.gear && r.gs === "return"), "migrated guards get gear slots + valid state");
}

console.log("— 20. guards return to duty after combat —");
{
  const st = world(); const g = mock(st); const w = addGuard(st, "rt", "guard", "cache");
  const a = ASSIGNMENTS.cache.anchor;
  const wolf = createEnemy("rw2", "wolf", a.x + 120, a.y + 60);
  wolf.hp = 1;
  st.enemies = [wolf];
  tick(g, 4);
  ok(wolf.dead, "threat neutralised");
  tick(g, 12);
  const d = Math.hypot(w.x - a.x, w.y - a.y);
  ok(d < 60, `walked back to the assigned post (${d.toFixed(0)}u away)`);
  ok(w.gs === "guard", `resumed holding the post (${w.gs})`);
}

console.log("— 21. perf: scans are staggered, not every frame —");
{
  const st = world(); const g = mock(st);
  for (let i = 0; i < 4; i++) addGuard(st, "pf" + i, "guard", "rally");
  st.enemies = [createEnemy("pfw", "wolf", 2000, 2000)];
  tickSettlement(g as never, 0.016);
  const scans = st.settlement.residents.map(r => r.scanT.toFixed(3));
  ok(new Set(scans).size > 1, `scan timers are de-synchronised (${scans.join(", ")})`);
  ok(st.settlement.residents.every(r => r.scanT > 0), "scan interval gates the expensive step");
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
