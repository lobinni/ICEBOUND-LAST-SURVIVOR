// ── ICEBOUND: deterministic world generation + pre-rendered terrain ─────────

import { NODE_INFO, WORLD } from "./config";
import type { NodeKind, Struct, WNode } from "./types";

export const WORLD_SEED = 1337;

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const riverCurve = (x: number) => WORLD.riverY + Math.sin(x * 0.004) * 34;

export function generateWorld(): { nodes: WNode[]; structs: Struct[] } {
  const rng = mulberry32(WORLD_SEED);
  const nodes: WNode[] = [];
  const structs: Struct[] = [];

  const baseX = 0, baseY = -60;
  const farFrom = (x: number, y: number, px: number, py: number, d: number) => {
    const dx = x - px, dy = y - py;
    return dx * dx + dy * dy > d * d;
  };
  const okSpot = (x: number, y: number, clearBase = 330, clearRiver = 0) => {
    if (x < WORLD.minX + 110 || x > WORLD.maxX - 110 || y < WORLD.minY + 110 || y > WORLD.maxY - 110) return false;
    if (!farFrom(x, y, baseX, baseY, clearBase)) return false;
    if (!farFrom(x, y, WORLD.wreck.x, WORLD.wreck.y, 300)) return false;
    if (!farFrom(x, y, WORLD.pod.x, WORLD.pod.y, 150)) return false;
    for (const d of WORLD.dens) if (!farFrom(x, y, d.x, d.y, 170)) return false;
    if (clearRiver > 0 && Math.abs(y - riverCurve(x)) < WORLD.riverH / 2 + clearRiver) return false;
    return true;
  };

  const tooClose = (x: number, y: number, min: number) =>
    nodes.some(n => { const dx = n.x - x, dy = n.y - y; return dx * dx + dy * dy < min * min; });

  let idc = 0;
  const addNode = (kind: NodeKind, x: number, y: number, solid = 0) => {
    const info = NODE_INFO[kind];
    nodes.push({
      id: `${kind}_${idc++}`, kind, x, y,
      amount: info.strikes, max: info.strikes, respawnAt: 0,
      solid, seed: Math.floor(rng() * 1e6), shake: 0,
    });
  };

  // ── pine forest clusters ──
  const clusters: { x: number; y: number }[] = [];
  for (let i = 0; i < 26 && clusters.length < 15; i++) {
    const x = WORLD.minX + 140 + rng() * (WORLD.maxX - WORLD.minX - 280);
    const y = WORLD.minY + 140 + rng() * (WORLD.maxY - WORLD.minY - 280);
    if (!okSpot(x, y, 430, 70)) continue;
    if (clusters.some(c => !farFrom(x, y, c.x, c.y, 340))) continue;
    clusters.push({ x, y });
  }
  for (const c of clusters) {
    const n = 3 + Math.floor(rng() * 5);
    for (let i = 0; i < n; i++) {
      const a = rng() * Math.PI * 2, r = 24 + rng() * 120;
      const x = c.x + Math.cos(a) * r, y = c.y + Math.sin(a) * r * 0.8;
      if (!okSpot(x, y, 300, 40)) continue;
      if (tooClose(x, y, 52)) continue;
      addNode("tree", x, y, 16);
    }
  }

  // a few pines scattered near base (but not blocking)
  const baseTrees: [number, number][] = [[-360, -320], [330, -330], [-420, 140], [420, 170], [-150, -420], [250, 320]];
  for (const [x, y] of baseTrees) addNode("tree", x, y, 16);

  // ── branches / stone / berries / herbs ──
  const scatter = (kind: NodeKind, count: number, opts?: { nearRiver?: number; minDist?: number; clearBase?: number; nearTrees?: boolean }) => {
    let placed = 0, tries = 0;
    while (placed < count && tries < count * 40) {
      tries++;
      let x = WORLD.minX + 120 + rng() * (WORLD.maxX - WORLD.minX - 240);
      let y = WORLD.minY + 120 + rng() * (WORLD.maxY - WORLD.minY - 240);
      if (opts?.nearRiver !== undefined) y = riverCurve(x) + (rng() - 0.5) * opts.nearRiver * 2;
      if (!okSpot(x, y, opts?.clearBase ?? 250, 24)) continue;
      if (tooClose(x, y, opts?.minDist ?? 70)) continue;
      if (opts?.nearTrees && !nodes.some(n => n.kind === "tree" && !farFrom(x, y, n.x, n.y, 150))) continue;
      addNode(kind, x, y, kind === "stone" ? 20 : 0);
      placed++;
    }
  };
  scatter("branch", 26, { clearBase: 200, minDist: 80 });
  scatter("stone", 22, { minDist: 90 });
  scatter("ice", 16, { nearRiver: 74, minDist: 90, clearBase: 200 });
  scatter("berry", 13, { nearTrees: true, minDist: 110 });
  scatter("herb", 11, { minDist: 130 });

  // starter branch & stone near spawn for a gentle opening
  addNode("branch", -140, 470); addNode("branch", 90, 520); addNode("branch", -30, 350);
  addNode("stone", 150, 430); addNode("stone", -240, 330);
  addNode("berry", 260, 610); addNode("herb", -330, 560);

  // Deliberate early ice-runs: visible shore deposits on the way north from camp.
  // These do not replace the richer river field further north-east.
  addNode("ice", -150, riverCurve(-150) + 58);
  addNode("ice", -30, riverCurve(-30) - 52);
  addNode("ice", 110, riverCurve(110) + 62);
  addNode("ice", 300, riverCurve(300) - 58);
  addNode("ice", 430, riverCurve(430) + 50);

  // ── structures ──
  structs.push(
    { id: "shelter", kind: "shelter", x: WORLD.shelter.x, y: WORLD.shelter.y, r: 110, solid: 62, seed: 1 },
    { id: "firepit", kind: "firepit", x: WORLD.firepit.x, y: WORLD.firepit.y, r: 40, solid: 30, seed: 2 },
    { id: "storage", kind: "storage", x: WORLD.storage.x, y: WORLD.storage.y, r: 46, solid: 30, seed: 3 },
    { id: "station", kind: "station", x: WORLD.station.x, y: WORLD.station.y, r: 46, solid: 34, seed: 4 },
    { id: "pod", kind: "pod", x: WORLD.pod.x, y: WORLD.pod.y, r: 58, solid: 34, seed: 5 },
    { id: "wreck", kind: "wreck", x: WORLD.wreck.x, y: WORLD.wreck.y, r: 150, solid: 60, seed: 6 },
    ...WORLD.dens.map((d, i) => ({ id: `den_${i}`, kind: "den" as const, x: d.x, y: d.y, r: 70, solid: 36, seed: 10 + i })),
  );

  return { nodes, structs };
}

