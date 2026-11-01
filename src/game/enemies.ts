// ── ICEBOUND V2: enemy AI — wolf · hare · bear · crawler · guardian boss ────

import { ENEMY, WORLD } from "./config";
import type { Enemy, GameState } from "./types";
import type { Game } from "./engine";
import { collideAt } from "./actors";
import { profileOf, windupFor } from "./difficulty";

const dist = (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, ay - by);

function alert(g: Game, e: Enemy, sfx: string) {
  if (e.growlT <= 0) { g.fx.sfx(sfx); e.growlT = e.kind === "bear" ? 4 : 3; }
  e.state = "chase";
  e.stateT = 0;
  e.alerted = true;
}

/** Safe zones: the lit campfire and a repaired shelter keep ordinary predators out. */
function playerIsSafe(s: GameState): boolean {
  if (s.region !== "forest") return false;
  const p = s.player;
  const fireSafe = s.shelter.fire.lit && s.shelter.fire.fuel > 0 &&
    dist(p.x, p.y, WORLD.firepit.x, WORLD.firepit.y) < 215;
  const lampSafe = !!s.build.lamp && dist(p.x, p.y, WORLD.sites.lamp.x, WORLD.sites.lamp.y) < 260;
  const shelterSafe = s.shelter.stage >= 1 && dist(p.x, p.y, WORLD.shelter.x, WORLD.shelter.y) < 215;
  return fireSafe || shelterSafe || lampSafe;
}

let lodPhase = 0;

export function updateEnemies(g: Game, dtIn: number) {
  let dt = dtIn;
  const s = g.state;
  const p = s.player;
  const safe = playerIsSafe(s);
  const D0 = profileOf(s.difficulty);
  lodPhase = (lodPhase + 1) & 3;

  for (let idx = 0; idx < s.enemies.length; idx++) {
    dt = dtIn;
    const e = s.enemies[idx];
    const def = ENEMY[e.kind];

    // ── LOD: far-away, unalerted creatures tick at 1/4 rate (no behaviour loss,
    //    they simply advance in coarser steps while off-screen) ──
    if (!e.dead && !e.alerted && e.state !== "chase" && e.state !== "windup") {
      const far = Math.hypot(e.x - p.x, e.y - p.y) > def.aggro + 700;
      if (far) {
        if ((idx & 3) !== lodPhase) continue;
        dt = dt * 4;
      }
    }

    if (e.dead) {
      e.deadT += dt;
      if (!e.quest && def.respawn > 0 && e.respawnAt > 0 && s.time > e.respawnAt) {
        e.dead = false; e.deadT = 0;
        e.max = ENEMY[e.kind].hp * D0.enemyHpMul;   // honour the current mode
        e.hp = e.max;
        e.x = e.home.x; e.y = e.home.y;
        e.state = e.kind === "crawler" ? "hidden" : "patrol";
        e.stateT = 0; e.alerted = false; e.phase = 1;
      }
      continue;
    }

    e.hitT = Math.max(0, e.hitT - dt);
    e.growlT = Math.max(0, e.growlT - dt);

    const D = profileOf(s.difficulty);
    const dP = dist(e.x, e.y, p.x, p.y);
    const dHome = dist(e.x, e.y, e.home.x, e.home.y);
    const canSee = dP < def.aggro * D.enemyAggroMul && !p.dead;

    let vx = 0, vy = 0, moving = false;

    if (e.kind === "guardian") {
      ({ vx, vy, moving } = guardianAI(g, e, dt, dP));
    } else if (e.kind === "hare") {
      ({ vx, vy, moving } = hareAI(e, dt, dP, p.x, p.y, dHome));
    } else {
      ({ vx, vy, moving } = predatorAI(g, e, dt, dP, dHome, canSee, safe));
    }

    // knockback decay + integration
    e.vx *= Math.max(0, 1 - dt * 6);
    e.vy *= Math.max(0, 1 - dt * 6);
    const r = e.kind === "guardian" ? 34 : e.kind === "bear" ? 26 : 17;
    const pos = collideAt(s, e.x + (vx + e.vx) * dt, e.y + (vy + e.vy) * dt, r);
    e.x = pos.x; e.y = pos.y;

    if (moving) {
      e.walkPh += Math.hypot(vx, vy) * dt * (e.kind === "bear" ? 0.1 : 0.075);
      if (e.state !== "windup" && e.state !== "slam" && e.state !== "volley") {
        e.face = Math.atan2(vy, vx);
      }
    }

    // spacing so packs don't stack
    for (const o of s.enemies) {
      if (o === e || o.dead || o.kind === "guardian") continue;
      const d = dist(e.x, e.y, o.x, o.y);
      const min = e.kind === "bear" || o.kind === "bear" ? 58 : 42;
      if (d < min && d > 0.01) {
        e.x += ((e.x - o.x) / d) * 60 * dt;
        e.y += ((e.y - o.y) / d) * 60 * dt;
      }
    }

    // base defenses wound attackers
    if (s.region === "forest" && s.build.spikes && !e.dead) {
      const ds = dist(e.x, e.y, WORLD.sites.spikes.x, WORLD.sites.spikes.y);
      if (ds < 92) {
        e.hp -= 16 * dt;
        e.hitT = Math.max(e.hitT, 0.15);
        if (Math.random() < dt * 3) g.fx.burst(e.x, e.y - 12, "hit", 3);
        if (e.hp <= 0) g.onEnemyKilled(e);
      }
    }
  }
}

