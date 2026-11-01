// ── ICEBOUND: content & balance configuration (V2) ──────────────────────────

import type { EnemyKind, EquipSlot, ItemId, NodeKind, RegionId, WeatherKind } from "./types";

export const SAVE_KEY = "icebound_save_v1";
// V5 adds the settlement record (residents, work posts, upkeep, offline stamp).
export const SAVE_VERSION = 5;

// Forest / home region geometry (V1 layout preserved)
export const WORLD = {
  minX: -1700, maxX: 1750, minY: -1350, maxY: 1350,
  riverY: -640, riverH: 220,
  spawn: { x: -40, y: 620 },
  shelter: { x: -60, y: -190 },
  firepit: { x: 200, y: -60 },
  storage: { x: -245, y: 40 },
  station: { x: 95, y: 100 },
  pod: { x: -190, y: 780 },
  wreck: { x: 1380, y: -1010 },
  gate: { x: -520, y: -60 },          // expedition gate at the outpost
  dens: [
    { x: -1010, y: -830 },
    { x: 1230, y: 480 },
    { x: -460, y: 1080 },
  ],
  questWolf: { x: 620, y: -260 },
  // base build sites (fixed, collision-safe slots)
  sites: {
    cookpot:  { x: 300, y: 70 },
    research: { x: -330, y: -200 },
    lamp:     { x: 60, y: -340 },
    spikes:   { x: 330, y: -230 },
    banner:   { x: -150, y: 120 },
    // Phase 6.2 settlement add-ons
    bunks:    { x: -430, y: -160 },
    beacon:   { x: 415, y: -155 },
  },
};

export const BAL = {
  dayLength: 480,
  nightStart: 0.55, nightEnd: 0.95,

  walk: 168, sprintMul: 1.62, playerR: 15, interactR: 96,

  hungerPerSec: 100 / 760,
  thirstPerSec: 100 / 580,
  tempDrainDay: 100 / 400,
  tempDrainNight: 100 / 230,
  tempFireHeal: 26,
  tempFireR: 250,
  tempShelterR: 175,
  tempWarn: 35,

  stamMax: 100, stamSprint: 13, stamRegen: 15, stamRegenIdle: 24,
  stamAttack: 13, stamDodge: 22,

  attack: {
    range: 104, arc: 2.1, cd: 0.46, t: 0.32, knock: 260,
    dmgHand: 10, dmgAxe: 16, dmgIronAxe: 24,
    dmgSpear: 30, dmgWarSpear: 44, dmgBlade: 62,
  },
  dodge: { t: 0.24, dist: 168, iframes: 0.42, cd: 1.5 },

  fire: { fuelMax: 120, woodFuel: 45, burnPerSec: 1, cookCost: 4, meltCost: 3, stewCost: 6 },

  hpRegen: 0.55,
  freezeDps: 3.2, starveDps: 1.6, thirstDps: 2.2,
  autosaveEvery: 20,

  baseCapacity: 16,     // distinct item slots
  packCapacity: 10,     // bonus from expedition pack

  weatherMin: 70, weatherMax: 150,
};

/** Explicit construction ordering; the graph is metadata, not hard-coded checks. */
export const OUTPOST_UPGRADE_ORDER = ["r_shelter1", "r_campfire", "r_outpost2", "r_outpost3"] as const;


// ── armor: cold multiplier + damage reduction ───────────────────────────────
export const ARMOR: Record<string, { cold: number; dr: number }> = {
  parka:      { cold: 0.48, dr: 0.08 },
  coat:       { cold: 0.33, dr: 0.18 },
  thermalsuit:{ cold: 0.18, dr: 0.30 },
};

export const TOOL_TIER: Record<string, number> = { axe: 1, ironaxe: 2, crystalpick: 3 };

export interface ItemDef {
  name: string; icon: string; color: string; stack: number;
  cat: "mat" | "food" | "med" | "gear" | "key";
  desc: string;
  use?: { hp?: number; hunger?: number; thirst?: number; temp?: number; stamina?: number; label: string };
  equip?: EquipSlot;
  tier?: number;
}

