// ── ICEBOUND V5: versioned local save (migrates V4/V3/V2/V1 safely) ─────────

import { ITEMS, SAVE_KEY, SAVE_VERSION } from "./config";
import { profileOf } from "./difficulty";
import type { DailyTask, GameState, ItemId, RegionId, Settings } from "./types";
import { reconcileEquipment, rescaleEnemiesForDifficulty, syncRegionViews } from "./state";
import { createProgression, emptyRanks, MAX_LEVEL, progressionFromTotalXp, XP, type ProgressionState, type UpgradeId } from "./progression";
import { UPGRADES, progMaxHp, progMaxStamina } from "./progression";
import { sanitizeSettlement, serializeSettlement, type SettlementSave } from "./residents";
import { sanitizeSiege, serializeSiege, type SiegeState } from "./siege";

interface RegionSave {
  discovered: boolean;
  nodes: Record<string, { a: number; r: number }>;
  enemies: Record<string, { hp: number; d: boolean; r: number }>;
  containers: string[];          // ids that have been opened
  devices: string[];             // ids that are switched on
  discoveries: string[];         // ids of points of interest already found
}

export interface SaveData {
  v: number;
  time: number;
  region: RegionId;
  unlocked: RegionId[];
  player: { x: number; y: number; hp: number; hunger: number; thirst: number; temp: number; stamina: number; face: number };
  inv: Record<string, number>;
  storage: Record<string, number>;
  equip: GameState["equip"];
  shelter: GameState["shelter"];
  build: Record<string, boolean>;
  regions: Partial<Record<RegionId, RegionSave>>;
  difficulty: import("./difficulty").DifficultyId;
  questsDone: string[];
  questActive: string | null;
  daily: GameState["daily"];
  progression: ProgressionState;
  /** V5+: settlement residents & production. Absent on older saves. */
  settlement?: SettlementSave;
  /** V6.4+: siege calendar, defence ledger and structure wear. Absent on older saves. */
  siege?: SiegeState;
  crafted: string[];
  logs: string[];
  stats: GameState["stats"];
  flags: Record<string, boolean>;
  weather: GameState["weather"];
  settings: Settings;
}

export function extractSave(s: GameState): SaveData {
  const regions: SaveData["regions"] = {};
  for (const [id, r] of Object.entries(s.regions)) {
    const nodes: RegionSave["nodes"] = {};
    for (const n of r.nodes) if (n.amount !== n.max || n.respawnAt > 0) nodes[n.id] = { a: n.amount, r: n.respawnAt };
    const enemies: RegionSave["enemies"] = {};
    for (const e of r.enemies) if (e.dead || e.hp < e.max) enemies[e.id] = { hp: e.hp, d: e.dead, r: e.respawnAt };
    regions[id as RegionId] = {
      discovered: r.discovered,
      nodes, enemies,
      containers: r.containers.filter(c => c.opened).map(c => c.id),
      devices: r.devices.filter(d => d.on).map(d => d.id),
      discoveries: r.discoveries.filter(d => d.found).map(d => d.id),
    };
  }
  return {
    v: SAVE_VERSION,
    time: s.time,
    region: s.region,
    unlocked: [...s.unlocked],
    player: {
      x: s.player.x, y: s.player.y, hp: s.player.hp, hunger: s.player.hunger,
      thirst: s.player.thirst, temp: s.player.temp, stamina: s.player.stamina, face: s.player.face,
    },
    inv: { ...s.inv },
    storage: { ...s.storage },
    equip: { ...s.equip },
    shelter: JSON.parse(JSON.stringify(s.shelter)) as GameState["shelter"],
    build: { ...s.build },
    regions,
    difficulty: s.difficulty,
    questsDone: [...s.questsDone],
    questActive: s.questActive,
    progression: {
      level: s.progression.level,
      xp: s.progression.xp,
      totalXp: s.progression.totalXp,
      points: s.progression.points,
      ranks: { ...s.progression.ranks },
    },
    daily: {
      day: s.daily.day,
      tasks: s.daily.tasks.map(t => ({ ...t, reward: { ...t.reward } })),
      completedTotal: s.daily.completedTotal,
    },
    settlement: serializeSettlement(s.settlement),
    siege: serializeSiege(s.siege),
    crafted: [...s.crafted],
    logs: [...s.logs],
    stats: { ...s.stats },
    flags: { ...s.flags },
    weather: { ...s.weather },
    settings: { ...s.settings },
  };
}

