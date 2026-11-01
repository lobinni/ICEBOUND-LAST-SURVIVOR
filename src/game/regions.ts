// ── ICEBOUND V2: five distinct regions — layouts, props, ground painting ────

import { REGIONS, WORLD } from "./config";
import type {
  Container, Device, Enemy, Hazard, NodeKind, RegionId, RegionState, Struct, WNode,
} from "./types";
import { createEnemy } from "./state";
import { buildDiscoveries } from "./discoveries";
import { generateWorld, mulberry32, renderGround } from "./world";

let uid = 0;
const nid = (p: string) => `${p}_${uid++}`;

function node(kind: NodeKind, x: number, y: number, strikes: number, solid = 0, seed = 1): WNode {
  return { id: nid(kind), kind, x, y, amount: strikes, max: strikes, respawnAt: 0, solid, seed, shake: 0 };
}

// ════════════════════════════ FOREST (home) ════════════════════════════════

function buildForest(): RegionState {
  const { nodes, structs } = generateWorld();
  const rng = mulberry32(99);

  // expedition gate — the travel hub
  structs.push({ id: "gate_forest", kind: "gate", x: WORLD.gate.x, y: WORLD.gate.y, r: 70, solid: 26, seed: 7 });

  // base build-site anchors (ghost previews until built)
  for (const [key, p] of Object.entries(WORLD.sites)) {
    structs.push({ id: `site_${key}`, kind: key as Struct["kind"], x: p.x, y: p.y, r: 44, solid: 0, seed: 20 });
  }

  // landmark: the frozen falls on the north river bend — visible from camp
  structs.push({ id: "lm_forest", kind: "landmark", x: 620, y: -900, r: 150, solid: 74, seed: 0 });

  const enemies: Enemy[] = [
    createEnemy("wolf_0", "wolf", WORLD.dens[0].x, WORLD.dens[0].y - 70),
    createEnemy("wolf_1", "wolf", WORLD.dens[1].x, WORLD.dens[1].y - 70),
    createEnemy("wolf_2", "wolf", WORLD.dens[2].x, WORLD.dens[2].y - 70),
  ];
  // wildlife — a renewable food source
  for (let i = 0; i < 5; i++) {
    const a = rng() * Math.PI * 2, r = 420 + rng() * 820;
    enemies.push(createEnemy(`hare_${i}`, "hare", Math.cos(a) * r, Math.sin(a) * r * 0.8 + 180));
  }

  const containers: Container[] = [
    {
      id: "c_pod", kind: "cache", x: WORLD.pod.x + 70, y: WORLD.pod.y + 20, opened: false,
      loot: [{ item: "salve", n: 1 }, { item: "berry", n: 2 }], log: "log_pod",
    },
    {
      id: "c_wreck", kind: "crate", x: WORLD.wreck.x - 120, y: WORLD.wreck.y + 70, opened: false,
      loot: [{ item: "scrap", n: 3 }, { item: "medkit", n: 1 }], log: "log_wreck",
    },
  ];

  return { id: "forest", nodes, structs, enemies, containers, devices: [], hazards: [], discoveries: buildDiscoveries("forest"), discovered: true };
}

// ════════════════════════════ SHIPWRECK ════════════════════════════════════