export const ITEMS: Record<ItemId, ItemDef> = {
  // ── materials ──
  wood:      { name: "Wood",        icon: "wood",    color: "#c98d5a", stack: 40, cat: "mat", desc: "Dry timber. Fuel, tools, repairs." },
  stone:     { name: "Stone",       icon: "stone",   color: "#9fb0c4", stack: 40, cat: "mat", desc: "Hard glacial rock for tools and building." },
  ice:       { name: "Clear Ice",   icon: "ice",     color: "#7fd8ff", stack: 30, cat: "mat", desc: "Melt at a fire for water. Eating it raw costs warmth.", use: { thirst: 10, temp: -7, label: "Eat" } },
  scrap:     { name: "Scrap Metal", icon: "scrap",   color: "#b9a88f", stack: 30, cat: "mat", desc: "Salvaged plating and bolts. The backbone of mid-tier gear." },
  crystal:   { name: "Ice Crystal", icon: "crystal", color: "#8be8ff", stack: 20, cat: "mat", desc: "Resonant cave crystal. Holds warmth and light unnaturally well." },
  chitin:    { name: "Crawler Chitin", icon: "chitin", color: "#9fd0c0", stack: 15, cat: "mat", desc: "Armoured shell plating. Light, rigid, very cold-resistant." },
  bearhide:  { name: "Bear Hide",   icon: "pelt",    color: "#d8c3a5", stack: 8,  cat: "mat", desc: "Thick frost-bear hide. The warmest material in the region." },
  pelt:      { name: "Wolf Pelt",   icon: "pelt",    color: "#b9c7de", stack: 10, cat: "mat", desc: "Insulating fur from an ice wolf." },

  // ── consumables ──
  berry:     { name: "Frostberry",  icon: "berry",   color: "#ff7d6b", stack: 15, cat: "food", desc: "Bitter-sweet arctic berries.", use: { hunger: 16, thirst: 7, label: "Eat" } },
  frostleaf: { name: "Frostleaf",   icon: "herb",    color: "#7fd6a4", stack: 12, cat: "med",  desc: "A medicinal herb that thrives in the snow." },
  rawmeat:   { name: "Raw Meat",    icon: "rawmeat", color: "#d66d6d", stack: 10, cat: "food", desc: "Risky raw — cook it at a campfire.", use: { hunger: 12, hp: -5, label: "Eat raw" } },
  cookedmeat:{ name: "Cooked Meat", icon: "meat",    color: "#ffb063", stack: 10, cat: "food", desc: "Hot, filling, restorative.", use: { hunger: 44, hp: 8, temp: 6, label: "Eat" } },
  meltwater: { name: "Meltwater",   icon: "water",   color: "#67c8f4", stack: 8,  cat: "food", desc: "Clean warm water from melted ice.", use: { thirst: 36, temp: 5, label: "Drink" } },
  stew:      { name: "Hot Stew",    icon: "stew",    color: "#ffca86", stack: 6,  cat: "food", desc: "Cooked in the pot. The best meal in the arctic.", use: { hunger: 58, thirst: 24, temp: 22, hp: 14, label: "Eat" } },
  glowcap:   { name: "Glowcap",     icon: "fungus",  color: "#9be2b5", stack: 12, cat: "food", desc: "Cave fungus. Mildly nourishing, oddly energising.", use: { hunger: 20, stamina: 30, label: "Eat" } },
  salve:     { name: "Herbal Salve",icon: "salve",   color: "#7fd6a4", stack: 6,  cat: "med",  desc: "Poultice of frostleaf. Restores health.", use: { hp: 38, label: "Apply" } },
  medkit:    { name: "Field Medkit",icon: "medkit",  color: "#ff9d9d", stack: 4,  cat: "med",  desc: "Station-grade trauma kit. Full recovery and warmth.", use: { hp: 85, temp: 12, label: "Use" } },

  // ── key items ──
  keycard:   { name: "Lab Keycard", icon: "keycard", color: "#a5e0ff", stack: 1, cat: "key", desc: "Opens the sealed laboratory at the research station." },
  sigil:     { name: "Frost Sigil", icon: "sigil",   color: "#b48cff", stack: 4, cat: "key", desc: "Carved rune-stone. Two will open the fortress inner gate." },
  core:      { name: "Guardian Core", icon: "core",  color: "#ffd2a0", stack: 1, cat: "key", desc: "Still humming with the energy that killed this station." },

  // ── gear ──
  axe:        { name: "Stone Axe",      icon: "axe",    color: "#ffb063", stack: 1, cat: "gear", desc: "Chops pines and boulders. A passable weapon.", equip: "tool", tier: 1 },
  ironaxe:    { name: "Salvaged Axe",   icon: "axe",    color: "#d9e6f2", stack: 1, cat: "gear", desc: "Scrap-forged head. Faster gathering, +1 yield on wood and stone.", equip: "tool", tier: 2 },
  crystalpick:{ name: "Crystal Pick",   icon: "pick",   color: "#8be8ff", stack: 1, cat: "gear", desc: "Required to harvest ice crystals. Fastest gathering of all.", equip: "tool", tier: 3 },
  spear:      { name: "Hunting Spear",  icon: "spear",  color: "#ffb063", stack: 1, cat: "gear", desc: "Reach and power. The wolf's reply.", equip: "weapon", tier: 1 },
  warspear:   { name: "Reinforced Spear", icon: "spear", color: "#d9e6f2", stack: 1, cat: "gear", desc: "Scrap-banded shaft, heavier head. Strong against bears.", equip: "weapon", tier: 2 },
  crystalblade:{ name: "Crystal Blade", icon: "blade",  color: "#8be8ff", stack: 1, cat: "gear", desc: "Resonant edge. The only weapon that truly bites a Guardian.", equip: "weapon", tier: 3 },
  parka:      { name: "Fur-lined Parka", icon: "parka", color: "#a5e0ff", stack: 1, cat: "gear", desc: "Wolf-fur lining. Halves cold exposure, light protection.", equip: "armor", tier: 1 },
  coat:       { name: "Insulated Coat", icon: "coat",   color: "#ffd2a0", stack: 1, cat: "gear", desc: "Bear hide over chitin plate. Strong cold and impact protection.", equip: "armor", tier: 2 },
  thermalsuit:{ name: "Thermal Suit",   icon: "suit",   color: "#8be8ff", stack: 1, cat: "gear", desc: "Crystal-woven expedition suit. Required to survive the fortress.", equip: "armor", tier: 3 },
  lantern:    { name: "Storm Lantern",  icon: "lantern",color: "#ffca86", stack: 1, cat: "gear", desc: "Lights the dark. Required to explore the Crystal Cave.", equip: "gear", tier: 1 },
  heatcore:   { name: "Heat Core",      icon: "heatcore", color: "#ff9d6b", stack: 1, cat: "gear", desc: "Portable warmth. Slows cold loss everywhere you go.", equip: "gear", tier: 2 },
  crowbar:    { name: "Crowbar",        icon: "crowbar",color: "#b9a88f", stack: 1, cat: "gear", desc: "Pries open rusted cargo holds and jammed lockers." },
  pack:       { name: "Expedition Pack",icon: "backpack", color: "#7fd6a4", stack: 1, cat: "gear", desc: `Carry ${BAL.packCapacity} more item types. Pure exploration freedom.` },
};