const BACKUP_KEY = SAVE_KEY + "_bak";

/** A payload must look complete before it is allowed to replace a good save. */
function isPlausible(d: SaveData): boolean {
  return !!d
    && d.v === SAVE_VERSION
    && !!d.player && isFinite(d.player.x) && isFinite(d.player.y)
    && d.player.hp > 0
    && !!d.shelter
    && Array.isArray(d.questsDone)
    && Array.isArray(d.unlocked) && d.unlocked.length > 0
    && !!d.regions;
}

export function writeSave(s: GameState): boolean {
  try {
    const data = extractSave(s);
    if (!isPlausible(data)) return false;           // never clobber with junk
    const json = JSON.stringify(data);
    if (json.length < 120) return false;             // truncated/serialisation failure
    const prev = localStorage.getItem(SAVE_KEY);
    if (prev && prev.length > 120) {
      try { localStorage.setItem(BACKUP_KEY, prev); } catch { /* quota: skip backup */ }
    }
    localStorage.setItem(SAVE_KEY, json);
    return true;
  } catch {
    return false;
  }
}

/** Last-known-good copy, used when the primary slot fails to parse. */
function readBackup(): SaveData | null {
  try {
    const raw = localStorage.getItem(BACKUP_KEY);
    if (!raw) return null;
    return decodeSave(JSON.parse(raw) as Record<string, unknown>);
  } catch {
    return null;
  }
}

function decodeSave(d: Record<string, unknown>): SaveData | null {
  if (typeof d !== "object" || d === null) return null;
  if (d.v === SAVE_VERSION) {
    const s = d as unknown as SaveData;
    return s.player
      && Number.isFinite(s.player.x)
      && Number.isFinite(s.player.y)
      && Number.isFinite(s.player.hp)
      ? s : null;
  }
  if (d.v === 4) return migrateV4(d);
  if (d.v === 3) return migrateV4(migrateV3(d) as unknown as Record<string, unknown>);
  if (d.v === 2) return migrateV4(migrateV3(migrateV2(d) as unknown as Record<string, unknown>) as unknown as Record<string, unknown>);
  if (d.v === 1) return migrateV4(migrateV3(migrateV1(d) as unknown as Record<string, unknown>) as unknown as Record<string, unknown>);
  return null;
}

/** V4 → V5: attaches the settlement record. Every V4 field carries forward. */
function migrateV4(old: Record<string, unknown> | null): (SaveData & { migrated: boolean }) | null {
  if (!old) return null;
  const p = old.player as SaveData["player"] | undefined;
  if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return null;
  return {
    ...(old as unknown as SaveData),
    v: SAVE_VERSION,
    // Residents previously did not exist; sanitizeSettlement supplies a clean
    // empty settlement for any save that lacks (or corrupts) the record.
    settlement: undefined,
    migrated: true,
  };
}

/** V3 → V4 adds survivor progression and recorded discoveries. Nothing is lost. */
function migrateV3(old: Record<string, unknown> | null): (SaveData & { migrated: boolean }) | null {
  if (!old) return null;
  const p = old.player as SaveData["player"] | undefined;
  if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return null;
  const stats = (old.stats ?? {}) as Partial<GameState["stats"]>;
  const questsDone = Array.isArray(old.questsDone) ? (old.questsDone as string[]).length : 0;
  const logs = Array.isArray(old.logs) ? (old.logs as string[]).length : 0;
  const crafted = Array.isArray(old.crafted) ? (old.crafted as string[]).length : 0;
  // Credit work the player already did before progression existed, so a
  // migrated veteran is not reset to a blank survivor record.
  const retroXp =
    questsDone * 70 +
    (stats.kills ?? 0) * XP.kill.wolf +
    (stats.bosses ?? 0) * XP.kill.guardian +
    logs * XP.log +
    (stats.containers ?? 0) * XP.container +
    crafted * XP.craftGear +
    Math.floor((stats.gathered ?? 0) * XP.gatherPerUnit * 0.5);
  return {
    ...(old as unknown as SaveData),
    v: SAVE_VERSION,
    progression: progressionFromTotalXp(retroXp),
    stats: {
      kills: stats.kills ?? 0, gathered: stats.gathered ?? 0, crafted: stats.crafted ?? 0,
      distance: stats.distance ?? 0, bosses: stats.bosses ?? 0, containers: stats.containers ?? 0,
      discoveries: stats.discoveries ?? 0,
    },
    migrated: true,
  };
}