function buildShip(): RegionState {
  const rng = mulberry32(2024);
  const nodes: WNode[] = [];
  const structs: Struct[] = [];
  const B = REGIONS.ship.bounds;

  structs.push({ id: "gate_ship", kind: "gate", x: -1100, y: 700, r: 70, solid: 26, seed: 7 });

  // the ship itself — a broken spine across the middle of the floe
  structs.push({ id: "hull_bow", kind: "shiphull", x: -240, y: -140, r: 240, solid: 150, seed: 1 });
  structs.push({ id: "hull_stern", kind: "shiphull", x: 420, y: 110, r: 210, solid: 130, seed: 2 });
  structs.push({ id: "mast_1", kind: "mast", x: -40, y: -280, r: 40, solid: 18, seed: 3 });
  structs.push({ id: "mast_2", kind: "mast", x: 300, y: -10, r: 40, solid: 18, seed: 4 });
  for (let i = 0; i < 7; i++) {
    structs.push({ id: nid("cstack"), kind: "crate_stack", x: -760 + i * 240 + rng() * 60, y: 330 + Math.sin(i) * 120, r: 40, solid: 26, seed: 10 + i });
  }

  // scrap fields radiating from the wreck
  for (let i = 0; i < 26; i++) {
    const a = rng() * Math.PI * 2, r = 260 + rng() * 760;
    const x = Math.cos(a) * r, y = Math.sin(a) * r * 0.72;
    if (Math.abs(x) > B.maxX - 120 || Math.abs(y) > B.maxY - 120) continue;
    nodes.push(node("scrap", x, y, 2, 0, Math.floor(rng() * 1e6)));
  }
  // driftwood & ice along the floe edges
  for (let i = 0; i < 16; i++) {
    nodes.push(node("branch", B.minX + 140 + rng() * (B.maxX - B.minX - 280), B.minY + 120 + rng() * (B.maxY - B.minY - 240), 1, 0, Math.floor(rng() * 1e6)));
  }
  for (let i = 0; i < 18; i++) {
    nodes.push(node("ice", B.minX + 160 + rng() * (B.maxX - B.minX - 320), B.minY + 140 + rng() * (B.maxY - B.minY - 280), 2, 0, Math.floor(rng() * 1e6)));
  }
  for (let i = 0; i < 6; i++) {
    nodes.push(node("stone", B.minX + 200 + rng() * (B.maxX - B.minX - 400), B.minY + 180 + rng() * (B.maxY - B.minY - 360), 3, 20, Math.floor(rng() * 1e6)));
  }

  // landmark: the listing channel beacon that failed to warn them
  structs.push({ id: "lm_ship", kind: "landmark", x: -820, y: -520, r: 120, solid: 46, seed: 1 });

  const enemies: Enemy[] = [
    createEnemy("ship_w0", "wolf", -620, -420),
    createEnemy("ship_w1", "wolf", 700, -330),
    createEnemy("ship_w2", "wolf", 160, 560),
  ];

  const containers: Container[] = [
    { id: "ship_c1", kind: "crate",  x: -700, y: 300, opened: false, loot: [{ item: "scrap", n: 3 }, { item: "wood", n: 2 }] },
    { id: "ship_c2", kind: "crate",  x: 560, y: 420, opened: false, loot: [{ item: "scrap", n: 2 }, { item: "rawmeat", n: 1 }] },
    { id: "ship_c3", kind: "locker", x: -180, y: -260, opened: false, needs: "crowbar", needsLabel: "Crowbar",
      loot: [{ item: "scrap", n: 4 }, { item: "salve", n: 1 }] },
    { id: "sv_ship", kind: "survivor", x: -430, y: -300, opened: false,
      loot: [], /* recruitment rescue — handled by residents.ts, never lootable */ },
    { id: "ship_hold", kind: "cargo", x: 430, y: 10, opened: false, needs: "crowbar", needsLabel: "Crowbar",
      loot: [{ item: "scrap", n: 8 }, { item: "medkit", n: 1 }, { item: "pelt", n: 2 }], log: "log_ship" },
  ];

  const hazards: Hazard[] = [
    { id: "ship_h1", kind: "thinice", x: -520, y: 60, r: 180 },
    { id: "ship_h2", kind: "thinice", x: 840, y: 480, r: 200 },
    { id: "ship_h3", kind: "steam", x: 120, y: 330, r: 110, period: 3.2, phase: 0 },
    { id: "ship_h4", kind: "steam", x: -300, y: -480, r: 110, period: 3.8, phase: 1.5 },
  ];

  return { id: "ship", nodes, structs, enemies, containers, devices: [], hazards, discoveries: buildDiscoveries("ship"), discovered: false };
}