// ── recipes ─────────────────────────────────────────────────────────────────

export interface Recipe {
  id: string; name: string; icon: string;
  cat: "gear" | "outpost" | "research";
  tier: "early" | "mid" | "late";
  needs: Partial<Record<ItemId, number>>;
  makes?: ItemId;
  builds?: string;        // base addon key
  desc: string;
  nearOutpost?: boolean;
  atStation?: boolean;    // needs stage-3 workbench
  atResearch?: boolean;   // needs research station
  reqFlag?: string;
  hideLocked?: boolean;
  /** Base progression metadata; keeps construction rules out of ID checks. */
  minStage?: number;
  upgradeTo?: number;
  requiresCampfire?: boolean;
}

export const RECIPES: Recipe[] = [
  // ── early ──
  { id: "r_axe",   name: "Stone Axe",     icon: "axe",   cat: "gear", tier: "early", needs: { wood: 3, stone: 2 }, makes: "axe",   desc: "Chop pines and boulders. Essential." },
  { id: "r_spear", name: "Hunting Spear", icon: "spear", cat: "gear", tier: "early", needs: { wood: 3, stone: 3 }, makes: "spear", desc: "A real weapon for what stalks the ice." },
  { id: "r_salve", name: "Herbal Salve",  icon: "salve", cat: "gear", tier: "early", needs: { frostleaf: 2 },      makes: "salve", desc: "Field medicine. Restores 38 health." },
  { id: "r_parka", name: "Fur-lined Parka", icon: "parka", cat: "gear", tier: "early", needs: { pelt: 3, frostleaf: 4 }, makes: "parka", desc: "Halves cold exposure.", atStation: true, reqFlag: "parka", hideLocked: true },

  // ── mid ──
  { id: "r_crowbar", name: "Crowbar",      icon: "crowbar", cat: "gear", tier: "mid", needs: { scrap: 3, wood: 1 }, makes: "crowbar", desc: "Opens rusted cargo holds aboard the shipwreck.", reqFlag: "r_ship" },
  { id: "r_lantern", name: "Storm Lantern", icon: "lantern", cat: "gear", tier: "mid", needs: { scrap: 2, wood: 2, pelt: 1 }, makes: "lantern", desc: "Required before entering the Crystal Cave.", reqFlag: "r_ship" },
  { id: "r_ironaxe", name: "Salvaged Axe",  icon: "axe",   cat: "gear", tier: "mid", needs: { scrap: 4, wood: 2 }, makes: "ironaxe", desc: "Faster gathering, +1 wood/stone per strike.", atStation: true, reqFlag: "r_ship" },
  { id: "r_warspear",name: "Reinforced Spear", icon: "spear", cat: "gear", tier: "mid", needs: { scrap: 4, wood: 3, chitin: 1 }, makes: "warspear", desc: "44 damage. Needed to fight frost bears safely.", atStation: true, reqFlag: "r_ship" },
  { id: "r_pack",    name: "Expedition Pack", icon: "backpack", cat: "gear", tier: "mid", needs: { pelt: 2, bearhide: 1, scrap: 2 }, makes: "pack", desc: `+${BAL.packCapacity} inventory slots.`, atStation: true },
  { id: "r_medkit",  name: "Field Medkit", icon: "medkit", cat: "gear", tier: "mid", needs: { frostleaf: 3, scrap: 1, glowcap: 1 }, makes: "medkit", desc: "Heals 85 health and warms you.", atStation: true },
  { id: "r_coat",    name: "Insulated Coat", icon: "coat", cat: "gear", tier: "mid", needs: { bearhide: 2, chitin: 2, pelt: 2 }, makes: "coat", desc: "Strong cold resistance, 18% damage reduction.", atStation: true, reqFlag: "r_cave" },

  // ── late (research station) ──
  { id: "r_pick",   name: "Crystal Pick",  icon: "pick",  cat: "research", tier: "late", needs: { crystal: 3, scrap: 3, wood: 2 }, makes: "crystalpick", desc: "Harvests ice crystals. Fastest tool tier.", atResearch: true, reqFlag: "r_cave" },
  { id: "r_blade",  name: "Crystal Blade", icon: "blade", cat: "research", tier: "late", needs: { crystal: 5, scrap: 4, chitin: 2 }, makes: "crystalblade", desc: "62 damage. The Guardian's only true counter.", atResearch: true, reqFlag: "r_station" },
  { id: "r_suit",   name: "Thermal Suit",  icon: "suit",  cat: "research", tier: "late", needs: { crystal: 4, chitin: 3, bearhide: 2 }, makes: "thermalsuit", desc: "Required to survive the Frost Fortress blizzard.", atResearch: true, reqFlag: "r_station" },
  { id: "r_heat",   name: "Heat Core",     icon: "heatcore", cat: "research", tier: "late", needs: { crystal: 3, scrap: 4 }, makes: "heatcore", desc: "Portable warmth source for long expeditions.", atResearch: true, reqFlag: "r_cave" },

  // ── outpost construction ──
  { id: "r_shelter1", name: "Repair Shelter", icon: "shelter", cat: "outpost", tier: "early", needs: { wood: 8, stone: 6 }, desc: "Seal the hull. Real protection from the wind.", nearOutpost: true, upgradeTo: 1 },
  { id: "r_campfire", name: "Build Campfire", icon: "fire",    cat: "outpost", tier: "early", needs: { wood: 5, stone: 3 }, desc: "A stone fire ring. Warmth, light, cooking.", nearOutpost: true, minStage: 1 },
  { id: "r_outpost2", name: "Warm Quarters",  icon: "shelter", cat: "outpost", tier: "early", needs: { wood: 6, stone: 4, ice: 2 }, desc: "Insulate the repaired hull with ice blocks. Unlocks a much warmer resting area.", nearOutpost: true, upgradeTo: 2, requiresCampfire: true },
  { id: "r_outpost3", name: "Storage & Workbench", icon: "crate", cat: "outpost", tier: "early", needs: { wood: 12, stone: 8, ice: 4 }, desc: "Make the outpost operational. Unlocks storage, the workbench, and the route beyond Map 1.", nearOutpost: true, upgradeTo: 3 },
  { id: "b_cookpot",  name: "Cooking Pot",   icon: "stew",    cat: "outpost", tier: "mid", needs: { scrap: 3, stone: 4 }, builds: "cookpot", desc: "Cook Hot Stew at the campfire — the best meal available.", nearOutpost: true, minStage: 3 },
  { id: "b_lamp",     name: "Lamp Posts",    icon: "lantern", cat: "outpost", tier: "mid", needs: { scrap: 2, wood: 4, crystal: 1 }, builds: "lamp", desc: "Lights the camp at night and keeps predators at distance.", nearOutpost: true, minStage: 3 },
  { id: "b_spikes",   name: "Spike Barricade", icon: "spikes", cat: "outpost", tier: "mid", needs: { wood: 10, stone: 4 }, builds: "spikes", desc: "Wounds enemies that approach the outpost.", nearOutpost: true, minStage: 1 },
  { id: "b_research", name: "Research Station", icon: "research", cat: "outpost", tier: "late", needs: { scrap: 8, crystal: 2, wood: 6 }, builds: "research", desc: "Unlocks late-tier crafting and log analysis.", nearOutpost: true, minStage: 3, reqFlag: "r_cave" },
  { id: "b_banner",   name: "Expedition Banner", icon: "banner", cat: "outpost", tier: "mid", needs: { pelt: 2, wood: 3 }, builds: "banner", desc: "Cosmetic. Proof that someone still lives here.", nearOutpost: true, minStage: 2 },
  // ── settlement (Phase 6.2) ──
  { id: "b_bunks",    name: "Bunkhouse",      icon: "bunks",  cat: "outpost", tier: "mid", needs: { wood: 14, stone: 6, ice: 4 }, builds: "bunks", desc: "Bunks, stoves and lockers for three more residents. Raises housing capacity by 3.", nearOutpost: true, minStage: 2 },
  { id: "b_beacon",   name: "Signal Beacon",  icon: "beacon", cat: "outpost", tier: "mid", needs: { scrap: 5, crystal: 2, wood: 4 }, builds: "beacon", desc: "A shortwave mast that reaches over the ridge. Broadcasts recruitment calls and hears answers.", nearOutpost: true, minStage: 3, reqFlag: "r_ship" },
];

