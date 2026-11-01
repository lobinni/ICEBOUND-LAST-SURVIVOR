// ── ICEBOUND: shared types (V2 — multi-region expansion) ────────────────────

export type RegionId = "forest" | "ship" | "cave" | "station" | "fortress";

export type ItemId =
  // raw materials
  | "wood" | "stone" | "ice" | "scrap" | "crystal" | "chitin" | "bearhide" | "pelt"
  // consumables
  | "berry" | "frostleaf" | "rawmeat" | "cookedmeat" | "meltwater" | "salve"
  | "glowcap" | "stew" | "medkit"
  // key / story items
  | "keycard" | "sigil" | "core"
  // gear
  | "axe" | "spear" | "parka" | "crowbar" | "lantern"
  | "ironaxe" | "warspear" | "coat" | "pack"
  | "crystalpick" | "crystalblade" | "thermalsuit" | "heatcore";

export type NodeKind =
  | "branch" | "tree" | "stone" | "ice" | "berry" | "herb"
  | "scrap" | "crystal" | "fungus" | "frostbloom";

export type StructKind =
  // forest / base
  | "shelter" | "firepit" | "storage" | "station" | "pod" | "wreck" | "den" | "gate"
  | "cookpot" | "research" | "lamp" | "spikes" | "banner"
  // settlement (Phase 6.2) — build-site anchors like the other base add-ons
  | "bunks" | "beacon"
  // ship
  | "shiphull" | "mast" | "crate_stack"
  // cave
  | "crystalpillar" | "stalagmite"
  // station
  | "labblock" | "antenna" | "pylon"
  // fortress
  | "ruin" | "throne" | "obelisk"
  | "landmark";

export type DeviceKind = "resonator" | "breaker" | "terminal" | "labdoor" | "sigilgate";
// "survivor" is a stranded rescue pod — opening it recruits, never loots.
export type ContainerKind = "crate" | "locker" | "cargo" | "labcase" | "vault" | "cache" | "survivor";
export type HazardKind = "cold" | "steam" | "shock" | "thinice" | "spike";
export type EnemyKind = "wolf" | "hare" | "bear" | "crawler" | "guardian";
export type WeatherKind = "clear" | "snow" | "blizzard" | "aurora";

export type EquipSlot = "tool" | "weapon" | "armor" | "gear";
export type DiscoveryKind = "cache" | "equipment" | "beacon" | "shelter" | "landmark" | "notes" | "vein";
export type Screen = "loading" | "menu" | "intro" | "game" | "over";
export type Modal =
  | null | "inv" | "craft" | "quest" | "settings" | "help"
  | "outpost" | "fire" | "storage" | "pause" | "map" | "loot" | "journal" | "build"
  | "progress" | "prep" | "settlement" | "defense" | "command";

export interface Vec { x: number; y: number }

export interface WNode {
  id: string; kind: NodeKind; x: number; y: number;
  amount: number; max: number; respawnAt: number;
  solid: number; seed: number; shake: number;
}

export interface Struct {
  id: string; kind: StructKind; x: number; y: number;
  r: number; solid: number; seed: number;
  to?: RegionId; // for gates
}

export interface Container {
  id: string; kind: ContainerKind; x: number; y: number;
  opened: boolean; needs?: ItemId; needsLabel?: string;
  loot: { item: ItemId; n: number }[];
  log?: string;
}

export interface Device {
  id: string; kind: DeviceKind; x: number; y: number;
  on: boolean; group?: string; label: string; hint: string;
  needs?: ItemId; needCount?: number;
}

export interface Hazard {
  id: string; kind: HazardKind; x: number; y: number; r: number;
  period?: number; phase?: number;
}

export interface Discovery {
  id: string;
  region: RegionId;
  kind: DiscoveryKind;
  x: number; y: number;
  name: string;
  note: string;
  loot: { item: ItemId; n: number }[];
  found: boolean;
}

export interface Pickup {
  id: string; item: ItemId; n: number; x: number; y: number; t: number;
}

export interface Player {
  x: number; y: number; vx: number; vy: number;
  face: number;
  moving: boolean; sprint: boolean;
  hp: number; hunger: number; thirst: number; temp: number; stamina: number;
  atkT: number; atkCd: number; atkHit: boolean;
  gatherT: number; gatherLen: number; gatherTarget: string | null;
  dodgeT: number; dodgeCd: number; iframeT: number; hurtT: number;
  dead: boolean; deathT: number;
  walkPh: number; stepAcc: number; breathT: number;
  attackTool: "axe" | "spear" | "hands" | null;
  dodgeDir: number;
}

export type EnemyState =
  | "idle" | "patrol" | "chase" | "windup" | "lunge" | "recover" | "return" | "prowl"
  | "hidden" | "emerge" | "flee" | "slam" | "volley" | "charge" | "stagger" | "dead";

