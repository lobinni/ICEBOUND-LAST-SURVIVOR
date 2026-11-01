// ── ICEBOUND V2: survival · gathering · crafting · quests ──────────────────

import {
  ARMOR, BAL, ITEMS, LOGS, NODE_INFO, RECIPES, REGIONS, WEATHER, WORLD, isNight,
} from "./config";
import type { Recipe } from "./config";
import type { Fx, GameState, ItemId, RegionId, WNode } from "./types";
import { addItem, capacity, countItem, removeItem, usedSlots } from "./state";
import { grant, pay, spaceFor, whyCannotPay } from "./tx";
import { toolTier } from "./actors";
import type { ChapterId } from "./story";
import { profileOf } from "./difficulty";
import { recordDailyEvent } from "./tasks";
import {
  grantXp, progColdMul, progGatherBonusChance, progGatherSpeedMul,
  progMaxHp, progSurvivalMul, XP,
} from "./progression";

const dist = (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, ay - by);
const clamp = (v: number, lo = 0, hi = 100) => Math.min(hi, Math.max(lo, v));

// ── survival ────────────────────────────────────────────────────────────────

export interface SurvivalEvents {
  frozeWarn: boolean; starveWarn: boolean; thirstWarn: boolean;
  deathCause: string | null; fireDied: boolean;
}

export function tickSurvival(s: GameState, dt: number): SurvivalEvents {
  const p = s.player;
  const ev: SurvivalEvents = { frozeWarn: false, starveWarn: false, thirstWarn: false, deathCause: null, fireDied: false };
  if (p.dead) return ev;

  const ph = p.hunger, pt = p.thirst, pm = p.temp;
  const D = profileOf(s.difficulty);
  const rationing = progSurvivalMul(s);           // Field Rationing upgrade
  p.hunger = clamp(p.hunger - BAL.hungerPerSec * rationing * D.hungerMul * dt);
  p.thirst = clamp(p.thirst - BAL.thirstPerSec * rationing * D.thirstMul * dt);

  const region = REGIONS[s.region];
  const night = isNight(s.time);
  let drain = (night ? BAL.tempDrainNight : BAL.tempDrainDay) * region.tempMul;
  drain *= WEATHER[s.weather.kind].tempMul;

  const inForest = s.region === "forest";
  const nearFire = inForest && s.shelter.fire.lit && s.shelter.fire.fuel > 0 &&
    dist(p.x, p.y, WORLD.firepit.x, WORLD.firepit.y) < BAL.tempFireR;
  const inShelter = inForest && dist(p.x, p.y, WORLD.shelter.x, WORLD.shelter.y) < BAL.tempShelterR;

  if (nearFire) {
    p.temp = clamp(p.temp + BAL.tempFireHeal * D.fireWarmMul * dt);
  } else {
    if (inShelter) drain *= s.shelter.stage >= 2 ? 0.05 : s.shelter.stage >= 1 ? 0.12 : 0.45;
    if (s.equip.armor) drain *= ARMOR[s.equip.armor]?.cold ?? 1;
    if (s.equip.gear === "heatcore") drain *= 0.72;
    if (p.sprint && p.moving) drain *= 0.72;
    drain *= progColdMul(s);                      // Cold Adaptation upgrade
    drain *= D.coldMul;                           // difficulty
    p.temp = clamp(p.temp - drain * dt);
  }

  if (pm > BAL.tempWarn && p.temp <= BAL.tempWarn) ev.frozeWarn = true;
  if (ph > 25 && p.hunger <= 25) ev.starveWarn = true;
  if (pt > 25 && p.thirst <= 25) ev.thirstWarn = true;

  if (p.temp <= 0) p.hp -= BAL.freezeDps * D.starveDpsMul * dt;
  if (p.hunger <= 0) p.hp -= BAL.starveDps * D.starveDpsMul * dt;
  if (p.thirst <= 0) p.hp -= BAL.thirstDps * D.starveDpsMul * dt;

  const hpCap = progMaxHp(s);
  if (p.hunger > 50 && p.thirst > 50 && p.temp > 50 && p.hp < hpCap) {
    p.hp = Math.min(hpCap, p.hp + BAL.hpRegen * D.regenMul * (inShelter || nearFire ? 2.2 : 1) * dt);
  }

  if (inForest && s.shelter.fire.lit) {
    s.shelter.fire.fuel -= BAL.fire.burnPerSec * dt;
    if (s.shelter.fire.fuel <= 0) {
      s.shelter.fire.fuel = 0;
      s.shelter.fire.lit = false;
      ev.fireDied = true;
    }
  }

  if (p.hp <= 0 && !p.dead) {
    p.hp = 0; p.dead = true; p.deathT = 0;
    ev.deathCause = p.temp <= 0 ? "Hypothermia claimed you in the white silence."
      : p.hunger <= 0 ? "Starvation — the cold demands calories."
      : p.thirst <= 0 ? "Dehydration — water is life, even here."
      : "The arctic took you.";
  }
  return ev;
}

