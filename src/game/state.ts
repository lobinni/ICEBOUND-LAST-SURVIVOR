// ── ICEBOUND V2: state factory + inventory helpers ──────────────────────────

import { BAL, ENEMY, ITEMS, REGIONS, WORLD } from "./config";
import type { Enemy, EnemyKind, GameState, ItemId, Player, RegionId } from "./types";
import { mulberry32, WORLD_SEED } from "./world";
import { createProgression, progCapacityBonus } from "./progression";
import { DIFFICULTIES, type DifficultyId } from "./difficulty";
import { createSettlement } from "./residents";
import { createSiege } from "./siege";

export function createPlayer(): Player {
  return {
    x: WORLD.spawn.x, y: WORLD.spawn.y, vx: 0, vy: 0,
    face: -Math.PI / 2, moving: false, sprint: false,
    hp: 100, hunger: 82, thirst: 72, temp: 88, stamina: 100,
    atkT: 0, atkCd: 0, atkHit: false,
    gatherT: 0, gatherLen: 0.6, gatherTarget: null,
    dodgeT: 0, dodgeCd: 0, iframeT: 0, hurtT: 0,
    dead: false, deathT: 0,
    walkPh: 0, stepAcc: 0, breathT: 0,
    attackTool: null, dodgeDir: 0,
  };
}

export function createEnemy(id: string, kind: EnemyKind, x: number, y: number, quest = false, difficulty: DifficultyId = "survival"): Enemy {
  const def = ENEMY[kind];
  const hpMul = DIFFICULTIES[difficulty].enemyHpMul;
  const rng = mulberry32(WORLD_SEED + id.length * 31 + Math.floor(x) + Math.floor(y));
  const wp: { x: number; y: number }[] = [];
  const spread = kind === "guardian" ? 170 : kind === "crawler" ? 150 : 230;
  for (let i = 0; i < 3; i++) {
    const a = rng() * Math.PI * 2, r = spread * (0.6 + rng() * 0.8);
    wp.push({ x: x + Math.cos(a) * r, y: y + Math.sin(a) * r * 0.75 });
  }
  return {
    id, kind, x, y, vx: 0, vy: 0, face: rng() * Math.PI * 2,
    hp: def.hp * hpMul, max: def.hp * hpMul,
    state: kind === "crawler" ? "hidden" : "patrol", stateT: 0,
    home: { x, y }, wp, wpi: 0,
    lungeDir: { x: 0, y: 0 }, biteDone: false,
    dead: false, deadT: 0, respawnAt: 0,
    quest, hitT: 0, walkPh: 0, growlT: 0,
    phase: 1, atkIdx: 0, shots: 0, alerted: false,
  };
}

/** Point the live view arrays at the active region. */
export function syncRegionViews(s: GameState) {
  const r = s.regions[s.region];
  s.nodes = r.nodes;
  s.structs = r.structs;
  s.enemies = r.enemies;
  s.containers = r.containers;
  s.devices = r.devices;
  s.hazards = r.hazards;
  s.discoveries = r.discoveries;
}

export function createState(): GameState {
  // regions are built lazily by the engine to avoid a circular import
  const s: GameState = {
    screen: "menu",
    paused: false,
    modal: null,
    time: BAL.dayLength * 0.06,

    region: "forest",
    regions: {} as GameState["regions"],
    unlocked: ["forest"],

    nodes: [], structs: [], enemies: [], containers: [], devices: [], hazards: [], discoveries: [],

    player: createPlayer(),
    pickups: [],
    projectiles: [],
    weather: { kind: "snow", t: 90, intensity: 1, target: 1 },

    shelter: { stage: 0, fire: { built: false, lit: false, fuel: 0 } },
    build: {},

    inv: {},
    storage: {},
    equip: { tool: null, weapon: null, armor: null, gear: null },
    crafted: [],
    logs: [],

    difficulty: "survival",
    questsDone: [],
    questActive: null,
    daily: { day: -1, tasks: [], completedTotal: 0 },
    progression: createProgression(),
    settlement: createSettlement(),
    siege: createSiege(),
    guide: null,
    stats: { kills: 0, gathered: 0, crafted: 0, distance: 0, bosses: 0, containers: 0, discoveries: 0 },
    settings: { master: 1, music: 0.55, sfx: 0.9, ambient: 0.8, snow: 1, shake: true, quality: "auto", joyHand: "left", bigText: false, highContrast: false, tips: true },
    flags: {},

    interact: null,
    lootOpen: null,
    cause: "",
    savedFlash: 0,
  };
  return s;
}

// ── inventory helpers ────────────────────────────────────────────────────────

export const countItem = (s: GameState, id: ItemId, from: "inv" | "storage" = "inv") =>
  (from === "inv" ? s.inv : s.storage)[id] ?? 0;

export const capacity = (s: GameState) =>
  BAL.baseCapacity + (countItem(s, "pack") > 0 ? BAL.packCapacity : 0) + progCapacityBonus(s);

export const usedSlots = (s: GameState) => Object.values(s.inv).filter(n => n > 0).length;

/** Returns amount actually added (respects stack limits AND slot capacity). */
export function addItem(s: GameState, id: ItemId, n: number, to: "inv" | "storage" = "inv"): number {
  if (!Number.isFinite(n) || n <= 0 || !ITEMS[id]) return 0;
  n = Math.floor(n);
  const bag = to === "inv" ? s.inv : s.storage;
  const cur = bag[id] ?? 0;
  if (to === "inv" && cur <= 0 && usedSlots(s) >= capacity(s)) return 0; // pack full
  const cap = ITEMS[id].stack * (to === "storage" ? 4 : 1);
  const add = Math.max(0, Math.min(cap - cur, n));
  if (add > 0) bag[id] = cur + add;
  return add;
}

/** Drop any equipment reference that no longer points at a held item. */
export function reconcileEquipment(s: GameState) {
  const slots = ["tool", "weapon", "armor", "gear"] as const;
  for (const slot of slots) {
    const id = s.equip[slot];
    if (id && (countItem(s, id) <= 0 || !ITEMS[id].equip)) s.equip[slot] = null;
  }
}

export function removeItem(s: GameState, id: ItemId, n: number, from: "inv" | "storage" = "inv"): boolean {
  if (!Number.isFinite(n) || n <= 0 || !ITEMS[id]) return false;
  n = Math.floor(n);
  const bag = from === "inv" ? s.inv : s.storage;
  const cur = bag[id] ?? 0;
  if (cur < n) return false;
  const next = cur - n;
  if (next <= 0) delete bag[id]; else bag[id] = next;
  // Removing the last of an equipped item would otherwise leave a phantom
  // reference that still applies its stats after the item is gone.
  if (from === "inv" && next <= 0) reconcileEquipment(s);
  return true;
}

export const regionDef = (id: RegionId) => REGIONS[id];

/**
 * Re-scale living enemies when the player changes difficulty mid-run.
 * Current health keeps its proportion, so no enemy is healed or killed and no
 * reward can be duplicated by toggling the setting.
 */
export function rescaleEnemiesForDifficulty(s: GameState, next: DifficultyId) {
  const mul = DIFFICULTIES[next].enemyHpMul;
  for (const reg of Object.values(s.regions)) {
    for (const e of reg.enemies) {
      const base = ENEMY[e.kind].hp;
      const newMax = base * mul;
      if (newMax === e.max) continue;
      const frac = e.max > 0 ? e.hp / e.max : 1;
      e.max = newMax;
      e.hp = Math.max(1, newMax * frac);
    }
  }
}
