/**
 * Phase 6.2 regression harness (development tool, not shipped).
 * Verifies that the settlement economy still behaves after the Phase 6.3
 * guard-AI refactor: recruitment, capacity, production, upkeep, save/offline.
 */
import { createState, addItem, countItem } from "../src/game/state";
import { buildAllRegions } from "../src/game/regions";
import {
  tickSettlement, broadcastCall, callStatus, assignTask, taskStatus, TASKS,
  treatResident, settleUpkeepDay, serializeSettlement, sanitizeSettlement,
  applyOfflineSettlement, capacityOf, RESCUES, rescueSurvivor, createSettlement,
} from "../src/game/residents";
import type { GameState } from "../src/game/types";

let pass = 0, fail = 0;
const ok = (c: boolean, n: string) => { if (c) { pass++; console.log("  ok:", n); } else { fail++; console.log("  FAIL:", n); } };

function mockGame(s: GameState) {
  return {
    state: s, kills: 0,
    fx: { sfx() {}, float() {}, toast() {}, burst() {}, shake() {}, bump() {} },
    onEnemyKilled(e: { dead: boolean }) { e.dead = true; this.kills++; },
  };
}
const s = () => { const st = createState(); st.settlement = createSettlement(); return st; };
const tick = (g: ReturnType<typeof mockGame>, secs: number) => { for (let t = 0; t < secs; t += 0.1) tickSettlement(g as never, 0.1); };

console.log("— capacity + rescues —");
{
  const st = s();
  ok(capacityOf(st) === 0, "capacity 0 at stage 0");
  st.shelter.stage = 2; ok(capacityOf(st) === 2, "stage 2 → 2");
  st.shelter.stage = 3; ok(capacityOf(st) === 4, "stage 3 → 4");
  st.build.bunks = true; ok(capacityOf(st) === 7, "bunkhouse → 7");
  const regs = buildAllRegions();
  ok(["ship", "cave", "station", "fortress"].every(r =>
    regs[r as keyof typeof regs].containers.some(c => c.kind === "survivor")), "all four rescue pods exist");
}

console.log("— recruitment —");
{
  const st = s(); const g = mockGame(st);
  st.build.beacon = true; st.shelter.stage = 3;
  ok(!callStatus(st).ok, "blocked without supplies");
  addItem(st, "stew", 2, "storage"); addItem(st, "medkit", 1, "storage");
  ok(callStatus(st).ok, "available with supplies");
  ok(broadcastCall(st, g.fx as never), "recruit #1");
  ok(!broadcastCall(st, g.fx as never), "cooldown blocks a second call");
  ok(st.settlement.residents.length === 1, "no duplicate");
  const def = RESCUES[0];
  addItem(st, "meltwater", 1); addItem(st, "berry", 2);
  ok(rescueSurvivor(st, def, g.fx as never), "rescue works");
  ok(!rescueSurvivor(st, def, g.fx as never), "rescue cannot repeat");
}

console.log("— production rules —");
{
  const st = s(); const g = mockGame(st);
  st.shelter.stage = 3; st.build.beacon = true; st.shelter.fire.built = true;
  addItem(st, "stew", 2, "storage"); addItem(st, "medkit", 1, "storage");
  broadcastCall(st, g.fx as never);
  const w = st.settlement.residents[0];
  assignTask(st, w.id, "wood", g.fx as never);
  tick(g, 50);
  ok(countItem(st, "wood", "storage") >= 1 && countItem(st, "wood", "inv") === 0, "output goes to the Supply Cache only");
  assignTask(st, w.id, "water", g.fx as never);
  ok(!!taskStatus(st, w, TASKS.water), "water post blocked without stored ice");
  const before = countItem(st, "meltwater", "storage");
  tick(g, 30);
  ok(countItem(st, "meltwater", "storage") === before, "blocked post produces nothing");
  addItem(st, "ice", 6, "storage");
  tick(g, 60);
  ok(countItem(st, "meltwater", "storage") > before, "produces once inputs exist");
  ok(countItem(st, "ice", "storage") < 6, "inputs consumed");
  st.settlement.stock.stone = 0;
  assignTask(st, w.id, "stone", g.fx as never);
  ok(taskStatus(st, w, TASKS.stone) === "Site depleted — regrowing", "depleted site reported");
}

console.log("— upkeep + treatment —");
{
  const st = s(); const g = mockGame(st);
  st.shelter.stage = 3; st.build.beacon = true;
  addItem(st, "stew", 2, "storage"); addItem(st, "medkit", 1, "storage");
  broadcastCall(st, g.fx as never);
  const r = st.settlement.residents[0];
  addItem(st, "berry", 6, "storage"); addItem(st, "ice", 4, "storage");
  settleUpkeepDay(st, true);
  ok(r.unfed === 0, "fed day clears hunger");
  settleUpkeepDay(st, true); settleUpkeepDay(st, true); settleUpkeepDay(st, true);
  ok(r.unfed >= 1, "missed rations tracked");
  ok(st.settlement.residents.length === 1, "resident never deleted");
  r.hp = 10; r.injured = true;
  addItem(st, "salve", 1, "storage");
  ok(treatResident(st, r.id, g.fx as never), "treatment consumes medicine and heals");
  ok(r.hp > 10, "health restored");
}

console.log("— save + offline —");
{
  const st = s(); const g = mockGame(st);
  st.shelter.stage = 3; st.build.beacon = true;
  addItem(st, "stew", 2, "storage"); addItem(st, "medkit", 1, "storage");
  broadcastCall(st, g.fx as never);
  const r = st.settlement.residents[0];
  assignTask(st, r.id, "wood", g.fx as never);
  addItem(st, "berry", 40, "storage"); addItem(st, "ice", 40, "storage");
  const back = sanitizeSettlement(JSON.parse(JSON.stringify(serializeSettlement(st.settlement))));
  ok(back.residents.length === 1 && back.residents[0].task === "wood", "task persisted");
  const wood0 = countItem(st, "wood", "storage");
  st.settlement.lastWall = Date.now() - 2 * 3600 * 1000;
  applyOfflineSettlement(st, g.fx as never);
  const gained = countItem(st, "wood", "storage") - wood0;
  ok(gained > 0 && gained <= 40, `offline accrual capped (+${gained})`);
  const w1 = countItem(st, "wood", "storage");
  applyOfflineSettlement(st, g.fx as never);
  ok(countItem(st, "wood", "storage") === w1, "replay cannot duplicate");
  st.settlement.lastWall = Date.now() + 3600_000;
  const w2 = countItem(st, "wood", "storage");
  applyOfflineSettlement(st, g.fx as never);
  ok(countItem(st, "wood", "storage") === w2, "clock rollback accrues nothing");
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