/** Reads V3 or migrates V2/V1 forward without deleting the original save. */
export function readSave(): (SaveData & { migrated?: boolean; recovered?: boolean }) | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) {
      const bak = readBackup();
      return bak ? { ...bak, recovered: true } : null;
    }
    const decoded = decodeSave(JSON.parse(raw) as Record<string, unknown>);
    if (decoded) return decoded;
  } catch { /* fall through to backup */ }
  const bak = readBackup();
  return bak ? { ...bak, recovered: true } : null;
}

/** V2 → V3 only adds persistent daily assignments; all V2 progress is kept. */
function migrateV2(old: Record<string, unknown>): (SaveData & { migrated: boolean }) | null {
  const p = old.player as SaveData["player"] | undefined;
  if (!p || typeof p.x !== "number") return null;
  return {
    ...(old as unknown as SaveData),
    v: SAVE_VERSION,
    daily: { day: -1, tasks: [], completedTotal: 0 },
    progression: createProgression(),
    difficulty: "survival",
    migrated: true,
  };
}

/** V1 → V2: keep every scrap of the player's progress. */
function migrateV1(old: Record<string, unknown>): (SaveData & { migrated: boolean }) | null {
  const p = old.player as SaveData["player"] | undefined;
  if (!p || typeof p.x !== "number") return null;
  const oldNodes = (old.nodes ?? {}) as Record<string, { a: number; r: number }>;
  const oldEquip = (old.equip ?? {}) as Partial<GameState["equip"]>;
  return {
    v: SAVE_VERSION,
    time: typeof old.time === "number" ? old.time : 0,
    region: "forest",
    unlocked: ["forest"],
    player: p,
    inv: (old.inv ?? {}) as Record<string, number>,
    storage: (old.storage ?? {}) as Record<string, number>,
    equip: { tool: oldEquip.tool ?? null, weapon: oldEquip.weapon ?? null, armor: oldEquip.armor ?? null, gear: null },
    shelter: (old.shelter ?? { stage: 0, fire: { built: false, lit: false, fuel: 0 } }) as GameState["shelter"],
    build: {},
    regions: { forest: { discovered: true, nodes: oldNodes, enemies: {}, containers: [], devices: [], discoveries: [] } },
    questsDone: Array.isArray(old.questsDone) ? (old.questsDone as string[]) : [],
    questActive: (old.questActive as string) ?? null,
    daily: { day: -1, tasks: [], completedTotal: 0 },
    progression: createProgression(),
    difficulty: "survival",
    crafted: Array.isArray(old.crafted) ? (old.crafted as string[]) : [],
    logs: [],
    stats: {
      kills: 0, gathered: 0, crafted: 0, distance: 0, bosses: 0, containers: 0, discoveries: 0,
      ...(old.stats as object ?? {}),
    } as GameState["stats"],
    flags: (old.flags ?? {}) as Record<string, boolean>,
    weather: { kind: "snow", t: 90, intensity: 1, target: 1 },
    settings: { music: 0.55, sfx: 0.9, snow: 1, shake: true, master: 1, ambient: 0.8, highContrast: false, quality: "auto", joyHand: "left", bigText: false, tips: true, ...(old.settings as object ?? {}) } as Settings,
    migrated: true,
  };
}

export function hasSave(): boolean {
  return readSave() !== null;
}

export function clearSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
    localStorage.removeItem(BACKUP_KEY);
  } catch { /* noop */ }
}

