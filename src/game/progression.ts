// ── ICEBOUND Phase 4.1: survivor progression ───────────────────────────────
// Experience is only granted by deliberate player actions (gathering, crafting,
// combat, discovery, quests). There is no idle, AFK or timed XP income.

import type { Fx, GameState } from "./types";

export type UpgradeId =
  | "vitality" | "endurance" | "insulation"
  | "porter" | "harvester" | "warrior" | "forager";

export interface UpgradeDef {
  id: UpgradeId;
  name: string;
  icon: string;
  summary: string;
  maxRank: number;
  /** Minimum survivor level required to buy each rank (index = rank-1). */
  reqLevel: number[];
  /** Human-readable effect at a given rank. */
  effectAt: (rank: number) => string;
}

export const MAX_LEVEL = 20;

/** XP needed to advance from `level` to `level + 1`. */
export const xpForNext = (level: number) =>
  level >= MAX_LEVEL ? Infinity : 90 + (level - 1) * 75;

export const UPGRADES: UpgradeDef[] = [
  {
    id: "vitality", name: "Vitality", icon: "heart",
    summary: "Hard-won resilience. Raises maximum health.",
    maxRank: 5, reqLevel: [1, 3, 6, 10, 14],
    effectAt: r => `Maximum health ${100 + r * 10} (+${r * 10})`,
  },
  {
    id: "endurance", name: "Endurance", icon: "bolt",
    summary: "Deeper lungs for long hauls. Raises maximum stamina.",
    maxRank: 5, reqLevel: [1, 3, 6, 10, 14],
    effectAt: r => `Maximum stamina ${100 + r * 10} (+${r * 10})`,
  },
  {
    id: "insulation", name: "Cold Adaptation", icon: "temp",
    summary: "Your body fights the cold harder. Slows temperature loss everywhere.",
    maxRank: 5, reqLevel: [2, 4, 7, 11, 15],
    effectAt: r => `Cold exposure −${r * 6}%`,
  },
  {
    id: "porter", name: "Porter", icon: "backpack",
    summary: "Smarter packing. Adds inventory slots on top of the Expedition Pack.",
    maxRank: 4, reqLevel: [2, 5, 9, 13],
    effectAt: r => `+${r * 2} inventory slots`,
  },
  {
    id: "harvester", name: "Harvester", icon: "axe",
    summary: "Efficient technique. Faster gathering and occasional extra yield.",
    maxRank: 4, reqLevel: [1, 4, 8, 12],
    effectAt: r => `Gather speed +${r * 6}%, ${r * 18}% chance of +1 yield`,
  },
  {
    id: "warrior", name: "Combat Training", icon: "spear",
    summary: "Better footing and leverage. Increases all weapon damage.",
    maxRank: 5, reqLevel: [2, 5, 8, 12, 16],
    effectAt: r => `Weapon damage +${r * 8}%`,
  },
  {
    id: "forager", name: "Field Rationing", icon: "meat",
    summary: "You waste less. Hunger and thirst drain more slowly.",
    maxRank: 4, reqLevel: [3, 6, 10, 14],
    effectAt: r => `Hunger & thirst drain −${r * 7}%`,
  },
];

export const UPGRADE_BY_ID = Object.fromEntries(UPGRADES.map(u => [u.id, u])) as Record<UpgradeId, UpgradeDef>;

export function emptyRanks(): Record<UpgradeId, number> {
  return { vitality: 0, endurance: 0, insulation: 0, porter: 0, harvester: 0, warrior: 0, forager: 0 };
}

export interface ProgressionState {
  level: number;
  xp: number;        // XP inside the current level
  totalXp: number;   // lifetime, for the stats screen
  points: number;    // unspent upgrade points
  ranks: Record<UpgradeId, number>;
}

export function createProgression(): ProgressionState {
  return { level: 1, xp: 0, totalXp: 0, points: 0, ranks: emptyRanks() };
}

// ── XP award table (deliberate actions only) ───────────────────────────────

export const XP = {
  gatherPerUnit: 1,
  craftGear: 12,
  craftLate: 30,
  buildUpgrade: 45,
  container: 15,
  log: 45,
  discovery: 40,
  regionFirstVisit: 110,
  questChapter: [0, 55, 75, 95, 115, 140, 170] as const, // index by chapter 1..6
  kill: { hare: 3, wolf: 22, crawler: 26, bear: 65, guardian: 420 } as const,
};

const rank = (s: GameState, id: UpgradeId) => s.progression?.ranks?.[id] ?? 0;

// ── derived gameplay stats (used by survival, combat, inventory, gathering) ─