// ── gatherable nodes ────────────────────────────────────────────────────────

export const NODE_INFO: Record<NodeKind, {
  name: string; verb: string; tool?: ItemId; toolTier?: number;
  yieldItem: ItemId; yieldMin: number; yieldMax: number; strikes: number; respawn: number;
}> = {
  branch:    { name: "Fallen Branch", verb: "Gather", yieldItem: "wood",      yieldMin: 2, yieldMax: 3, strikes: 1, respawn: 170 },
  tree:      { name: "Frost Pine",    verb: "Chop",   tool: "axe", toolTier: 1, yieldItem: "wood", yieldMin: 2, yieldMax: 3, strikes: 3, respawn: 300 },
  stone:     { name: "Rock Outcrop",  verb: "Pry",    yieldItem: "stone",     yieldMin: 2, yieldMax: 3, strikes: 3, respawn: 200 },
  ice:       { name: "Ice Shard",     verb: "Harvest",yieldItem: "ice",       yieldMin: 2, yieldMax: 3, strikes: 2, respawn: 180 },
  berry:     { name: "Frostberry Bush", verb: "Pick", yieldItem: "berry",     yieldMin: 2, yieldMax: 3, strikes: 2, respawn: 240 },
  herb:      { name: "Frostleaf",     verb: "Pick",   yieldItem: "frostleaf", yieldMin: 2, yieldMax: 2, strikes: 1, respawn: 250 },
  scrap:     { name: "Scrap Pile",    verb: "Salvage",yieldItem: "scrap",     yieldMin: 1, yieldMax: 2, strikes: 2, respawn: 280 },
  crystal:   { name: "Crystal Vein",  verb: "Mine",   tool: "crystalpick", toolTier: 3, yieldItem: "crystal", yieldMin: 1, yieldMax: 2, strikes: 2, respawn: 340 },
  fungus:    { name: "Glowcap Cluster", verb: "Pick", yieldItem: "glowcap",   yieldMin: 1, yieldMax: 2, strikes: 2, respawn: 260 },
  frostbloom:{ name: "Frostbloom",    verb: "Pick",   yieldItem: "frostleaf", yieldMin: 2, yieldMax: 3, strikes: 1, respawn: 300 },
};