// ════════════════════════════ CRYSTAL CAVE ═════════════════════════════════

function buildCave(): RegionState {
  const rng = mulberry32(7171);
  const nodes: WNode[] = [];
  const structs: Struct[] = [];

  structs.push({ id: "gate_cave", kind: "gate", x: -960, y: 680, r: 70, solid: 26, seed: 7 });

  // cavern walls shaped by stalagmite clusters — forms narrow passages
  const walls: [number, number][] = [
    [-640, 300], [-520, 180], [-420, 60], [-430, -90], [-520, -240],
    [-120, 420], [40, 430], [180, 360], [-150, -330], [10, -400], [190, -380],
    [420, 220], [520, 60], [470, -120], [700, -300], [760, 180], [240, 120],
    [-760, -120], [-800, 320], [620, 420], [840, -60], [-240, -140],
  ];
  for (const [x, y] of walls) {
    structs.push({ id: nid("stal"), kind: "stalagmite", x, y, r: 54, solid: 42, seed: Math.floor(rng() * 1000) });
  }
  // glowing pillars light the chambers
  for (const [x, y] of [[-300, 120], [280, -180], [640, 260], [-620, -360], [120, 560]] as [number, number][]) {
    structs.push({ id: nid("pillar"), kind: "crystalpillar", x, y, r: 60, solid: 34, seed: Math.floor(rng() * 1000) });
  }

  // crystal veins (need the Crystal Pick) in the deep chambers
  for (const [x, y] of [[-160, -520], [240, -560], [600, -420], [-540, -520], [880, 60], [-860, 60], [460, 540], [-420, 600]] as [number, number][]) {
    nodes.push(node("crystal", x, y, 2, 16, Math.floor(rng() * 1e6)));
  }
  // glowcaps & ice
  for (let i = 0; i < 18; i++) {
    const x = -980 + rng() * 1960, y = -720 + rng() * 1440;
    nodes.push(node(rng() > 0.45 ? "fungus" : "ice", x, y, 2, 0, Math.floor(rng() * 1e6)));
  }
  for (let i = 0; i < 8; i++) {
    nodes.push(node("stone", -900 + rng() * 1800, -680 + rng() * 1360, 3, 20, Math.floor(rng() * 1e6)));
  }

  // landmark: the crystal heart the survey team never dared cut
  structs.push({ id: "lm_cave", kind: "landmark", x: 0, y: -200, r: 140, solid: 72, seed: 2 });

  const enemies: Enemy[] = [
    createEnemy("cave_c0", "crawler", -400, -300),
    createEnemy("cave_c1", "crawler", 380, 120),
    createEnemy("cave_c2", "crawler", 760, -260),
    createEnemy("cave_c3", "crawler", -120, 480),
  ];

  // ── puzzle: three resonators must be struck to open the vault ──
  const devices: Device[] = [
    { id: "res_a", kind: "resonator", x: -700, y: -420, on: false, group: "cave", label: "Resonant Crystal α", hint: "strike to attune" },
    { id: "res_b", kind: "resonator", x: 520, y: -520, on: false, group: "cave", label: "Resonant Crystal β", hint: "strike to attune" },
    { id: "res_c", kind: "resonator", x: 700, y: 520, on: false, group: "cave", label: "Resonant Crystal γ", hint: "strike to attune" },
  ];

  const containers: Container[] = [
    { id: "cave_c1", kind: "cache", x: -820, y: -200, opened: false, loot: [{ item: "glowcap", n: 2 }, { item: "crystal", n: 1 }] },
    { id: "cave_c2", kind: "cache", x: 180, y: 300, opened: false, loot: [{ item: "chitin", n: 1 }, { item: "salve", n: 1 }] },
    { id: "sv_cave", kind: "survivor", x: 640, y: 60, opened: false, loot: [] },
    {
      id: "cave_vault", kind: "vault", x: 0, y: -660, opened: false,
      needs: "keycard", needsLabel: "all three resonators",
      loot: [{ item: "crystal", n: 4 }, { item: "medkit", n: 1 }, { item: "chitin", n: 2 }], log: "log_cave",
    },
  ];

  const hazards: Hazard[] = [
    { id: "cave_h1", kind: "spike", x: -300, y: -140, r: 120, period: 2.6, phase: 0 },
    { id: "cave_h2", kind: "spike", x: 420, y: 340, r: 130, period: 3.0, phase: 1.2 },
    { id: "cave_h3", kind: "cold", x: 820, y: -520, r: 240 },
  ];

  return { id: "cave", nodes, structs, enemies, containers, devices, hazards, discoveries: buildDiscoveries("cave"), discovered: false };
}