// ════════════════════════════ WOLF / BEAR / CRAWLER ════════════════════════

function predatorAI(g: Game, e: Enemy, dt: number, dP: number, dHome: number, canSee: boolean, safe: boolean) {
  const s = g.state;
  const p = s.player;
  const def = ENEMY[e.kind];
  const D = profileOf(s.difficulty);
  let vx = 0, vy = 0, moving = false;
  const growl = e.kind === "bear" ? "bearRoar" : e.kind === "crawler" ? "crawlerHiss" : "wolfGrowl";

  switch (e.state) {
    case "hidden": {
      // crawlers lurk buried until the player walks close
      if (dP < 190 && !p.dead) {
        e.state = "emerge"; e.stateT = 0.55;
        g.fx.sfx("crawlerHiss");
        g.fx.burst(e.x, e.y, "ice", 14);
        g.fx.shake(4);
      }
      break;
    }
    case "emerge": {
      e.stateT -= dt;
      e.face = Math.atan2(p.y - e.y, p.x - e.x);
      if (e.stateT <= 0) { e.state = "chase"; e.alerted = true; }
      break;
    }
    case "idle": {
      e.stateT -= dt;
      if (canSee) { alert(g, e, growl); break; }
      if (e.stateT <= 0) { e.state = "patrol"; e.wpi = (e.wpi + 1) % e.wp.length; }
      break;
    }
    case "patrol": {
      const tgt = e.wp[e.wpi];
      const d = dist(e.x, e.y, tgt.x, tgt.y);
      if (d < 26) { e.state = "idle"; e.stateT = 1 + Math.random() * 2.4; break; }
      vx = ((tgt.x - e.x) / d) * def.walk;
      vy = ((tgt.y - e.y) / d) * def.walk;
      moving = true;
      if (canSee) alert(g, e, growl);
      break;
    }
    case "chase": {
      if (p.dead || dHome > def.leash) { e.state = "return"; break; }
      if (safe) { e.state = "prowl"; e.stateT = 4 + Math.random() * 3; break; }
      if (dP < def.attackR && e.hitT <= 0) {
        e.state = "windup"; e.stateT = windupFor(def.windup, D);
        g.fx.sfx(growl);
        break;
      }
      vx = ((p.x - e.x) / dP) * def.chase;
      vy = ((p.y - e.y) / dP) * def.chase;
      moving = true;
      break;
    }
    case "prowl": {
      if (!safe && dP < def.aggro) { alert(g, e, growl); break; }
      if (dP > def.aggro * 1.5 || p.dead) { e.state = "return"; break; }
      e.stateT -= dt;
      const ang = Math.atan2(e.y - p.y, e.x - p.x) + dt * 0.85;
      const rr = 235;
      const tx = p.x + Math.cos(ang) * rr, ty = p.y + Math.sin(ang) * rr * 0.85;
      const d = dist(e.x, e.y, tx, ty);
      if (d > 10) { vx = ((tx - e.x) / d) * def.walk * 1.5; vy = ((ty - e.y) / d) * def.walk * 1.5; moving = true; }
      break;
    }
    case "windup": {
      e.stateT -= dt;
      e.face = Math.atan2(p.y - e.y, p.x - e.x);
      if (e.kind === "bear") {
        // bear plants its feet — heavier, slower, very readable
        if (e.stateT <= 0) { e.state = "slam"; e.stateT = 0.3; e.biteDone = false; }
      } else if (e.stateT <= 0) {
        e.state = "lunge"; e.stateT = def.lungeT;
        const d = Math.max(1, dP);
        e.lungeDir = { x: (p.x - e.x) / d, y: (p.y - e.y) / d };
        e.biteDone = false;
      }
      break;
    }
    case "lunge": {
      e.stateT -= dt;
      vx = e.lungeDir.x * def.lungeSpd;
      vy = e.lungeDir.y * def.lungeSpd;
      moving = true;
      if (!e.biteDone && dP < 56 && !p.dead) {
        e.biteDone = true;
        const chill = e.kind === "crawler" ? 14 : 0;
        g.damagePlayer(def.dmg * D.enemyDmgMul, `Killed by an ${ENEMY[e.kind].name.toLowerCase()}.`, chill);
        g.fx.sfx(e.kind === "crawler" ? "crawlerHit" : "wolfBite");
      }
      if (e.stateT <= 0) { e.state = "recover"; e.stateT = def.cd * 0.5; }
      break;
    }
    case "slam": {
      // bear ground-slam: damage in a radius, then a long opening
      e.stateT -= dt;
      if (!e.biteDone && e.stateT <= 0.08) {
        e.biteDone = true;
        g.fx.sfx("bearSlam");
        g.fx.shake(10);
        g.fx.burst(e.x + Math.cos(e.face) * 50, e.y + Math.sin(e.face) * 30, "snow", 22);
        g.shockwave(e.x + Math.cos(e.face) * 46, e.y + Math.sin(e.face) * 28, 108);
        const hx = e.x + Math.cos(e.face) * 46, hy = e.y + Math.sin(e.face) * 28;
        if (dist(hx, hy, p.x, p.y) < 108 && !p.dead) {
          g.damagePlayer(def.dmg * D.enemyDmgMul, "Crushed by a frost bear.", 0);
        }
      }
      if (e.stateT <= 0) { e.state = "recover"; e.stateT = def.cd; }
      break;
    }
    case "recover": {
      e.stateT -= dt;
      if (e.stateT <= 0) {
        e.state = (dP < def.aggro && !p.dead && !safe) ? "chase" : "return";
      }
      break;
    }
    case "return": {
      const d = Math.max(1, dHome);
      if (dHome < 30) {
        e.state = e.kind === "crawler" ? "hidden" : "idle";
        e.stateT = 1.5;
        e.hp = Math.min(e.max, e.hp + def.regen * D.enemyRegenMul * 2);
        break;
      }
      e.hp = Math.min(e.max, e.hp + def.regen * dt);
      vx = ((e.home.x - e.x) / d) * def.walk * 1.3;
      vy = ((e.home.y - e.y) / d) * def.walk * 1.3;
      moving = true;
      if (canSee && !safe) alert(g, e, growl);
      break;
    }
    default: break;
  }
  return { vx, vy, moving };
}