// ── enemies ─────────────────────────────────────────────────────────────────

export const ENEMY: Record<EnemyKind, {
  name: string; hp: number; walk: number; chase: number; aggro: number;
  attackR: number; dmg: number; windup: number; cd: number; leash: number;
  respawn: number; regen: number; lungeSpd: number; lungeT: number; boss?: boolean;
}> = {
  hare:     { name: "Arctic Hare",  hp: 14,  walk: 120, chase: 230, aggro: 220, attackR: 0,  dmg: 0,  windup: 0,    cd: 0,    leash: 900,  respawn: 220, regen: 0,  lungeSpd: 0,   lungeT: 0 },
  wolf:     { name: "Ice Wolf",     hp: 62,  walk: 74,  chase: 208, aggro: 300, attackR: 66, dmg: 14, windup: 0.6,  cd: 1.35, leash: 780,  respawn: 260, regen: 9,  lungeSpd: 560, lungeT: 0.3 },
  crawler:  { name: "Ice Crawler",  hp: 74,  walk: 60,  chase: 232, aggro: 250, attackR: 60, dmg: 16, windup: 0.45, cd: 1.15, leash: 640,  respawn: 300, regen: 7,  lungeSpd: 640, lungeT: 0.26 },
  bear:     { name: "Frost Bear",   hp: 190, walk: 58,  chase: 152, aggro: 330, attackR: 92, dmg: 27, windup: 0.95, cd: 2.0,  leash: 820,  respawn: 420, regen: 12, lungeSpd: 330, lungeT: 0.42 },
  guardian: { name: "Frost Guardian", hp: 860, walk: 64, chase: 136, aggro: 620, attackR: 110, dmg: 32, windup: 1.0, cd: 1.9, leash: 2000, respawn: 0,  regen: 0,  lungeSpd: 520, lungeT: 0.5, boss: true },
};

