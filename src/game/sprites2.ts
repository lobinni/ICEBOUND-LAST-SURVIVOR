// ── ICEBOUND V2: new procedural art — creatures, regions, containers ───────

import type {
  Container, Device, Enemy, GameState, Projectile, Struct, WNode,
} from "./types";
import { drawNode as drawNodeV1, drawStruct as drawStructV1, drawWolf, shadow } from "./sprites";

const TAU = Math.PI * 2;

function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function rrect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// ════════════════════════════ NODES ════════════════════════════════════════

export function drawNodeAny(ctx: CanvasRenderingContext2D, n: WNode, t: number) {
  if (n.kind === "scrap" || n.kind === "crystal" || n.kind === "fungus" || n.kind === "frostbloom") {
    ctx.save();
    ctx.translate(n.x, n.y);
    if (n.shake > 0) ctx.rotate(Math.sin(n.shake * 55) * 0.05 * n.shake);
    const rng = seeded(n.seed);
    const empty = n.amount <= 0;
    if (n.kind === "scrap") drawScrapPile(ctx, rng, empty);
    else if (n.kind === "crystal") drawCrystalVein(ctx, rng, empty, t);
    else if (n.kind === "fungus") drawGlowcaps(ctx, rng, empty, t);
    else drawFrostbloom(ctx, rng, empty, t);
    ctx.restore();
    return;
  }
  drawNodeV1(ctx, n, t);
}

function drawScrapPile(ctx: CanvasRenderingContext2D, rng: () => number, empty: boolean) {
  shadow(ctx, 0, 0, 24, 8, 0.22);
  const plate = (x: number, y: number, w: number, h: number, rot: number, c1: string, c2: string) => {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
    const g = ctx.createLinearGradient(-w / 2, -h, w / 2, h);
    g.addColorStop(0, c1); g.addColorStop(1, c2);
    ctx.fillStyle = g;
    rrect(ctx, -w / 2, -h, w, h, 2); ctx.fill();
    ctx.strokeStyle = "rgba(40,30,22,0.5)"; ctx.lineWidth = 1; ctx.stroke();
    ctx.restore();
  };
  if (empty) { plate(0, 0, 16, 5, 0.2, "#8a7a68", "#5e5245"); return; }
  plate(-9, 0, 26, 8, -0.22, "#c3b49c", "#7d6f5e");
  plate(10, -2, 22, 7, 0.3, "#a89883", "#6b5f50");
  plate(0, -8, 18, 6, -0.6, "#d6c8b0", "#8c7d69");
  // rust
  ctx.fillStyle = "rgba(150,80,40,0.35)";
  ctx.beginPath(); ctx.ellipse(-4, -4, 7, 3, 0.3, 0, TAU); ctx.fill();
  // bolts
  ctx.fillStyle = "#e8dcc8";
  for (let i = 0; i < 3; i++) ctx.fillRect(-12 + i * 10 + rng() * 3, -11 - rng() * 3, 2, 2);
}

function drawCrystalVein(ctx: CanvasRenderingContext2D, rng: () => number, empty: boolean, t: number) {
  const pulse = 0.55 + Math.sin(t * 1.7 + rng() * 6) * 0.25;
  shadow(ctx, 0, 0, 22, 8, 0.2);
  if (!empty) {
    const g = ctx.createRadialGradient(0, -22, 2, 0, -22, 70);
    g.addColorStop(0, `rgba(139,232,255,${0.38 * pulse})`);
    g.addColorStop(1, "rgba(139,232,255,0)");
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, -22, 70, 0, TAU); ctx.fill();
  }
  // rock base
  ctx.fillStyle = "#3b4a60";
  ctx.beginPath();
  ctx.moveTo(-24, 2); ctx.lineTo(-16, -14); ctx.lineTo(14, -16); ctx.lineTo(24, 2);
  ctx.closePath(); ctx.fill();
  if (empty) {
    ctx.fillStyle = "#2a3647";
    ctx.beginPath(); ctx.moveTo(-8, -14); ctx.lineTo(0, -22); ctx.lineTo(8, -14); ctx.closePath(); ctx.fill();
    return;
  }
  const shard = (x: number, h: number, w: number, tilt: number, a: number) => {
    const g = ctx.createLinearGradient(x - w, 0, x + w, -h);
    g.addColorStop(0, `rgba(60,150,220,${a})`);
    g.addColorStop(0.55, `rgba(139,232,255,${a})`);
    g.addColorStop(1, `rgba(236,252,255,${a})`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(x - w / 2, -10); ctx.lineTo(x + tilt, -h); ctx.lineTo(x + w / 2, -12);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = `rgba(255,255,255,${a * 0.75})`; ctx.lineWidth = 1; ctx.stroke();
  };
  shard(-10, 40, 15, -4, 0.95);
  shard(8, 52, 17, 5, 1);
  shard(0, 30, 11, 0, 0.85);
  ctx.fillStyle = `rgba(255,255,255,${pulse * 0.5})`;
  ctx.beginPath(); ctx.arc(6, -40, 3, 0, TAU); ctx.fill();
}

function drawGlowcaps(ctx: CanvasRenderingContext2D, rng: () => number, empty: boolean, t: number) {
  shadow(ctx, 0, 0, 16, 5, 0.16);
  if (empty) {
    ctx.fillStyle = "#3a5a4c";
    ctx.beginPath(); ctx.ellipse(0, -2, 7, 3, 0, 0, TAU); ctx.fill();
    return;
  }
  const glow = 0.4 + Math.sin(t * 2.1) * 0.15;
  const g = ctx.createRadialGradient(0, -12, 2, 0, -12, 40);
  g.addColorStop(0, `rgba(155,226,181,${glow})`);
  g.addColorStop(1, "rgba(155,226,181,0)");
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(0, -12, 40, 0, TAU); ctx.fill();
  for (let i = 0; i < 4; i++) {
    const x = -14 + i * 9 + rng() * 4;
    const h = 10 + rng() * 10;
    ctx.strokeStyle = "#cfe8d8"; ctx.lineWidth = 2.6; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, -h); ctx.stroke();
    const cg = ctx.createLinearGradient(x, -h - 6, x, -h + 3);
    cg.addColorStop(0, "#d6ffe8"); cg.addColorStop(1, "#5fbd8c");
    ctx.fillStyle = cg;
    ctx.beginPath(); ctx.ellipse(x, -h, 6.5, 4.4, 0, Math.PI, 0); ctx.fill();
  }
}

function drawFrostbloom(ctx: CanvasRenderingContext2D, rng: () => number, empty: boolean, t: number) {
  shadow(ctx, 0, 0, 14, 5, 0.14);
  if (empty) {
    ctx.strokeStyle = "#54707f"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(2, -9); ctx.stroke();
    return;
  }
  const sway = Math.sin(t * 1.4 + rng() * 5) * 0.12;
  ctx.save(); ctx.rotate(sway);
  ctx.strokeStyle = "#6f94a8"; ctx.lineWidth = 2.4; ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -18); ctx.stroke();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU;
    const g = ctx.createRadialGradient(0, -20, 1, Math.cos(a) * 9, -20 + Math.sin(a) * 7, 8);
    g.addColorStop(0, "#ffffff"); g.addColorStop(1, "#a5d8ff");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(Math.cos(a) * 7, -20 + Math.sin(a) * 5.5, 5.4, 3.2, a, 0, TAU);
    ctx.fill();
  }
  ctx.fillStyle = "#ffe9a8";
  ctx.beginPath(); ctx.arc(0, -20, 2.6, 0, TAU); ctx.fill();
  ctx.restore();
}

// ════════════════════════════ STRUCTURES ═══════════════════════════════════

const V1_STRUCTS = new Set(["shelter", "firepit", "storage", "station", "pod", "wreck", "den"]);

export function drawStructAny(ctx: CanvasRenderingContext2D, st: Struct, s: GameState, t: number) {
  if (V1_STRUCTS.has(st.kind)) { drawStructV1(ctx, st, s, t); return; }
  ctx.save();
  ctx.translate(st.x, st.y);
  const rng = seeded(st.seed);
  switch (st.kind) {
    case "gate": drawGate(ctx, t); break;
    case "shiphull": drawShipHull(ctx, st.seed === 1, t); break;
    case "mast": drawMast(ctx, t); break;
    case "crate_stack": drawCrateStack(ctx, rng); break;
    case "stalagmite": drawStalagmite(ctx, rng); break;
    case "crystalpillar": drawCrystalPillar(ctx, t); break;
    case "labblock": drawLabBlock(ctx, st.seed, t); break;
    case "antenna": drawAntenna(ctx, t); break;
    case "pylon": drawPylon(ctx, t); break;
    case "ruin": drawRuin(ctx, rng); break;
    case "landmark": drawLandmark(ctx, st.seed, t); break;
    case "obelisk": drawObelisk(ctx, t); break;
    case "throne": drawThrone(ctx, t); break;
    // base add-ons (ghost preview when not yet built)
    case "cookpot": drawCookpot(ctx, !!s.build.cookpot, t); break;
    case "research": drawResearch(ctx, !!s.build.research, t); break;
    case "lamp": drawLamp(ctx, !!s.build.lamp, t); break;
    case "spikes": drawSpikes(ctx, !!s.build.spikes); break;
    case "banner": drawBanner(ctx, !!s.build.banner, t); break;
    case "bunks": drawBunks(ctx, !!s.build.bunks, t); break;
    case "beacon": drawSignalBeacon(ctx, !!s.build.beacon, t); break;
    default: break;
  }
  ctx.restore();
}

function ghost(ctx: CanvasRenderingContext2D, w: number, h: number, label = true) {
  ctx.save();
  ctx.strokeStyle = "rgba(165,224,255,0.45)";
  ctx.setLineDash([6, 5]);
  ctx.lineWidth = 2;
  ctx.fillStyle = "rgba(103,200,244,0.07)";
  rrect(ctx, -w / 2, -h, w, h, 6);
  ctx.fill(); ctx.stroke();
  if (label) {
    ctx.setLineDash([]);
    ctx.fillStyle = "rgba(165,224,255,0.5)";
    ctx.font = "700 11px Rajdhani, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("BUILD SITE", 0, -h - 7);
  }
  ctx.restore();
}

function drawGate(ctx: CanvasRenderingContext2D, t: number) {
  shadow(ctx, 0, 4, 54, 16, 0.3);
  // two carved posts with a banner between — the expedition hub
  for (const sx of [-40, 40]) {
    const g = ctx.createLinearGradient(sx - 10, -90, sx + 10, 0);
    g.addColorStop(0, "#8a6a45"); g.addColorStop(1, "#4c3826");
    ctx.fillStyle = g;
    rrect(ctx, sx - 9, -92, 18, 94, 3); ctx.fill();
    ctx.fillStyle = "rgba(232,242,250,0.85)";
    ctx.beginPath(); ctx.ellipse(sx, -92, 11, 4.4, 0, 0, TAU); ctx.fill();
  }
  ctx.strokeStyle = "#5c452c"; ctx.lineWidth = 5;
  ctx.beginPath(); ctx.moveTo(-44, -86); ctx.lineTo(44, -86); ctx.stroke();
  // hanging map board
  const sway = Math.sin(t * 1.2) * 0.05;
  ctx.save(); ctx.translate(0, -84); ctx.rotate(sway);
  ctx.fillStyle = "#2a3b50";
  rrect(ctx, -30, 4, 60, 40, 4); ctx.fill();
  ctx.strokeStyle = "rgba(165,224,255,0.55)"; ctx.lineWidth = 1.6; ctx.stroke();
  ctx.strokeStyle = "rgba(139,232,255,0.7)";
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(-20, 32); ctx.lineTo(-6, 18); ctx.lineTo(8, 26); ctx.lineTo(22, 12);
  ctx.stroke();
  for (const [px, py] of [[-20, 32], [-6, 18], [8, 26], [22, 12]] as [number, number][]) {
    ctx.fillStyle = "#ffb063";
    ctx.beginPath(); ctx.arc(px, py, 2.4, 0, TAU); ctx.fill();
  }
  ctx.restore();
  // guiding glow
  const gl = 0.3 + Math.sin(t * 2) * 0.12;
  const g2 = ctx.createRadialGradient(0, -40, 4, 0, -40, 90);
  g2.addColorStop(0, `rgba(255,176,99,${gl})`); g2.addColorStop(1, "rgba(255,176,99,0)");
  ctx.fillStyle = g2;
  ctx.beginPath(); ctx.arc(0, -40, 90, 0, TAU); ctx.fill();
}

