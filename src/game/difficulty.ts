// ── ICEBOUND Phase 5.2: difficulty profiles ────────────────────────────────
// One table drives every system, so a mode is a coherent experience rather
// than an enemy-health slider. Values are multipliers applied at the point of
// use; nothing here is baked into the save, so switching mode is always safe
// and never grants or duplicates a reward.

export type DifficultyId = "story" | "survival" | "hardcore";

export interface DifficultyProfile {
  id: DifficultyId;
  name: string;
  tagline: string;
  /** Player-facing bullet list shown on the menu and in Settings. */
  effects: string[];

  // ── survival pressure ──
  hungerMul: number;      // hunger drain rate
  thirstMul: number;      // thirst drain rate
  coldMul: number;        // temperature loss rate
  starveDpsMul: number;   // damage once a bar hits zero

  // ── recovery ──
  foodMul: number;        // hunger/thirst restored by consumables
  healMul: number;        // health restored by medical items
  regenMul: number;       // passive health regeneration
  fireWarmMul: number;    // campfire warming rate

  // ── combat ──
  enemyDmgMul: number;
  enemyHpMul: number;
  enemyAggroMul: number;  // detection radius
  windupMul: number;      // attack telegraph length (floored, see MIN_WINDUP)
  enemyRegenMul: number;

  // ── world ──
  hazardMul: number;      // steam / shock / spike damage
  yieldBonus: number;     // extra chance of +1 on a gather strike
  respawnMul: number;     // resource node regrowth time

  // ── defeat ──
  /** Fraction of carried raw materials lost when recovering at the outpost. */
  deathMaterialLoss: number;
}

/** Telegraphs never drop below this, so attacks stay readable in every mode. */
export const MIN_WINDUP = 0.45;

export const DIFFICULTIES: Record<DifficultyId, DifficultyProfile> = {
  story: {
    id: "story", name: "Story", tagline: "Explore the arctic without fighting the clock.",
    effects: [
      "Hunger, thirst and cold drain ~40% slower",
      "Food and medicine restore 25% more",
      "Enemies hit 35% softer and have less health",
      "Hazards do half damage",
      "Gathering yields more; nodes regrow faster",
      "No materials lost when you recover from defeat",
    ],
    hungerMul: 0.60, thirstMul: 0.60, coldMul: 0.60, starveDpsMul: 0.55,
    foodMul: 1.25, healMul: 1.25, regenMul: 1.60, fireWarmMul: 1.25,
    enemyDmgMul: 0.65, enemyHpMul: 0.85, enemyAggroMul: 0.85, windupMul: 1.15, enemyRegenMul: 0.8,
    hazardMul: 0.50, yieldBonus: 0.30, respawnMul: 0.75,
    deathMaterialLoss: 0,
  },
  survival: {
    id: "survival", name: "Survival", tagline: "The intended experience. Preparation matters.",
    effects: [
      "Balanced survival drain and recovery",
      "Expeditions require real preparation",
      "Enemies are dangerous but always telegraph",
      "Defeat costs a quarter of your carried materials",
    ],
    hungerMul: 1, thirstMul: 1, coldMul: 1, starveDpsMul: 1,
    foodMul: 1, healMul: 1, regenMul: 1, fireWarmMul: 1,
    enemyDmgMul: 1, enemyHpMul: 1, enemyAggroMul: 1, windupMul: 1, enemyRegenMul: 1,
    hazardMul: 1, yieldBonus: 0, respawnMul: 1,
    deathMaterialLoss: 0.25,
  },
  hardcore: {
    id: "hardcore", name: "Hardcore", tagline: "The ice is actively trying to kill you.",
    effects: [
      "Hunger, thirst and cold drain ~35% faster",
      "Food and medicine restore 15% less; slower natural healing",
      "Enemies hit 40% harder, have more health and spot you sooner",
      "Shorter attack warnings — still readable, never unavoidable",
      "Hazards hurt more; nodes regrow slowly",
      "Defeat costs half your carried materials",
    ],
    hungerMul: 1.35, thirstMul: 1.35, coldMul: 1.40, starveDpsMul: 1.35,
    foodMul: 0.85, healMul: 0.85, regenMul: 0.60, fireWarmMul: 0.90,
    enemyDmgMul: 1.40, enemyHpMul: 1.25, enemyAggroMul: 1.15, windupMul: 0.88, enemyRegenMul: 1.2,
    hazardMul: 1.35, yieldBonus: -0.10, respawnMul: 1.30,
    deathMaterialLoss: 0.50,
  },
};

export const DIFFICULTY_ORDER: DifficultyId[] = ["story", "survival", "hardcore"];

export const DEFAULT_DIFFICULTY: DifficultyId = "survival";

/** Resolve a (possibly missing or corrupt) stored id to a real profile. */
export function profileOf(id: unknown): DifficultyProfile {
  return DIFFICULTIES[(id as DifficultyId)] ?? DIFFICULTIES[DEFAULT_DIFFICULTY];
}

/** Telegraph duration for an enemy wind-up under the given mode. */
export const windupFor = (base: number, p: DifficultyProfile) =>
  Math.max(MIN_WINDUP, base * p.windupMul);
