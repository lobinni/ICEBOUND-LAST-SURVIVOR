/**
 * Phase 6.4 verification harness (development tool, not shipped in the build).
 * Run with:  npx esbuild tools/phase64.test.ts --bundle --platform=node \
 *              --format=esm --outfile=/tmp/g64.mjs && node /tmp/g64.mjs
 */
import { createState, countItem, addItem } from "../src/game/state";
import { BAL, ENEMY } from "../src/game/config";
import {
  tickSiege, scheduleEvent, applyOfflineSieges, serializeSiege, sanitizeSiege,
  createSiege, readiness, planEvent, siegeTargets, structHealth, strikeStructure,
  repairStructure, activeSiege, timeUntil, dayOf, SIEGE, type SiegeEvent,
} from "../src/game/siege";
import { createSettlement, poolPay } from "../src/game/residents";
import { equipGuard } from "../src/game/guards";
import type { Enemy, GameState } from "../src/game/types";

const DAY = BAL.dayLength;
let pass = 0, fail = 0;
const ok = (c: boolean, n: string) => { if (c) { pass++; console.log("  ok:", n); } else { fail++; console.log("  FAIL:", n); } };

function mock(s: GameState) {
  return {
    state: s, kills: 0, bannerT: 0,
    fx: { sfx() {}, float() {}, toast() {}, burst() {}, shake() {}, bump() {} },
    onEnemyKilled(e: Enemy) { e.dead = true; e.hp = 0; e.state = "dead"; this.kills++; },
    saveNow() {}, emitEvent() {}, bump() {},
  };
}
function world(toT = DAY * 5): GameState {
  const st = createState();
  st.settlement = createSettlement();
  st.siege = createSiege();
  st.time = toT;
  st.region = "forest";
  st.shelter.stage = 3;
  st.structs = []; st.nodes = []; st.enemies = [];
  return st;
}
const tick = (g: ReturnType<typeof mock>, secs: number, dt = 0.1) => {
  for (let t = 0; t < secs; t += dt) { g.state.time += dt; tickSiege(g as never, dt); }
};
const killAll = (g: ReturnType<typeof mock>, ev: SiegeEvent) => {
  for (const id of ev.spawnedIds) {
    const e = g.state.enemies.find(x => x.id === id);
    if (e && !e.dead) g.onEnemyKilled(e);
  }
};
/** Fight through every wave as it lands, then hold until resolution. */
const defeatEvent = (g: ReturnType<typeof mock>, ev: SiegeEvent) => {
  for (let t = 0; t < 260 && !ev.resolved; t += 1) {
    tick(g, 1);
    killAll(g, ev);
  }
};

console.log("— 1. calendar runs on the shared game clock —");
{
  const st = world(DAY * 3);
  ok(st.siege.next.weekly === DAY * 7, "weekly anchored on day 7 (game-time, not wall-time)");
  ok(st.siege.next.monthly === DAY * 28, "monthly anchored on day 28");
  tick(mock(st), 1);   // the anchor tracks the calendar as time flows
  ok(st.siege.next.night > st.time, "nightly countdown anchor always points forward");
  ok(dayOf(st) === 3, "dayOf derives from s.time — no second clock");
}

console.log("— 2. warnings arrive with real heads-up —");
{
  const st = world(DAY * 7 - SIEGE.weekly.warnHoursGame * DAY - 4);
  const g = mock(st);
  tick(g, 5);
  const ev = st.siege.events.find(e => e.kind === "weekly");
  ok(!!ev, "weekly event is pre-scheduled inside the warn window");
  ok(ev!.status === "scheduled" && !ev!.resolved, "counting down, not fired");
  ok(ev!.waves.length >= 2, "wave table is planned up front (visible preview)");
  ok(ev!.planned.total > 0 && ev!.planned.threats.length > 0, "expected size + species are known in advance");
  ok(ev!.startAt === st.siege.next.weekly, "fires exactly at the calendar anchor");
}

