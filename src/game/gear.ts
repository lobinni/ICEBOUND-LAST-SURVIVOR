// ── ICEBOUND Phase 5.2: equipment statistics ───────────────────────────────
// One source of truth for the numbers shown on gear, so the inventory and the
// crafting list can never disagree with what the simulation actually applies.

import { ARMOR, BAL, ITEMS, TOOL_TIER } from "./config";
import type { GameState, ItemId } from "./types";
import { profileOf } from "./difficulty";
import { progDamageMul } from "./progression";

export interface GearStat {
  label: string;
  value: string;
  /** Positive = an improvement over what the player currently has equipped. */
  delta?: number;
  deltaText?: string;
}

const WEAPON_DMG: Partial<Record<ItemId, number>> = {
  spear: BAL.attack.dmgSpear,
  warspear: BAL.attack.dmgWarSpear,
  crystalblade: BAL.attack.dmgBlade,
};

const TOOL_DMG: Partial<Record<ItemId, number>> = {
  axe: BAL.attack.dmgAxe,
  ironaxe: BAL.attack.dmgIronAxe,
  crystalpick: BAL.attack.dmgIronAxe,
};

/** Hits needed to fell a reference enemy, so damage means something concrete. */
function hitsOn(dmg: number, hp: number) {
  return Math.max(1, Math.ceil(hp / Math.max(1, dmg)));
}

/**
 * Display statistics for an item. Values include the player's current
 * progression bonuses and difficulty, because that is what they will actually
 * experience when they equip it.
 */
export function gearStats(s: GameState, id: ItemId): GearStat[] {
  const def = ITEMS[id];
  const out: GearStat[] = [];
  const D = profileOf(s.difficulty);

  // ── weapons ──
  const wd = WEAPON_DMG[id];
  if (wd !== undefined) {
    const dmg = wd * progDamageMul(s);
    const cur = s.equip.weapon ? (WEAPON_DMG[s.equip.weapon] ?? 0) * progDamageMul(s) : 0;
    out.push({
      label: "Damage", value: dmg.toFixed(0),
      delta: cur > 0 ? dmg - cur : undefined,
      deltaText: cur > 0 && dmg !== cur ? `${dmg > cur ? "+" : ""}${(dmg - cur).toFixed(0)} vs equipped` : undefined,
    });
    const wolfHp = 62 * D.enemyHpMul;
    out.push({ label: "Ice Wolf", value: `${hitsOn(dmg, wolfHp)} hits` });
    const bearHp = 190 * D.enemyHpMul;
    out.push({ label: "Frost Bear", value: `${hitsOn(dmg, bearHp)} hits` });
    out.push({ label: "Stamina / swing", value: String(BAL.stamAttack) });
  }

  // ── tools ──
  const td = TOOL_DMG[id];
  if (td !== undefined) {
    const tier = TOOL_TIER[id] ?? 0;
    out.push({ label: "Tool tier", value: `${tier}` });
    out.push({ label: "Gather speed", value: tier >= 3 ? "+40%" : tier >= 2 ? "+22%" : "baseline" });
    if (tier >= 2) out.push({ label: "Yield", value: "+1 wood / stone" });
    if (tier >= 3) out.push({ label: "Unlocks", value: "Ice crystal veins" });
    out.push({ label: "Damage", value: (td * progDamageMul(s)).toFixed(0) });
  }

  // ── clothing ──
  const armor = ARMOR[id];
  if (armor) {
    const cur = s.equip.armor ? ARMOR[s.equip.armor] : null;
    const coldCut = Math.round((1 - armor.cold) * 100);
    out.push({
      label: "Cold resistance", value: `${coldCut}%`,
      delta: cur ? (1 - armor.cold) - (1 - cur.cold) : undefined,
      deltaText: cur && cur.cold !== armor.cold
        ? `${armor.cold < cur.cold ? "+" : ""}${coldCut - Math.round((1 - cur.cold) * 100)}% vs equipped`
        : undefined,
    });
    out.push({ label: "Damage reduction", value: `${Math.round(armor.dr * 100)}%` });
  }

  // ── utility gear ──
  if (id === "pack") out.push({ label: "Carrying capacity", value: `+${BAL.packCapacity} slots` });
  if (id === "lantern") out.push({ label: "Light radius", value: "300 (from 170)" });
  if (id === "heatcore") out.push({ label: "Cold resistance", value: "28%" });
  if (id === "crowbar") out.push({ label: "Unlocks", value: "Rusted cargo holds" });

  // ── consumables: restoration, already difficulty-adjusted ──
  if (def.use) {
    const u = def.use;
    const push = (label: string, raw: number | undefined, mul: number) => {
      if (!raw) return;
      const v = raw > 0 ? raw * mul : raw;     // penalties are never softened
      out.push({ label, value: `${v > 0 ? "+" : ""}${v.toFixed(0)}` });
    };
    push("Health", u.hp, D.healMul);
    push("Hunger", u.hunger, D.foodMul);
    push("Thirst", u.thirst, D.foodMul);
    push("Warmth", u.temp, D.foodMul);
    push("Stamina", u.stamina, 1);
  }

  return out;
}

export const hasGearStats = (s: GameState, id: ItemId) => gearStats(s, id).length > 0;