export const progMaxHp = (s: GameState) => 100 + rank(s, "vitality") * 10;
export const progMaxStamina = (s: GameState) => 100 + rank(s, "endurance") * 10;
/** Multiplier applied to cold drain (lower is warmer). */
export const progColdMul = (s: GameState) => 1 - rank(s, "insulation") * 0.06;
/** Extra inventory slots. */
export const progCapacityBonus = (s: GameState) => rank(s, "porter") * 2;
/** Multiplier applied to gather channel time (lower is faster). */
export const progGatherSpeedMul = (s: GameState) => 1 - rank(s, "harvester") * 0.06;
/** Chance of one extra unit per successful strike. */
export const progGatherBonusChance = (s: GameState) => rank(s, "harvester") * 0.18;
/** Multiplier applied to outgoing weapon damage. */
export const progDamageMul = (s: GameState) => 1 + rank(s, "warrior") * 0.08;
/** Multiplier applied to hunger/thirst drain (lower lasts longer). */
export const progSurvivalMul = (s: GameState) => 1 - rank(s, "forager") * 0.07;

// ── awarding ───────────────────────────────────────────────────────────────

/** Award XP for a completed player action. Levels grant one upgrade point. */
export function grantXp(s: GameState, amount: number, fx: Fx, reason?: string) {
  if (!s.progression || amount <= 0) return;
  const p = s.progression;
  if (p.level >= MAX_LEVEL) { p.totalXp += amount; return; }

  p.xp += amount;
  p.totalXp += amount;

  let levelled = 0;
  while (p.level < MAX_LEVEL && p.xp >= xpForNext(p.level)) {
    p.xp -= xpForNext(p.level);
    p.level++;
    p.points++;
    levelled++;
  }
  if (p.level >= MAX_LEVEL) p.xp = 0;

  if (levelled > 0) {
    // Health and stamina ceilings can rise, so top the player up by the gain.
    s.player.hp = Math.min(progMaxHp(s), s.player.hp + levelled * 6);
    s.player.stamina = Math.min(progMaxStamina(s), s.player.stamina + levelled * 10);
    fx.sfx("craftRare");
    fx.float(s.player.x, s.player.y - 86, `LEVEL ${p.level}`, "#ffd2a0");
    fx.toast({
      title: `Survivor Level ${p.level}`,
      sub: `${p.points} upgrade point${p.points === 1 ? "" : "s"} available — open the Survivor panel.`,
      kind: "quest", icon: "progress",
    });
  } else if (reason) {
    fx.float(s.player.x, s.player.y - 78, `+${amount} XP`, "#a5e0ff");
  }
}

// ── spending ───────────────────────────────────────────────────────────────

export function upgradeStatus(s: GameState, id: UpgradeId): {
  rank: number; maxed: boolean; canBuy: boolean; reason?: string; nextReqLevel: number | null;
} {
  const def = UPGRADE_BY_ID[id];
  const cur = rank(s, id);
  if (cur >= def.maxRank) return { rank: cur, maxed: true, canBuy: false, reason: "Fully upgraded", nextReqLevel: null };
  const need = def.reqLevel[cur] ?? 99;
  const lvl = s.progression?.level ?? 1;
  if (lvl < need) return { rank: cur, maxed: false, canBuy: false, reason: `Requires Level ${need}`, nextReqLevel: need };
  if ((s.progression?.points ?? 0) < 1) return { rank: cur, maxed: false, canBuy: false, reason: "No upgrade points", nextReqLevel: need };
  return { rank: cur, maxed: false, canBuy: true, nextReqLevel: need };
}

/** Spend one upgrade point. Returns true when the rank actually increased. */
export function buyUpgrade(s: GameState, id: UpgradeId, fx: Fx): boolean {
  const st = upgradeStatus(s, id);
  if (!st.canBuy || !s.progression) {
    fx.toast({ title: st.reason ?? "Cannot upgrade", kind: "warn", icon: "warn" });
    fx.sfx("error");
    return false;
  }
  s.progression.points--;
  s.progression.ranks[id] = st.rank + 1;

  // Raising a ceiling immediately grants the new headroom.
  if (id === "vitality") s.player.hp = Math.min(progMaxHp(s), s.player.hp + 10);
  if (id === "endurance") s.player.stamina = Math.min(progMaxStamina(s), s.player.stamina + 10);

  const def = UPGRADE_BY_ID[id];
  fx.sfx("craft");
  fx.toast({
    title: `${def.name} — Rank ${st.rank + 1}`,
    sub: def.effectAt(st.rank + 1),
    kind: "good", icon: def.icon,
  });
  fx.bump();
  return true;
}

/** Rebuild a progression record from a lifetime XP total.
 *  Used when an older save is migrated so past work still counts. */
export function progressionFromTotalXp(totalXp: number): ProgressionState {
  const p = createProgression();
  p.totalXp = Math.max(0, Math.floor(totalXp));
  let left = p.totalXp;
  while (p.level < MAX_LEVEL && left >= xpForNext(p.level)) {
    left -= xpForNext(p.level);
    p.level++;
    p.points++;
  }
  p.xp = p.level >= MAX_LEVEL ? 0 : left;
  return p;
}

export const spentPoints = (s: GameState) =>
  UPGRADES.reduce((n, u) => n + rank(s, u.id), 0);