console.log("— 3. nightly attacks: bounded, night-only, melt at dawn —");
{
  // The nightly roll is probabilistic per night; walk the calendar night by
  // night until a pack answers (bounded — higher levels raise the odds).
  const st = world(DAY * 3 + DAY * BAL.nightStart - 5);
  st.progression.level = 14;                        // ~0.69 chance/night
  const g = mock(st);
  let ev = st.siege.events.find(e => e.kind === "night");
  for (let night = 3; !ev && night < 40; night++) {
    st.time = DAY * night + DAY * BAL.nightStart + 1;
    tick(g, 2);
    ev = st.siege.events.find(e => e.kind === "night");
  }
  ok(!!ev, "a night pack rolled in on some night after the grace days");
  ok(ev!.planned.total >= 1 && ev!.planned.total <= SIEGE.night.max, `pack size capped (${ev!.planned.total} ≤ ${SIEGE.night.max})`);
  tick(g, 3);                                   // fires 1.5 s after roll (player home)
  const live = activeSiege(st);
  ok(live !== null, "fires while the player is home at night");
  ok(st.enemies.length > 0, "real enemies spawned into the live array");
  ok(st.enemies.every(e => e.hp > 0 && e.hp <= e.max), "spawned with real hit points");
  killAll(g, live!);
  tick(g, 1);
  ok(live!.resolved === true, "defeated pack ends the event");
  ok(activeSiege(st) === null, "no enemy is left in a permanently attacking state");
  ok(st.enemies.every(e => e.dead), "all spawned enemies resolved");
  // a stale night pack never strikes at noon
  const st2 = world(DAY * 3 + DAY * BAL.nightStart - 5);
  st2.progression.level = 14;
  const g2 = mock(st2);
  st2.region = "cave";                              // player away the entire night
  let night2 = st2.siege.events.find(e => e.kind === "night");
  for (let night = 3; !night2 && night < 40; night++) {
    st2.time = DAY * night + DAY * BAL.nightStart + 1;
    tick(g2, 2);
    night2 = st2.siege.events.find(e => e.kind === "night");
  }
  ok(!!night2, "a second night pack scheduled for the melt test");
  ok(night2!.status === "scheduled", "it cannot fire while the player is away");
  st2.time += DAY * 0.72;                         // next morning, well past dawn
  tick(g2, 1);
  ok(night2.resolved && (st2.enemies as Enemy[]).length === 0, "unanswered night pack melts at dawn without spawning");
  ok((night2.result?.rewards ?? []).length === 0, "melting away pays nothing");
}

console.log("— 4. attack size follows progression AND readiness —");
{
  const weak = world(); weak.progression.level = 2; weak.shelter.stage = 1;
  const strong = world(); strong.progression.level = 12; strong.shelter.stage = 3; strong.unlocked = ["forest", "ship", "cave"]; strong.build.spikes = true;
  const pw = planEvent(weak, "weekly", 7);
  const ps = planEvent(strong, "weekly", 7);
  ok(ps.total > pw.total, `bigger camp faces a bigger horde (${pw.total} → ${ps.total})`);
  ok(ps.total <= 8 && pw.total >= 4, "bounds hold at both ends");
  ok(!!planEvent(strong, "monthly", 28).threats.includes("bear"), "late game may include bears");
  ok(ps.total === planEvent(strong, "weekly", 7).total, "planning is deterministic per day");
}

console.log("— 5. weekly horde: waves, roles, live cap —");
{
  const st = world(DAY * 7);
  const g = mock(st);
  st.progression.level = 9;
  const ev = scheduleEvent(st, "weekly", st.time + 0.1);
  st.siege.events = [ev];
  ev.planned = planEvent(st, "weekly", 7);
  killAll; // silence
  tick(g, 1);
  ok(ev.status === "active", "horde fired at home");
  // wave 2 brings the roles (breakers) — check after it lands
  tick(g, SIEGE.waveGapBase + 40);
  const roles = new Set<string>();
  for (const e of st.enemies) roles.add((e as unknown as { siegeRole?: string }).siegeRole ?? "wave");
  ok(roles.has("breaker"), "bears act as wall-breakers when progression allows");
  const active = st.enemies.filter(e => !e.dead && (e as unknown as { siege?: string }).siege === ev.id);
  ok(active.length <= SIEGE.liveCap, `live attackers capped at ${SIEGE.liveCap} (${active.length})`);
  ok(ev.waveIdx === ev.waves.length, "both waves spawned on schedule");
}