function drawShipHull(ctx: CanvasRenderingContext2D, bow: boolean, t: number) {
  shadow(ctx, 0, 14, 210, 44, 0.34);
  ctx.save();
  ctx.rotate(bow ? -0.16 : 0.1);
  const g = ctx.createLinearGradient(0, -150, 0, 30);
  g.addColorStop(0, "#5d6b78"); g.addColorStop(0.45, "#3f4c58"); g.addColorStop(1, "#28323c");
  ctx.fillStyle = g;
  ctx.beginPath();
  if (bow) {
    ctx.moveTo(-230, 20);
    ctx.quadraticCurveTo(-250, -70, -150, -108);
    ctx.lineTo(120, -120);
    ctx.quadraticCurveTo(210, -108, 200, 10);
    ctx.quadraticCurveTo(60, 42, -230, 20);
  } else {
    ctx.moveTo(-190, 16);
    ctx.quadraticCurveTo(-200, -80, -90, -96);
    ctx.lineTo(130, -104);
    ctx.quadraticCurveTo(205, -80, 182, 14);
    ctx.quadraticCurveTo(40, 40, -190, 16);
  }
  ctx.closePath(); ctx.fill();
  // rust streaks
  ctx.fillStyle = "rgba(150,80,40,0.35)";
  for (let i = 0; i < 9; i++) {
    const x = -170 + i * 44;
    ctx.fillRect(x, -90 + (i % 3) * 14, 7, 60 + (i % 4) * 16);
  }
  // hull stripe + portholes
  ctx.fillStyle = "#b4482c";
  ctx.fillRect(-190, -40, 380, 13);
  for (let i = 0; i < 7; i++) {
    const x = -150 + i * 52;
    ctx.fillStyle = "#101c28";
    ctx.beginPath(); ctx.arc(x, -66, 8, 0, TAU); ctx.fill();
    ctx.strokeStyle = "#8795a3"; ctx.lineWidth = 2; ctx.stroke();
  }
  // deck rail
  ctx.strokeStyle = "#6f7d8a"; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(-160, -112); ctx.lineTo(150, -120); ctx.stroke();
  // ice encasing the base
  ctx.fillStyle = "rgba(200,232,250,0.75)";
  ctx.beginPath();
  ctx.moveTo(-230, 22);
  ctx.quadraticCurveTo(-120, 48, 0, 36);
  ctx.quadraticCurveTo(120, 48, 200, 18);
  ctx.quadraticCurveTo(80, 60, -230, 22);
  ctx.closePath(); ctx.fill();
  ctx.restore();
  // frozen mist clinging to the wreck
  const m = 0.1 + Math.sin(t * 0.7) * 0.03;
  const mg = ctx.createRadialGradient(0, -20, 20, 0, -20, 250);
  mg.addColorStop(0, `rgba(190,220,245,${m})`); mg.addColorStop(1, "rgba(190,220,245,0)");
  ctx.fillStyle = mg;
  ctx.beginPath(); ctx.arc(0, -20, 250, 0, TAU); ctx.fill();
}

function drawMast(ctx: CanvasRenderingContext2D, t: number) {
  shadow(ctx, 0, 2, 20, 7, 0.26);
  ctx.strokeStyle = "#4e5b68"; ctx.lineWidth = 9; ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-10, -150); ctx.stroke();
  ctx.lineWidth = 5;
  ctx.beginPath(); ctx.moveTo(-32, -104); ctx.lineTo(26, -116); ctx.stroke();
  // tattered sail
  const sway = Math.sin(t * 1.1) * 6;
  ctx.fillStyle = "rgba(216,226,236,0.8)";
  ctx.beginPath();
  ctx.moveTo(-28, -102);
  ctx.quadraticCurveTo(-4 + sway, -74, 22, -112);
  ctx.lineTo(16, -60 + sway * 0.4);
  ctx.quadraticCurveTo(-6, -48, -24, -66);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = "rgba(120,140,160,0.5)"; ctx.lineWidth = 1.2; ctx.stroke();
}

function drawCrateStack(ctx: CanvasRenderingContext2D, rng: () => number) {
  shadow(ctx, 0, 2, 30, 10, 0.26);
  const crate = (x: number, y: number, w: number, h: number) => {
    const g = ctx.createLinearGradient(x, y - h, x, y);
    g.addColorStop(0, "#8a6a45"); g.addColorStop(1, "#54402a");
    ctx.fillStyle = g;
    rrect(ctx, x - w / 2, y - h, w, h, 2); ctx.fill();
    ctx.strokeStyle = "rgba(28,20,12,0.6)"; ctx.lineWidth = 1.4; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x - w / 2, y - h / 2); ctx.lineTo(x + w / 2, y - h / 2); ctx.stroke();
  };
  crate(0, 0, 44, 26);
  if (rng() > 0.35) crate(-6, -26, 32, 20);
  ctx.fillStyle = "rgba(226,238,248,0.8)";
  ctx.beginPath(); ctx.ellipse(-4, -44, 16, 4.6, 0.1, 0, TAU); ctx.fill();
}

function drawStalagmite(ctx: CanvasRenderingContext2D, rng: () => number) {
  shadow(ctx, 0, 2, 40, 13, 0.3);
  const n = 2 + Math.floor(rng() * 2);
  for (let i = 0; i < n; i++) {
    const x = -18 + i * 22 + rng() * 10;
    const h = 70 + rng() * 80;
    const w = 26 + rng() * 16;
    const g = ctx.createLinearGradient(x - w / 2, 0, x + w / 2, -h);
    g.addColorStop(0, "#1f3350");
    g.addColorStop(0.55, "#35527a");
    g.addColorStop(1, "#6a9ac4");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(x - w / 2, 4);
    ctx.quadraticCurveTo(x - w * 0.22, -h * 0.55, x, -h);
    ctx.quadraticCurveTo(x + w * 0.24, -h * 0.5, x + w / 2, 4);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "rgba(160,220,255,0.3)"; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(x - 2, -h + 6); ctx.lineTo(x - w * 0.2, 0); ctx.stroke();
  }
}

function drawCrystalPillar(ctx: CanvasRenderingContext2D, t: number) {
  const pulse = 0.6 + Math.sin(t * 1.5) * 0.25;
  shadow(ctx, 0, 2, 36, 12, 0.28);
  const g0 = ctx.createRadialGradient(0, -70, 6, 0, -70, 170);
  g0.addColorStop(0, `rgba(103,200,244,${0.3 * pulse})`);
  g0.addColorStop(1, "rgba(103,200,244,0)");
  ctx.fillStyle = g0;
  ctx.beginPath(); ctx.arc(0, -70, 170, 0, TAU); ctx.fill();
  const col = (x: number, h: number, w: number) => {
    const g = ctx.createLinearGradient(x - w, 0, x + w, -h);
    g.addColorStop(0, "rgba(44,110,170,0.95)");
    g.addColorStop(0.5, "rgba(120,215,250,0.95)");
    g.addColorStop(1, "rgba(235,252,255,0.95)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(x - w / 2, 4);
    ctx.lineTo(x - w * 0.3, -h * 0.82);
    ctx.lineTo(x, -h);
    ctx.lineTo(x + w * 0.32, -h * 0.78);
    ctx.lineTo(x + w / 2, 4);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = `rgba(255,255,255,${0.5 * pulse})`; ctx.lineWidth = 1.4; ctx.stroke();
  };
  col(-16, 96, 26);
  col(14, 128, 30);
  col(0, 70, 18);
}

function drawLabBlock(ctx: CanvasRenderingContext2D, seed: number, t: number) {
  const rng = seeded(seed);
  const w = 180 + rng() * 60, h = 96 + rng() * 40;
  shadow(ctx, 0, 8, w * 0.55, 24, 0.32);
  // walls
  const g = ctx.createLinearGradient(0, -h, 0, 8);
  g.addColorStop(0, "#8d9aa8"); g.addColorStop(0.5, "#5f6c7a"); g.addColorStop(1, "#3c4855");
  ctx.fillStyle = g;
  rrect(ctx, -w / 2, -h, w, h + 6, 5); ctx.fill();
  // roof snow
  ctx.fillStyle = "rgba(234,243,251,0.92)";
  rrect(ctx, -w / 2 - 6, -h - 12, w + 12, 16, 5); ctx.fill();
  // windows — some lit if the grid is on
  const lit = rng() > 0.5;
  for (let i = 0; i < Math.floor(w / 46); i++) {
    const x = -w / 2 + 24 + i * 46;
    ctx.fillStyle = lit && i % 2 === 0 ? `rgba(255,200,130,${0.5 + Math.sin(t * 2 + i) * 0.12})` : "#1b2733";
    rrect(ctx, x - 13, -h + 22, 26, 22, 3); ctx.fill();
    ctx.strokeStyle = "rgba(20,30,42,0.7)"; ctx.lineWidth = 1.4; ctx.stroke();
  }
  // damage: collapsed corner
  if (rng() > 0.45) {
    ctx.fillStyle = "rgba(14,20,28,0.8)";
    ctx.beginPath();
    ctx.moveTo(w / 2 - 50, -h); ctx.lineTo(w / 2, -h + 10); ctx.lineTo(w / 2, -h + 54); ctx.lineTo(w / 2 - 42, -h + 30);
    ctx.closePath(); ctx.fill();
  }
  // door
  ctx.fillStyle = "#1a2531";
  rrect(ctx, -18, -46, 36, 46, 3); ctx.fill();
  ctx.strokeStyle = "rgba(165,224,255,0.3)"; ctx.stroke();
}

function drawAntenna(ctx: CanvasRenderingContext2D, t: number) {
  shadow(ctx, 0, 2, 26, 9, 0.26);
  ctx.strokeStyle = "#78868f"; ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(-20, 0); ctx.lineTo(0, -140); ctx.lineTo(20, 0);
  ctx.moveTo(-12, -46); ctx.lineTo(12, -46);
  ctx.moveTo(-7, -92); ctx.lineTo(7, -92);
  ctx.stroke();
  // dish
  ctx.save(); ctx.translate(0, -142); ctx.rotate(-0.5);
  const g = ctx.createLinearGradient(-26, 0, 26, 0);
  g.addColorStop(0, "#c3d0dc"); g.addColorStop(1, "#6d7c8a");
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.ellipse(0, 0, 26, 15, 0, 0, TAU); ctx.fill();
  ctx.restore();
  const b = 0.3 + Math.max(0, Math.sin(t * 1.6)) * 0.6;
  ctx.fillStyle = `rgba(255,110,90,${b})`;
  ctx.beginPath(); ctx.arc(0, -150, 3.4, 0, TAU); ctx.fill();
}

function drawPylon(ctx: CanvasRenderingContext2D, t: number) {
  shadow(ctx, 0, 2, 16, 6, 0.22);
  ctx.fillStyle = "#4c5865";
  rrect(ctx, -9, -70, 18, 72, 3); ctx.fill();
  ctx.fillStyle = "#e2b23c";
  ctx.fillRect(-9, -44, 18, 7);
  ctx.fillRect(-9, -24, 18, 7);
  const spark = Math.sin(t * 9) > 0.86;
  ctx.fillStyle = spark ? "#bff0ff" : "#2b3845";
  ctx.beginPath(); ctx.arc(0, -76, 5, 0, TAU); ctx.fill();
  if (spark) {
    ctx.strokeStyle = "rgba(190,240,255,0.8)"; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(0, -76); ctx.lineTo(8, -88); ctx.lineTo(2, -84); ctx.lineTo(10, -96); ctx.stroke();
  }
}

function drawRuin(ctx: CanvasRenderingContext2D, rng: () => number) {
  const h = 110 + rng() * 70;
  const w = 110 + rng() * 40;
  shadow(ctx, 0, 6, w * 0.5, 18, 0.34);
  const g = ctx.createLinearGradient(-w / 2, -h, w / 2, 10);
  g.addColorStop(0, "#44507a"); g.addColorStop(0.5, "#2c3756"); g.addColorStop(1, "#1a2238");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(-w / 2, 8);
  ctx.lineTo(-w / 2 + 6, -h * 0.82);
  ctx.lineTo(-w * 0.15, -h);
  ctx.lineTo(w * 0.2, -h * 0.9);
  ctx.lineTo(w / 2 - 4, -h * 0.6);
  ctx.lineTo(w / 2, 8);
  ctx.closePath(); ctx.fill();
  // battlement notches
  ctx.fillStyle = "rgba(190,210,255,0.14)";
  for (let i = 0; i < 3; i++) ctx.fillRect(-w / 2 + 10 + i * (w / 3.2), -h * 0.86, 14, 10);
  // violet resonance in the cracks
  ctx.strokeStyle = "rgba(170,140,255,0.5)"; ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-10, 4); ctx.lineTo(4, -h * 0.4); ctx.lineTo(-6, -h * 0.62); ctx.stroke();
  // ice rime
  ctx.fillStyle = "rgba(220,235,255,0.5)";
  ctx.beginPath(); ctx.ellipse(0, 8, w * 0.46, 8, 0, 0, TAU); ctx.fill();
}