// ════════════════════════════ HARE (passive wildlife) ══════════════════════

function hareAI(e: Enemy, dt: number, dP: number, px: number, py: number, dHome: number) {
  const def = ENEMY.hare;
  let vx = 0, vy = 0, moving = false;
  if (dP < 230 || e.state === "flee") {
    if (e.state !== "flee") { e.state = "flee"; e.stateT = 2.4; }
    e.stateT -= dt;
    const a = Math.atan2(e.y - py, e.x - px);
    vx = Math.cos(a) * def.chase;
    vy = Math.sin(a) * def.chase * 0.8;
    moving = true;
    if (e.stateT <= 0 && dP > 320) { e.state = "patrol"; }
  } else {
    switch (e.state) {
      case "idle":
        e.stateT -= dt;
        if (e.stateT <= 0) { e.state = "patrol"; e.wpi = (e.wpi + 1) % e.wp.length; }
        break;
      default: {
        const tgt = e.wp[e.wpi];
        const d = dist(e.x, e.y, tgt.x, tgt.y);
        if (d < 24 || dHome > 900) { e.state = "idle"; e.stateT = 1.5 + Math.random() * 3; break; }
        vx = ((tgt.x - e.x) / d) * def.walk;
        vy = ((tgt.y - e.y) / d) * def.walk;
        moving = true;
      }
    }
  }
  return { vx, vy, moving };
}

// ════════════════════════════ FROST GUARDIAN (boss) ════════════════════════
//
// Three phases. Cycles readable attacks: SLAM (telegraphed AoE), VOLLEY
// (dodgeable shard spread) and CHARGE (a straight-line dash) — each followed by a
// STAGGER window where its core is exposed and takes bonus damage.