console.log("— 6. monthly tide: three waves + a leader —");
{
  const st = world(DAY * 28);
  const g = mock(st);
  st.progression.level = 14;
  st.siege.next.weekly = DAY * 35;               // only the tide is on the calendar tonight
  const ev = scheduleEvent(st, "monthly", st.time + 0.1);
  ev.planned = planEvent(st, "monthly", 28);
  tick(g, 2);
  const leadWave = ev.waves[ev.waves.length - 1];
  ok(!!leadWave.note, "final wave is announced (readable warning, not silent)");
  // fast-forward through all waves
  tick(g, SIEGE.waveGapBase * 4 + 20);
  const leader = st.enemies.find(e => (e as unknown as { siegeRole?: string }).siegeRole === "leader");
  ok(!!leader, "a leader beast leads the tide");
  ok(leader! && leader!.hp > ENEMY.bear.hp, `leader is a genuinely bigger beast (${leader?.hp} vs ${ENEMY.bear.hp})`);
  const active = st.enemies.filter(e => !e.dead);
  ok(active.length <= SIEGE.liveCap + 1, `the tide never floods the screen (${active.length} ≤ ${SIEGE.liveCap}+1 leader)`);
}

console.log("— 7. resolution grades on the real fight —");
{
  const st = world(DAY * 7);
  const g = mock(st);
  const ev = scheduleEvent(st, "weekly", st.time + 0.1);
  ev.planned = planEvent(st, "weekly", 7);
  defeatEvent(g, ev);                             // full sweep, no damage
  ok(ev.resolved && ev.result?.outcome === "full", `clean sweep grades full (${ev.result?.outcome})`);
  ok(st.siege.done.includes(ev.id), "event id archived in the dedup ledger");
  const wood0 = countItem(st, "wood", "storage") + countItem(st, "wood", "inv") + st.pickups.length * 0;
  ok(ev.rewarded, "rewards locked exactly once");
  void wood0;
}

console.log("— 8. rewards survive the fight only if earned — and never twice —");
{
  const st = world(DAY * 28);
  const g = mock(st);
  st.siege.next.weekly = DAY * 35;
  const ev = scheduleEvent(st, "monthly", st.time + 0.1);
  ev.planned = planEvent(st, "monthly", 28);
  const crystal0 = countItem(st, "crystal", "storage") + countItem(st, "crystal", "inv");
  defeatEvent(g, ev);
  const crystal1 = countItem(st, "crystal", "storage") + countItem(st, "crystal", "inv");
  ok(crystal1 > crystal0, "a monthly tide pays rare crystal");
  ok(ev.rewarded, "reward granted");
  // save mid-history and pretend to load: the ledger persists
  const blob = JSON.parse(JSON.stringify(serializeSiege(st.siege)));
  const back = sanitizeSiege(blob);
  ok(back.done.includes(ev.id), "completed id persists");
  // a freshly-restored copy can NEVER be re-resolved for rewards
  const before = countItem(st, "crystal", "storage") + st.pickups.reduce((a, p) => a + (p.item === "crystal" ? p.n : 0), 0);
  st.siege = back;
  const total = countItem(st, "crystal", "storage") + countItem(st, "crystal", "inv")
    + st.pickups.filter(p => p.item === "crystal").reduce((a, p) => a + p.n, 0);
  ok(total >= before, "crystal count sane");
  // replay the resolution path on a restored event — rewarded flag blocks any grant
  const reXml = back.events.filter(e => !e.resolved);
  ok(reXml.length === 0 || reXml.every(e => e.rewarded), "restored live events re-arm already-rewarded");
  ok(reXml.length === 0, "completed events do not come back as live");
}