export interface Enemy {
  id: string; kind: EnemyKind;
  x: number; y: number; vx: number; vy: number; face: number;
  hp: number; max: number;
  state: EnemyState; stateT: number;
  home: Vec; wp: Vec[]; wpi: number;
  lungeDir: Vec; biteDone: boolean;
  dead: boolean; deadT: number; respawnAt: number;
  quest: boolean; hitT: number; walkPh: number; growlT: number;
  phase: number; atkIdx: number; shots: number; alerted: boolean;
}

export interface Projectile {
  id: number; x: number; y: number; vx: number; vy: number;
  life: number; dmg: number; r: number; kind: "shard" | "frost";
}

export interface ShelterState {
  stage: number;
  fire: { built: boolean; lit: boolean; fuel: number };
}

export interface Settings {
  /** Master gain applied on top of every other bus. */
  master: number;
  music: number;
  sfx: number;
  /** Wind, snowstorm and campfire beds — independent of one-shot SFX. */
  ambient: number;
  snow: number;
  shake: boolean;
  quality: import("./perf").QualityId;
  joyHand: "left" | "right";
  bigText: boolean;
  /** Stronger panel/text contrast for bright screens and low vision. */
  highContrast: boolean;
  tips: boolean;
}
export interface Stats { kills: number; gathered: number; crafted: number; distance: number; bosses: number; containers: number; discoveries: number }

export type DailyTaskKind =
  | "gather_any" | "gather_item" | "craft_any" | "cook_any"
  | "hunt_any" | "open_container" | "visit_region";

export interface DailyTask {
  id: string;
  kind: DailyTaskKind;
  target?: ItemId | RegionId;
  title: string;
  instruction: string;
  icon: string;
  goal: number;
  progress: number;
  reward: { item: ItemId; n: number };
  complete: boolean;
  rewarded: boolean;
}

export interface DailyState {
  /** In-game day number. Time only advances while actively playing. */
  day: number;
  tasks: DailyTask[];
  completedTotal: number;
}

export type InteractTag = "gather" | "tool" | "locked" | "quest" | "used" | "action" | "travel" | "danger";

export interface Interact {
  kind: "node" | "struct" | "container" | "device" | "resident";
  id: string; label: string;
  sub?: string; ok: boolean; x: number; y: number;
  tag: InteractTag;
  icon: string;
}

export interface ToastMsg {
  id: number; title: string; sub?: string; icon?: string;
  kind: "info" | "warn" | "error" | "quest" | "good" | "discovery";
}

export interface RegionState {
  id: RegionId;
  nodes: WNode[];
  structs: Struct[];
  enemies: Enemy[];
  containers: Container[];
  devices: Device[];
  hazards: Hazard[];
  discoveries: Discovery[];
  discovered: boolean;
}

export interface Weather {
  kind: WeatherKind;
  t: number;        // time left in this weather
  intensity: number; // 0..1 eased strength
  target: number;
}

export interface GameState {
  screen: Screen;
  paused: boolean;
  modal: Modal;
  time: number;

  region: RegionId;
  regions: Record<RegionId, RegionState>;
  unlocked: RegionId[];

  // live views onto the active region (reassigned on travel)
  nodes: WNode[];
  structs: Struct[];
  enemies: Enemy[];
  containers: Container[];
  devices: Device[];
  hazards: Hazard[];
  discoveries: Discovery[];

  player: Player;
  pickups: Pickup[];
  projectiles: Projectile[];
  weather: Weather;

  shelter: ShelterState;
  build: Record<string, boolean>;

  inv: Record<string, number>;
  storage: Record<string, number>;
  equip: { tool: ItemId | null; weapon: ItemId | null; armor: ItemId | null; gear: ItemId | null };
  crafted: string[];
  logs: string[];

  difficulty: import("./difficulty").DifficultyId;
  questsDone: string[];
  questActive: string | null;
  daily: DailyState;
  progression: import("./progression").ProgressionState;
  /** Phase 6.2: recruited residents, work posts, warriors, upkeep, production. */
  settlement: import("./residents").SettlementState;
  /** Phase 6.4: the siege calendar, live event bookkeeping and defence ledger. */
  siege: import("./siege").SiegeState;
  // Temporary manual navigation marker; never auto-gathers or moves the player.
  guide: { x: number; y: number; label: string; color: string; expiresAt: number } | null;
  stats: Stats;
  settings: Settings;
  flags: Record<string, boolean>;

  interact: Interact | null;
  lootOpen: string | null;
  cause: string;
  savedFlash: number;
}

export interface Fx {
  sfx(name: string): void;
  float(x: number, y: number, txt: string, color?: string): void;
  toast(t: Omit<ToastMsg, "id">): void;
  burst(x: number, y: number, kind: string, n?: number): void;
  shake(amt: number): void;
  bump(): void;
}