function guardianAI(g: Game, e: Enemy, dt: number, dP: number) {
  const s = g.state;
  const p = s.player;
  const def = ENEMY.guardian;
  const D = profileOf(s.difficulty);
  let vx = 0, vy = 0, moving = false;

  // dormant until the inner gate is opened — no fighting it through the wall
  if (!s.flags.sigilGate) {
    e.state = "idle";
    e.stateT = 0;
    return { vx: 0, vy: 0, moving: false };
  }

  const pct = e.hp / e.max;
  const newPhase = pct > 0.66 ? 1 : pct > 0.33 ? 2 : 3;
  if (newPhase !== e.phase) {
    e.phase = newPhase;
    e.state = "stagger"; e.stateT = 2.2;
    g.fx.sfx("bossPhase");
    g.fx.shake(12);
    g.fx.burst(e.x, e.y - 40, "craft", 26);
    g.fx.toast({ title: `The Guardian fractures — Phase ${newPhase}`, sub: "Its core is exposed. Strike now.", kind: "warn", icon: "core" });
  }
  const speedMul = 1 + (e.phase - 1) * 0.22;

  switch (e.state) {
    case "idle":
    case "patrol": {
      if (dP < def.aggro && !p.dead) {
        e.state = "chase"; e.stateT = 0;
        if (!e.alerted) {
          e.alerted = true;
          g.fx.sfx("bossRoar");
          g.fx.shake(14);
          g.fx.toast({ title: "THE FROST GUARDIAN AWAKENS", sub: "Kill the core, not the armour.", kind: "warn", icon: "core" });
          g.emitEvent("boss", true);
        }
      }
      break;
    }
    case "chase": {
      if (p.dead) { e.state = "idle"; break; }
      e.stateT += dt;
      if (dP < def.attackR || e.stateT > 2.6) {
        // pick the next readable attack
        e.atkIdx = (e.atkIdx + 1) % 3;
        const pick = dP > 330 ? (e.atkIdx === 1 ? 1 : 2) : e.atkIdx;
        e.state = "windup";
        e.stateT = windupFor(pick === 0 ? 1.0 : pick === 1 ? 0.85 : 0.9, D);
        e.atkIdx = pick;
        e.biteDone = false;
        e.shots = 0;
        g.fx.sfx("bossWindup");
        break;
      }
      vx = ((p.x - e.x) / Math.max(1, dP)) * def.chase * speedMul;
      vy = ((p.y - e.y) / Math.max(1, dP)) * def.chase * speedMul;
      moving = true;
      break;
    }
    case "windup": {
      e.stateT -= dt;
      e.face = Math.atan2(p.y - e.y, p.x - e.x);
      if (e.stateT <= 0) {
        if (e.atkIdx === 0) { e.state = "slam"; e.stateT = 0.34; }
        else if (e.atkIdx === 1) { e.state = "volley"; e.stateT = 0.9; }
        else {
          e.state = "charge"; e.stateT = 0.72;
          const d = Math.max(1, dP);
          e.lungeDir = { x: (p.x - e.x) / d, y: (p.y - e.y) / d };
        }
      }
      break;
    }
    case "slam": {
      e.stateT -= dt;
      if (!e.biteDone && e.stateT <= 0.1) {
        e.biteDone = true;
        g.fx.sfx("bossSlam");
        g.fx.shake(16);
        g.shockwave(e.x, e.y, 190);
        g.fx.burst(e.x, e.y, "ice", 30);
        if (dist(e.x, e.y, p.x, p.y) < 190 && !p.dead) {
          g.damagePlayer(def.dmg * D.enemyDmgMul, "Shattered by the Frost Guardian.", 10);
        }
      }
      if (e.stateT <= 0) { e.state = "stagger"; e.stateT = 1.9; }
      break;
    }
    case "volley": {
      e.stateT -= dt;
      const want = e.phase >= 3 ? 7 : e.phase === 2 ? 5 : 4;
      const fired = want - Math.ceil((e.stateT / 0.9) * want);
      while (e.shots < fired && e.shots < want) {
        const spread = (e.shots - (want - 1) / 2) * 0.22;
        const a = Math.atan2(p.y - e.y, p.x - e.x) + spread;
        g.spawnProjectile(e.x + Math.cos(a) * 40, e.y - 30 + Math.sin(a) * 24, a, 330, 15 * D.enemyDmgMul);
        e.shots++;
        g.fx.sfx("shardFire");
      }
      if (e.stateT <= 0) { e.state = "stagger"; e.stateT = 1.5; }
      break;
    }
    case "charge": {
      e.stateT -= dt;
      vx = e.lungeDir.x * def.lungeSpd * speedMul;
      vy = e.lungeDir.y * def.lungeSpd * speedMul;
      moving = true;
      if (!e.biteDone && dP < 86 && !p.dead) {
        e.biteDone = true;
        g.damagePlayer(def.dmg * 0.8 * D.enemyDmgMul, "Trampled by the Frost Guardian.", 6);
        g.fx.sfx("bossSlam");
        g.fx.shake(10);
      }
      if (e.stateT <= 0) { e.state = "stagger"; e.stateT = 2.1; }
      break;
    }
    case "stagger": {
      // vulnerable window — core exposed (engine applies the damage bonus)
      e.stateT -= dt;
      if (e.stateT <= 0) { e.state = "chase"; e.stateT = 0; }
      break;
    }
    default: {
      e.state = "chase";
      break;
    }
  }
  return { vx, vy, moving };
}

export const isVulnerable = (e: Enemy) => e.kind === "guardian" && e.state === "stagger";