export const LOOT: Record<EnemyKind, { item: ItemId; n: number; chance: number }[]> = {
  hare:     [{ item: "rawmeat", n: 1, chance: 1 }],
  wolf:     [{ item: "pelt", n: 1, chance: 1 }, { item: "pelt", n: 1, chance: 0.4 }, { item: "rawmeat", n: 1, chance: 0.8 }],
  crawler:  [{ item: "chitin", n: 1, chance: 1 }, { item: "crystal", n: 1, chance: 0.35 }, { item: "glowcap", n: 1, chance: 0.4 }],
  bear:     [{ item: "bearhide", n: 1, chance: 1 }, { item: "rawmeat", n: 2, chance: 1 }, { item: "bearhide", n: 1, chance: 0.5 }],
  guardian: [{ item: "core", n: 1, chance: 1 }, { item: "crystal", n: 4, chance: 1 }, { item: "sigil", n: 1, chance: 1 }],
};

// ── weather ─────────────────────────────────────────────────────────────────

export const WEATHER: Record<WeatherKind, { name: string; icon: string; tempMul: number; snow: number; desc: string }> = {
  clear:    { name: "Clear",    icon: "sun",   tempMul: 0.85, snow: 0.35, desc: "Still air. The cold is bearable." },
  snow:     { name: "Snowfall", icon: "snow",  tempMul: 1.0,  snow: 1.0,  desc: "Steady snow. Normal conditions." },
  blizzard: { name: "Blizzard", icon: "wind",  tempMul: 1.85, snow: 2.3,  desc: "Whiteout. Temperature drops fast — get to shelter." },
  aurora:   { name: "Aurora",   icon: "aurora",tempMul: 1.15, snow: 0.5,  desc: "The lights are back. Crystals resonate; creatures stir." },
};