// ════════════════════════════ RESEARCH STATION ═════════════════════════════

function buildStation(): RegionState {
  const rng = mulberry32(5150);
  const nodes: WNode[] = [];
  const structs: Struct[] = [];

  structs.push({ id: "gate_station", kind: "gate", x: -1040, y: 740, r: 70, solid: 26, seed: 7 });

  // facility blocks laid out as a compound with streets between them
  const blocks: [number, number, number][] = [
    [-520, -320, 1], [-120, -360, 2], [320, -300, 3],
    [-480, 120, 4], [60, 60, 5], [520, 180, 6], [-60, 460, 7],
  ];
  for (const [x, y, s] of blocks) structs.push({ id: nid("lab"), kind: "labblock", x, y, r: 130, solid: 96, seed: s });
  structs.push({ id: "st_antenna", kind: "antenna", x: 760, y: -420, r: 60, solid: 24, seed: 2 });
  for (const [x, y] of [[-760, -80], [-240, 240], [280, 300], [700, -120]] as [number, number][]) {
    structs.push({ id: nid("pylon"), kind: "pylon", x, y, r: 40, solid: 18, seed: Math.floor(rng() * 999) });
  }

  for (let i = 0; i < 20; i++) {
    nodes.push(node("scrap", -1050 + rng() * 2100, -800 + rng() * 1600, 2, 0, Math.floor(rng() * 1e6)));
  }
  for (let i = 0; i < 9; i++) nodes.push(node("stone", -1000 + rng() * 2000, -760 + rng() * 1520, 3, 20, Math.floor(rng() * 1e6)));
  for (let i = 0; i < 10; i++) nodes.push(node("ice", -1000 + rng() * 2000, -760 + rng() * 1520, 2, 0, Math.floor(rng() * 1e6)));
  for (let i = 0; i < 7; i++) nodes.push(node("frostbloom", -980 + rng() * 1960, -740 + rng() * 1480, 1, 0, Math.floor(rng() * 1e6)));

  // landmark: the evacuation helicopter that never lifted off
  structs.push({ id: "lm_station", kind: "landmark", x: 700, y: 640, r: 150, solid: 70, seed: 3 });

  const enemies: Enemy[] = [
    createEnemy("st_bear", "bear", 180, -120),
    createEnemy("st_w0", "wolf", -700, 420),
    createEnemy("st_w1", "wolf", 740, 460),
  ];

  // ── puzzle: two breakers → terminal → sealed lab door ──
  const devices: Device[] = [
    { id: "brk_a", kind: "breaker", x: -780, y: -420, on: false, group: "power", label: "Breaker A", hint: "throw the switch" },
    { id: "brk_b", kind: "breaker", x: 640, y: 520, on: false, group: "power", label: "Breaker B", hint: "throw the switch" },
    { id: "term", kind: "terminal", x: -80, y: -160, on: false, group: "power", label: "Grid Terminal", hint: "needs both breakers" },
    { id: "labdoor", kind: "labdoor", x: -120, y: 60, on: false, label: "Sealed Laboratory", hint: "power the grid first" },
  ];

  const containers: Container[] = [
    { id: "st_c1", kind: "locker", x: -560, y: -180, opened: false, loot: [{ item: "scrap", n: 3 }, { item: "frostleaf", n: 2 }] },
    { id: "st_c2", kind: "locker", x: 420, y: 320, opened: false, loot: [{ item: "medkit", n: 1 }, { item: "scrap", n: 2 }] },
    { id: "st_c3", kind: "crate", x: -300, y: 560, opened: false, loot: [{ item: "scrap", n: 3 }, { item: "cookedmeat", n: 1 }, { item: "bearhide", n: 1 }] },
    {
      id: "sv_station", kind: "survivor", x: -215, y: 130, opened: false, loot: [],
    },
    {
      id: "st_lab", kind: "labcase", x: -120, y: -30, opened: false,
      needs: "keycard", needsLabel: "the sealed lab",
      loot: [{ item: "keycard", n: 1 }, { item: "crystal", n: 2 }, { item: "medkit", n: 2 }, { item: "sigil", n: 1 }],
      log: "log_lab",
    },
  ];

  const hazards: Hazard[] = [
    { id: "st_h1", kind: "shock", x: -300, y: -160, r: 130, period: 2.4, phase: 0 },
    { id: "st_h2", kind: "shock", x: 360, y: 20, r: 140, period: 2.8, phase: 1.1 },
    { id: "st_h3", kind: "cold", x: 760, y: 600, r: 260 },
  ];

  return { id: "station", nodes, structs, enemies, containers, devices, hazards, discoveries: buildDiscoveries("station"), discovered: false };
}

