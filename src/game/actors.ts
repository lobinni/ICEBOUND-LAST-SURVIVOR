// ── ICEBOUND V2: player controller + shared collision ──────────────────────

import { ARMOR, BAL, ENEMY, REGIONS, TOOL_TIER } from "./config";
import type { Enemy, GameState } from "./types";
import type { Game } from "./engine";

import { gatherStrike } from "./systems";
import { isVulnerable } from "./enemies";
import { progDamageMul, progMaxStamina } from "./progression";

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const dist = (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, ay - by);

/** Solid-world collision + region bounds. Shared by the player and all enemies. */
export function collideAt(s: GameState, x: number, y: number, r: number): { x: number; y: number } {
  for (const n of s.nodes) {
    if (n.solid <= 0) continue;
    const d = dist(x, y, n.x, n.y);
    const min = r + n.solid;
    if (d < min && d > 0.001) {
      const push = (min - d) / d;
      x += (x - n.x) * push;
      y += (y - n.y) * push;
    }
  }
  for (const st of s.structs) {
    let solid = st.solid;
    // unbuilt base sites and the un-built firepit are walkable
    if (st.kind === "firepit" && !s.shelter.fire.built) solid = 0;
    if ((st.kind === "storage" || st.kind === "station") && s.shelter.stage < 3) solid = 0;
    if (st.id.startsWith("site_")) solid = s.build[st.kind] ? 28 : 0;
    if (solid <= 0) continue;
    const oy = st.kind === "shelter" ? 10 : 0;
    const d = dist(x, y, st.x, st.y - oy);
    const min = r + solid;
    if (d < min && d > 0.001) {
      const push = (min - d) / d;
      x += (x - st.x) * push;
      y += (y - (st.y - oy)) * push;
    }
  }
  // sealed devices block passage until opened
  for (const dv of s.devices) {
    if (dv.on) continue;
    if (dv.kind !== "labdoor" && dv.kind !== "sigilgate") continue;
    const d = dist(x, y, dv.x, dv.y);
    const min = r + (dv.kind === "sigilgate" ? 90 : 52);
    if (d < min && d > 0.001) {
      const push = (min - d) / d;
      x += (x - dv.x) * push;
      y += (y - dv.y) * push;
    }
  }
  const B = REGIONS[s.region].bounds;
  x = clamp(x, B.minX + 50, B.maxX - 50);
  y = clamp(y, B.minY + 50, B.maxY - 50);
  return { x, y };
}

export const weaponDamage = (s: GameState): { dmg: number; tool: "axe" | "spear" | "hands" } => {
  const mul = progDamageMul(s);                   // Combat Training upgrade
  const w = s.equip.weapon;
  if (w === "crystalblade") return { dmg: BAL.attack.dmgBlade * mul, tool: "spear" };
  if (w === "warspear") return { dmg: BAL.attack.dmgWarSpear * mul, tool: "spear" };
  if (w === "spear") return { dmg: BAL.attack.dmgSpear * mul, tool: "spear" };
  const t = s.equip.tool;
  if (t === "ironaxe" || t === "crystalpick") return { dmg: BAL.attack.dmgIronAxe * mul, tool: "axe" };
  if (t === "axe") return { dmg: BAL.attack.dmgAxe * mul, tool: "axe" };
  return { dmg: BAL.attack.dmgHand * mul, tool: "hands" };
};

export const toolTier = (s: GameState) => (s.equip.tool ? TOOL_TIER[s.equip.tool] ?? 0 : 0);

export const damageReduction = (s: GameState) => (s.equip.armor ? ARMOR[s.equip.armor]?.dr ?? 0 : 0);