// ── gathering ───────────────────────────────────────────────────────────────

export function canGather(s: GameState, n: WNode): { ok: boolean; reason?: string } {
  if (n.amount <= 0) return { ok: false, reason: "Depleted" };
  const info = NODE_INFO[n.kind];
  if (info.tool && info.toolTier && toolTier(s) < info.toolTier) {
    return { ok: false, reason: `Requires ${ITEMS[info.tool].name}` };
  }
  return { ok: true };
}

const rollN = (min: number, max: number) => min + Math.floor(Math.random() * (max - min + 1));

export function gatherStrike(s: GameState, n: WNode, fx: Fx) {
  const info = NODE_INFO[n.kind];
  const check = canGather(s, n);
  if (!check.ok) {
    fx.toast({ title: check.reason ?? "Cannot gather", kind: "warn", icon: "warn" });
    fx.sfx("error");
    return;
  }
  const bonus = toolTier(s) >= 2 && (n.kind === "tree" || n.kind === "stone") ? 1 : 0;
  const D = profileOf(s.difficulty);
  const skillBonus = Math.random() < progGatherBonusChance(s) ? 1 : 0;   // Harvester upgrade
  const modeBonus = D.yieldBonus > 0 && Math.random() < D.yieldBonus ? 1 : 0;
  const modePenalty = D.yieldBonus < 0 && Math.random() < -D.yieldBonus ? 1 : 0;
  const gained = Math.max(1, rollN(info.yieldMin, info.yieldMax) + bonus + skillBonus + modeBonus - modePenalty);
  const got = addItem(s, info.yieldItem, gained);
  n.amount -= 1;
  n.shake = 1;
  if (n.amount <= 0) n.respawnAt = s.time + info.respawn * D.respawnMul;

  const snd = n.kind === "tree" || n.kind === "branch" ? "gatherWood"
    : n.kind === "stone" ? "gatherStone"
    : n.kind === "ice" ? "gatherIce"
    : n.kind === "scrap" ? "gatherMetal"
    : n.kind === "crystal" ? "gatherCrystal" : "gatherLeaf";
  fx.sfx(snd);
  fx.burst(n.x, n.y - 14, n.kind, 10);

  if (got > 0) {
    s.stats.gathered += got;
    grantXp(s, got * XP.gatherPerUnit, fx);
    recordDailyEvent(s, { type: "gather", item: info.yieldItem, n: got }, fx);
    fx.float(n.x, n.y - 46, `+${got} ${ITEMS[info.yieldItem].name}`, ITEMS[info.yieldItem].color);
    fx.sfx("pickup");
    if (n.kind === "crystal") fx.sfx("rare");
  } else {
    fx.float(n.x, n.y - 46, usedSlots(s) >= capacity(s) ? "Pack full!" : "Stack full", "#ff9d8a");
  }
  fx.bump();
}

// ── gather speed scales with tool tier ──
export const gatherTime = (s: GameState, kind: string) => {
  const base = kind === "tree" || kind === "stone" || kind === "crystal" ? 0.7 : 0.5;
  const t = toolTier(s);
  return base * (t >= 3 ? 0.6 : t >= 2 ? 0.78 : 1) * progGatherSpeedMul(s);
};

// ── items ───────────────────────────────────────────────────────────────────