// ════════════════════════════ FROST FORTRESS ═══════════════════════════════

function buildFortress(): RegionState {
  const rng = mulberry32(31337);
  const nodes: WNode[] = [];
  const structs: Struct[] = [];

  structs.push({ id: "gate_fortress", kind: "gate", x: 0, y: 860, r: 70, solid: 26, seed: 7 });

  // outer curtain walls funnel the player toward the inner gate
  const wall = (x: number, y: number, solid = 72) =>
    structs.push({ id: nid("ruin"), kind: "ruin", x, y, r: 90, solid, seed: Math.floor(rng() * 999) });
  // flanking walls
  wall(-620, 240); wall(-640, 400); wall(620, 240); wall(640, 400);
  for (let i = -2; i <= 2; i++) if (Math.abs(i) > 0) wall(i * 200, -620);
  // ── the inner curtain: an unbroken barrier at y≈60 pierced only by the gate ──
  for (let x = -1040; x <= -200; x += 140) wall(x, 60, 86);
  for (let x = 200; x <= 1040; x += 140) wall(x, 60, 86);

  // obelisks mark the sigil gate
  structs.push({ id: "ob_l", kind: "obelisk", x: -120, y: 60, r: 50, solid: 30, seed: 1 });
  structs.push({ id: "ob_r", kind: "obelisk", x: 120, y: 60, r: 50, solid: 30, seed: 2 });
  // the throne in the inner yard — boss arena
  structs.push({ id: "throne", kind: "throne", x: 0, y: -420, r: 150, solid: 70, seed: 3 });

  for (let i = 0; i < 10; i++) nodes.push(node("crystal", -900 + rng() * 1800, 60 + rng() * 740, 2, 16, Math.floor(rng() * 1e6)));
  for (let i = 0; i < 12; i++) nodes.push(node("ice", -950 + rng() * 1900, -200 + rng() * 1000, 2, 0, Math.floor(rng() * 1e6)));
  for (let i = 0; i < 8; i++) nodes.push(node("scrap", -900 + rng() * 1800, 100 + rng() * 700, 2, 0, Math.floor(rng() * 1e6)));
  for (let i = 0; i < 6; i++) nodes.push(node("stone", -900 + rng() * 1800, 200 + rng() * 600, 3, 20, Math.floor(rng() * 1e6)));

  const enemies: Enemy[] = [
    createEnemy("ft_c0", "crawler", -420, 300),
    createEnemy("ft_c1", "crawler", 430, 280),
    createEnemy("ft_c2", "crawler", -260, -160),
    createEnemy("ft_bear", "bear", 520, 560),
    createEnemy("ft_boss", "guardian", 0, -480, true),
  ];

  const containers: Container[] = [
    { id: "ft_c1", kind: "cache", x: -760, y: 460, opened: false, loot: [{ item: "sigil", n: 1 }, { item: "crystal", n: 2 }] },
    { id: "ft_c2", kind: "cache", x: 780, y: 420, opened: false, loot: [{ item: "medkit", n: 1 }, { item: "crystal", n: 2 }] },
    { id: "ft_c3", kind: "vault", x: 0, y: -720, opened: false, loot: [{ item: "crystal", n: 5 }, { item: "medkit", n: 2 }], log: "log_fortress" },
    { id: "sv_fortress", kind: "survivor", x: -360, y: 520, opened: false, loot: [] },
  ];

  const devices: Device[] = [
    { id: "sigilgate", kind: "sigilgate", x: 0, y: 60, on: false, label: "Inner Gate", hint: "sealed with two sigils", needs: "sigil", needCount: 2 },
  ];

  const hazards: Hazard[] = [
    { id: "ft_h1", kind: "spike", x: -300, y: 230, r: 150, period: 2.2, phase: 0 },
    { id: "ft_h2", kind: "spike", x: 320, y: 230, r: 150, period: 2.2, phase: 1.1 },
    { id: "ft_h3", kind: "cold", x: 0, y: -300, r: 420 },
    { id: "ft_h4", kind: "cold", x: -700, y: -200, r: 300 },
  ];

  return { id: "fortress", nodes, structs, enemies, containers, devices, hazards, discoveries: buildDiscoveries("fortress"), discovered: false };
}