export function updatePlayer(g: Game, dt: number) {
  const s = g.state;
  const p = s.player;
  if (p.dead) { p.deathT += dt; return; }

  p.atkCd = Math.max(0, p.atkCd - dt);
  p.dodgeCd = Math.max(0, p.dodgeCd - dt);
  p.iframeT = Math.max(0, p.iframeT - dt);
  p.hurtT = Math.max(0, p.hurtT - dt);

  // ── input ──
  let ix = 0, iy = 0;
  const k = g.keys;
  if (k.has("w") || k.has("arrowup")) iy -= 1;
  if (k.has("s") || k.has("arrowdown")) iy += 1;
  if (k.has("a") || k.has("arrowleft")) ix -= 1;
  if (k.has("d") || k.has("arrowright")) ix += 1;
  if (g.joy.active) { ix += g.joy.x; iy += g.joy.y; }
  const mag = Math.hypot(ix, iy);
  if (mag > 1) { ix /= mag; iy /= mag; }

  // ── dodge ──
  if (g.consumeAction("dodge")) {
    if (p.dodgeCd <= 0 && p.dodgeT <= 0 && p.stamina >= BAL.stamDodge) {
      p.dodgeT = BAL.dodge.t;
      p.dodgeCd = BAL.dodge.cd;
      p.iframeT = Math.max(p.iframeT, BAL.dodge.iframes + BAL.dodge.t * 0.5);
      p.stamina -= BAL.stamDodge;
      p.gatherT = 0;
      p.dodgeDir = mag > 0.1 ? Math.atan2(iy, ix) : p.face;
      g.fx.sfx("dodge");
      g.fx.burst(p.x, p.y, "snow", 8);
    } else if (p.dodgeCd <= 0) {
      g.fx.toast({ title: "Exhausted", sub: "Not enough stamina to dodge.", kind: "warn", icon: "bolt" });
      g.fx.sfx("error");
    }
  }

  // ── attack ──
  if (g.consumeAction("attack")) {
    if (p.atkCd <= 0 && p.dodgeT <= 0 && p.stamina >= BAL.stamAttack) {
      p.atkT = BAL.attack.t;
      p.atkCd = BAL.attack.cd;
      p.atkHit = false;
      p.stamina -= BAL.stamAttack;
      p.gatherT = 0;
      p.attackTool = weaponDamage(s).tool;
      let best: Enemy | null = null, bd = 170;
      for (const e of s.enemies) {
        if (e.dead || e.state === "hidden") continue;
        const d = dist(p.x, p.y, e.x, e.y);
        if (d < bd) { bd = d; best = e; }
      }
      if (best) p.face = Math.atan2(best.y - p.y, best.x - p.x);
      g.fx.sfx("swing");
    } else if (p.atkCd <= 0 && p.stamina < BAL.stamAttack && p.dodgeT <= 0) {
      g.fx.sfx("error");
    }
  }

  if (p.atkT > 0) {
    const before = p.atkT;
    p.atkT = Math.max(0, p.atkT - dt);
    if (before > BAL.attack.t * 0.5 && p.atkT <= BAL.attack.t * 0.5 && !p.atkHit) {
      p.atkHit = true;
      const base = weaponDamage(s).dmg;
      let hitAny = false;
      for (const e of s.enemies) {
        if (e.dead || e.state === "hidden") continue;
        const reach = BAL.attack.range + (e.kind === "guardian" ? 42 : e.kind === "bear" ? 16 : 0);
        const d = dist(p.x, p.y, e.x, e.y);
        if (d > reach) continue;
        const ang = Math.atan2(e.y - p.y, e.x - p.x);
        let da = Math.abs(ang - p.face);
        if (da > Math.PI) da = Math.PI * 2 - da;
        if (da > BAL.attack.arc / 2) continue;

        hitAny = true;
        // the Guardian's armour shrugs off blows unless its core is exposed
        let dmg = base;
        let crit = false;
        if (e.kind === "guardian") {
          if (isVulnerable(e)) { dmg = base * 2.1; crit = true; }
          else dmg = base * 0.3;
        }
        e.hp -= dmg;
        e.hitT = 0.45;
        if (e.kind !== "guardian") {
          const kd = Math.atan2(e.y - p.y, e.x - p.x);
          const kb = BAL.attack.knock * (e.kind === "bear" ? 0.45 : 1);
          e.vx += Math.cos(kd) * kb;
          e.vy += Math.sin(kd) * kb;
        }
        if (e.kind === "hare") { e.state = "flee"; e.stateT = 3; }
        else if (["idle", "patrol", "return", "prowl", "hidden"].includes(e.state)) {
          e.state = "chase"; e.stateT = 0; e.alerted = true;
          g.fx.sfx(e.kind === "bear" ? "bearRoar" : e.kind === "crawler" ? "crawlerHiss" : "wolfGrowl");
        }
        g.fx.float(e.x, e.y - 44, crit ? `${Math.round(dmg)}!` : `${Math.round(dmg)}`, crit ? "#ffe9c4" : e.kind === "guardian" && !crit ? "#9fb0c4" : "#ffd2a0");
        g.fx.burst(e.x, e.y - 18, "hit", crit ? 16 : 10);
        if (e.hp <= 0) g.onEnemyKilled(e);
      }
      if (hitAny) { g.fx.sfx("hit"); g.fx.shake(4); g.hitstop = 0.055; }
    }
  }

  // ── gathering channel ──
  if (p.gatherT > 0) {
    if (mag > 0.2) { p.gatherT = 0; p.gatherTarget = null; }
    else {
      p.gatherT -= dt;
      if (p.gatherT <= 0 && p.gatherTarget) {
        const node = s.nodes.find(n => n.id === p.gatherTarget);
        if (node && node.amount > 0 && dist(p.x, p.y, node.x, node.y) < BAL.interactR + 30) {
          gatherStrike(s, node, g.fx);
          if (node.amount > 0) p.gatherT = p.gatherLen;
          else p.gatherTarget = null;
        } else p.gatherTarget = null;
      }
    }
  }

  // ── movement ──
  const wantSprint = (k.has("shift") || (g.joy.active && Math.hypot(g.joy.x, g.joy.y) > 0.9)) && mag > 0.1;
  p.sprint = wantSprint && p.stamina > 1 && p.hunger > 5;
  let spd = BAL.walk * (p.sprint ? BAL.sprintMul : 1);
  if (p.thirst <= 20) spd *= 0.85;
  if (p.temp <= 15) spd *= 0.8;
  if (g.slowT > 0) spd *= 0.55; // thin ice / deep drift

  let vx = 0, vy = 0;
  if (p.dodgeT > 0) {
    p.dodgeT = Math.max(0, p.dodgeT - dt);
    const v = BAL.dodge.dist / BAL.dodge.t;
    vx = Math.cos(p.dodgeDir) * v;
    vy = Math.sin(p.dodgeDir) * v;
  } else if (p.gatherT > 0) {
    vx = 0; vy = 0;
  } else if (p.atkT > 0) {
    vx = ix * spd * 0.25; vy = iy * spd * 0.25;
  } else {
    vx = ix * spd; vy = iy * spd;
  }

  p.moving = (mag > 0.08 && p.dodgeT <= 0 && p.gatherT <= 0) || p.dodgeT > 0;
  p.vx = vx; p.vy = vy;

  const pos = collideAt(s, p.x + vx * dt, p.y + vy * dt, BAL.playerR);
  const movedD = dist(p.x, p.y, pos.x, pos.y);
  p.x = pos.x; p.y = pos.y;

  if (p.moving && movedD > 0.01) {
    p.face = Math.atan2(vy, vx);
    p.walkPh += movedD * 0.085;
    s.stats.distance += movedD;
    p.stepAcc += movedD;
    if (p.stepAcc > 34) {
      p.stepAcc = 0;
      g.fx.sfx(s.region === "cave" || s.region === "station" ? "footHard" : "foot");
      g.addFootprint(p.x, p.y, p.face);
    }
  }

  // stamina
  const stamCap = progMaxStamina(s);
  if (p.sprint && p.moving) p.stamina = clamp(p.stamina - BAL.stamSprint * dt, 0, stamCap);
  else {
    const regen = (p.moving ? BAL.stamRegen : BAL.stamRegenIdle) * (p.hunger < 25 ? 0.5 : 1);
    p.stamina = clamp(p.stamina + regen * dt, 0, stamCap);
  }

  // visible breath in the cold
  p.breathT -= dt;
  if (p.breathT <= 0 && (p.temp < 60 || REGIONS[s.region].tempMul > 1)) {
    p.breathT = 1.6 + Math.random() * 1.4;
    g.spawnPuff(p.x + Math.cos(p.face) * 10, p.y - 46);
  }
}

export const enemyName = (e: Enemy) => ENEMY[e.kind].name;