export function useItem(s: GameState, id: ItemId, fx: Fx): boolean {
  const def = ITEMS[id];
  if (!def.use) return false;
  if (countItem(s, id) <= 0) { fx.sfx("error"); return false; }
  const p = s.player;
  const u = def.use;
  // Never consume something that is currently equipped: that would leave a
  // phantom equipment reference pointing at an item the player no longer holds.
  if (def.equip && s.equip[def.equip] === id) {
    fx.toast({
      title: `${def.name} is equipped`,
      sub: "Unequip it before using it.",
      kind: "warn", icon: "warn",
    });
    fx.sfx("error");
    return false;
  }
  if (u.hp && u.hp < 0 && p.hp + u.hp <= 2) {
    fx.toast({ title: "Too weak for that", sub: "Eating this raw now could kill you.", kind: "warn", icon: "warn" });
    fx.sfx("error");
    return false;
  }
  removeItem(s, id, 1);
  const D = profileOf(s.difficulty);
  // Penalties (raw meat) are never softened; only genuine recovery scales.
  if (u.hp) p.hp = clamp(p.hp + (u.hp > 0 ? u.hp * D.healMul : u.hp), 1, progMaxHp(s));
  if (u.hunger) p.hunger = clamp(p.hunger + u.hunger * D.foodMul);
  if (u.thirst) p.thirst = clamp(p.thirst + u.thirst * D.foodMul);
  if (u.temp) p.temp = clamp(p.temp + (u.temp > 0 ? u.temp * D.foodMul : u.temp));
  if (u.stamina) p.stamina = clamp(p.stamina + u.stamina);
  fx.sfx(id === "salve" || id === "medkit" || id === "meltwater" ? "healed" : "eat");
  fx.float(p.x, p.y - 56, `${u.label}: ${def.name}`, def.color);
  fx.bump();
  return true;
}

export function equipItem(s: GameState, id: ItemId, fx: Fx) {
  const def = ITEMS[id];
  if (!def.equip || countItem(s, id) <= 0) { fx.sfx("error"); return; }
  const slot = def.equip;
  s.equip[slot] = s.equip[slot] === id ? null : id;
  fx.sfx("equip");
  fx.bump();
}

// ── crafting ────────────────────────────────────────────────────────────────

export function recipeStatus(s: GameState, r: Recipe): { ok: boolean; reason?: string } {
  if (r.reqFlag && !s.flags[r.reqFlag]) return { ok: false, reason: "Not yet discovered" };
  if (r.makes && ITEMS[r.makes].stack === 1
      && countItem(s, r.makes) + countItem(s, r.makes, "storage") > 0) {
    return { ok: false, reason: "Already crafted (pack or Supply Cache)" };
  }
  if (r.builds && s.build[r.builds]) return { ok: false, reason: "Already built" };

  const atHome = s.region === "forest";
  const dShelter = atHome ? dist(s.player.x, s.player.y, WORLD.shelter.x, WORLD.shelter.y) : 9999;
  if (r.nearOutpost && dShelter > 330) return { ok: false, reason: "Must be at the outpost" };
  if (r.atStation && (s.shelter.stage < 3 || dShelter > 360)) return { ok: false, reason: "Requires the outpost workbench" };
  if (r.atResearch && (!s.build.research || dShelter > 400)) return { ok: false, reason: "Requires the Research Station" };

  if (r.upgradeTo !== undefined) {
    if (s.shelter.stage >= r.upgradeTo) return { ok: false, reason: "Upgrade complete" };
    const requiredStage = r.upgradeTo - 1;
    if (s.shelter.stage !== requiredStage) return { ok: false, reason: `Requires Outpost Stage ${requiredStage}` };
    if (r.requiresCampfire && !s.shelter.fire.built) return { ok: false, reason: "Build the Campfire first" };
  }
  if (r.minStage !== undefined && s.shelter.stage < r.minStage) {
    return { ok: false, reason: `Requires Outpost Stage ${r.minStage}` };
  }
  if (r.id === "r_campfire" && s.shelter.fire.built) return { ok: false, reason: "Already built" };
  const missing = whyCannotPay(s, r.needs);
  if (missing) return { ok: false, reason: missing };
  // The result must have somewhere to go. Without this, a craft that succeeds
  // validation but overflows its stack would silently destroy the materials.
  if (r.makes && spaceFor(s, r.makes) < 1) {
    const inPack = countItem(s, r.makes);
    return {
      ok: false,
      reason: inPack > 0
        ? `${ITEMS[r.makes].name} stack is full (${inPack}/${ITEMS[r.makes].stack})`
        : "Pack full — free a slot",
    };
  }
  return { ok: true };
}