// ── region landmarks: one memorable silhouette per region ──────────────────

function drawLandmark(ctx: CanvasRenderingContext2D, variant: number, t: number) {
  switch (variant) {
    case 0: drawFrozenFalls(ctx, t); break;
    case 1: drawBeacon(ctx, t); break;
    case 2: drawCrystalHeart(ctx, t); break;
    case 3: drawHelicopter(ctx, t); break;
  }
}

/** Forest: a waterfall caught mid-fall, blue-white and translucent. */
function drawFrozenFalls(ctx: CanvasRenderingContext2D, t: number) {
  shadow(ctx, 0, 10, 130, 30, 0.3);
  // cliff face
  const cliff = ctx.createLinearGradient(-130, -210, 130, 20);
  cliff.addColorStop(0, "#6c7f93"); cliff.addColorStop(0.5, "#4c5c6d"); cliff.addColorStop(1, "#33404e");
  ctx.fillStyle = cliff;
  ctx.beginPath();
  ctx.moveTo(-132, 16);
  ctx.lineTo(-116, -196);
  ctx.lineTo(-26, -222);
  ctx.lineTo(96, -202);
  ctx.lineTo(130, 16);
  ctx.closePath(); ctx.fill();
  // snow cap
  ctx.fillStyle = "rgba(236,245,252,0.95)";
  ctx.beginPath();
  ctx.moveTo(-118, -194);
  ctx.quadraticCurveTo(-30, -236, 98, -200);
  ctx.quadraticCurveTo(-10, -212, -118, -194);
  ctx.closePath(); ctx.fill();

  // the frozen cascade — layered translucent columns
  ctx.save();
  ctx.globalAlpha = 0.9;
  for (let i = 0; i < 5; i++) {
    const x = -62 + i * 30;
    const w = 20 + (i % 2) * 10;
    const g = ctx.createLinearGradient(x, -200, x + w * 0.6, 14);
    g.addColorStop(0, "rgba(236,252,255,0.95)");
    g.addColorStop(0.45, "rgba(150,216,244,0.8)");
    g.addColorStop(1, "rgba(96,172,214,0.85)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(x - w / 2, -198);
    ctx.quadraticCurveTo(x - w * 0.2, -90, x - w * 0.42, 14);
    ctx.lineTo(x + w * 0.52, 14);
    ctx.quadraticCurveTo(x + w * 0.3, -94, x + w / 2, -198);
    ctx.closePath(); ctx.fill();
    // highlight rib
    ctx.strokeStyle = `rgba(255,255,255,${0.35 + Math.sin(t * 0.8 + i) * 0.12})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x - w * 0.1, -190); ctx.quadraticCurveTo(x + 2, -96, x - w * 0.16, 8);
    ctx.stroke();
  }
  ctx.restore();
  // icicle fringe + basin
  ctx.fillStyle = "rgba(226,246,255,0.9)";
  for (let i = 0; i < 9; i++) {
    const x = -84 + i * 21;
    const h = 16 + ((i * 7) % 20);
    ctx.beginPath();
    ctx.moveTo(x - 4, -200); ctx.lineTo(x, -200 + h); ctx.lineTo(x + 4, -200);
    ctx.closePath(); ctx.fill();
  }
  ctx.fillStyle = "rgba(190,230,248,0.75)";
  ctx.beginPath(); ctx.ellipse(0, 18, 112, 22, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.4)";
  ctx.beginPath(); ctx.ellipse(-20, 14, 54, 10, 0, 0, TAU); ctx.fill();
}

/** Shipwreck: a listing navigation beacon, long dead. */
function drawBeacon(ctx: CanvasRenderingContext2D, t: number) {
  shadow(ctx, 0, 6, 54, 16, 0.3);
  ctx.save();
  ctx.rotate(0.17);
  // lattice tower
  ctx.strokeStyle = "#5d6b78"; ctx.lineWidth = 5; ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-30, 4); ctx.lineTo(-11, -168);
  ctx.moveTo(30, 4); ctx.lineTo(11, -168);
  ctx.stroke();
  ctx.lineWidth = 2.6;
  for (let i = 0; i < 6; i++) {
    const y0 = 0 - i * 28, y1 = y0 - 28;
    const w0 = 29 - i * 3.1, w1 = 29 - (i + 1) * 3.1;
    ctx.beginPath();
    ctx.moveTo(-w0, y0); ctx.lineTo(w1, y1);
    ctx.moveTo(w0, y0); ctx.lineTo(-w1, y1);
    ctx.moveTo(-w1, y1); ctx.lineTo(w1, y1);
    ctx.stroke();
  }
  // rust wash
  ctx.strokeStyle = "rgba(150,80,40,0.35)"; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(-26, -8); ctx.lineTo(-14, -120); ctx.stroke();
  // lamp housing — cracked, unlit, faint residual flicker
  ctx.fillStyle = "#2c3744";
  rrect(ctx, -17, -196, 34, 30, 4); ctx.fill();
  const blink = Math.max(0, Math.sin(t * 0.7)) * 0.3;
  ctx.fillStyle = `rgba(255,140,90,${0.08 + blink})`;
  rrect(ctx, -12, -191, 24, 20, 3); ctx.fill();
  ctx.strokeStyle = "rgba(220,235,248,0.5)"; ctx.lineWidth = 1.4;
  rrect(ctx, -17, -196, 34, 30, 4); ctx.stroke();
  ctx.fillStyle = "#44525f";
  ctx.beginPath(); ctx.moveTo(-20, -196); ctx.lineTo(0, -214); ctx.lineTo(20, -196); ctx.closePath(); ctx.fill();
  ctx.restore();
  // ice collar at the base
  ctx.fillStyle = "rgba(226,243,252,0.9)";
  ctx.beginPath(); ctx.ellipse(0, 8, 46, 13, 0, 0, TAU); ctx.fill();
}

/** Cave: the enormous uncut crystal the survey team feared. */
function drawCrystalHeart(ctx: CanvasRenderingContext2D, t: number) {
  const pulse = 0.62 + Math.sin(t * 1.1) * 0.22;
  shadow(ctx, 0, 8, 96, 26, 0.34);
  // aura
  const g0 = ctx.createRadialGradient(0, -120, 10, 0, -120, 300);
  g0.addColorStop(0, `rgba(103,200,244,${0.3 * pulse})`);
  g0.addColorStop(0.5, `rgba(150,120,255,${0.12 * pulse})`);
  g0.addColorStop(1, "rgba(103,200,244,0)");
  ctx.fillStyle = g0;
  ctx.beginPath(); ctx.arc(0, -120, 300, 0, TAU); ctx.fill();
  // rock plinth
  ctx.fillStyle = "#223349";
  ctx.beginPath();
  ctx.moveTo(-86, 14); ctx.lineTo(-54, -34); ctx.lineTo(56, -36); ctx.lineTo(88, 14);
  ctx.closePath(); ctx.fill();
  // main crystal mass
  const face = (pts: [number, number][], c1: string, c2: string, a: number) => {
    const g = ctx.createLinearGradient(pts[0][0], pts[0][1], pts[2][0], pts[2][1]);
    g.addColorStop(0, c1); g.addColorStop(1, c2);
    ctx.globalAlpha = a;
    ctx.fillStyle = g;
    ctx.beginPath();
    pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p[0], p[1]) : ctx.lineTo(p[0], p[1])));
    ctx.closePath(); ctx.fill();
    ctx.globalAlpha = 1;
  };
  face([[-52, -30], [-22, -238], [6, -28]], "#2b6ea6", "#bfefff", 0.95);
  face([[6, -28], [-22, -238], [34, -196]], "#8be8ff", "#e9fbff", 0.92);
  face([[6, -28], [34, -196], [62, -26]], "#1f5c93", "#79cdf0", 0.95);
  face([[-80, -14], [-58, -148], [-40, -18]], "#2b6ea6", "#9fe4ff", 0.85);
  face([[48, -18], [70, -132], [84, -12]], "#255f99", "#8fd9f7", 0.85);
  // inner glow core
  const cg = ctx.createRadialGradient(0, -120, 2, 0, -120, 60);
  cg.addColorStop(0, `rgba(255,255,255,${pulse * 0.6})`);
  cg.addColorStop(1, "rgba(139,232,255,0)");
  ctx.fillStyle = cg;
  ctx.beginPath(); ctx.arc(0, -120, 60, 0, TAU); ctx.fill();
  // survey markers: the team's warning tape
  ctx.strokeStyle = "rgba(226,178,60,0.75)";
  ctx.lineWidth = 3;
  ctx.setLineDash([12, 9]);
  ctx.beginPath(); ctx.ellipse(0, 10, 104, 26, 0, 0, TAU); ctx.stroke();
  ctx.setLineDash([]);
}

/** Station: the evacuation helicopter that never lifted off. */
function drawHelicopter(ctx: CanvasRenderingContext2D, t: number) {
  shadow(ctx, 0, 10, 118, 26, 0.32);
  ctx.save();
  ctx.rotate(-0.08);
  // skids
  ctx.strokeStyle = "#39454f"; ctx.lineWidth = 5; ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-66, 12); ctx.lineTo(54, 10);
  ctx.moveTo(-42, 12); ctx.lineTo(-36, -8);
  ctx.moveTo(30, 10); ctx.lineTo(26, -8);
  ctx.stroke();
  // tail boom
  const tg = ctx.createLinearGradient(0, -60, 0, -10);
  tg.addColorStop(0, "#5c6d7c"); tg.addColorStop(1, "#36424e");
  ctx.fillStyle = tg;
  ctx.beginPath();
  ctx.moveTo(14, -48); ctx.lineTo(128, -62); ctx.lineTo(130, -44); ctx.lineTo(16, -26);
  ctx.closePath(); ctx.fill();
  // tail fin + rotor
  ctx.fillStyle = "#44525f";
  ctx.beginPath(); ctx.moveTo(120, -62); ctx.lineTo(146, -104); ctx.lineTo(152, -62); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = "#8795a3"; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(140, -84); ctx.lineTo(160, -72); ctx.moveTo(140, -84); ctx.lineTo(126, -70); ctx.stroke();
  // cabin
  const bg = ctx.createLinearGradient(0, -92, 0, 8);
  bg.addColorStop(0, "#9fb0bf"); bg.addColorStop(0.45, "#6a7a89"); bg.addColorStop(1, "#3d4a57");
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.moveTo(-70, 4);
  ctx.quadraticCurveTo(-88, -50, -46, -80);
  ctx.lineTo(16, -84);
  ctx.quadraticCurveTo(44, -74, 40, -20);
  ctx.quadraticCurveTo(26, 6, -70, 4);
  ctx.closePath(); ctx.fill();
  // cockpit glass — cracked
  ctx.fillStyle = "rgba(24,42,60,0.9)";
  ctx.beginPath();
  ctx.moveTo(-66, -6); ctx.quadraticCurveTo(-80, -48, -44, -72); ctx.lineTo(-16, -74); ctx.lineTo(-20, -8);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = "rgba(200,225,245,0.5)"; ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.moveTo(-60, -60); ctx.lineTo(-40, -36); ctx.lineTo(-54, -22); ctx.moveTo(-40, -36); ctx.lineTo(-24, -44);
  ctx.stroke();
  // rescue stripe + door
  ctx.fillStyle = "#d4641a";
  ctx.fillRect(-18, -46, 56, 11);
  ctx.fillStyle = "#2b3744";
  rrect(ctx, 0, -40, 30, 36, 3); ctx.fill();
  // mast + drooping rotor blades
  ctx.fillStyle = "#4f5d6b";
  rrect(ctx, -12, -104, 24, 22, 3); ctx.fill();
  ctx.strokeStyle = "#6f7f8d"; ctx.lineWidth = 6; ctx.lineCap = "round";
  const droop = Math.sin(t * 0.4) * 2;
  ctx.beginPath();
  ctx.moveTo(0, -104); ctx.quadraticCurveTo(-80, -98 + droop, -150, -78 + droop);
  ctx.moveTo(0, -104); ctx.quadraticCurveTo(70, -100 - droop, 132, -86 - droop);
  ctx.stroke();
  ctx.restore();
  // snow burial
  ctx.fillStyle = "rgba(234,243,251,0.92)";
  ctx.beginPath(); ctx.ellipse(-30, 12, 70, 15, 0, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.ellipse(66, 8, 44, 11, 0, 0, TAU); ctx.fill();
}

function drawObelisk(ctx: CanvasRenderingContext2D, t: number) {
  shadow(ctx, 0, 4, 26, 10, 0.3);
  const g = ctx.createLinearGradient(-16, 0, 16, -150);
  g.addColorStop(0, "#232c4e"); g.addColorStop(0.6, "#3d4a7d"); g.addColorStop(1, "#6b7bc0");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(-15, 4); ctx.lineTo(-10, -140); ctx.lineTo(0, -158); ctx.lineTo(10, -140); ctx.lineTo(15, 4);
  ctx.closePath(); ctx.fill();
  const pulse = 0.4 + Math.sin(t * 2.2) * 0.25;
  ctx.strokeStyle = `rgba(180,140,255,${pulse})`;
  ctx.lineWidth = 2.4;
  for (let i = 0; i < 4; i++) {
    const y = -30 - i * 30;
    ctx.beginPath(); ctx.moveTo(-8, y); ctx.lineTo(8, y - 8); ctx.stroke();
  }
  const gg = ctx.createRadialGradient(0, -150, 2, 0, -150, 60);
  gg.addColorStop(0, `rgba(180,140,255,${pulse * 0.7})`); gg.addColorStop(1, "rgba(180,140,255,0)");
  ctx.fillStyle = gg;
  ctx.beginPath(); ctx.arc(0, -150, 60, 0, TAU); ctx.fill();
}

function drawThrone(ctx: CanvasRenderingContext2D, t: number) {
  shadow(ctx, 0, 10, 140, 34, 0.36);
  // dais
  ctx.fillStyle = "#283357";
  ctx.beginPath();
  ctx.ellipse(0, 0, 140, 44, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = "#333f69";
  ctx.beginPath(); ctx.ellipse(0, -10, 118, 36, 0, 0, TAU); ctx.fill();
  // seat of black ice
  const g = ctx.createLinearGradient(0, -170, 0, -10);
  g.addColorStop(0, "#5a69ab"); g.addColorStop(0.6, "#2e3a63"); g.addColorStop(1, "#1b2440");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(-58, -18);
  ctx.lineTo(-48, -120);
  ctx.lineTo(-22, -176);
  ctx.lineTo(22, -176);
  ctx.lineTo(48, -120);
  ctx.lineTo(58, -18);
  ctx.closePath(); ctx.fill();
  // resonance veins
  const pulse = 0.35 + Math.sin(t * 1.8) * 0.22;
  ctx.strokeStyle = `rgba(180,140,255,${pulse})`;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-30, -24); ctx.lineTo(-12, -92); ctx.lineTo(-26, -140);
  ctx.moveTo(30, -24); ctx.lineTo(14, -96); ctx.lineTo(26, -146);
  ctx.stroke();
}

// ── base add-ons ──

function drawCookpot(ctx: CanvasRenderingContext2D, built: boolean, t: number) {
  if (!built) { ghost(ctx, 48, 26); return; }
  shadow(ctx, 0, 2, 28, 9, 0.26);
  ctx.strokeStyle = "#5a6372"; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(-22, 0); ctx.lineTo(-14, -34); ctx.moveTo(22, 0); ctx.lineTo(14, -34); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-18, -34); ctx.lineTo(18, -34); ctx.stroke();
  const g = ctx.createLinearGradient(0, -30, 0, -6);
  g.addColorStop(0, "#5c6675"); g.addColorStop(1, "#2d3540");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(-17, -26); ctx.quadraticCurveTo(0, -6, 17, -26); ctx.quadraticCurveTo(0, -18, -17, -26);
  ctx.fill();
  rrect(ctx, -17, -28, 34, 20, 4); ctx.fill();
  // steam
  for (let i = 0; i < 3; i++) {
    const o = Math.sin(t * 1.6 + i * 2) * 4;
    ctx.fillStyle = `rgba(226,240,252,${0.25 - i * 0.06})`;
    ctx.beginPath(); ctx.ellipse(o, -40 - i * 12, 7 - i, 4, 0, 0, TAU); ctx.fill();
  }
}

function drawResearch(ctx: CanvasRenderingContext2D, built: boolean, t: number) {
  if (!built) { ghost(ctx, 68, 32); return; }
  shadow(ctx, 0, 4, 44, 14, 0.3);
  // console desk
  const g = ctx.createLinearGradient(0, -56, 0, 0);
  g.addColorStop(0, "#5c6b7d"); g.addColorStop(1, "#303a46");
  ctx.fillStyle = g;
  rrect(ctx, -38, -40, 76, 42, 4); ctx.fill();
  // angled screen
  ctx.save(); ctx.translate(0, -44); ctx.rotate(-0.12);
  ctx.fillStyle = "#101b28";
  rrect(ctx, -30, -34, 60, 36, 3); ctx.fill();
  const glow = 0.5 + Math.sin(t * 2.4) * 0.2;
  ctx.fillStyle = `rgba(103,200,244,${glow})`;
  for (let i = 0; i < 4; i++) ctx.fillRect(-24, -28 + i * 8, 20 + Math.sin(t * 3 + i) * 14, 3);
  ctx.strokeStyle = "rgba(165,224,255,0.5)"; ctx.lineWidth = 1.4;
  rrect(ctx, -30, -34, 60, 36, 3); ctx.stroke();
  ctx.restore();
  // crystal analyser
  const cg = ctx.createRadialGradient(28, -56, 2, 28, -56, 26);
  cg.addColorStop(0, `rgba(139,232,255,${glow * 0.8})`); cg.addColorStop(1, "rgba(139,232,255,0)");
  ctx.fillStyle = cg;
  ctx.beginPath(); ctx.arc(28, -56, 26, 0, TAU); ctx.fill();
  ctx.fillStyle = "#8be8ff";
  ctx.beginPath();
  ctx.moveTo(28, -70); ctx.lineTo(34, -54); ctx.lineTo(28, -46); ctx.lineTo(22, -54);
  ctx.closePath(); ctx.fill();
}

function drawLamp(ctx: CanvasRenderingContext2D, built: boolean, t: number) {
  if (!built) { ghost(ctx, 30, 24); return; }
  shadow(ctx, 0, 2, 14, 5, 0.24);
  ctx.fillStyle = "#4b3a28";
  rrect(ctx, -5, -96, 10, 98, 3); ctx.fill();
  ctx.strokeStyle = "#5a6372"; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(0, -96); ctx.quadraticCurveTo(16, -100, 20, -86); ctx.stroke();
  const flick = 0.75 + Math.sin(t * 7) * 0.12;
  const g = ctx.createRadialGradient(20, -80, 2, 20, -80, 76);
  g.addColorStop(0, `rgba(255,200,130,${0.4 * flick})`);
  g.addColorStop(1, "rgba(255,200,130,0)");
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(20, -80, 76, 0, TAU); ctx.fill();
  ctx.fillStyle = "#2b3542";
  rrect(ctx, 13, -84, 14, 16, 3); ctx.fill();
  ctx.fillStyle = `rgba(255,222,160,${flick})`;
  rrect(ctx, 15, -82, 10, 12, 2); ctx.fill();
}

function drawSpikes(ctx: CanvasRenderingContext2D, built: boolean) {
  if (!built) { ghost(ctx, 70, 22); return; }
  shadow(ctx, 0, 2, 44, 10, 0.26);
  for (let i = 0; i < 5; i++) {
    const x = -36 + i * 18;
    const h = 34 + (i % 2) * 12;
    ctx.save();
    ctx.translate(x, 0);
    ctx.rotate((i % 2 ? 1 : -1) * 0.22);
    const g = ctx.createLinearGradient(-5, 0, 5, -h);
    g.addColorStop(0, "#5c452c"); g.addColorStop(1, "#b8a082");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-5, 2); ctx.lineTo(0, -h); ctx.lineTo(5, 2);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = "rgba(230,242,252,0.7)";
    ctx.beginPath(); ctx.moveTo(-2, -h + 8); ctx.lineTo(0, -h); ctx.lineTo(2, -h + 8); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  // lashed cross-beam
  ctx.strokeStyle = "#4b3a28"; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(-40, -10); ctx.lineTo(40, -14); ctx.stroke();
}

function drawBanner(ctx: CanvasRenderingContext2D, built: boolean, t: number) {
  if (!built) { ghost(ctx, 26, 24); return; }
  shadow(ctx, 0, 2, 10, 4, 0.22);
  ctx.fillStyle = "#4b3a28";
  rrect(ctx, -3, -104, 6, 106, 2); ctx.fill();
  const sway = Math.sin(t * 1.6) * 3;
  const g = ctx.createLinearGradient(0, -100, 0, -40);
  g.addColorStop(0, "#e8763a"); g.addColorStop(1, "#b4482c");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(3, -100);
  ctx.lineTo(40 + sway, -96);
  ctx.lineTo(34 + sway, -74);
  ctx.lineTo(40 + sway, -52);
  ctx.lineTo(3, -48);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = "rgba(255,230,180,0.9)";
  ctx.beginPath(); ctx.arc(18 + sway * 0.6, -74, 6, 0, TAU); ctx.fill();
}

/** Settlement housing — a low, sod-roofed bunk hall behind the shelter. */
function drawBunks(ctx: CanvasRenderingContext2D, built: boolean, t: number) {
  if (!built) { ghost(ctx, 88, 40); return; }
  shadow(ctx, 0, 4, 54, 16, 0.3);
  // hull walls
  const g = ctx.createLinearGradient(0, -46, 0, 0);
  g.addColorStop(0, "#6c5236"); g.addColorStop(1, "#453322");
  ctx.fillStyle = g;
  rrect(ctx, -48, -38, 96, 40, 5); ctx.fill();
  ctx.strokeStyle = "rgba(20,14,8,0.6)"; ctx.lineWidth = 1.6; ctx.stroke();
  // sod roof with snow cap
  ctx.fillStyle = "#3a4b3a";
  ctx.beginPath();
  ctx.moveTo(-54, -36); ctx.quadraticCurveTo(0, -64, 54, -36);
  ctx.lineTo(50, -30); ctx.quadraticCurveTo(0, -54, -50, -30);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = "rgba(230,242,252,0.85)";
  ctx.beginPath();
  ctx.moveTo(-50, -38); ctx.quadraticCurveTo(0, -60, 50, -38);
  ctx.quadraticCurveTo(0, -52, -50, -38);
  ctx.closePath(); ctx.fill();
  // door + warm window light
  ctx.fillStyle = "#241a10";
  rrect(ctx, -8, -22, 18, 24, 3); ctx.fill();
  const flick = 0.55 + Math.sin(t * 5.2) * 0.12;
  ctx.fillStyle = `rgba(255,190,110,${flick})`;
  rrect(ctx, -36, -22, 14, 12, 2); ctx.fill();
  rrect(ctx, 24, -22, 14, 12, 2); ctx.fill();
  // smoke curl from the stove
  for (let i = 0; i < 3; i++) {
    const o = Math.sin(t * 1.2 + i * 2.1) * 5;
    ctx.fillStyle = `rgba(226,240,252,${0.22 - i * 0.05})`;
    ctx.beginPath(); ctx.ellipse(-30 + o, -56 - i * 14, 5 - i * 0.8, 3.4, 0, 0, TAU); ctx.fill();
  }
}

/** Settlement recruitment tower — salvaged mast, dish and a pulsing lamp. */
function drawSignalBeacon(ctx: CanvasRenderingContext2D, built: boolean, t: number) {
  if (!built) { ghost(ctx, 42, 60); return; }
  shadow(ctx, 0, 2, 20, 7, 0.26);
  // lattice mast
  ctx.strokeStyle = "#5a6372"; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(-9, 0); ctx.lineTo(-2, -80); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(9, 0); ctx.lineTo(2, -80); ctx.stroke();
  ctx.lineWidth = 1.8;
  for (let i = 0; i < 4; i++) {
    const y = -12 - i * 17;
    ctx.beginPath(); ctx.moveTo(-8 + i * 1.4, y); ctx.lineTo(8 - i * 1.4, y - 9); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(8 - i * 1.4, y); ctx.lineTo(-8 + i * 1.4, y - 9); ctx.stroke();
  }
  // dish
  ctx.save(); ctx.translate(7, -56); ctx.rotate(-0.5);
  ctx.strokeStyle = "#8a94a6"; ctx.lineWidth = 3; ctx.lineCap = "round";
  ctx.beginPath(); ctx.arc(0, 0, 12, -1.2, 1.2); ctx.stroke();
  ctx.restore();
  // crystal beacon lamp
  const pulse = 0.5 + Math.sin(t * 2.6) * 0.4;
  const g = ctx.createRadialGradient(0, -84, 2, 0, -84, 60);
  g.addColorStop(0, `rgba(139,232,255,${0.5 * pulse})`); g.addColorStop(1, "rgba(139,232,255,0)");
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(0, -84, 60, 0, TAU); ctx.fill();
  ctx.fillStyle = `rgba(139,232,255,${0.65 + pulse * 0.35})`;
  ctx.beginPath();
  ctx.moveTo(0, -94); ctx.lineTo(5, -84); ctx.lineTo(0, -76); ctx.lineTo(-5, -84);
  ctx.closePath(); ctx.fill();
}

// ════════════════════════════ CONTAINERS & DEVICES ═════════════════════════

/** A stranded survivor's survival pod — opens into a resident rescue. */
function drawSurvivorPod(ctx: CanvasRenderingContext2D, open: boolean, t: number) {
  shadow(ctx, 0, 2, 26, 9, 0.26);
  // glow while occupied — someone is alive in there
  if (!open) {
    const pulse = 0.3 + Math.sin(t * 2.8) * 0.14;
    const g = ctx.createRadialGradient(0, -18, 2, 0, -18, 64);
    g.addColorStop(0, `rgba(255,158,110,${pulse})`); g.addColorStop(1, "rgba(255,158,110,0)");
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, -18, 64, 0, TAU); ctx.fill();
  }
  // capsule hull
  const g = ctx.createLinearGradient(0, -34, 0, 0);
  g.addColorStop(0, open ? "#5a4a3a" : "#8a5a3a"); g.addColorStop(1, "#3c2a1c");
  ctx.fillStyle = g;
  ctx.save();
  ctx.rotate(-0.12);
  rrect(ctx, -30, -22, 60, 24, 11); ctx.fill();
  ctx.restore();
  ctx.strokeStyle = "rgba(22,14,8,0.65)"; ctx.lineWidth = 1.6;
  rrect(ctx, -30, -22, 60, 24, 11); ctx.stroke();
  // viewport — a pale face silhouette until rescued
  ctx.fillStyle = open ? "#10141a" : "#ffd9b8";
  ctx.beginPath(); ctx.arc(-10, -12, 5.4, 0, TAU); ctx.fill();
  ctx.fillStyle = "#22303f";
  rrect(ctx, 6, -18, 16, 9, 2); ctx.fill();
  // status lamp
  ctx.fillStyle = open ? "#3f4a58" : (Math.sin(t * 3.2) > 0 ? "#ffb063" : "#e84848");
  ctx.beginPath(); ctx.arc(24, -20, 2.6, 0, TAU); ctx.fill();
}

export function drawContainer(ctx: CanvasRenderingContext2D, c: Container, t: number) {
  ctx.save();
  ctx.translate(c.x, c.y);
  shadow(ctx, 0, 2, 24, 8, 0.26);
  const open = c.opened;
  const glow = open ? 0 : 0.26 + Math.sin(t * 2.2) * 0.1;
  if (glow > 0) {
    const g = ctx.createRadialGradient(0, -14, 2, 0, -14, 54);
    g.addColorStop(0, `rgba(255,200,120,${glow})`); g.addColorStop(1, "rgba(255,200,120,0)");
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, -14, 54, 0, TAU); ctx.fill();
  }
  switch (c.kind) {
    case "survivor": drawSurvivorPod(ctx, open, t); break;
    case "crate": case "cache": {
      const g = ctx.createLinearGradient(0, -30, 0, 0);
      g.addColorStop(0, open ? "#6a563d" : "#8a6a45"); g.addColorStop(1, "#4a3826");
      ctx.fillStyle = g;
      rrect(ctx, -22, -30, 44, 30, 3); ctx.fill();
      ctx.strokeStyle = "rgba(28,20,12,0.6)"; ctx.lineWidth = 1.5; ctx.stroke();
      if (open) {
        ctx.fillStyle = "#1b1410";
        rrect(ctx, -19, -30, 38, 11, 2); ctx.fill();
        ctx.save(); ctx.translate(-22, -30); ctx.rotate(-0.7);
        ctx.fillStyle = "#7a6044"; rrect(ctx, 0, -7, 42, 7, 2); ctx.fill();
        ctx.restore();
      } else {
        ctx.strokeStyle = "#c9a870"; ctx.lineWidth = 2.4;
        ctx.beginPath(); ctx.moveTo(-22, -16); ctx.lineTo(22, -16); ctx.stroke();
        ctx.fillStyle = "#c9a870";
        rrect(ctx, -5, -20, 10, 9, 2); ctx.fill();
      }
      break;
    }
    case "locker": {
      const g = ctx.createLinearGradient(-16, 0, 16, -52);
      g.addColorStop(0, "#43525f"); g.addColorStop(1, open ? "#5c6d7c" : "#72828f");
      ctx.fillStyle = g;
      rrect(ctx, -16, -54, 32, 54, 3); ctx.fill();
      ctx.strokeStyle = "rgba(18,26,34,0.7)"; ctx.lineWidth = 1.4; ctx.stroke();
      ctx.fillStyle = open ? "#101a24" : "#334150";
      rrect(ctx, -12, -48, 24, 40, 2); ctx.fill();
      ctx.fillStyle = "#b9c7d4";
      ctx.beginPath(); ctx.arc(8, -26, 2.4, 0, TAU); ctx.fill();
      if (c.needs && !open) {
        ctx.fillStyle = "#ffb063";
        ctx.beginPath(); ctx.arc(0, -60, 4, 0, TAU); ctx.fill();
      }
      break;
    }
    case "cargo": {
      const g = ctx.createLinearGradient(0, -70, 0, 0);
      g.addColorStop(0, "#3f6d84"); g.addColorStop(1, "#1d3b4d");
      ctx.fillStyle = g;
      rrect(ctx, -50, -70, 100, 70, 4); ctx.fill();
      ctx.strokeStyle = "rgba(10,20,28,0.7)"; ctx.lineWidth = 2; ctx.stroke();
      for (let i = 0; i < 5; i++) {
        ctx.strokeStyle = "rgba(255,255,255,0.12)";
        ctx.beginPath(); ctx.moveTo(-40 + i * 20, -68); ctx.lineTo(-40 + i * 20, -4); ctx.stroke();
      }
      ctx.fillStyle = open ? "#0d161e" : "#b4482c";
      rrect(ctx, -16, -44, 32, 30, 2); ctx.fill();
      if (!open) {
        ctx.strokeStyle = "#e8c98a"; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(-16, -30); ctx.lineTo(16, -30); ctx.stroke();
      }
      ctx.fillStyle = "rgba(226,238,248,0.8)";
      ctx.beginPath(); ctx.ellipse(0, -72, 46, 7, 0, 0, TAU); ctx.fill();
      break;
    }
    case "labcase": {
      const g = ctx.createLinearGradient(0, -40, 0, 0);
      g.addColorStop(0, "#c6d4e0"); g.addColorStop(1, "#7f8e9c");
      ctx.fillStyle = g;
      rrect(ctx, -26, -40, 52, 40, 4); ctx.fill();
      ctx.strokeStyle = "rgba(20,30,42,0.6)"; ctx.lineWidth = 1.6; ctx.stroke();
      ctx.fillStyle = open ? "#16212c" : "#1f6d8f";
      rrect(ctx, -20, -34, 40, 18, 2); ctx.fill();
      ctx.fillStyle = "#ffb063";
      ctx.fillRect(-6, -14, 12, 5);
      break;
    }
    case "vault": {
      const g = ctx.createLinearGradient(0, -80, 0, 0);
      g.addColorStop(0, "#4a5b86"); g.addColorStop(1, "#202b45");
      ctx.fillStyle = g;
      rrect(ctx, -46, -80, 92, 80, 5); ctx.fill();
      ctx.strokeStyle = "rgba(170,200,255,0.4)"; ctx.lineWidth = 2; ctx.stroke();
      const spin = t * (open ? 0 : 0.6);
      ctx.save(); ctx.translate(0, -42); ctx.rotate(spin);
      ctx.strokeStyle = open ? "#5d6d8a" : "#8be8ff"; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(0, 0, 18, 0, TAU); ctx.stroke();
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * TAU;
        ctx.beginPath(); ctx.moveTo(Math.cos(a) * 10, Math.sin(a) * 10); ctx.lineTo(Math.cos(a) * 22, Math.sin(a) * 22); ctx.stroke();
      }
      ctx.restore();
      if (open) {
        ctx.fillStyle = "rgba(10,16,26,0.85)";
        rrect(ctx, -34, -70, 68, 60, 4); ctx.fill();
      }
      break;
    }
  }
  ctx.restore();
}

export function drawDevice(ctx: CanvasRenderingContext2D, d: Device, t: number) {
  ctx.save();
  ctx.translate(d.x, d.y);
  const on = d.on;
  switch (d.kind) {
    case "resonator": {
      shadow(ctx, 0, 2, 22, 8, 0.24);
      const pulse = on ? 0.85 : 0.3 + Math.sin(t * 2) * 0.12;
      const col = on ? "255,210,140" : "139,232,255";
      const g = ctx.createRadialGradient(0, -40, 3, 0, -40, 90);
      g.addColorStop(0, `rgba(${col},${pulse * 0.45})`); g.addColorStop(1, `rgba(${col},0)`);
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(0, -40, 90, 0, TAU); ctx.fill();
      const sg = ctx.createLinearGradient(-14, 0, 14, -72);
      sg.addColorStop(0, on ? "#9a6a2e" : "#2c6a9e");
      sg.addColorStop(1, on ? "#ffd28a" : "#d4f4ff");
      ctx.fillStyle = sg;
      ctx.beginPath();
      ctx.moveTo(-15, 2); ctx.lineTo(-7, -56); ctx.lineTo(0, -74); ctx.lineTo(7, -56); ctx.lineTo(15, 2);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = `rgba(255,255,255,${pulse})`; ctx.lineWidth = 1.6; ctx.stroke();
      // resonance rings
      if (on) {
        for (let i = 0; i < 2; i++) {
          const rr = ((t * 50 + i * 40) % 80);
          ctx.strokeStyle = `rgba(255,210,140,${0.4 - rr / 200})`;
          ctx.lineWidth = 2;
          ctx.beginPath(); ctx.ellipse(0, 2, rr, rr * 0.35, 0, 0, TAU); ctx.stroke();
        }
      }
      break;
    }
    case "breaker": {
      shadow(ctx, 0, 2, 18, 6, 0.24);
      ctx.fillStyle = "#3b4654";
      rrect(ctx, -18, -52, 36, 52, 3); ctx.fill();
      ctx.strokeStyle = "rgba(165,224,255,0.3)"; ctx.lineWidth = 1.4; ctx.stroke();
      ctx.fillStyle = "#e2b23c";
      ctx.fillRect(-18, -56, 36, 5);
      // lever
      ctx.save(); ctx.translate(0, -26); ctx.rotate(on ? -0.6 : 0.6);
      ctx.fillStyle = on ? "#7fd6a4" : "#e05a5a";
      rrect(ctx, -3.4, -16, 7, 20, 3); ctx.fill();
      ctx.restore();
      ctx.fillStyle = on ? "#7fd6a4" : "#5a2a2a";
      ctx.beginPath(); ctx.arc(0, -46, 3.4, 0, TAU); ctx.fill();
      break;
    }
    case "terminal": {
      shadow(ctx, 0, 2, 22, 8, 0.26);
      ctx.fillStyle = "#2f3b49";
      rrect(ctx, -24, -58, 48, 58, 4); ctx.fill();
      ctx.save(); ctx.translate(0, -58); ctx.rotate(-0.16);
      ctx.fillStyle = "#0e1824";
      rrect(ctx, -22, -30, 44, 32, 3); ctx.fill();
      const glow = on ? 0.75 + Math.sin(t * 4) * 0.2 : 0.12;
      ctx.fillStyle = `rgba(${on ? "127,214,164" : "90,110,130"},${glow})`;
      for (let i = 0; i < 4; i++) ctx.fillRect(-16, -24 + i * 7, (on ? 12 + Math.sin(t * 5 + i) * 10 : 6), 2.6);
      ctx.strokeStyle = on ? "rgba(127,214,164,0.6)" : "rgba(130,150,170,0.3)";
      ctx.lineWidth = 1.4;
      rrect(ctx, -22, -30, 44, 32, 3); ctx.stroke();
      ctx.restore();
      break;
    }
    case "labdoor": {
      shadow(ctx, 0, 4, 46, 14, 0.3);
      ctx.fillStyle = "#39465a";
      rrect(ctx, -48, -86, 96, 88, 4); ctx.fill();
      ctx.strokeStyle = "rgba(20,30,44,0.8)"; ctx.lineWidth = 2; ctx.stroke();
      if (on) {
        // retracted panels
        ctx.fillStyle = "#0b1119";
        rrect(ctx, -34, -78, 68, 78, 3); ctx.fill();
        ctx.fillStyle = "#5e6e80";
        rrect(ctx, -48, -86, 14, 88, 3); ctx.fill();
        rrect(ctx, 34, -86, 14, 88, 3); ctx.fill();
        ctx.fillStyle = "rgba(127,214,164,0.9)";
        ctx.beginPath(); ctx.arc(0, -92, 4, 0, TAU); ctx.fill();
      } else {
        const g = ctx.createLinearGradient(-34, 0, 34, 0);
        g.addColorStop(0, "#76869a"); g.addColorStop(0.5, "#51606f"); g.addColorStop(1, "#76869a");
        ctx.fillStyle = g;
        rrect(ctx, -34, -78, 68, 78, 3); ctx.fill();
        ctx.strokeStyle = "#e2b23c"; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(-30, -58); ctx.lineTo(30, -58); ctx.stroke();
        ctx.setLineDash([7, 6]);
        ctx.beginPath(); ctx.moveTo(-30, -22); ctx.lineTo(30, -22); ctx.stroke();
        ctx.setLineDash([]);
        const blink = 0.4 + Math.max(0, Math.sin(t * 3)) * 0.6;
        ctx.fillStyle = `rgba(232,72,72,${blink})`;
        ctx.beginPath(); ctx.arc(0, -92, 4, 0, TAU); ctx.fill();
      }
      break;
    }
    case "sigilgate": {
      shadow(ctx, 0, 6, 90, 22, 0.34);
      if (!on) {
        const g = ctx.createLinearGradient(0, -150, 0, 0);
        g.addColorStop(0, "#5b6bb0"); g.addColorStop(0.6, "#2b3560"); g.addColorStop(1, "#1a2140");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(-86, 6);
        ctx.lineTo(-74, -120);
        ctx.quadraticCurveTo(0, -176, 74, -120);
        ctx.lineTo(86, 6);
        ctx.closePath(); ctx.fill();
        // two sigil sockets
        for (const sx of [-34, 34]) {
          const pulse = 0.4 + Math.sin(t * 2.4 + sx) * 0.25;
          ctx.fillStyle = `rgba(180,140,255,${pulse})`;
          ctx.beginPath();
          ctx.moveTo(sx, -92); ctx.lineTo(sx + 13, -74); ctx.lineTo(sx, -56); ctx.lineTo(sx - 13, -74);
          ctx.closePath(); ctx.fill();
          ctx.strokeStyle = "rgba(220,200,255,0.7)"; ctx.lineWidth = 1.6; ctx.stroke();
        }
        ctx.strokeStyle = "rgba(180,140,255,0.5)"; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(-60, -30); ctx.lineTo(60, -30); ctx.stroke();
      } else {
        // shattered open
        ctx.fillStyle = "#222c4e";
        ctx.beginPath(); ctx.moveTo(-86, 6); ctx.lineTo(-74, -120); ctx.lineTo(-48, -112); ctx.lineTo(-54, 6); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(86, 6); ctx.lineTo(74, -120); ctx.lineTo(48, -112); ctx.lineTo(54, 6); ctx.closePath(); ctx.fill();
        const gg = ctx.createRadialGradient(0, -60, 10, 0, -60, 120);
        gg.addColorStop(0, "rgba(180,140,255,0.22)"); gg.addColorStop(1, "rgba(180,140,255,0)");
        ctx.fillStyle = gg;
        ctx.beginPath(); ctx.arc(0, -60, 120, 0, TAU); ctx.fill();
      }
      break;
    }
  }
  ctx.restore();
}

// ════════════════════════════ ENEMIES ══════════════════════════════════════

export function drawEnemyAny(ctx: CanvasRenderingContext2D, e: Enemy, t: number) {
  switch (e.kind) {
    case "wolf": drawWolf(ctx, e, t); return;
    case "hare": drawHare(ctx, e, t); return;
    case "bear": drawBear(ctx, e, t); return;
    case "crawler": drawCrawler(ctx, e, t); return;
    case "guardian": drawGuardian(ctx, e, t); return;
  }
}

function hitFlash(ctx: CanvasRenderingContext2D, e: Enemy, r: number, y: number) {
  if (e.hitT <= 0) return;
  ctx.globalCompositeOperation = "lighter";
  ctx.globalAlpha = Math.min(0.6, e.hitT * 2);
  ctx.fillStyle = "#ff6b55";
  ctx.beginPath(); ctx.arc(0, y, r, 0, TAU); ctx.fill();
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
}

function drawHare(ctx: CanvasRenderingContext2D, e: Enemy, t: number) {
  const flip = Math.cos(e.face) < 0 ? -1 : 1;
  if (e.dead) {
    const a = Math.max(0, 1 - e.deadT / 1.6);
    if (a <= 0) return;
    ctx.save(); ctx.globalAlpha = a; ctx.translate(e.x, e.y); ctx.rotate(0.6);
    ctx.fillStyle = "#e6eef7";
    ctx.beginPath(); ctx.ellipse(0, -8, 14, 9, 0, 0, TAU); ctx.fill();
    ctx.restore(); return;
  }
  const hop = e.state === "flee" ? Math.abs(Math.sin(e.walkPh * 3)) * 9 : Math.abs(Math.sin(e.walkPh * 2)) * 3;
  shadow(ctx, e.x, e.y + 1, 12, 4, 0.22);
  ctx.save();
  ctx.translate(e.x, e.y - hop);
  ctx.scale(flip, 1);
  // body
  const g = ctx.createLinearGradient(0, -22, 0, -2);
  g.addColorStop(0, "#ffffff"); g.addColorStop(1, "#c6d6e4");
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.ellipse(0, -11, 14, 9.6, -0.1, 0, TAU); ctx.fill();
  // head
  ctx.beginPath(); ctx.ellipse(12, -17, 7.4, 6.2, 0.2, 0, TAU); ctx.fill();
  // ears
  ctx.fillStyle = "#e8f0f8";
  ctx.save(); ctx.translate(12, -22); ctx.rotate(-0.25 + Math.sin(t * 2) * 0.08);
  ctx.beginPath(); ctx.ellipse(0, -7, 2.6, 8.4, 0, 0, TAU); ctx.fill();
  ctx.rotate(0.45);
  ctx.beginPath(); ctx.ellipse(3, -6, 2.4, 7.6, 0, 0, TAU); ctx.fill();
  ctx.restore();
  // tail + eye
  ctx.fillStyle = "#ffffff";
  ctx.beginPath(); ctx.arc(-13, -12, 4, 0, TAU); ctx.fill();
  ctx.fillStyle = "#2a3648";
  ctx.beginPath(); ctx.arc(15, -18, 1.5, 0, TAU); ctx.fill();
  // legs
  ctx.strokeStyle = "#cdd9e6"; ctx.lineWidth = 3; ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-6, -4); ctx.lineTo(-7, 0);
  ctx.moveTo(6, -4); ctx.lineTo(7, 0);
  ctx.stroke();
  hitFlash(ctx, e, 16, -12);
  ctx.restore();
}

function drawBear(ctx: CanvasRenderingContext2D, e: Enemy, t: number) {
  const flip = Math.cos(e.face) < 0 ? -1 : 1;
  if (e.dead) {
    const a = Math.max(0, 1 - e.deadT / 2.6);
    if (a <= 0) return;
    ctx.save(); ctx.globalAlpha = a * 0.9; ctx.translate(e.x, e.y); ctx.scale(flip, 1); ctx.rotate(0.42);
    bearBody(ctx, t, 0, false, true);
    ctx.restore(); return;
  }
  const rear = e.state === "windup" ? Math.min(1, (0.95 - e.stateT) / 0.95) : 0;
  const slam = e.state === "slam" ? 1 : 0;
  const moving = ["patrol", "chase", "return", "prowl"].includes(e.state);
  shadow(ctx, e.x, e.y + 3, 38, 13, 0.3);
  ctx.save();
  ctx.translate(e.x, e.y - rear * 10 + slam * 6);
  ctx.scale(flip, 1);
  if (e.hitT > 0) ctx.translate(Math.sin(t * 60) * 2, 0);
  bearBody(ctx, t, moving ? e.walkPh : 0, e.state === "windup" || e.state === "slam", false);
  hitFlash(ctx, e, 44, -40);
  ctx.restore();

  if (e.state === "windup") {
    // readable telegraph: the ground where the slam will land
    const hx = e.x + Math.cos(e.face) * 46, hy = e.y + Math.sin(e.face) * 28;
    const p = 1 - e.stateT / 0.95;
    ctx.save();
    ctx.strokeStyle = `rgba(255,110,90,${0.3 + p * 0.5})`;
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.ellipse(hx, hy, 108, 44, 0, 0, TAU); ctx.stroke();
    ctx.fillStyle = `rgba(255,110,90,${0.08 + p * 0.16})`;
    ctx.beginPath(); ctx.ellipse(hx, hy, 108 * p, 44 * p, 0, 0, TAU); ctx.fill();
    ctx.restore();
  }
}

function bearBody(ctx: CanvasRenderingContext2D, t: number, walkPh: number, aggressive: boolean, dead: boolean) {
  const sw = Math.sin(walkPh) * (walkPh ? 1 : 0);
  // legs
  ctx.strokeStyle = "#8b9bb0"; ctx.lineWidth = 11; ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-22, -22); ctx.lineTo(-22 + sw * 5, 0);
  ctx.moveTo(22, -22); ctx.lineTo(22 - sw * 5, 0);
  ctx.stroke();
  ctx.lineWidth = 9;
  ctx.beginPath();
  ctx.moveTo(-6, -22); ctx.lineTo(-6 - sw * 4, -1);
  ctx.moveTo(34, -24); ctx.lineTo(34 + sw * 4, -1);
  ctx.stroke();
  // body mass
  const g = ctx.createLinearGradient(0, -74, 0, -10);
  g.addColorStop(0, "#eef4fa"); g.addColorStop(0.5, "#c3d2e2"); g.addColorStop(1, "#8294aa");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(-40, -24);
  ctx.quadraticCurveTo(-48, -66, -16, -72);
  ctx.lineTo(24, -74);
  ctx.quadraticCurveTo(52, -70, 48, -28);
  ctx.quadraticCurveTo(16, -14, -40, -24);
  ctx.closePath(); ctx.fill();
  // shoulder hump
  ctx.fillStyle = "rgba(255,255,255,0.5)";
  ctx.beginPath(); ctx.ellipse(-6, -68, 22, 11, -0.1, 0, TAU); ctx.fill();
  // frost crust along the spine
  ctx.fillStyle = "rgba(165,224,255,0.65)";
  for (let i = 0; i < 5; i++) {
    const x = -24 + i * 13;
    ctx.beginPath();
    ctx.moveTo(x - 4, -70); ctx.lineTo(x, -84 - (i % 2) * 6); ctx.lineTo(x + 5, -70);
    ctx.closePath(); ctx.fill();
  }
  // head
  ctx.fillStyle = "#b4c4d6";
  ctx.beginPath(); ctx.ellipse(48, -58, 19, 16, 0.12, 0, TAU); ctx.fill();
  ctx.fillStyle = "#95a7bb";
  ctx.beginPath(); ctx.ellipse(66, -52, 12, 9, 0.2, 0, TAU); ctx.fill();
  ctx.fillStyle = "#2a3442";
  ctx.beginPath(); ctx.ellipse(76, -51, 4, 3.2, 0, 0, TAU); ctx.fill();
  // ears
  ctx.fillStyle = "#a3b4c8";
  ctx.beginPath(); ctx.arc(38, -74, 6.4, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.arc(56, -73, 5.8, 0, TAU); ctx.fill();
  // eye
  if (dead) {
    ctx.strokeStyle = "#1a222e"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(52, -62); ctx.lineTo(58, -56); ctx.moveTo(58, -62); ctx.lineTo(52, -56); ctx.stroke();
  } else {
    ctx.fillStyle = aggressive ? "#ff8a70" : "#45586e";
    if (aggressive) { ctx.shadowColor = "#ff8a70"; ctx.shadowBlur = 10; }
    ctx.beginPath(); ctx.arc(56, -60, 2.6, 0, TAU); ctx.fill();
    ctx.shadowBlur = 0;
  }
  // claws
  ctx.strokeStyle = "#e8f1f8"; ctx.lineWidth = 2;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath(); ctx.moveTo(36 + i * 4, -2); ctx.lineTo(39 + i * 4, 3); ctx.stroke();
  }
  void t;
}

function drawCrawler(ctx: CanvasRenderingContext2D, e: Enemy, t: number) {
  const flip = Math.cos(e.face) < 0 ? -1 : 1;
  if (e.dead) {
    const a = Math.max(0, 1 - e.deadT / 2.2);
    if (a <= 0) return;
    ctx.save(); ctx.globalAlpha = a * 0.85; ctx.translate(e.x, e.y); ctx.scale(flip, 1); ctx.rotate(0.5);
    crawlerBody(ctx, t, 0, false, true);
    ctx.restore(); return;
  }
  if (e.state === "hidden") {
    // only a faint disturbance in the ice betrays it
    const pulse = 0.18 + Math.sin(t * 2 + e.x) * 0.07;
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.strokeStyle = `rgba(139,232,255,${pulse})`;
    ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.ellipse(0, 0, 22, 8, 0, 0, TAU); ctx.stroke();
    ctx.fillStyle = `rgba(139,232,255,${pulse * 0.5})`;
    ctx.beginPath(); ctx.ellipse(0, 0, 14, 5, 0, 0, TAU); ctx.fill();
    ctx.restore();
    return;
  }
  const emerge = e.state === "emerge" ? 1 - e.stateT / 0.55 : 1;
  const moving = ["chase", "patrol", "return", "lunge"].includes(e.state);
  shadow(ctx, e.x, e.y + 1, 26, 8, 0.26 * emerge);
  ctx.save();
  ctx.translate(e.x, e.y + (1 - emerge) * 24);
  ctx.scale(flip, 1);
  ctx.globalAlpha = 0.35 + emerge * 0.65;
  if (e.hitT > 0) ctx.translate(Math.sin(t * 70) * 2.4, 0);
  crawlerBody(ctx, t, moving ? e.walkPh : 0, e.state === "windup" || e.state === "lunge", false);
  hitFlash(ctx, e, 28, -16);
  ctx.restore();

  if (e.state === "windup") {
    ctx.save();
    const p = 1 - e.stateT / 0.45;
    ctx.strokeStyle = `rgba(255,110,90,${0.3 + p * 0.5})`;
    ctx.lineWidth = 2.2;
    ctx.beginPath(); ctx.arc(e.x, e.y - 12, 34 - p * 12, 0, TAU); ctx.stroke();
    ctx.restore();
  }
}

function crawlerBody(ctx: CanvasRenderingContext2D, t: number, walkPh: number, aggressive: boolean, dead: boolean) {
  // segmented legs
  ctx.strokeStyle = "#6f9aa8"; ctx.lineWidth = 3.4; ctx.lineCap = "round";
  for (let i = 0; i < 3; i++) {
    const bx = -14 + i * 13;
    const sw = Math.sin(walkPh * 2 + i * 1.7) * 6;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(bx, -14);
      ctx.lineTo(bx + sw * 0.4, -22 + side * 2);
      ctx.lineTo(bx + sw, side > 0 ? -2 : -4);
      ctx.stroke();
    }
  }
  // low armoured body
  const g = ctx.createLinearGradient(0, -30, 0, -4);
  g.addColorStop(0, "#d2f0ea"); g.addColorStop(0.5, "#7fb6bd"); g.addColorStop(1, "#3d6b78");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(-24, -10);
  ctx.quadraticCurveTo(-26, -26, -6, -28);
  ctx.lineTo(16, -27);
  ctx.quadraticCurveTo(32, -24, 30, -10);
  ctx.quadraticCurveTo(6, -4, -24, -10);
  ctx.closePath(); ctx.fill();
  // chitin plates
  ctx.fillStyle = "rgba(240,255,255,0.5)";
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.ellipse(-12 + i * 13, -24, 7, 3.4, 0, 0, TAU);
    ctx.fill();
  }
  // ice spines
  ctx.fillStyle = "rgba(165,224,255,0.9)";
  for (let i = 0; i < 4; i++) {
    const x = -16 + i * 11;
    ctx.beginPath();
    ctx.moveTo(x - 3, -27); ctx.lineTo(x + 1, -40 - (i % 2) * 5); ctx.lineTo(x + 4, -27);
    ctx.closePath(); ctx.fill();
  }
  // head & mandibles
  ctx.fillStyle = "#5f93a0";
  ctx.beginPath(); ctx.ellipse(32, -18, 11, 9, 0, 0, TAU); ctx.fill();
  ctx.strokeStyle = "#cdebf2"; ctx.lineWidth = 2.6;
  const bite = aggressive ? Math.sin(t * 22) * 3 : 0;
  ctx.beginPath();
  ctx.moveTo(40, -22); ctx.lineTo(50, -18 - bite);
  ctx.moveTo(40, -14); ctx.lineTo(50, -11 + bite);
  ctx.stroke();
  // eyes
  if (!dead) {
    ctx.fillStyle = aggressive ? "#ff9d6b" : "#b48cff";
    ctx.shadowColor = aggressive ? "#ff9d6b" : "#b48cff";
    ctx.shadowBlur = 8;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath(); ctx.arc(33 + (i % 2) * 5, -22 + i * 3.6, 1.6, 0, TAU); ctx.fill();
    }
    ctx.shadowBlur = 0;
  }
}

function drawGuardian(ctx: CanvasRenderingContext2D, e: Enemy, t: number) {
  const flip = Math.cos(e.face) < 0 ? -1 : 1;
  if (e.dead) {
    const a = Math.max(0, 1 - e.deadT / 4);
    if (a <= 0) return;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.translate(e.x, e.y);
    ctx.scale(flip, 1);
    // collapsing into rubble
    ctx.translate(0, (1 - a) * 26);
    ctx.rotate((1 - a) * 0.3);
    guardianBody(ctx, t, e, true);
    ctx.restore();
    return;
  }
  const vuln = e.state === "stagger";
  const moving = e.state === "chase" || e.state === "charge";
  shadow(ctx, e.x, e.y + 4, 56, 18, 0.36);
  ctx.save();
  ctx.translate(e.x, e.y + (e.state === "slam" ? 8 : 0));
  ctx.scale(flip, 1);
  if (e.hitT > 0) ctx.translate(Math.sin(t * 60) * 3, 0);
  if (vuln) {
    // exposed core glows and the frame sags
    ctx.translate(0, 6);
  }
  guardianBody(ctx, moving ? e.walkPh : t * 0.4, e, false);
  ctx.restore();

  // attack telegraphs
  if (e.state === "windup") {
    const p = 1 - e.stateT / (e.atkIdx === 0 ? 1.0 : e.atkIdx === 1 ? 0.85 : 0.9);
    ctx.save();
    if (e.atkIdx === 0) {
      ctx.strokeStyle = `rgba(255,110,90,${0.3 + p * 0.5})`;
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.ellipse(e.x, e.y, 190, 76, 0, 0, TAU); ctx.stroke();
      ctx.fillStyle = `rgba(255,110,90,${0.07 + p * 0.14})`;
      ctx.beginPath(); ctx.ellipse(e.x, e.y, 190 * p, 76 * p, 0, 0, TAU); ctx.fill();
    } else if (e.atkIdx === 2) {
      const a = e.face;
      ctx.strokeStyle = `rgba(180,140,255,${0.3 + p * 0.5})`;
      ctx.lineWidth = 5;
      ctx.setLineDash([16, 12]);
      ctx.beginPath();
      ctx.moveTo(e.x, e.y - 10);
      ctx.lineTo(e.x + Math.cos(a) * 420, e.y - 10 + Math.sin(a) * 420);
      ctx.stroke();
      ctx.setLineDash([]);
    } else {
      ctx.strokeStyle = `rgba(139,232,255,${0.3 + p * 0.45})`;
      ctx.lineWidth = 3;
      for (let i = -2; i <= 2; i++) {
        const a = Math.atan2(0, 1) + e.face + i * 0.22;
        ctx.beginPath();
        ctx.moveTo(e.x + Math.cos(a) * 60, e.y - 24 + Math.sin(a) * 40);
        ctx.lineTo(e.x + Math.cos(a) * 190, e.y - 24 + Math.sin(a) * 130);
        ctx.stroke();
      }
    }
    ctx.restore();
  }
}

function guardianBody(ctx: CanvasRenderingContext2D, ph: number, e: Enemy, dead: boolean) {
  const vuln = e.state === "stagger";
  const sw = Math.sin(ph) * 1;
  // heavy legs
  ctx.strokeStyle = "#3a4673"; ctx.lineWidth = 15; ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-20, -56); ctx.lineTo(-24 + sw * 8, 0);
  ctx.moveTo(22, -56); ctx.lineTo(26 - sw * 8, 0);
  ctx.stroke();
  // torso — layered black-ice armour
  const g = ctx.createLinearGradient(0, -150, 0, -40);
  g.addColorStop(0, "#6b7cc4"); g.addColorStop(0.5, "#39477d"); g.addColorStop(1, "#1f2748");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(-44, -44);
  ctx.quadraticCurveTo(-54, -120, -26, -142);
  ctx.lineTo(26, -142);
  ctx.quadraticCurveTo(54, -120, 44, -44);
  ctx.quadraticCurveTo(0, -30, -44, -44);
  ctx.closePath(); ctx.fill();
  // shoulder pauldrons
  ctx.fillStyle = "#4a5a9a";
  ctx.beginPath(); ctx.ellipse(-40, -122, 20, 15, -0.4, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.ellipse(40, -122, 20, 15, 0.4, 0, TAU); ctx.fill();
  // arms
  ctx.strokeStyle = "#45539a"; ctx.lineWidth = 13;
  const swing = e.state === "slam" ? 1.1 : e.state === "windup" && e.atkIdx === 0 ? -0.8 : Math.sin(ph) * 0.2;
  ctx.save();
  ctx.translate(42, -118); ctx.rotate(swing);
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(10, 54); ctx.stroke();
  // ice gauntlet
  ctx.fillStyle = "#9fc8f0";
  ctx.beginPath();
  ctx.moveTo(4, 50); ctx.lineTo(24, 66); ctx.lineTo(10, 76); ctx.lineTo(0, 60);
  ctx.closePath(); ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.translate(-42, -118); ctx.rotate(-swing * 0.5);
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-8, 52); ctx.stroke();
  ctx.restore();

  // crystal spines on the back
  ctx.fillStyle = "rgba(180,140,255,0.8)";
  for (let i = 0; i < 4; i++) {
    const x = -30 + i * 18;
    ctx.beginPath();
    ctx.moveTo(x - 6, -140); ctx.lineTo(x, -172 - (i % 2) * 14); ctx.lineTo(x + 7, -140);
    ctx.closePath(); ctx.fill();
  }

  // ── the core: armoured shut, blazing when staggered ──
  const corePulse = vuln ? 0.9 + Math.sin(performance.now() / 90) * 0.1 : 0.3;
  const cg = ctx.createRadialGradient(0, -96, 2, 0, -96, vuln ? 54 : 26);
  cg.addColorStop(0, vuln ? `rgba(255,220,150,${corePulse})` : `rgba(120,160,255,${corePulse})`);
  cg.addColorStop(1, "rgba(120,160,255,0)");
  ctx.fillStyle = cg;
  ctx.beginPath(); ctx.arc(0, -96, vuln ? 54 : 26, 0, TAU); ctx.fill();
  ctx.fillStyle = vuln ? "#ffe3a8" : "#6f86d8";
  ctx.beginPath();
  ctx.moveTo(0, -112); ctx.lineTo(13, -96); ctx.lineTo(0, -80); ctx.lineTo(-13, -96);
  ctx.closePath(); ctx.fill();
  if (!vuln && !dead) {
    // armour shutters over the core
    ctx.fillStyle = "#2b3663";
    ctx.beginPath();
    ctx.moveTo(-16, -100); ctx.lineTo(16, -104); ctx.lineTo(16, -96); ctx.lineTo(-16, -92);
    ctx.closePath(); ctx.fill();
  }

  // head
  ctx.fillStyle = "#44528c";
  ctx.beginPath();
  ctx.moveTo(-18, -142); ctx.lineTo(0, -176); ctx.lineTo(18, -142);
  ctx.closePath(); ctx.fill();
  if (!dead) {
    ctx.fillStyle = vuln ? "#ffd28a" : "#b48cff";
    ctx.shadowColor = vuln ? "#ffd28a" : "#b48cff";
    ctx.shadowBlur = 14;
    ctx.fillRect(-10, -158, 20, 4);
    ctx.shadowBlur = 0;
  }
}

// ════════════════════════════ PROJECTILES ══════════════════════════════════

export function drawProjectile(ctx: CanvasRenderingContext2D, pr: Projectile) {
  const a = Math.atan2(pr.vy, pr.vx);
  ctx.save();
  ctx.translate(pr.x, pr.y);
  ctx.rotate(a);
  const g = ctx.createLinearGradient(-16, 0, 12, 0);
  g.addColorStop(0, "rgba(139,232,255,0)");
  g.addColorStop(1, "rgba(220,250,255,0.95)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(14, 0); ctx.lineTo(-10, -5.5); ctx.lineTo(-16, 0); ctx.lineTo(-10, 5.5);
  ctx.closePath(); ctx.fill();
  ctx.shadowColor = "#8be8ff"; ctx.shadowBlur = 12;
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.beginPath(); ctx.arc(8, 0, 2.6, 0, TAU); ctx.fill();
  ctx.restore();
}

// ════════════════════════════ HAZARD OVERLAYS ══════════════════════════════

export function drawHazard(
  ctx: CanvasRenderingContext2D,
  h: { kind: string; x: number; y: number; r: number; period?: number; phase?: number },
  t: number,
  detail = true
) {
  ctx.save();
  ctx.translate(h.x, h.y);
  const cycle = h.period ? ((t + (h.phase ?? 0)) % h.period) / h.period : 0;
  const active = h.period ? cycle > 0.72 : false;
  switch (h.kind) {
    case "thinice": {
      ctx.strokeStyle = "rgba(60,130,190,0.5)";
      ctx.lineWidth = 2;
      ctx.setLineDash([10, 8]);
      ctx.beginPath(); ctx.ellipse(0, 0, h.r, h.r * 0.42, 0, 0, TAU); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "rgba(30,90,150,0.18)";
      ctx.beginPath(); ctx.ellipse(0, 0, h.r, h.r * 0.42, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.3)";
      ctx.lineWidth = 1.2;
      for (let i = 0; detail && i < 5; i++) {
        const a = (i / 5) * TAU;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(a) * h.r * 0.8, Math.sin(a) * h.r * 0.34);
        ctx.stroke();
      }
      break;
    }
    case "steam": {
      const g = ctx.createRadialGradient(0, 0, 4, 0, 0, h.r);
      g.addColorStop(0, `rgba(226,240,252,${active ? 0.45 : 0.12})`);
      g.addColorStop(1, "rgba(226,240,252,0)");
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.ellipse(0, 0, h.r, h.r * 0.5, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = active ? "rgba(255,160,120,0.6)" : "rgba(160,200,230,0.3)";
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(0, 0, h.r * 0.6, h.r * 0.28, 0, 0, TAU); ctx.stroke();
      break;
    }
    case "shock": {
      ctx.strokeStyle = active ? "rgba(140,220,255,0.85)" : "rgba(226,178,60,0.4)";
      ctx.lineWidth = active ? 2.6 : 2;
      ctx.setLineDash(active ? [] : [8, 7]);
      ctx.beginPath(); ctx.ellipse(0, 0, h.r, h.r * 0.44, 0, 0, TAU); ctx.stroke();
      ctx.setLineDash([]);
      if (active && detail) {
        ctx.strokeStyle = "rgba(200,240,255,0.9)";
        ctx.lineWidth = 2;
        for (let i = 0; i < 4; i++) {
          const a = Math.random() * TAU;
          ctx.beginPath();
          ctx.moveTo(0, 0);
          let x = 0, y = 0;
          for (let s = 0; s < 3; s++) {
            x += Math.cos(a) * h.r * 0.3 + (Math.random() - 0.5) * 20;
            y += Math.sin(a) * h.r * 0.14 + (Math.random() - 0.5) * 12;
            ctx.lineTo(x, y);
          }
          ctx.stroke();
        }
      }
      break;
    }
    case "spike": {
      const p = Math.max(0, (cycle - 0.6) / 0.4);
      ctx.strokeStyle = `rgba(165,224,255,${0.25 + p * 0.4})`;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(0, 0, h.r, h.r * 0.4, 0, 0, TAU); ctx.stroke();
      if (p > 0) {
        for (let i = 0; i < 7; i++) {
          const a = (i / 7) * TAU;
          const sx = Math.cos(a) * h.r * 0.6, sy = Math.sin(a) * h.r * 0.24;
          const hh = 40 * p;
          const g = ctx.createLinearGradient(sx, sy, sx, sy - hh);
          g.addColorStop(0, "rgba(120,190,240,0.9)");
          g.addColorStop(1, "rgba(240,252,255,0.95)");
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.moveTo(sx - 7, sy); ctx.lineTo(sx, sy - hh); ctx.lineTo(sx + 7, sy);
          ctx.closePath(); ctx.fill();
        }
      }
      break;
    }
    case "cold": {
      const g = ctx.createRadialGradient(0, 0, 10, 0, 0, h.r);
      g.addColorStop(0, "rgba(120,180,255,0.14)");
      g.addColorStop(1, "rgba(120,180,255,0)");
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(0, 0, h.r, 0, TAU); ctx.fill();
      ctx.strokeStyle = "rgba(150,200,255,0.2)";
      ctx.setLineDash([12, 10]);
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(0, 0, h.r * 0.95, h.r * 0.42, 0, 0, TAU); ctx.stroke();
      ctx.setLineDash([]);
      break;
    }
  }
  ctx.restore();
}

// ════════════════════════ DISCOVERY MARKERS (Phase 4.1) ════════════════════

/** Hand-placed point of interest. Undiscovered sites only shimmer faintly when
 *  the player is near, so exploration still requires actually looking around. */
export function drawDiscovery(
  ctx: CanvasRenderingContext2D,
  d: { x: number; y: number; kind: string; found: boolean },
  t: number,
  hintStrength: number,
) {
  if (!d.found && hintStrength <= 0) return;
  ctx.save();
  ctx.translate(d.x, d.y);

  if (!d.found) {
    // subtle "something is here" glimmer — no icon, no label
    const a = hintStrength * (0.3 + Math.sin(t * 2.4) * 0.14);
    const g = ctx.createRadialGradient(0, -18, 2, 0, -18, 60);
    g.addColorStop(0, `rgba(226,240,252,${a})`);
    g.addColorStop(1, "rgba(226,240,252,0)");
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, -18, 60, 0, TAU); ctx.fill();
    for (let i = 0; i < 3; i++) {
      const ang = t * 0.8 + i * 2.1;
      const rx = Math.cos(ang) * 16, ry = Math.sin(ang) * 7;
      ctx.fillStyle = `rgba(255,232,190,${a * 0.9})`;
      ctx.beginPath(); ctx.arc(rx, -22 + ry, 1.6, 0, TAU); ctx.fill();
    }
    ctx.restore();
    return;
  }

  // ── recorded site: a small stone cairn with a marker cloth ──
  shadow(ctx, 0, 2, 20, 7, 0.26);
  const stone = (x: number, y: number, w: number, h: number, shade: number) => {
    const g = ctx.createLinearGradient(x - w / 2, y - h, x + w / 2, y);
    g.addColorStop(0, `rgb(${150 + shade},${166 + shade},${186 + shade})`);
    g.addColorStop(1, `rgb(${86 + shade},${100 + shade},${120 + shade})`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(x, y - h / 2, w / 2, h / 2, 0, 0, TAU);
    ctx.fill();
  };
  stone(0, 0, 26, 12, 0);
  stone(1, -9, 20, 10, 10);
  stone(-1, -17, 14, 9, 20);

  // marker pole + pennant
  ctx.strokeStyle = "#5c452c";
  ctx.lineWidth = 2.6;
  ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(2, -20); ctx.lineTo(4, -54); ctx.stroke();
  const sway = Math.sin(t * 1.7) * 2.4;
  const pg = ctx.createLinearGradient(4, -54, 22, -40);
  pg.addColorStop(0, "#ffb063");
  pg.addColorStop(1, "#d4641a");
  ctx.fillStyle = pg;
  ctx.beginPath();
  ctx.moveTo(4, -54);
  ctx.lineTo(22 + sway, -49);
  ctx.lineTo(16 + sway, -43);
  ctx.lineTo(22 + sway, -37);
  ctx.lineTo(4, -38);
  ctx.closePath();
  ctx.fill();

  // soft confirmation glow so recorded sites read at a glance
  const gl = 0.16 + Math.sin(t * 1.3) * 0.05;
  const g2 = ctx.createRadialGradient(0, -24, 3, 0, -24, 52);
  g2.addColorStop(0, `rgba(255,176,99,${gl})`);
  g2.addColorStop(1, "rgba(255,176,99,0)");
  ctx.fillStyle = g2;
  ctx.beginPath(); ctx.arc(0, -24, 52, 0, TAU); ctx.fill();
  ctx.restore();
}