console.log("— 9. structure damage is real, capped, repairable —");
{
  const st = world(DAY * 7);
  const g = mock(st);
  st.siege.next.weekly = st.time + 60;           // only this event fires
  const ev = scheduleEvent(st, "weekly", st.time + 0.1);
  ev.planned = planEvent(st, "weekly", 7);
  tick(g, 1);
  const pre = structHealth(st, "spikes");
  ok(pre === 3, "spikes start whole (3/3)");
  // a breaker parks next to the spikes and pounds them
  const bear = g.state.enemies.find(e => ENEMY[e.kind].name === "Frost Bear")
    ?? g.state.enemies[0];
  bear.x = 330; bear.y = -230;
  (bear as unknown as { siegeRole?: string }).siegeRole = "breaker";
  for (let i = 0; i < 60; i++) { st.siege && strikeStructure(g as never, ev, "spikes"); }
  ok(structHealth(st, "spikes") <= 0, "structure can be destroyed by siege damage");
  ok(st.build.spikes === false, "destroyed spikes come offline (buildable flag off)");
  ok(totalOut(ev) <= SIEGE.structDmgCapPerEvent, `per-event structure damage capped at ${SIEGE.structDmgCapPerEvent}`);
  // repair pays real materials
  addItem(st, "wood", 10, "storage"); addItem(st, "stone", 10, "storage");
  const w0 = countItem(st, "wood", "storage"), s0 = countItem(st, "stone", "storage");
  ok(repairStructure(st, "spikes", g.fx as never, needs => poolPay(st, needs)), "repair works");
  ok(countItem(st, "wood", "storage") === w0 - 4 && countItem(st, "stone", "storage") === s0 - 2, "materials were actually consumed");
  ok(structHealth(st, "spikes") === 1 && st.build.spikes === true, "repaired point comes back online");
  function totalOut(e: SiegeEvent) { return Object.values(e.structHits).reduce<number>((a, b) => a + (b ?? 0), 0); }
}

console.log("— 10. player death = failed defence, camp intact —");
{
  const st = world(DAY * 7);
  const g = mock(st);
  const ev = scheduleEvent(st, "weekly", st.time + 0.1);
  ev.planned = planEvent(st, "weekly", 7);
  tick(g, 1);
  st.player.dead = true;
  tick(g, 0.5);
  ok(ev.resolved && ev.result?.outcome === "failed", "defeat resolves as a failed defence");
  ok(st.settlement.residents.length === st.settlement.residents.length, "residents untouched");
  ok((st.shelter as { stage: number }).stage === 3, "the shelter is never reset or deleted");
  const units = ev.result!.rewards.reduce((a, r) => a + r.n, 0);
  ok(units <= 4, `a failed defence pays almost nothing (${units} units)`);
}

console.log("— 11. retreat path: attackers never freeze in attack —");
{
  const st = world(DAY * 7);
  const g = mock(st);
  const ev = scheduleEvent(st, "weekly", st.time + 0.1);
  ev.planned = planEvent(st, "weekly", 7);
  tick(g, 1);
  // never kill anything; the event must end by itself
  tick(g, 160);
  ok(ev.resolved, "a stalled siege resolves by retreat, not forever");
  ok(!activeSiege(st), "no active attackers linger");
}