export function craftRecipe(s: GameState, id: string, fx: Fx): boolean {
  const r = RECIPES.find(r => r.id === id);
  if (!r) return false;
  const st = recipeStatus(s, r);
  if (!st.ok) {
    fx.toast({ title: st.reason ?? "Cannot craft", kind: "warn", icon: "warn" });
    fx.sfx("error");
    return false;
  }
  // Atomic: validated above, paid here, and the result is guaranteed a slot.
  if (!pay(s, r.needs)) {
    fx.toast({ title: "Missing materials", kind: "warn", icon: "warn" });
    fx.sfx("error");
    return false;
  }
  if (r.makes) {
    const got = grant(s, r.makes, 1);
    if (got.packed + got.stored + got.dropped === 0) {
      // Should be unreachable thanks to the spaceFor check; never lose materials.
      for (const [rid, rn] of Object.entries(r.needs) as [ItemId, number][]) {
        addItem(s, rid, rn);
      }
      fx.toast({ title: "No room for the result", kind: "warn", icon: "warn" });
      fx.sfx("error");
      return false;
    }
    if (!s.crafted.includes(r.makes)) s.crafted.push(r.makes);
    const slot = ITEMS[r.makes].equip;
    // auto-equip upgrades
    if (slot) {
      const cur = s.equip[slot];
      const curTier = cur ? ITEMS[cur].tier ?? 0 : 0;
      if ((ITEMS[r.makes].tier ?? 0) >= curTier) s.equip[slot] = r.makes;
    }
  }
  if (r.builds) s.build[r.builds] = true;
  if (r.id === "r_campfire") { s.shelter.fire.built = true; s.shelter.fire.fuel = 15; }
  if (r.upgradeTo !== undefined) {
    s.shelter.stage = r.upgradeTo;
    if (r.upgradeTo >= 3) s.flags.forestComplete = true;
  }

  s.stats.crafted++;
  grantXp(s, r.cat === "outpost" ? XP.buildUpgrade : r.tier === "late" ? XP.craftLate : XP.craftGear, fx, "craft");
  recordDailyEvent(s, { type: "craft", item: r.makes, n: 1 }, fx);
  fx.sfx(r.cat === "outpost" ? "build" : r.tier === "late" ? "craftRare" : "craft");
  fx.toast({ title: `${r.name} — complete`, sub: r.desc, kind: "good", icon: r.icon });
  const anchor = r.cat === "outpost" ? WORLD.shelter : { x: s.player.x, y: s.player.y };
  fx.burst(anchor.x, anchor.y + 60, "craft", r.tier === "late" ? 26 : 16);
  fx.bump();
  return true;
}

// ── Map 1 / outpost progression ─────────────────────────────────────────────

export interface OutpostMilestone {
  id: string;
  title: string;
  desc: string;
  icon: string;
  done: boolean;
  recipeId: string;
  benefit: string;
}

/** Single source of truth for the Forest restoration route. */
export function outpostMilestones(s: GameState): OutpostMilestone[] {
  return [
    {
      id: "repair", title: "Stage 1 — Repair the Hull", icon: "shelter",
      desc: "8 Wood + 6 Stone", recipeId: "r_shelter1", done: s.shelter.stage >= 1,
      benefit: "Seals the breach, creates a predator-safe shelter zone, and greatly reduces cold exposure nearby.",
    },
    {
      id: "fire", title: "Build the Campfire", icon: "fire",
      desc: "5 Wood + 3 Stone", recipeId: "r_campfire", done: s.shelter.fire.built,
      benefit: "Provides warmth, cooking and meltwater; its light keeps ordinary predators out of camp.",
    },
    {
      id: "warm", title: "Stage 2 — Warm Quarters", icon: "temp",
      desc: "6 Wood + 4 Stone + 2 Ice", recipeId: "r_outpost2", done: s.shelter.stage >= 2,
      benefit: "Adds ice-block insulation and reduces cold loss in the shelter to 5% of outside exposure.",
    },
    {
      id: "workbench", title: "Stage 3 — Operational Outpost", icon: "research",
      desc: "12 Wood + 8 Stone + 4 Ice", recipeId: "r_outpost3", done: s.shelter.stage >= 3,
      benefit: "Activates Storage and the Workbench; completing Map 1 makes the Shipwreck route available at the gate.",
    },
  ];
}