export function buildAllRegions(): Record<RegionId, RegionState> {
  uid = 0;
  return {
    forest: buildForest(),
    ship: buildShip(),
    cave: buildCave(),
    station: buildStation(),
    fortress: buildFortress(),
  };
}

// ════════════════════════════ GROUND PAINTING ══════════════════════════════

const GS = 0.42;

function makeCanvas(id: RegionId) {
  const B = REGIONS[id].bounds;
  const cv = document.createElement("canvas");
  cv.width = Math.ceil((B.maxX - B.minX) * GS);
  cv.height = Math.ceil((B.maxY - B.minY) * GS);
  return { cv, ctx: cv.getContext("2d")!, B, w: cv.width, h: cv.height };
}

function speckle(ctx: CanvasRenderingContext2D, w: number, h: number, rng: () => number, n: number, colors: string[]) {
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = colors[Math.floor(rng() * colors.length)];
    ctx.fillRect(rng() * w, rng() * h, 1.3, 1.3);
  }
}

function blobs(ctx: CanvasRenderingContext2D, w: number, h: number, rng: () => number, n: number, c1: string, c2: string, rMin: number, rMax: number) {
  for (let i = 0; i < n; i++) {
    const x = rng() * w, y = rng() * h, r = rMin + rng() * (rMax - rMin);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, rng() > 0.5 ? c1 : c2);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
  }
}