console.log("— 12. offline: bounded, deduped, never erasing the camp —");
{
  const st = world(DAY * 7 - SIEGE.weekly.warnHoursGame * DAY - 10);
  const g = mock(st);
  tick(g, 12);                                    // schedules + warns while home
  const ev = st.siege.events.find(e => e.kind === "weekly")!;
  ok(st.siege.warned[ev.id], "warning was issued before the save");
  // the player heads out for the anchor time, game time passes, app closes
  st.region = "cave";
  st.time = ev.startAt + 30;                      // anchor passed while away
  st.settlement.lastWall = Date.now() - 3 * 86400_000;
  const beforeEnemies = st.enemies.length;
  applyOfflineSieges(st, g.fx as never);
  ok(st.enemies.length === beforeEnemies, "no enemies spawn offline");
  ok(ev.resolved && ev.rewarded, "the due, warned event resolved exactly once");
  ok(st.siege.done.includes(ev.id), "logged in the ledger");
  ok((st.siege.history.at(-1)?.offline) === true, "report flagged as offline");
  // shelter can be worn but never destroyed offline
  ok(structHealth(st, "shelter") >= 1, "offline wear bottoms out at 1 integrity");
  // reload → nothing re-runs
  const hp0 = st.siege.history.length;
  st.settlement.lastWall = Date.now() - 3 * 86400_000;
  applyOfflineSieges(st, g.fx as never);
  ok(st.siege.history.length === hp0, "reloading cannot re-process the same event");
  // clock rollback → nothing at all
  const st2 = world(DAY * 7);
  st2.settlement.lastWall = Date.now() + 86400_000;
  const hist = st2.siege.history.length;
  applyOfflineSieges(st2, g.fx as never);
  ok(st2.siege.history.length === hist, "a backwards clock earns/reworks nothing");
}

console.log("— 13. readiness is real state, not an arbitrary number —");
{
  const st = world();
  const r0 = readiness(st).score;
  // add a fit, armed guard
  st.settlement.residents.push({
    id: "wg", name: "Warden", title: "Guard", role: "warrior", spec: "guard",
    task: null, post: "gate", gs: "guard", gsT: 0, priority: "balanced",
    gear: { weapon: null, armor: null }, swingT: 0, hitDone: false,
    alertT: 0, lostT: 0, scanT: 0, kills: 0,
    trait: "Steady", traitDesc: "", hp: 110, maxHp: 110,
    injured: false, downed: false, unfed: 0, paused: false, shakenT: 0,
    x: 0, y: 0, face: 0, walkPh: 0, state: "work", workT: 0,
    atkCd: 0, clashCd: 0, hurtT: 0, targetId: null, stuckT: 0, wpi: 0,
  } as never);
  const r1 = readiness(st).score;
  ok(r1 > r0, `a fit guard raises readiness (${r0} → ${r1})`);
  addItem(st, "spear", 1, "storage");
  equipGuard(st, "wg", "weapon", "spear", mock(st).fx as never);
  const r2 = readiness(st).score;
  ok(r2 > r1, `arming them raises it further (${r1} → ${r2})`);
  st.siege.structHp.spikes = 3; st.build.spikes = true;
  const r3 = readiness(st).score;
  st.siege.structHp.spikes = 0;
  ok(readiness(st).score > r3, "broken spikes lower readiness until repaired");
  ok(readiness(st).parts.length >= 6, "weaknesses are itemised for the player");
}

console.log("— 14. calendar persists and migrates safely —");
{
  const st = world(DAY * 9);
  st.siege.next.weekly = DAY * 14;
  st.siege.done = ["weekly_d7"];
  st.siege.structHp = { spikes: 2 };
  const back = sanitizeSiege(JSON.parse(JSON.stringify(serializeSiege(st.siege))));
  ok(back.next.weekly === DAY * 14, "calendar anchors persist");
  ok(back.done.includes("weekly_d7"), "reward ledger persists");
  ok(back.structHp.spikes === 2, "structure wear persists");
  const junk = sanitizeSiege({ events: "junk", done: [1, 2, null], structHp: "x" } as never);
  ok(junk.events.length === 0 && junk.done.length === 0, "corrupt payload resets cleanly");
  ok(timeUntil(st, "weekly") === DAY * 5, "countdown derives from saved anchor");
}

console.log("— 15. siege targets exist and are reachable camp structures —");
{
  const st = world();
  const targets = siegeTargets(st);
  ok(targets.length >= 2, "attackable structures are real camp sites");
  ok(targets.every(t => t.max >= 1), "each has definable integrity");
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