/** Merge saved data onto a freshly generated state. Missing fields use safe defaults. */
export function applySave(s: GameState, d: SaveData) {
  s.time = typeof d.time === "number" ? d.time : 0;
  Object.assign(s.player, {
    x: d.player.x, y: d.player.y,
    hp: clampN(d.player.hp, 5, 200), hunger: clampN(d.player.hunger, 10, 100),
    thirst: clampN(d.player.thirst, 10, 100), temp: clampN(d.player.temp, 30, 100),
    stamina: clampN(d.player.stamina, 30, 200), face: d.player.face ?? Math.PI / 2,
  });

  s.inv = sanitizeItems(d.inv, "inv");
  s.storage = sanitizeItems(d.storage, "storage");
  s.equip = {
    tool: d.equip?.tool ?? null, weapon: d.equip?.weapon ?? null,
    armor: d.equip?.armor ?? null, gear: d.equip?.gear ?? null,
  };
  // Reject slots that point at items the player does not actually hold, or
  // items that are not equippable in that slot.
  reconcileEquipment(s);
  s.shelter.stage = clampN(d.shelter?.stage, 0, 3);
  s.shelter.fire = {
    built: !!d.shelter?.fire?.built,
    lit: !!d.shelter?.fire?.lit && (d.shelter?.fire?.fuel ?? 0) > 0,
    fuel: clampN(d.shelter?.fire?.fuel ?? 0, 0, 999),
  };
  s.build = typeof d.build === "object" && d.build ? { ...d.build } : {};

  // regions
  // Set and apply difficulty BEFORE restoring enemy HP: otherwise a Hardcore
  // save is clamped against Survival max-health and loads weaker enemies.
  s.difficulty = profileOf(d.difficulty).id;
  rescaleEnemiesForDifficulty(s, s.difficulty);
  s.region = d.region && s.regions[d.region] ? d.region : "forest";
  s.unlocked = Array.isArray(d.unlocked) && d.unlocked.length ? d.unlocked.filter(r => !!s.regions[r]) : ["forest"];
  if (!s.unlocked.includes("forest")) s.unlocked.push("forest");

  for (const [id, rs] of Object.entries(d.regions ?? {})) {
    const reg = s.regions[id as RegionId];
    if (!reg || !rs) continue;
    reg.discovered = !!rs.discovered;
    for (const [nid, rec] of Object.entries(rs.nodes ?? {})) {
      const n = reg.nodes.find(n => n.id === nid);
      if (n && rec && typeof rec.a === "number") { n.amount = clampN(rec.a, 0, n.max); n.respawnAt = rec.r ?? 0; }
    }
    for (const [eid, rec] of Object.entries(rs.enemies ?? {})) {
      const e = reg.enemies.find(e => e.id === eid);
      if (e && rec) {
        e.hp = clampN(rec.hp, 1, e.max);
        e.dead = !!rec.d;
        e.respawnAt = rec.r ?? 0;
        if (e.dead) { e.state = "dead"; e.deadT = 99; }
      }
    }
    for (const cid of rs.containers ?? []) {
      const c = reg.containers.find(c => c.id === cid);
      if (c) c.opened = true;
    }
    for (const did of rs.devices ?? []) {
      const dv = reg.devices.find(x => x.id === did);
      if (dv) dv.on = true;
    }
    for (const fid of rs.discoveries ?? []) {
      const found = reg.discoveries.find(x => x.id === fid);
      if (found) found.found = true;
    }
  }
  syncRegionViews(s);

  s.questsDone = Array.isArray(d.questsDone) ? d.questsDone.filter(q => typeof q === "string") : [];
  s.questActive = d.questActive ?? null;
  s.daily = sanitizeDaily(d.daily);
  s.progression = sanitizeProgression(d.progression);
  // Settlement residents: identities, roles, injuries, tasks, production
  // progress, camp stock and the offline wall-clock stamp. Corrupt entries are
  // dropped individually; a missing record yields an empty settlement.
  s.settlement = sanitizeSettlement(d.settlement);
  // Siege calendar & defence ledger. An old or corrupt payload yields a fresh
  // calendar; event ids that already resolved stay in the dedup ledger so a
  // reward is never re-armed.
  s.siege = sanitizeSiege(d.siege);
  // Clamp vitals to the ceilings the restored upgrades actually allow.
  s.player.hp = Math.min(s.player.hp, progMaxHp(s));
  s.player.stamina = Math.min(s.player.stamina, progMaxStamina(s));
  s.crafted = Array.isArray(d.crafted) ? d.crafted.filter(c => typeof c === "string") : [];
  s.logs = Array.isArray(d.logs) ? d.logs.filter(l => typeof l === "string") : [];
  s.stats = {
    kills: d.stats?.kills ?? 0, gathered: d.stats?.gathered ?? 0,
    crafted: d.stats?.crafted ?? s.crafted.length, distance: d.stats?.distance ?? 0,
    bosses: d.stats?.bosses ?? 0, containers: d.stats?.containers ?? 0,
    discoveries: d.stats?.discoveries ?? 0,
  };
  s.flags = typeof d.flags === "object" && d.flags ? { ...d.flags } : {};
  if (d.weather && typeof d.weather.kind === "string") s.weather = { ...d.weather, t: Math.max(20, d.weather.t ?? 60) };
  if (d.settings) {
    // Volumes must be real 0..1 numbers: a corrupt string would otherwise
    // reach the gain node and silently mute the game.
    const vol = (v: unknown, fallback: number) =>
      typeof v === "number" && isFinite(v) ? Math.min(1, Math.max(0, v)) : fallback;
    s.settings = {
      music: vol(d.settings.music, 0.55), sfx: vol(d.settings.sfx, 0.9),
      snow: vol(d.settings.snow, 1), shake: d.settings.shake ?? true,
      quality: d.settings.quality ?? "auto",
      joyHand: d.settings.joyHand ?? "left",
      bigText: d.settings.bigText ?? false,
      highContrast: d.settings.highContrast ?? false,
      tips: d.settings.tips ?? true,
      master: vol(d.settings.master, 1),
      ambient: vol(d.settings.ambient, 0.8),
    };
  }
}