export function renderRegionGround(id: RegionId): HTMLCanvasElement {
  if (id === "forest") return renderGround();
  const { cv, ctx, B, w, h } = makeCanvas(id);
  const rng = mulberry32(id.length * 7717 + 13);
  const X = (x: number) => (x - B.minX) * GS;
  const Y = (y: number) => (y - B.minY) * GS;

  if (id === "ship") {
    // ── sea ice floe: pack ice plates with dark leads of open water ──
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "#9fc3dc"); g.addColorStop(0.5, "#b8d6ea"); g.addColorStop(1, "#8fb6d2");
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    // ice plates
    for (let i = 0; i < 90; i++) {
      const x = rng() * w, y = rng() * h, r = 28 + rng() * 90;
      ctx.beginPath();
      const pts = 6 + Math.floor(rng() * 4);
      for (let p = 0; p < pts; p++) {
        const a = (p / pts) * Math.PI * 2;
        const rr = r * (0.7 + rng() * 0.5);
        const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr * 0.7;
        p === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fillStyle = rng() > 0.5 ? "rgba(236,246,253,0.5)" : "rgba(160,196,224,0.35)";
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.35)"; ctx.lineWidth = 1.2; ctx.stroke();
    }
    // dark water leads
    ctx.strokeStyle = "rgba(16,48,78,0.55)";
    for (let i = 0; i < 9; i++) {
      let x = rng() * w, y = rng() * h;
      ctx.lineWidth = 5 + rng() * 14;
      ctx.beginPath(); ctx.moveTo(x, y);
      for (let s = 0; s < 5; s++) { x += (rng() - 0.5) * 240; y += (rng() - 0.5) * 160; ctx.lineTo(x, y); }
      ctx.stroke();
    }
    // oil / rust stains around the wreck
    blobs(ctx, w, h, rng, 26, "rgba(90,70,50,0.22)", "rgba(60,50,45,0.18)", 20, 70);
    const cx = X(0), cy = Y(0);
    const rg = ctx.createRadialGradient(cx, cy, 10, cx, cy, 380 * GS);
    rg.addColorStop(0, "rgba(70,60,52,0.3)"); rg.addColorStop(1, "rgba(70,60,52,0)");
    ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(cx, cy, 380 * GS, 0, 7); ctx.fill();
    speckle(ctx, w, h, rng, 340, ["rgba(255,255,255,0.5)", "rgba(180,215,238,0.4)"]);
  }

  if (id === "cave") {
    // ── subterranean ice: dark floor, glowing veins ──
    ctx.fillStyle = "#101d31"; ctx.fillRect(0, 0, w, h);
    blobs(ctx, w, h, rng, 70, "rgba(26,52,86,0.9)", "rgba(18,38,66,0.9)", 40, 150);
    // walkable ice floor patches
    for (let i = 0; i < 46; i++) {
      const x = rng() * w, y = rng() * h, r = 40 + rng() * 120;
      const g2 = ctx.createRadialGradient(x, y, 0, x, y, r);
      g2.addColorStop(0, "rgba(72,128,184,0.4)");
      g2.addColorStop(1, "rgba(72,128,184,0)");
      ctx.fillStyle = g2; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
    }
    // glowing crystal veins
    ctx.lineCap = "round";
    for (let i = 0; i < 40; i++) {
      let x = rng() * w, y = rng() * h;
      ctx.strokeStyle = rng() > 0.5 ? "rgba(103,200,244,0.42)" : "rgba(150,120,255,0.3)";
      ctx.lineWidth = 1 + rng() * 2.6;
      ctx.beginPath(); ctx.moveTo(x, y);
      for (let s = 0; s < 4; s++) { x += (rng() - 0.5) * 90; y += (rng() - 0.5) * 70; ctx.lineTo(x, y); }
      ctx.stroke();
    }
    speckle(ctx, w, h, rng, 420, ["rgba(139,232,255,0.55)", "rgba(165,140,255,0.4)"]);
  }

  if (id === "station") {
    // ── compound: snow over concrete, roads, painted markings ──
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "#aebdcc"); g.addColorStop(0.6, "#c3d2df"); g.addColorStop(1, "#b0bfcd");
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    // concrete pads under the blocks
    ctx.fillStyle = "rgba(96,108,122,0.5)";
    for (const [x, y, ww, hh] of [
      [-700, -480, 520, 340], [-260, -520, 420, 320], [160, -460, 420, 320],
      [-660, -40, 420, 340], [-120, -100, 420, 340], [340, 20, 420, 340], [-240, 300, 420, 320],
    ] as [number, number, number, number][]) {
      ctx.fillRect(X(x), Y(y), ww * GS, hh * GS);
    }
    // roads
    ctx.strokeStyle = "rgba(70,82,96,0.45)";
    ctx.lineWidth = 52 * GS; ctx.lineCap = "square";
    ctx.beginPath();
    ctx.moveTo(X(-1100), Y(-60)); ctx.lineTo(X(1100), Y(-60));
    ctx.moveTo(X(-80), Y(-850)); ctx.lineTo(X(-80), Y(850));
    ctx.stroke();
    // yellow hazard markings
    ctx.strokeStyle = "rgba(226,178,60,0.4)";
    ctx.lineWidth = 3;
    ctx.setLineDash([14, 14]);
    ctx.beginPath(); ctx.moveTo(X(-1100), Y(-60)); ctx.lineTo(X(1100), Y(-60)); ctx.stroke();
    ctx.setLineDash([]);
    // snow drifts reclaiming it
    blobs(ctx, w, h, rng, 120, "rgba(240,248,255,0.45)", "rgba(220,234,246,0.3)", 20, 90);
    // scorch marks from the incident
    blobs(ctx, w, h, rng, 14, "rgba(30,26,24,0.35)", "rgba(42,34,30,0.3)", 26, 90);
    speckle(ctx, w, h, rng, 300, ["rgba(255,255,255,0.45)", "rgba(150,170,190,0.4)"]);
  }

  if (id === "fortress") {
    // ── black ice yard with violet resonance bleeding through ──
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "#1b2340"); g.addColorStop(0.45, "#2b3a60"); g.addColorStop(1, "#44567f");
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    blobs(ctx, w, h, rng, 60, "rgba(126,118,210,0.18)", "rgba(60,90,170,0.2)", 50, 180);
    // shattered ice plates
    ctx.strokeStyle = "rgba(190,214,255,0.3)";
    for (let i = 0; i < 70; i++) {
      let x = rng() * w, y = rng() * h;
      ctx.lineWidth = 1 + rng() * 1.8;
      ctx.beginPath(); ctx.moveTo(x, y);
      for (let s = 0; s < 3; s++) { x += (rng() - 0.5) * 120; y += (rng() - 0.5) * 90; ctx.lineTo(x, y); }
      ctx.stroke();
    }
    // the arena circle
    const cx = X(0), cy = Y(-420);
    ctx.strokeStyle = "rgba(180,140,255,0.4)"; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.arc(cx, cy, 330 * GS, 0, 7); ctx.stroke();
    ctx.strokeStyle = "rgba(180,140,255,0.22)"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(cx, cy, 250 * GS, 0, 7); ctx.stroke();
    const rg = ctx.createRadialGradient(cx, cy, 10, cx, cy, 340 * GS);
    rg.addColorStop(0, "rgba(150,120,255,0.22)"); rg.addColorStop(1, "rgba(150,120,255,0)");
    ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(cx, cy, 340 * GS, 0, 7); ctx.fill();
    // approach path
    ctx.strokeStyle = "rgba(220,232,255,0.14)";
    ctx.lineWidth = 60 * GS;
    ctx.beginPath(); ctx.moveTo(X(0), Y(900)); ctx.lineTo(X(0), Y(-300)); ctx.stroke();
    speckle(ctx, w, h, rng, 380, ["rgba(200,220,255,0.5)", "rgba(170,140,255,0.4)"]);
  }

  // shared edge vignette
  const vg = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.62);
  vg.addColorStop(0, "rgba(0,0,0,0)");
  vg.addColorStop(1, id === "cave" ? "rgba(4,10,20,0.85)" : "rgba(18,32,52,0.55)");
  ctx.fillStyle = vg; ctx.fillRect(0, 0, w, h);
  return cv;
}