// ── research logs (story) ───────────────────────────────────────────────────

export const LOGS: Record<string, { title: string; where: string; text: string }> = {
  log_pod: {
    title: "Personal Recorder — Day 1", where: "Escape Pod",
    text: "Pod's dead. Beacon's dead. I walked out of a crash that should have killed me. The station is three kilometres north. If anyone is alive, they're there.",
  },
  log_wreck: {
    title: "Flight Log — KV-407", where: "Crash Site",
    text: "…the aurora wasn't natural. Instruments spun to zero. It came down over the ridge and took the reactor with it. It took them all.",
  },
  log_ship: {
    title: "Captain's Final Entry", where: "Frozen Shipwreck",
    text: "Ice took the hull in a single night — no gradual freeze, no warning. The sea stopped moving. We offloaded the cargo onto the floe. Whatever the research team wanted it for, they never came to collect.",
  },
  log_cave: {
    title: "Geological Survey #12", where: "Crystal Cave",
    text: "The crystal lattice carries current with almost no loss. Sample 12 resonated for nine hours after we stopped the field. Hoffmann wants to scale it up to the reactor. I have recommended against it twice.",
  },
  log_lab: {
    title: "Director Hoffmann — Restricted", where: "Research Station Lab",
    text: "Scale test tonight. If the lattice holds, we power the whole arctic grid from a cave. If it doesn't… the containment yard will take it. The Guardian frame is rated for far worse than this.",
  },
  log_fortress: {
    title: "Containment Yard — Last Transmission", where: "Frost Fortress",
    text: "It didn't fail. It WOKE. The frame is walking and the lattice is feeding it. Freeze the yard, seal the gate, and tell whoever comes next: kill the core, not the armour.",
  },
};

// ── regions ─────────────────────────────────────────────────────────────────

export interface RegionDef {
  id: RegionId; name: string; subtitle: string; icon: string;
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
  entry: { x: number; y: number };
  tempMul: number;
  darkness: number;
  snowMul: number;
  ambient: string;
  unlockFlag?: string;
  reqItem?: ItemId;
  reqLabel?: string;
  advise: string[];
  desc: string;
  dangers: string;
  loot: string;
  danger: 0 | 1 | 2 | 3 | 4;
}