function sanitizeDaily(raw: unknown): GameState["daily"] {
  const d = raw as Partial<GameState["daily"]> | null;
  if (!d || typeof d.day !== "number" || !Array.isArray(d.tasks)) {
    return { day: -1, tasks: [], completedTotal: 0 };
  }
  const tasks: DailyTask[] = d.tasks
    .filter(t => !!t && typeof t.id === "string" && typeof t.goal === "number" && t.goal > 0)
    .slice(0, 3)
    .map(t => ({
      ...t,
      progress: clampN(t.progress, 0, t.goal),
      complete: !!t.complete || t.progress >= t.goal,
      rewarded: !!t.rewarded,
      reward: { ...t.reward },
    }));
  return {
    day: Math.max(-1, Math.floor(d.day)),
    tasks,
    completedTotal: Math.max(0, Math.floor(d.completedTotal ?? 0)),
  };
}

/** Progression is rebuilt defensively: unknown or corrupt ranks fall back to 0. */
function sanitizeProgression(raw: unknown): ProgressionState {
  const base = createProgression();
  const d = raw as Partial<ProgressionState> | null;
  if (!d || typeof d !== "object") return base;
  const ranks = emptyRanks();
  for (const def of UPGRADES) {
    const v = (d.ranks as Record<string, unknown> | undefined)?.[def.id];
    if (typeof v === "number" && isFinite(v)) {
      ranks[def.id as UpgradeId] = Math.max(0, Math.min(def.maxRank, Math.floor(v)));
    }
  }
  return {
    level: clampN(d.level ?? 1, 1, MAX_LEVEL),
    xp: Math.max(0, Math.floor(typeof d.xp === "number" && isFinite(d.xp) ? d.xp : 0)),
    totalXp: Math.max(0, Math.floor(typeof d.totalXp === "number" && isFinite(d.totalXp) ? d.totalXp : 0)),
    points: clampN(d.points ?? 0, 0, 99),
    ranks,
  };
}

function clampN(v: unknown, lo: number, hi: number): number {
  return typeof v === "number" && isFinite(v) ? Math.min(hi, Math.max(lo, v)) : lo;
}

/** Only known item ids survive. An unknown key would otherwise create a broken
 *  inventory slot and crash the first ITEMS[id].stack lookup. Quantities are
 *  clamped to the ceiling of the bag they came from. */
function sanitizeItems(inv: unknown, bag: "inv" | "storage"): Record<string, number> {
  const out: Record<string, number> = {};
  if (typeof inv === "object" && inv) {
    for (const [k, v] of Object.entries(inv as Record<string, unknown>)) {
      if (!Object.prototype.hasOwnProperty.call(ITEMS, k)) continue;
      if (typeof v === "number" && v > 0 && isFinite(v)) {
        const id = k as ItemId;
        const cap = ITEMS[id].stack * (bag === "storage" ? 4 : 1);
        out[id] = Math.min(cap, Math.floor(v));
      }
    }
  }
  return out;
}