export function nextOutpostMilestone(s: GameState) {
  return outpostMilestones(s).find(m => !m.done) ?? null;
}

export function forestCompletion(s: GameState) {
  const all = outpostMilestones(s);
  const complete = all.filter(m => m.done).length;
  return { complete, total: all.length, pct: complete / all.length, done: complete === all.length };
}

// ── campfire ────────────────────────────────────────────────────────────────

export function fireAction(s: GameState, kind: "add" | "light" | "cook" | "melt" | "stew", fx: Fx) {
  const fire = s.shelter.fire;
  switch (kind) {
    case "add": {
      if (!removeItem(s, "wood", 1)) { fx.toast({ title: "No wood", kind: "warn", icon: "wood" }); fx.sfx("error"); return; }
      fire.fuel = Math.min(BAL.fire.fuelMax, fire.fuel + BAL.fire.woodFuel);
      fx.sfx("fireAdd");
      fx.float(WORLD.firepit.x, WORLD.firepit.y - 40, "+Fuel", "#ffb063");
      break;
    }
    case "light": {
      if (fire.fuel <= 0) { fx.toast({ title: "Add wood first", kind: "warn", icon: "fire" }); fx.sfx("error"); return; }
      fire.lit = true;
      fx.sfx("fireLight");
      fx.burst(WORLD.firepit.x, WORLD.firepit.y - 10, "fire", 18);
      break;
    }
    case "cook": case "melt": case "stew": {
      const cost = kind === "stew" ? BAL.fire.stewCost : kind === "cook" ? BAL.fire.cookCost : BAL.fire.meltCost;
      const from: ItemId = kind === "melt" ? "ice" : "rawmeat";
      const to: ItemId = kind === "melt" ? "meltwater" : kind === "cook" ? "cookedmeat" : "stew";
      if (!fire.lit) { fx.toast({ title: "The fire is out", kind: "warn", icon: "fire" }); fx.sfx("error"); return; }
      if (fire.fuel < cost) { fx.toast({ title: "Fire too weak", sub: "Add more wood.", kind: "warn", icon: "fire" }); fx.sfx("error"); return; }
      if (kind === "stew") {
        if (!s.build.cookpot) { fx.toast({ title: "Needs a Cooking Pot", kind: "warn", icon: "stew" }); fx.sfx("error"); return; }
        if (countItem(s, "rawmeat") <= 0 || countItem(s, "berry") <= 0 || countItem(s, "ice") <= 0) {
          fx.toast({ title: "Stew needs meat, berries and ice", kind: "warn", icon: "stew" }); fx.sfx("error"); return;
        }
      } else if (countItem(s, from) <= 0) {
        fx.toast({ title: `No ${ITEMS[from].name.toLowerCase()}`, kind: "warn", icon: ITEMS[from].icon }); fx.sfx("error"); return;
      }
      if (addItem(s, to, 1) <= 0) { fx.toast({ title: `${ITEMS[to].name} stack full`, kind: "warn" }); fx.sfx("error"); return; }
      if (kind === "stew") { removeItem(s, "rawmeat", 1); removeItem(s, "berry", 1); removeItem(s, "ice", 1); }
      else removeItem(s, from, 1);
      fire.fuel -= cost;
      fx.sfx("cook");
      fx.float(WORLD.firepit.x, WORLD.firepit.y - 40, `+1 ${ITEMS[to].name}`, ITEMS[to].color);
      recordDailyEvent(s, { type: "cook", item: to, n: 1 }, fx);
      break;
    }
  }
  fx.bump();
}

// ── quests ──────────────────────────────────────────────────────────────────

export interface QuestDef {
  id: string; title: string; hint: string;
  region?: RegionId;
  target?: (s: GameState) => { x: number; y: number } | null;
  cur: (s: GameState) => number; max: number;
  done: (s: GameState) => boolean;
  reward?: Partial<Record<ItemId, number>>;
  unlocks?: RegionId;
  chapter: ChapterId;
  /** Optional objective: never blocks the main story route. */
  side?: true;
  /** Side quests only appear once this is true (keeps the log uncluttered). */
  available?: (s: GameState) => boolean;
}

const foodCount = (s: GameState) =>
  countItem(s, "berry") + countItem(s, "rawmeat") + countItem(s, "cookedmeat") + countItem(s, "stew") + countItem(s, "glowcap");