// ── pre-render the painted terrain once ──────────────────────────────────────
const GSCALE = 0.42;

export function renderGround(): HTMLCanvasElement {
  const w = Math.ceil((WORLD.maxX - WORLD.minX) * GSCALE);
  const h = Math.ceil((WORLD.maxY - WORLD.minY) * GSCALE);
  const cv = document.createElement("canvas");
  cv.width = w; cv.height = h;
  const ctx = cv.getContext("2d")!;
  const rng = mulberry32(77);
  const X = (x: number) => (x - WORLD.minX) * GSCALE;
  const Y = (y: number) => (y - WORLD.minY) * GSCALE;

  // base snow gradient — cooler up north (top), softer near base
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, "#b9c9dc");
  g.addColorStop(0.42, "#cddbea");
  g.addColorStop(1, "#dbe7f2");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  // large soft drifts
  for (let i = 0; i < 240; i++) {
    const x = rng() * w, y = rng() * h, r = (40 + rng() * 150) * GSCALE * 2;
    const rg = ctx.createRadialGradient(x, y, 0, x, y, r);
    const light = rng() > 0.45;
    rg.addColorStop(0, light ? "rgba(244,250,255,0.16)" : "rgba(140,165,195,0.13)");
    rg.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = rg;
    ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
  }

  // wind streaks
  ctx.strokeStyle = "rgba(255,255,255,0.10)";
  for (let i = 0; i < 130; i++) {
    const x = rng() * w, y = rng() * h, len = 20 + rng() * 90;
    ctx.lineWidth = (1 + rng() * 2.4) * GSCALE * 2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + len * 0.5, y - 4 - rng() * 8, x + len, y - 2);
    ctx.stroke();
  }

  // ── frozen river ──
  const yTop = (x: number) => Y(riverCurve((x / GSCALE) + WORLD.minX) - WORLD.riverH / 2);
  const yBot = (x: number) => Y(riverCurve((x / GSCALE) + WORLD.minX) + WORLD.riverH / 2);
  ctx.beginPath();
  ctx.moveTo(0, yTop(0));
  for (let px = 0; px <= w; px += 14) ctx.lineTo(px, yTop(px));
  for (let px = w; px >= 0; px -= 14) ctx.lineTo(px, yBot(px));
  ctx.closePath();
  const rg2 = ctx.createLinearGradient(0, Y(WORLD.riverY - 140), 0, Y(WORLD.riverY + 140));
  rg2.addColorStop(0, "#8fd4f2");
  rg2.addColorStop(0.5, "#bdeafb");
  rg2.addColorStop(1, "#7ec8ef");
  ctx.fillStyle = rg2;
  ctx.fill();
  // depth shading
  ctx.fillStyle = "rgba(30,127,180,0.18)";
  ctx.fill();
  // ice cracks
  ctx.strokeStyle = "rgba(255,255,255,0.5)";
  for (let i = 0; i < 46; i++) {
    let x = rng() * w;
    const yc = riverCurve((x / GSCALE) + WORLD.minX);
    let y = Y(yc + (rng() - 0.5) * WORLD.riverH * 0.8);
    ctx.lineWidth = 1 + rng() * 1.4;
    ctx.beginPath(); ctx.moveTo(x, y);
    const segs = 2 + Math.floor(rng() * 3);
    for (let s2 = 0; s2 < segs; s2++) { x += (rng() - 0.5) * 46 * GSCALE * 2; y += (rng() - 0.5) * 30 * GSCALE * 2; ctx.lineTo(x, y); }
    ctx.stroke();
  }
  // snow banks
  for (let i = 0; i < 130; i++) {
    const x = rng() * w;
    const wx = (x / GSCALE) + WORLD.minX;
    const edge = rng() > 0.5 ? Y(riverCurve(wx) - WORLD.riverH / 2) : Y(riverCurve(wx) + WORLD.riverH / 2);
    const y = edge + (rng() - 0.5) * 8;
    const r = (10 + rng() * 26) * GSCALE * 1.6;
    const rg3 = ctx.createRadialGradient(x, y, 0, x, y, r);
    rg3.addColorStop(0, "rgba(238,246,252,0.85)");
    rg3.addColorStop(1, "rgba(238,246,252,0)");
    ctx.fillStyle = rg3;
    ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
  }

  // packed trail from pod to outpost
  ctx.strokeStyle = "rgba(120,145,175,0.14)";
  ctx.lineCap = "round";
  ctx.lineWidth = 46 * GSCALE;
  ctx.beginPath();
  ctx.moveTo(X(WORLD.pod.x), Y(WORLD.pod.y - 30));
  ctx.quadraticCurveTo(X(-320), Y(300), X(WORLD.shelter.x - 10), Y(WORLD.shelter.y + 120));
  ctx.stroke();

  // sparkle flecks
  for (let i = 0; i < 420; i++) {
    const x = rng() * w, y = rng() * h;
    ctx.fillStyle = rng() > 0.5 ? "rgba(255,255,255,0.5)" : "rgba(165,224,255,0.4)";
    ctx.fillRect(x, y, 1.2, 1.2);
  }

  // outpost clearing — slightly packed, warmer snow
  const cx = X(0), cy = Y(-60);
  const rg4 = ctx.createRadialGradient(cx, cy, 0, cx, cy, 300 * GSCALE);
  rg4.addColorStop(0, "rgba(214,224,232,0.5)");
  rg4.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = rg4;
  ctx.beginPath(); ctx.arc(cx, cy, 300 * GSCALE, 0, 7); ctx.fill();

  // edge vignette (world boundary readability)
  const vg = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.32, w / 2, h / 2, Math.max(w, h) * 0.62);
  vg.addColorStop(0, "rgba(0,0,0,0)");
  vg.addColorStop(1, "rgba(24,41,63,0.5)");
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, w, h);

  return cv;
}