export const REGIONS: Record<RegionId, RegionDef> = {
  forest: {
    id: "forest", name: "Frozen Forest", subtitle: "Home — the research outpost", icon: "wood",
    bounds: { minX: WORLD.minX, maxX: WORLD.maxX, minY: WORLD.minY, maxY: WORLD.maxY },
    entry: { x: WORLD.gate.x + 60, y: WORLD.gate.y + 70 },
    tempMul: 1, darkness: 0, snowMul: 1, ambient: "rgba(120,160,200,0)",
    advise: [],
    desc: "Pine woods, a frozen river and the outpost you are rebuilding. Wolves hunt the treeline; hares graze the clearings.",
    dangers: "Ice Wolves", loot: "Wood · Stone · Ice · Berries · Frostleaf", danger: 1,
  },
  ship: {
    id: "ship", name: "Frozen Shipwreck", subtitle: "A freighter caught in the floe", icon: "ship",
    bounds: { minX: -1250, maxX: 1250, minY: -900, maxY: 900 },
    entry: { x: -1050, y: 640 },
    tempMul: 1.25, darkness: 0.12, snowMul: 1.2, ambient: "rgba(90,130,170,0.12)",
    advise: ["Food and water for the trip", "A weapon — wolves roam the floe", "Craft a Crowbar to open the cargo hold"],
    desc: "A freighter crushed into the sea ice, hull split, cargo scattered across the floe. The richest source of scrap metal in the region.",
    dangers: "Ice Wolves · thin ice · steam vents", loot: "Scrap Metal · Driftwood · Cargo crates", danger: 2,
  },
  cave: {
    id: "cave", name: "Crystal Cave", subtitle: "Beneath the glacier", icon: "crystal",
    bounds: { minX: -1100, maxX: 1100, minY: -820, maxY: 820 },
    entry: { x: -900, y: 560 },
    tempMul: 1.15, darkness: 0.82, snowMul: 0, ambient: "rgba(40,120,190,0.3)",
    reqItem: "lantern", reqLabel: "Storm Lantern",
    advise: ["Storm Lantern (required — it is pitch dark)", "Medical supplies: crawlers ambush", "Free inventory space for crystals"],
    desc: "Glowing blue passages under the glacier. Ice crawlers nest in the dark and crystal veins line the deepest chambers.",
    dangers: "Ice Crawlers · total darkness", loot: "Ice Crystals · Glowcaps · Chitin", danger: 3,
  },
  station: {
    id: "station", name: "Research Station", subtitle: "KVESTA-9 — abandoned", icon: "research",
    bounds: { minX: -1200, maxX: 1200, minY: -900, maxY: 900 },
    entry: { x: -980, y: 620 },
    tempMul: 1.3, darkness: 0.25, snowMul: 1.3, ambient: "rgba(70,110,160,0.18)",
    advise: ["Warm clothing — the yard is exposed", "A strong weapon: a frost bear denned here", "Restore power to reach the sealed lab"],
    desc: "The facility that started all of this. Collapsed labs, a dead grid, and a bear that moved into the mess hall.",
    dangers: "Frost Bear · shock hazards", loot: "Scrap · Medkits · Keycard · Research logs", danger: 3,
  },
  fortress: {
    id: "fortress", name: "Frost Fortress", subtitle: "The containment yard", icon: "fortress",
    bounds: { minX: -1100, maxX: 1100, minY: -950, maxY: 950 },
    entry: { x: 0, y: 780 },
    tempMul: 2.1, darkness: 0.3, snowMul: 2.0, ambient: "rgba(80,100,180,0.22)",
    reqItem: "thermalsuit", reqLabel: "Thermal Suit",
    advise: ["Thermal Suit (required — permanent blizzard)", "Crystal Blade or better", "Medkits — the Guardian hits hard", "Full stomach and full water"],
    desc: "Walls of black ice around the yard where they sealed it in. Two sigils open the inner gate. Something very large waits past it.",
    dangers: "Frost Guardian · Ice Crawlers · permanent blizzard", loot: "Guardian Core · Frost Sigils · Crystals", danger: 4,
  },
};

export const REGION_ORDER: RegionId[] = ["forest", "ship", "cave", "station", "fortress"];

export const phaseOf = (time: number) => (time % BAL.dayLength) / BAL.dayLength;
export const isNight = (time: number) => {
  const p = phaseOf(time);
  return p >= BAL.nightStart && p <= BAL.nightEnd;
};