export const QUESTS: QuestDef[] = [
  // ── chapter 1: survive (V1 arc, preserved) ──
  { id: "q_arrive", chapter: 1, title: "Reach the research outpost", hint: "Follow the trail north. Gather branches on the way.", region: "forest",
    target: () => ({ x: WORLD.shelter.x, y: WORLD.shelter.y + 60 }),
    cur: (s) => (s.region === "forest" && dist(s.player.x, s.player.y, WORLD.shelter.x, WORLD.shelter.y) < 175 ? 1 : 0), max: 1,
    done: (s) => s.region === "forest" && dist(s.player.x, s.player.y, WORLD.shelter.x, WORLD.shelter.y) < 175 },
  { id: "q_gather", chapter: 1, title: "Collect 4 Wood and 3 Stone", hint: "Branches and loose rocks can be gathered by hand.",
    cur: (s) => Math.min(countItem(s, "wood"), 4) + Math.min(countItem(s, "stone"), 3), max: 7,
    done: (s) => countItem(s, "wood") >= 4 && countItem(s, "stone") >= 3, reward: { berry: 2 } },
  { id: "q_repair", chapter: 1, title: "Repair the shelter", hint: "Interact with the outpost and repair the hull (8 wood, 6 stone).", region: "forest",
    target: () => WORLD.shelter, cur: (s) => s.shelter.stage, max: 1,
    done: (s) => s.shelter.stage >= 1, reward: { frostleaf: 2 } },
  { id: "q_fire", chapter: 1, title: "Build the campfire", hint: "Use the outpost menu at the marked fire site (5 wood, 3 stone).", region: "forest",
    target: () => WORLD.firepit, cur: (s) => (s.shelter.fire.built ? 1 : 0), max: 1,
    done: (s) => s.shelter.fire.built, reward: { meltwater: 1 } },
  { id: "q_warm", chapter: 1, title: "Light the fire and warm up", hint: "Add wood, light it, and stand close until your temperature passes 80%.", region: "forest",
    target: () => WORLD.firepit, cur: (s) => (s.shelter.fire.lit ? (s.player.temp >= 80 ? 2 : 1) : 0), max: 2,
    done: (s) => s.shelter.fire.lit && s.player.temp >= 80, reward: { wood: 2, berry: 1 } },
  { id: "q_tools", chapter: 1, title: "Craft an axe and a spear", hint: "Open crafting. The axe chops pines; the spear answers wolves.",
    cur: (s) => (s.crafted.includes("axe") ? 1 : 0) + (s.crafted.includes("spear") ? 1 : 0), max: 2,
    done: (s) => s.crafted.includes("axe") && s.crafted.includes("spear"), reward: { salve: 1 } },
  { id: "q_howl", chapter: 1, title: "Something stalks the camp", hint: "An ice wolf prowls nearby. Fight with the spear — dodge its lunge.",
    cur: (s) => (s.stats.kills >= 1 ? 1 : 0), max: 1,
    done: (s) => s.stats.kills >= 1, reward: { salve: 1 } },
  { id: "q_stage3", chapter: 2, title: "Restore the outpost", hint: "Upgrade the shelter to Stage 3: storage and a workbench.", region: "forest",
    target: () => WORLD.shelter, cur: (s) => s.shelter.stage, max: 3,
    done: (s) => s.shelter.stage >= 3, reward: { cookedmeat: 2 } },

  // ── chapter 2: explore ──
  { id: "q_gate", chapter: 2, title: "Open the expedition map", hint: "An expedition gate stands west of the outpost. Travel begins there.", region: "forest",
    target: () => WORLD.gate, cur: (s) => (s.flags.sawGate ? 1 : 0), max: 1,
    done: (s) => !!s.flags.sawGate, unlocks: "ship", reward: { cookedmeat: 1 } },
  { id: "q_stock", chapter: 2, title: "Pack for an expedition", hint: "Carry 3 food, 2 water or ice and 1 medical item before you travel.",
    cur: (s) => Math.min(foodCount(s), 3) + Math.min(countItem(s, "meltwater") + countItem(s, "ice"), 2) + Math.min(countItem(s, "salve") + countItem(s, "medkit"), 1), max: 6,
    done: (s) => foodCount(s) >= 3 && countItem(s, "meltwater") + countItem(s, "ice") >= 2 && countItem(s, "salve") + countItem(s, "medkit") >= 1,
    reward: { cookedmeat: 1 } },
  { id: "q_ship", chapter: 2, title: "Salvage the Frozen Shipwreck", hint: "Travel to the shipwreck and bring back 6 Scrap Metal.",
    region: "ship", cur: (s) => Math.min(countItem(s, "scrap") + countItem(s, "crowbar") * 3, 6), max: 6,
    done: (s) => countItem(s, "scrap") >= 6 || !!s.flags.shipCargo, reward: { scrap: 2 } },
  { id: "q_cargo", chapter: 2, title: "Break open the cargo hold", hint: "Craft a Crowbar (3 scrap, 1 wood) and pry the hold open aboard the ship.",
    region: "ship", target: () => ({ x: 430, y: 10 }),
    cur: (s) => (s.flags.shipCargo ? 1 : 0), max: 1,
    done: (s) => !!s.flags.shipCargo, reward: { medkit: 1 } },
  { id: "q_lantern", chapter: 3, title: "Light for the deep", hint: "Craft a Storm Lantern — the Crystal Cave is pitch black without it.",
    cur: (s) => (s.crafted.includes("lantern") ? 1 : 0), max: 1,
    done: (s) => s.crafted.includes("lantern"), unlocks: "cave", reward: { glowcap: 1 } },
  { id: "q_cave", chapter: 3, title: "Attune the Crystal Cave", hint: "Strike all three resonant crystals to open the sealed vault.",
    region: "cave", cur: (s) => (s.regions.cave?.devices.filter(d => d.on).length ?? 0), max: 3,
    done: (s) => !!s.flags.caveVault, reward: { crystal: 2 }, unlocks: "station" },
  { id: "q_research", chapter: 3, title: "Build the Research Station", hint: "Back at the outpost: 8 scrap, 2 crystals, 6 wood. Unlocks late-tier crafting.",
    region: "forest", target: () => WORLD.sites.research,
    cur: (s) => (s.build.research ? 1 : 0), max: 1,
    done: (s) => !!s.build.research, reward: { medkit: 1 } },

  // ── chapter 3: uncover ──
  { id: "q_station", chapter: 4, title: "Restore power at KVESTA-9", hint: "Throw both breakers, then use the grid terminal to unseal the lab.",
    region: "station", cur: (s) => (s.regions.station?.devices.filter(d => d.on && d.group === "power").length ?? 0), max: 3,
    done: (s) => !!s.flags.labOpen, reward: { scrap: 3 } },
  { id: "q_lab", chapter: 4, title: "Recover the director's log", hint: "The sealed laboratory holds the truth — and a Frost Sigil.",
    region: "station", cur: (s) => (s.logs.includes("log_lab") ? 1 : 0), max: 1,
    done: (s) => s.logs.includes("log_lab"), reward: { crystal: 2 }, unlocks: "fortress" },
  { id: "q_suit", chapter: 5, title: "Equip for the fortress", hint: "Craft the Thermal Suit and a Crystal Blade at the Research Station.",
    cur: (s) => (s.crafted.includes("thermalsuit") ? 1 : 0) + (s.crafted.includes("crystalblade") ? 1 : 0), max: 2,
    done: (s) => s.crafted.includes("thermalsuit") && s.crafted.includes("crystalblade"), reward: { medkit: 2 } },
  { id: "q_sigils", chapter: 5, title: "Open the inner gate", hint: "Two Frost Sigils unseal the containment yard at the Frost Fortress.",
    region: "fortress", target: () => ({ x: 0, y: 60 }),
    cur: (s) => Math.min(countItem(s, "sigil"), 2), max: 2,
    done: (s) => !!s.flags.sigilGate, reward: { medkit: 1 } },
  { id: "q_boss", chapter: 5, title: "Destroy the Frost Guardian", hint: "Its armour is immune — strike the exposed core during its stagger.",
    region: "fortress", target: () => ({ x: 0, y: -440 }),
    cur: (s) => (s.stats.bosses >= 1 ? 1 : 0), max: 1,
    done: (s) => s.stats.bosses >= 1, reward: { crystal: 3 } },
  { id: "q_finale", chapter: 6, title: "Bring the Core home", hint: "Return to the outpost Research Station with the Guardian Core.",
    region: "forest", target: () => WORLD.sites.research,
    cur: (s) => (s.flags.finale ? 1 : 0), max: 1,
    done: (s) => !!s.flags.finale, reward: { medkit: 1 } },
  { id: "q_broadcast", chapter: 6, title: "Send the last transmission", hint: "Use the Research Station again to broadcast the warning off the ice.",
    region: "forest", target: () => WORLD.sites.research,
    cur: (s) => (s.flags.broadcast ? 1 : 0), max: 1,
    done: (s) => !!s.flags.broadcast },

  // ══════════════ OPTIONAL SIDE QUESTS ══════════════
  // Every one reads real gameplay state and is rewarded exactly once by the
  // same completion path as the main story.
  { id: "s_survey_forest", chapter: 2, side: true,
    title: "Survey the Frozen Forest", hint: "Record all 5 points of interest in the home region.",
    available: (s) => !!s.flags.sawGate,
    cur: (s) => s.regions.forest?.discoveries.filter(d => d.found).length ?? 0, max: 5,
    done: (s) => (s.regions.forest?.discoveries.filter(d => d.found).length ?? 0) >= 5,
    reward: { salve: 2, cookedmeat: 1 } },

  { id: "s_salvager", chapter: 2, side: true,
    title: "Salvager", hint: "Open 6 containers anywhere in the region chain.",
    available: (s) => s.unlocked.length > 1,
    cur: (s) => s.stats.containers, max: 6,
    done: (s) => s.stats.containers >= 6,
    reward: { scrap: 4 } },

  { id: "s_hunter", chapter: 3, side: true,
    title: "Thin the Packs", hint: "Defeat 12 hostile creatures. Arctic hares do not count.",
    available: (s) => s.stats.kills >= 3,
    cur: (s) => s.stats.kills, max: 12,
    done: (s) => s.stats.kills >= 12,
    reward: { medkit: 1, pelt: 2 } },

  { id: "s_archivist", chapter: 4, side: true,
    title: "The Archivist", hint: "Recover all 6 research logs scattered across the regions.",
    available: (s) => s.logs.length >= 2,
    cur: (s) => s.logs.length, max: 6,
    done: (s) => s.logs.length >= 6,
    reward: { crystal: 2, medkit: 1 } },

  { id: "s_outfitter", chapter: 5, side: true,
    title: "Fully Outfitted", hint: "Hold the Crystal Pick, the Crystal Blade and the Thermal Suit at once.",
    available: (s) => !!s.build.research,
    cur: (s) => (countItem(s, "crystalpick") > 0 ? 1 : 0) + (countItem(s, "crystalblade") > 0 ? 1 : 0) + (countItem(s, "thermalsuit") > 0 ? 1 : 0), max: 3,
    done: (s) => countItem(s, "crystalpick") > 0 && countItem(s, "crystalblade") > 0 && countItem(s, "thermalsuit") > 0,
    reward: { crystal: 3 } },

  { id: "s_cartographer", chapter: 6, side: true,
    title: "Cartographer", hint: "Record every point of interest in all five regions.",
    available: (s) => s.stats.discoveries >= 6,
    cur: (s) => s.stats.discoveries, max: 16,
    done: (s) => s.stats.discoveries >= 16,
    reward: { medkit: 2, crystal: 3 } },

  { id: "s_homestead", chapter: 6, side: true,
    title: "Homestead", hint: "Build every optional outpost facility: pot, lamps, spikes, research station and banner.",
    available: (s) => s.shelter.stage >= 3,
    cur: (s) => ["cookpot", "lamp", "spikes", "research", "banner"].filter(k => s.build[k]).length, max: 5,
    done: (s) => ["cookpot", "lamp", "spikes", "research", "banner"].every(k => !!s.build[k]),
    reward: { stew: 2 } },
];

/** The active MAIN story objective. Side quests never block this. */
export const currentQuest = (s: GameState) =>
  QUESTS.find(q => !q.side && !s.questsDone.includes(q.id)) ?? null;

export const mainQuests = () => QUESTS.filter(q => !q.side);
export const sideQuests = () => QUESTS.filter(q => !!q.side);

/** Side quests the player has actually unlocked (available, or already done). */
export const activeSideQuests = (s: GameState) =>
  sideQuests().filter(q => s.questsDone.includes(q.id) || !q.available || q.available(s));

export const logEntry = (id: string) => LOGS[id];
