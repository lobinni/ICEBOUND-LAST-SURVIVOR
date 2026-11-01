// ── ICEBOUND: procedural 2.5D sprite art (Canvas vector painting) ────────────

import type { Enemy, GameState, Pickup, Player, Struct, WNode } from "./types";

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

let SHADOWS = true;
/** Engine toggles this with the quality tier (shadows are a per-sprite cost). */
export function setShadowQuality(on: boolean) { SHADOWS = on; }

export function shadow(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, a = 0.22) {
  if (!SHADOWS) return;
  ctx.save();
  ctx.fillStyle = `rgba(20,35,55,${a})`;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, TAU);
  ctx.fill();
  ctx.restore();
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

// ════════════════════════════ TREES & NODES ════════════════════════════════

export function drawNode(ctx: CanvasRenderingContext2D, n: WNode, t: number) {
  ctx.save();
  ctx.translate(n.x, n.y);
  if (n.shake > 0) ctx.rotate(Math.sin(n.shake * 55) * 0.05 * n.shake);
  const rngv = seeded(n.seed);
  switch (n.kind) {
    case "tree": drawTree(ctx, rngv, n.amount <= 0, t); break;
    case "branch": drawBranch(ctx, rngv, n.amount <= 0); break;
    case "stone": drawStones(ctx, rngv, n.amount <= 0); break;
    case "ice": drawIceShard(ctx, rngv, n.amount <= 0); break;
    case "berry": drawBerry(ctx, rngv, n.amount, t); break;
    case "herb": drawHerb(ctx, rngv, n.amount, t); break;
  }
  ctx.restore();
}

function drawTree(ctx: CanvasRenderingContext2D, rng: () => number, depleted: boolean, _t: number) {
  const sw = 0.9 + rng() * 0.35;
  const hgt = (86 + rng() * 30) * sw;
  shadow(ctx, 0, 0, 26 * sw, 9 * sw, 0.24);
  if (depleted) {
    // stump
    ctx.fillStyle = "#4d3b2c";
    rrect(ctx, -6 * sw, -13 * sw, 12 * sw, 14 * sw, 3);
    ctx.fill();
    ctx.fillStyle = "#6b543f";
    ctx.beginPath(); ctx.ellipse(0, -13 * sw, 6 * sw, 3.4 * sw, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = "#dfe9f2";
    ctx.beginPath(); ctx.ellipse(0, -14.4 * sw, 5.4 * sw, 2.6 * sw, 0, 0, TAU); ctx.fill();
    return;
  }
  // trunk
  ctx.fillStyle = "#3d2f24";
  rrect(ctx, -4 * sw, -14 * sw, 8 * sw, 15 * sw, 2);
  ctx.fill();
  const sway = Math.sin(_t * 0.9 + hgt) * 1.4;
  ctx.translate(sway * 0.4, 0);
  // layered boughs
  const layers = 4;
  for (let i = 0; i < layers; i++) {
    const p = i / layers;
    const w = (44 - i * 8.5) * sw;
    const y0 = -12 * sw - i * (hgt / layers) * 0.82;
    const hh = (hgt / layers) * 1.28;
    const g = ctx.createLinearGradient(-w / 2, y0, w / 2, y0);
    g.addColorStop(0, "#1d3a33");
    g.addColorStop(0.45, "#2a5546");
    g.addColorStop(1, "#12251f");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-w / 2, y0);
    ctx.quadraticCurveTo(-w * 0.18, y0 - hh * 0.5, 0, y0 - hh);
    ctx.quadraticCurveTo(w * 0.18, y0 - hh * 0.5, w / 2, y0);
    // scalloped lower edge
    ctx.quadraticCurveTo(w * 0.25, y0 + 4 * sw, 0, y0 + 2 * sw);
    ctx.quadraticCurveTo(-w * 0.25, y0 + 4 * sw, -w / 2, y0);
    ctx.closePath();
    ctx.fill();
    // snow cap highlight
    ctx.fillStyle = `rgba(226,238,248,${0.75 - p * 0.12})`;
    ctx.beginPath();
    ctx.moveTo(-w * 0.3, y0 - hh * 0.42);
    ctx.quadraticCurveTo(-w * 0.12, y0 - hh * 0.72, 0, y0 - hh + 2);
    ctx.quadraticCurveTo(w * 0.14, y0 - hh * 0.66, w * 0.28, y0 - hh * 0.36);
    ctx.quadraticCurveTo(w * 0.1, y0 - hh * 0.44, -w * 0.3, y0 - hh * 0.42);
    ctx.closePath();
    ctx.fill();
  }
}

function drawBranch(ctx: CanvasRenderingContext2D, rng: () => number, depleted: boolean) {
  if (depleted) {
    shadow(ctx, 0, 0, 14, 5, 0.12);
    ctx.fillStyle = "rgba(224,234,244,0.65)";
    ctx.beginPath(); ctx.ellipse(0, -2, 13, 6, 0, 0, TAU); ctx.fill();
    return;
  }
  shadow(ctx, 0, 0, 20, 6, 0.2);
  const rot = rng() * 0.6 - 0.3;
  ctx.rotate(rot);
  ctx.fillStyle = "#5a4531";
  rrect(ctx, -19, -6, 38, 7, 3.4);
  ctx.fill();
  const g = ctx.createLinearGradient(0, -6, 0, 2);
  g.addColorStop(0, "rgba(255,255,255,0.75)");
  g.addColorStop(0.55, "rgba(226,238,248,0.2)");
  g.addColorStop(1, "rgba(226,238,248,0)");
  ctx.fillStyle = g;
  rrect(ctx, -19, -6, 38, 5, 3);
  ctx.fill();
  ctx.rotate(0.5);
  ctx.fillStyle = "#4c3a29";
  rrect(ctx, -10, -10, 22, 5, 2.4);
  ctx.fill();
}

function drawStones(ctx: CanvasRenderingContext2D, rng: () => number, depleted: boolean) {
  shadow(ctx, 0, 0, 26, 9, 0.22);
  const rock = (x: number, y: number, w: number, h: number, shade: number) => {
    const g = ctx.createLinearGradient(x - w / 2, y - h, x + w / 2, y);
    g.addColorStop(0, `rgb(${150 + shade},${165 + shade},${185 + shade})`);
    g.addColorStop(0.5, `rgb(${110 + shade},${126 + shade},${148 + shade})`);
    g.addColorStop(1, `rgb(${72 + shade},${86 + shade},${106 + shade})`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(x - w / 2, y);
    ctx.lineTo(x - w * 0.42, y - h * 0.75);
    ctx.lineTo(x - w * 0.1, y - h);
    ctx.lineTo(x + w * 0.32, y - h * 0.85);
    ctx.lineTo(x + w / 2, y - h * 0.2);
    ctx.lineTo(x + w * 0.42, y);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.28)";
    ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(x - w * 0.42, y - h * 0.75); ctx.lineTo(x - w * 0.1, y - h); ctx.stroke();
  };
  if (depleted) {
    rock(-6, 0, 16, 9, -18); rock(9, -1, 13, 8, -10);
    return;
  }
  rock(-10, 0, 26, 26, 0);
  rock(12, 0, 22, 18, 8);
  rock(0, -2, 17, 30, -6);
  // ice frosting
  ctx.fillStyle = "rgba(190,225,245,0.35)";
  if (rng() > 0.4) { ctx.beginPath(); ctx.ellipse(-6, -24, 7, 3, -0.3, 0, TAU); ctx.fill(); }
}

function drawIceShard(ctx: CanvasRenderingContext2D, rng: () => number, depleted: boolean) {
  shadow(ctx, 0, 0, 20, 7, 0.18);
  const shard = (x: number, h: number, w: number, tilt: number, a: number) => {
    const g = ctx.createLinearGradient(x - w, 0, x + w, -h);
    g.addColorStop(0, `rgba(126,200,239,${a})`);
    g.addColorStop(0.6, `rgba(189,234,251,${a})`);
    g.addColorStop(1, `rgba(240,252,255,${a})`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(x - w / 2, 0);
    ctx.lineTo(x + tilt, -h);
    ctx.lineTo(x + w / 2, -h * 0.12);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = `rgba(255,255,255,${a * 0.8})`;
    ctx.lineWidth = 1;
    ctx.stroke();
  };
  if (depleted) { shard(0, 10, 12, 2, 0.5); return; }
  shard(-9, 26 + rng() * 8, 14, -3, 0.92);
  shard(7, 34 + rng() * 10, 16, 4, 1);
  shard(0, 18, 10, 1, 0.8);
}

function drawBerry(ctx: CanvasRenderingContext2D, rng: () => number, amount: number, t: number) {
  shadow(ctx, 0, 0, 22, 7, 0.2);
  const bush = (x: number, y: number, r: number, c: string) => {
    const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.4, 1, x, y, r);
    g.addColorStop(0, "#2e5a4a");
    g.addColorStop(1, c);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  };
  bush(-8, -10, 13, "#152b24");
  bush(9, -8, 12, "#12251f");
  bush(0, -15, 12, "#1a352c");
  // snow dust
  ctx.fillStyle = "rgba(226,238,248,0.55)";
  ctx.beginPath(); ctx.ellipse(-4, -22, 9, 3.4, -0.2, 0, TAU); ctx.fill();
  if (amount > 0) {
    const n = 4 + Math.floor(rng() * 3);
    for (let i = 0; i < n; i++) {
      const a = rng() * TAU, rr = 4 + rng() * 10;
      const bx = Math.cos(a) * rr, by = -10 + Math.sin(a) * rr * 0.6 - rng() * 8;
      const pulse = 1 + Math.sin(t * 2.4 + i * 1.7) * 0.08;
      const g = ctx.createRadialGradient(bx - 1, by - 1, 0.4, bx, by, 3.4 * pulse);
      g.addColorStop(0, "#ffb0a0");
      g.addColorStop(0.5, "#ff7d6b");
      g.addColorStop(1, "#c43b43");
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(bx, by, 3 * pulse, 0, TAU); ctx.fill();
    }
  }
}

function drawHerb(ctx: CanvasRenderingContext2D, rng: () => number, amount: number, t: number) {
  shadow(ctx, 0, 0, 14, 5, 0.16);
  if (amount <= 0) {
    ctx.strokeStyle = "#3d5a4c";
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(2, -8, 5, -10); ctx.stroke();
    return;
  }
  const glow = 0.35 + Math.sin(t * 2 + (rng() * 6)) * 0.12;
  const g = ctx.createRadialGradient(0, -10, 2, 0, -10, 26);
  g.addColorStop(0, `rgba(127,214,164,${glow})`);
  g.addColorStop(1, "rgba(127,214,164,0)");
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(0, -10, 26, 0, TAU); ctx.fill();
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + (i - 2) * 0.5;
    const len = 14 + (i === 2 ? 6 : 0);
    ctx.strokeStyle = i === 2 ? "#8fe6b6" : "#4d9a72";
    ctx.lineWidth = 2.6;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(Math.cos(a) * len * 0.5, Math.sin(a) * len * 0.6, Math.cos(a) * len, Math.sin(a) * len);
    ctx.stroke();
    // leaf blade
    ctx.fillStyle = i === 2 ? "#a8f0c8" : "#63b387";
    ctx.beginPath();
    ctx.ellipse(Math.cos(a) * len, Math.sin(a) * len, 3.2, 6, a + Math.PI / 2, 0, TAU);
    ctx.fill();
  }
}

// ════════════════════════════ STRUCTURES ═══════════════════════════════════

export function drawStruct(ctx: CanvasRenderingContext2D, s: Struct, st: GameState, t: number) {
  ctx.save();
  ctx.translate(s.x, s.y);
  switch (s.kind) {
    case "shelter": drawShelter(ctx, st.shelter.stage, t); break;
    case "firepit": drawFirepit(ctx, st.shelter.fire, t); break;
    case "storage": drawStorage(ctx, st.shelter.stage >= 3); break;
    case "station": drawStation(ctx, st.shelter.stage >= 3, t); break;
    case "pod": drawPod(ctx); break;
    case "wreck": drawWreck(ctx, !st.flags.journal, t); break;
    case "den": drawDen(ctx, s.seed); break;
  }
  ctx.restore();
}

function ghostSite(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.save();
  ctx.strokeStyle = "rgba(165,224,255,0.5)";
  ctx.setLineDash([6, 5]);
  ctx.lineWidth = 2;
  ctx.fillStyle = "rgba(103,200,244,0.08)";
  rrect(ctx, -w / 2, -h, w, h, 6);
  ctx.fill(); ctx.stroke();
  ctx.restore();
}

function drawShelter(ctx: CanvasRenderingContext2D, stage: number, t: number) {
  shadow(ctx, 0, 8, 96, 26, 0.3);
  // main hull
  const hw = 150, hh = 78;
  const wallG = ctx.createLinearGradient(-hw / 2, -hh, hw / 2, 0);
  if (stage >= 1) {
    wallG.addColorStop(0, "#7d93a8"); wallG.addColorStop(0.5, "#5a7187"); wallG.addColorStop(1, "#3d5064");
  } else {
    wallG.addColorStop(0, "#5f6d7c"); wallG.addColorStop(0.5, "#48525f"); wallG.addColorStop(1, "#323b47");
  }
  ctx.fillStyle = wallG;
  rrect(ctx, -hw / 2, -hh, hw, hh, 8);
  ctx.fill();
  // panel seams
  ctx.strokeStyle = "rgba(20,35,50,0.5)";
  ctx.lineWidth = 1.4;
  for (const px of [-hw / 6, hw / 6]) {
    ctx.beginPath(); ctx.moveTo(px, -hh + 6); ctx.lineTo(px, -6); ctx.stroke();
  }
  // dome roof
  const roofG = ctx.createLinearGradient(0, -hh - 46, 0, -hh + 6);
  roofG.addColorStop(0, stage >= 1 ? "#9db4c9" : "#6b7a89");
  roofG.addColorStop(1, stage >= 1 ? "#647e96" : "#49545f");
  ctx.fillStyle = roofG;
  ctx.beginPath();
  ctx.moveTo(-hw / 2 - 8, -hh + 4);
  ctx.quadraticCurveTo(0, -hh - 58, hw / 2 + 8, -hh + 4);
  ctx.closePath(); ctx.fill();
  // roof snow
  ctx.fillStyle = "rgba(232,242,250,0.9)";
  ctx.beginPath();
  ctx.moveTo(-hw / 2 - 4, -hh - 2);
  ctx.quadraticCurveTo(0, -hh - 52, hw / 2 + 4, -hh - 2);
  ctx.quadraticCurveTo(0, -hh - 30, -hw / 2 - 4, -hh - 2);
  ctx.closePath(); ctx.fill();

  // door
  const doorG = ctx.createLinearGradient(0, -44, 0, 0);
  doorG.addColorStop(0, stage >= 1 ? "#233445" : "#141c26");
  doorG.addColorStop(1, "#0b1119");
  ctx.fillStyle = doorG;
  rrect(ctx, -16, -46, 32, 46, 5);
  ctx.fill();
  ctx.strokeStyle = "rgba(165,224,255,0.25)";
  ctx.stroke();
  ctx.fillStyle = stage >= 1 ? "#67c8f4" : "#31404f";
  ctx.fillRect(8, -26, 3, 3);

  // window — warm when stage >= 2
  const winX = -52;
  if (stage >= 2) {
    const wg = ctx.createRadialGradient(winX, -46, 2, winX, -46, 26);
    wg.addColorStop(0, "rgba(255,176,99,0.75)");
    wg.addColorStop(1, "rgba(255,176,99,0)");
    ctx.fillStyle = wg;
    ctx.beginPath(); ctx.arc(winX, -46, 26, 0, TAU); ctx.fill();
  }
  ctx.fillStyle = stage >= 2 ? "#ffca86" : stage >= 1 ? "#8fd4f2" : "#2c3947";
  rrect(ctx, winX - 11, -56, 22, 20, 4);
  ctx.fill();
  ctx.strokeStyle = "rgba(10,20,32,0.8)";
  ctx.stroke();
  ctx.beginPath(); ctx.moveTo(winX, -56); ctx.lineTo(winX, -36); ctx.moveTo(winX - 11, -46); ctx.lineTo(winX + 11, -46); ctx.stroke();

  if (stage === 0) {
    // damage: scorch + torn panel + debris
    ctx.fillStyle = "rgba(12,16,22,0.85)";
    ctx.beginPath();
    ctx.moveTo(34, -hh + 10); ctx.lineTo(66, -hh + 16); ctx.lineTo(60, -30); ctx.lineTo(38, -22);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "rgba(150,120,90,0.6)";
    ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(40, -hh + 12); ctx.lineTo(52, -40); ctx.lineTo(48, -26); ctx.stroke();
    ctx.fillStyle = "#3a4552";
    ctx.beginPath(); ctx.ellipse(88, 2, 12, 5, 0.4, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.ellipse(-92, 4, 9, 4, -0.3, 0, TAU); ctx.fill();
  } else {
    // patch plates
    ctx.fillStyle = "#8ea6bb";
    rrect(ctx, 36, -hh + 12, 26, 18, 3); ctx.fill();
    ctx.strokeStyle = "rgba(20,35,50,0.6)"; ctx.stroke();
  }

  // antenna
  ctx.strokeStyle = stage >= 1 ? "#8ea6bb" : "#55626f";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(48, -hh - 30);
  ctx.lineTo(stage >= 1 ? 52 : 62, -hh - 78);
  ctx.stroke();
  const blink = 0.35 + Math.max(0, Math.sin(t * (stage >= 1 ? 2.4 : 0.8))) * 0.65;
  ctx.fillStyle = stage >= 1 ? `rgba(103,200,244,${blink})` : `rgba(255,110,90,${blink * 0.7})`;
  ctx.beginPath(); ctx.arc(stage >= 1 ? 52 : 62, -hh - 80, 4, 0, TAU); ctx.fill();

  if (stage >= 3) {
    // solar panel + annex
    ctx.fillStyle = "#1d3a5a";
    ctx.save();
    ctx.rotate(0.28);
    rrect(ctx, 66, -60, 34, 22, 3); ctx.fill();
    ctx.strokeStyle = "rgba(165,224,255,0.5)"; ctx.stroke();
    ctx.restore();
    ctx.fillStyle = "#54687c";
    rrect(ctx, -112, -34, 30, 34, 4); ctx.fill();
    ctx.fillStyle = "rgba(232,242,250,0.85)";
    ctx.beginPath(); ctx.ellipse(-97, -34, 16, 5, 0, 0, TAU); ctx.fill();
  }
}

function drawFirepit(ctx: CanvasRenderingContext2D, fire: { built: boolean; lit: boolean; fuel: number }, t: number) {
  if (!fire.built) {
    ghostSite(ctx, 56, 26);
    return;
  }
  shadow(ctx, 0, 2, 34, 12, 0.26);
  // stone ring
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * TAU;
    const sx = Math.cos(a) * 26, sy = Math.sin(a) * 11 - 2;
    const g = ctx.createLinearGradient(sx - 6, sy - 6, sx + 6, sy + 4);
    g.addColorStop(0, "#8d9aac"); g.addColorStop(1, "#5a6678");
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(sx, sy, 8, 6, a * 0.4, 0, TAU); ctx.fill();
  }
  // charred ground
  const cg = ctx.createRadialGradient(0, -2, 1, 0, -2, 22);
  cg.addColorStop(0, "#1a1410"); cg.addColorStop(1, "rgba(26,20,16,0)");
  ctx.fillStyle = cg;
  ctx.beginPath(); ctx.ellipse(0, -2, 22, 10, 0, 0, TAU); ctx.fill();
  // logs
  ctx.strokeStyle = "#4c3524";
  ctx.lineWidth = 5; ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(-10, 0); ctx.lineTo(9, -7); ctx.moveTo(9, 0); ctx.lineTo(-9, -7); ctx.stroke();

  if (fire.lit && fire.fuel > 0) {
    const flick = 1 + Math.sin(t * 11) * 0.08 + Math.sin(t * 23.7) * 0.06;
    // glow
    const gg = ctx.createRadialGradient(0, -14, 2, 0, -14, 60 * flick);
    gg.addColorStop(0, "rgba(255,176,99,0.5)");
    gg.addColorStop(0.6, "rgba(255,143,61,0.16)");
    gg.addColorStop(1, "rgba(255,143,61,0)");
    ctx.fillStyle = gg;
    ctx.beginPath(); ctx.arc(0, -14, 60 * flick, 0, TAU); ctx.fill();
    // flame tongues
    const tongue = (off: number, w: number, hgt: number, c1: string, c2: string, sp: number) => {
      const fl = Math.sin(t * sp + off * 9) * 0.22;
      const g = ctx.createLinearGradient(0, 0, 0, -hgt);
      g.addColorStop(0, c1); g.addColorStop(1, c2);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(off - w, -2);
      ctx.quadraticCurveTo(off - w * 0.6, -hgt * 0.55, off + fl * w * 2, -hgt);
      ctx.quadraticCurveTo(off + w * 0.6, -hgt * 0.5, off + w, -2);
      ctx.closePath(); ctx.fill();
    };
    tongue(0, 12, 34 * flick, "#e76f1e", "rgba(255,200,120,0.9)", 13);
    tongue(-4, 8, 44 * flick, "#ffb063", "rgba(255,230,170,0.95)", 17);
    tongue(3, 5, 26 * flick, "#ffe9c4", "rgba(255,255,240,0.9)", 21);
  } else if (fire.fuel > 0) {
    // unlit fuel — faint smoke-ready logs
    ctx.fillStyle = "rgba(165,224,255,0.14)";
    ctx.beginPath(); ctx.ellipse(0, -4, 12, 5, 0, 0, TAU); ctx.fill();
  }
}

function drawStorage(ctx: CanvasRenderingContext2D, built: boolean) {
  if (!built) { ghostSite(ctx, 60, 30); return; }
  shadow(ctx, 0, 2, 34, 10, 0.26);
  const crate = (x: number, y: number, w: number, h: number) => {
    const g = ctx.createLinearGradient(x, y - h, x, y);
    g.addColorStop(0, "#8a6a45"); g.addColorStop(1, "#5c452c");
    ctx.fillStyle = g;
    rrect(ctx, x - w / 2, y - h, w, h, 3); ctx.fill();
    ctx.strokeStyle = "rgba(30,20,10,0.55)"; ctx.lineWidth = 1.4; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x - w / 2, y - h / 2); ctx.lineTo(x + w / 2, y - h / 2); ctx.stroke();
  };
  crate(0, 0, 52, 26);
  crate(-10, -26, 34, 20);
  // tarp
  ctx.fillStyle = "#31556b";
  ctx.beginPath();
  ctx.moveTo(-30, -30); ctx.quadraticCurveTo(-6, -52, 24, -34);
  ctx.quadraticCurveTo(20, -26, -6, -22); ctx.closePath(); ctx.fill();
  ctx.fillStyle = "rgba(232,242,250,0.75)";
  ctx.beginPath(); ctx.ellipse(-8, -44, 16, 4.6, 0.18, 0, TAU); ctx.fill();
}

function drawStation(ctx: CanvasRenderingContext2D, built: boolean, t: number) {
  if (!built) { ghostSite(ctx, 64, 26); return; }
  shadow(ctx, 0, 2, 38, 10, 0.26);
  // bench
  const g = ctx.createLinearGradient(0, -26, 0, 0);
  g.addColorStop(0, "#7a5c3c"); g.addColorStop(1, "#4e3a24");
  ctx.fillStyle = g;
  rrect(ctx, -34, -28, 68, 10, 3); ctx.fill();
  ctx.fillStyle = "#43301d";
  ctx.fillRect(-28, -18, 6, 18); ctx.fillRect(22, -18, 6, 18);
  // tools on bench
  ctx.strokeStyle = "#c9d6e2"; ctx.lineWidth = 2.6; ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(-20, -30); ctx.lineTo(-8, -33); ctx.moveTo(-8, -33); ctx.lineTo(-4, -30); ctx.stroke();
  ctx.fillStyle = "#67c8f4";
  ctx.save(); ctx.translate(14, -31); ctx.rotate(0.2); ctx.fillRect(-1.5, -7, 3, 14); ctx.restore();
  // lamp
  ctx.strokeStyle = "#5c452c"; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(28, -28); ctx.lineTo(28, -52); ctx.stroke();
  const lamp = 0.7 + Math.sin(t * 3.2) * 0.15;
  const lg = ctx.createRadialGradient(28, -54, 1, 28, -54, 20);
  lg.addColorStop(0, `rgba(255,210,160,${0.5 * lamp})`); lg.addColorStop(1, "rgba(255,210,160,0)");
  ctx.fillStyle = lg;
  ctx.beginPath(); ctx.arc(28, -54, 20, 0, TAU); ctx.fill();
  ctx.fillStyle = "#ffca86";
  ctx.beginPath(); ctx.arc(28, -54, 4, 0, TAU); ctx.fill();
}

function drawPod(ctx: CanvasRenderingContext2D) {
  shadow(ctx, 0, 4, 46, 13, 0.3);
  ctx.save();
  ctx.rotate(-0.22);
  const g = ctx.createLinearGradient(0, -46, 0, 6);
  g.addColorStop(0, "#dbe4ec"); g.addColorStop(0.55, "#9fb0c0"); g.addColorStop(1, "#67788a");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(-44, 0);
  ctx.quadraticCurveTo(-46, -42, -8, -46);
  ctx.quadraticCurveTo(38, -48, 44, -8);
  ctx.quadraticCurveTo(45, 3, 30, 4);
  ctx.closePath(); ctx.fill();
  // stripes
  ctx.fillStyle = "#e8763a";
  ctx.fillRect(-40, -18, 26, 7);
  ctx.fillStyle = "#1d3a5a";
  ctx.fillRect(-40, -26, 18, 6);
  // scorch
  ctx.fillStyle = "rgba(15,20,28,0.5)";
  ctx.beginPath(); ctx.ellipse(24, -10, 18, 9, -0.4, 0, TAU); ctx.fill();
  ctx.restore();
  // snow drift over it
  ctx.fillStyle = "rgba(232,242,250,0.92)";
  ctx.beginPath(); ctx.ellipse(14, 2, 30, 9, 0, 0, TAU); ctx.fill();
}

function drawWreck(ctx: CanvasRenderingContext2D, glowing: boolean, t: number) {
  shadow(ctx, 0, 10, 120, 26, 0.32);
  ctx.save();
  ctx.rotate(0.1);
  // broken wing
  ctx.fillStyle = "#4e5d6e";
  ctx.beginPath();
  ctx.moveTo(-20, -34); ctx.lineTo(-150, -74); ctx.lineTo(-138, -50); ctx.lineTo(-28, -20);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = "rgba(232,242,250,0.65)";
  ctx.beginPath(); ctx.moveTo(-60, -44); ctx.lineTo(-146, -72); ctx.lineTo(-140, -58); ctx.closePath(); ctx.fill();
  // fuselage
  const g = ctx.createLinearGradient(0, -70, 0, 10);
  g.addColorStop(0, "#b8c8d6"); g.addColorStop(0.5, "#8798aa"); g.addColorStop(1, "#556575");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(-70, 4);
  ctx.quadraticCurveTo(-86, -52, -20, -64);
  ctx.quadraticCurveTo(70, -80, 108, -34);
  ctx.quadraticCurveTo(118, -12, 92, 2);
  ctx.closePath(); ctx.fill();
  // window line
  ctx.fillStyle = "rgba(20,32,46,0.85)";
  rrect(ctx, -54, -56, 88, 12, 6); ctx.fill();
  // stripes
  ctx.fillStyle = "#d4641a";
  ctx.fillRect(-62, -36, 150, 8);
  // ripped tail
  ctx.fillStyle = "#3d4c5c";
  ctx.beginPath(); ctx.moveTo(96, -60); ctx.lineTo(140, -92); ctx.lineTo(146, -66); ctx.lineTo(108, -38); ctx.closePath(); ctx.fill();
  ctx.restore();
  // drifts
  ctx.fillStyle = "rgba(232,242,250,0.9)";
  ctx.beginPath(); ctx.ellipse(-40, 4, 46, 11, 0, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.ellipse(60, 6, 40, 10, 0, 0, TAU); ctx.fill();
  if (glowing) {
    const b = 0.4 + Math.max(0, Math.sin(t * 2.2)) * 0.6;
    const gg = ctx.createRadialGradient(0, -80, 1, 0, -80, 40);
    gg.addColorStop(0, `rgba(103,200,244,${b})`); gg.addColorStop(1, "rgba(103,200,244,0)");
    ctx.fillStyle = gg;
    ctx.beginPath(); ctx.arc(0, -80, 40, 0, TAU); ctx.fill();
    ctx.fillStyle = `rgba(165,224,255,${b})`;
    ctx.beginPath(); ctx.arc(0, -80, 5, 0, TAU); ctx.fill();
  }
}

function drawDen(ctx: CanvasRenderingContext2D, seed: number) {
  const rng = seeded(seed);
  shadow(ctx, 0, 6, 60, 16, 0.3);
  // ice mound
  const g = ctx.createLinearGradient(0, -52, 0, 8);
  g.addColorStop(0, "#c3dcf0"); g.addColorStop(0.55, "#8fb2cc"); g.addColorStop(1, "#5f7e98");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(-58, 4);
  ctx.quadraticCurveTo(-52, -46, 0, -52);
  ctx.quadraticCurveTo(54, -46, 60, 4);
  ctx.closePath(); ctx.fill();
  // cave mouth
  ctx.fillStyle = "#0b1119";
  ctx.beginPath();
  ctx.moveTo(-24, 4);
  ctx.quadraticCurveTo(-20, -30, 0, -32);
  ctx.quadraticCurveTo(22, -30, 26, 4);
  ctx.closePath(); ctx.fill();
  // icy rim highlights
  ctx.strokeStyle = "rgba(255,255,255,0.5)";
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(-24, 2); ctx.quadraticCurveTo(-20, -28, 0, -30); ctx.stroke();
  // bones
  ctx.strokeStyle = "rgba(226,232,238,0.8)";
  ctx.lineWidth = 2.4;
  for (let i = 0; i < 3; i++) {
    const bx = -42 + rng() * 84, by = 6 + rng() * 6;
    ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx + 8, by - 3); ctx.stroke();
  }
}

// ════════════════════════════ PICKUPS ══════════════════════════════════════

export function drawPickup(ctx: CanvasRenderingContext2D, p: Pickup, t: number) {
  const bob = Math.sin(t * 3 + p.t * 7) * 3;
  const y = p.y - 10 + bob;
  const gg = ctx.createRadialGradient(p.x, y, 1, p.x, y, 20);
  gg.addColorStop(0, "rgba(255,230,170,0.4)"); gg.addColorStop(1, "rgba(255,230,170,0)");
  ctx.fillStyle = gg;
  ctx.beginPath(); ctx.arc(p.x, y, 20, 0, TAU); ctx.fill();
  ctx.save();
  ctx.translate(p.x, y);
  switch (p.item) {
    case "pelt": {
      ctx.fillStyle = "#b9c7de";
      ctx.beginPath();
      ctx.moveTo(-9, 4); ctx.quadraticCurveTo(-11, -8, 0, -9); ctx.quadraticCurveTo(11, -8, 9, 4);
      ctx.quadraticCurveTo(4, 8, 0, 6); ctx.quadraticCurveTo(-4, 8, -9, 4);
      ctx.fill();
      ctx.fillStyle = "#e8eef7";
      ctx.beginPath(); ctx.ellipse(0, -5, 5, 3, 0, 0, TAU); ctx.fill();
      break;
    }
    case "rawmeat": {
      ctx.fillStyle = "#d66d6d";
      ctx.beginPath(); ctx.ellipse(0, 0, 9, 6.4, -0.3, 0, TAU); ctx.fill();
      ctx.fillStyle = "#f2b8b8";
      ctx.beginPath(); ctx.ellipse(-2, -1.4, 4, 2.6, -0.3, 0, TAU); ctx.fill();
      break;
    }
    default: {
      ctx.fillStyle = "#ffb063";
      ctx.beginPath(); ctx.arc(0, 0, 6, 0, TAU); ctx.fill();
    }
  }
  if (p.n > 1) {
    ctx.fillStyle = "#fff";
    ctx.font = "700 10px Rajdhani, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(`×${p.n}`, 10, -6);
  }
  ctx.restore();
}

// ════════════════════════════ PLAYER ═══════════════════════════════════════

export function drawPlayer(ctx: CanvasRenderingContext2D, p: Player, t: number, armorOn: boolean) {
  const flip = Math.cos(p.face) < 0 ? -1 : 1;
  const moving = p.moving;
  const sprintK = p.sprint && moving ? 1.5 : 1;
  const bob = moving ? Math.sin(p.walkPh * 2) * 1.6 * sprintK : Math.sin(t * 2) * 0.6;
  shadow(ctx, p.x, p.y + 2, 15, 6, 0.26);

  ctx.save();
  ctx.translate(p.x, p.y - 2 + bob * 0.4);
  // lean into a dodge, recoil away from a hit
  if (p.dodgeT > 0) {
    const k = p.dodgeT / 0.24;
    ctx.rotate(flip * -0.5 * k);
    ctx.translate(0, -6 * Math.sin((1 - k) * Math.PI));
  } else if (p.hurtT > 0) {
    ctx.rotate(flip * -0.18 * p.hurtT);
  } else if (moving) {
    ctx.rotate(flip * (p.sprint ? 0.1 : 0.045));
  }
  if (p.dead) {
    ctx.rotate(flip * 1.35);
    ctx.globalAlpha = Math.max(0, 1 - p.deathT * 0.5);
  }
  ctx.scale(flip, 1);

  const legPh = Math.sin(p.walkPh) * (moving ? 1 : 0);
  // legs
  ctx.fillStyle = "#2a3648";
  rrect(ctx, -6.4, -13 + legPh * 3, 5.6, 14 - Math.max(0, legPh * 3), 2.4); ctx.fill();
  rrect(ctx, 1, -13 - legPh * 3, 5.6, 14 + Math.min(0, legPh * 3), 2.4); ctx.fill();
  // boots
  ctx.fillStyle = "#1a2432";
  rrect(ctx, -7.4, -2.6 + legPh * 3, 7.4, 3.4, 1.6); ctx.fill();
  rrect(ctx, 0.2, -2.6 - legPh * 3, 7.4, 3.4, 1.6); ctx.fill();

  // torso — parka
  const torsoG = ctx.createLinearGradient(0, -44, 0, -12);
  torsoG.addColorStop(0, "#f08a4a");
  torsoG.addColorStop(0.55, "#e8763a");
  torsoG.addColorStop(1, "#c45a24");
  ctx.fillStyle = torsoG;
  ctx.beginPath();
  ctx.moveTo(-11, -12);
  ctx.quadraticCurveTo(-13, -34, -8, -40);
  ctx.quadraticCurveTo(0, -45, 8, -40);
  ctx.quadraticCurveTo(13, -34, 11, -12);
  ctx.quadraticCurveTo(0, -8, -11, -12);
  ctx.closePath(); ctx.fill();
  // fur trim if parka
  if (armorOn) {
    ctx.strokeStyle = "#e8eef7";
    ctx.lineWidth = 3.2;
    ctx.beginPath();
    ctx.moveTo(-10.4, -13);
    ctx.quadraticCurveTo(0, -8.5, 10.4, -13);
    ctx.stroke();
  }
  // zipper + belt
  ctx.strokeStyle = "rgba(90,30,5,0.55)";
  ctx.lineWidth = 1.6;
  ctx.beginPath(); ctx.moveTo(0, -42); ctx.lineTo(0, -12); ctx.stroke();
  ctx.strokeStyle = "#22303f";
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(-9.6, -20); ctx.quadraticCurveTo(0, -17.6, 9.6, -20); ctx.stroke();

  // backpack
  ctx.fillStyle = "#31556b";
  rrect(ctx, -15.5, -38, 7.5, 20, 3.4); ctx.fill();
  ctx.fillStyle = "#25424f";
  rrect(ctx, -15.5, -30, 7.5, 6, 2); ctx.fill();

  // ── back arm counter-swings while walking (depth + readable gait) ──
  if (!p.dead) {
    ctx.save();
    ctx.translate(-4, -34);
    ctx.rotate(-legPh * 0.55 * sprintK);
    ctx.fillStyle = "#c45a24";
    rrect(ctx, -3, -3, 12.5, 5.8, 3); ctx.fill();
    ctx.fillStyle = "#25424f";
    ctx.beginPath(); ctx.arc(11, 0, 3.4, 0, TAU); ctx.fill();
    ctx.restore();
  }

  // ── front arm: attack swing · gather chop · walk swing ──
  const atk = p.atkT > 0 ? 1 - p.atkT / 0.32 : 0;
  // gathering is a repeating chop/pull cycle driven by the channel timer
  const gPh = p.gatherT > 0 ? 1 - p.gatherT / Math.max(0.001, p.gatherLen) : 0;
  const gChop = p.gatherT > 0 ? Math.sin(gPh * Math.PI * 2 - Math.PI / 2) : 0;
  const armA = p.atkT > 0 ? -1.7 + atk * 2.4
    : p.gatherT > 0 ? -0.9 + gChop * 0.95
    : legPh * 0.5 * sprintK;
  ctx.save();
  ctx.translate(7, -34);
  ctx.rotate(armA * 0.9);
  ctx.fillStyle = "#d96a30";
  rrect(ctx, -3, -3, 15, 6.4, 3); ctx.fill();
  // mitten
  ctx.fillStyle = "#31556b";
  ctx.beginPath(); ctx.arc(13.4, 0, 4, 0, TAU); ctx.fill();
  // weapon in hand
  const tool = p.attackTool;
  if (tool && tool !== "hands" && (p.atkT > 0 || p.gatherT > 0)) {
    ctx.translate(14, 0);
    if (tool === "spear") {
      ctx.strokeStyle = "#8a6a45"; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(-6, 0); ctx.lineTo(34, 0); ctx.stroke();
      ctx.fillStyle = "#c9d6e2";
      ctx.beginPath(); ctx.moveTo(34, -4.4); ctx.lineTo(45, 0); ctx.lineTo(34, 4.4); ctx.closePath(); ctx.fill();
    } else {
      ctx.strokeStyle = "#8a6a45"; ctx.lineWidth = 3.4;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(20, 0); ctx.stroke();
      const ag = ctx.createLinearGradient(18, -8, 26, 8);
      ag.addColorStop(0, "#c9d6e2"); ag.addColorStop(1, "#7a8a9c");
      ctx.fillStyle = ag;
      ctx.beginPath(); ctx.moveTo(19, -8); ctx.lineTo(30, -2); ctx.lineTo(30, 3); ctx.lineTo(19, 8); ctx.closePath(); ctx.fill();
    }
  }
  ctx.restore();

  // head — hood (dips slightly on a chop, tilts when hurt)
  if (p.gatherT > 0) ctx.translate(0, Math.max(0, gChop) * 1.6);
  const hoodG = ctx.createLinearGradient(0, -58, 0, -42);
  hoodG.addColorStop(0, "#f6a05e");
  hoodG.addColorStop(1, "#d96a30");
  ctx.fillStyle = hoodG;
  ctx.beginPath();
  ctx.arc(0, -47, 9.6, 0, TAU);
  ctx.fill();
  // face opening
  ctx.fillStyle = "#241a14";
  ctx.beginPath();
  ctx.ellipse(2.6, -46.6, 6.2, 6.8, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = "#e8c9a8";
  ctx.beginPath();
  ctx.ellipse(3.4, -46.4, 4, 5, 0, 0, TAU);
  ctx.fill();
  // fur rim
  ctx.strokeStyle = armorOn ? "#ffffff" : "#f2dcc4";
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.ellipse(2.6, -46.6, 7, 7.6, 0, 0, TAU);
  ctx.stroke();
  // goggle glint
  ctx.fillStyle = "rgba(165,224,255,0.9)";
  ctx.fillRect(4.6, -49.6, 3.6, 1.8);

  // hurt flash
  if (p.hurtT > 0) {
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = Math.min(0.65, p.hurtT * 2.2);
    ctx.fillStyle = "#ff5050";
    ctx.beginPath(); ctx.arc(0, -28, 20, 0, TAU); ctx.fill();
  }
  ctx.restore();

  // dodge afterimage
  if (p.dodgeT > 0) {
    ctx.save();
    ctx.globalAlpha = p.dodgeT * 1.6;
    ctx.fillStyle = "rgba(165,224,255,0.35)";
    ctx.beginPath(); ctx.arc(p.x - Math.cos(p.face) * 18, p.y - 24, 12, 0, TAU); ctx.fill();
    ctx.restore();
  }

  // breath puffs handled by engine particles
}

// ════════════════════════════ ICE WOLF ═════════════════════════════════════

export function drawWolf(ctx: CanvasRenderingContext2D, w: Enemy, t: number) {
  const flip = Math.cos(w.face) < 0 ? -1 : 1;
  if (w.dead) {
    const a = Math.max(0, 1 - w.deadT / 2.4);
    if (a <= 0) return;
    ctx.save();
    ctx.globalAlpha = a * 0.85;
    ctx.translate(w.x, w.y);
    shadow(ctx, 0, 0, 26, 8, 0.2 * a);
    ctx.scale(flip, 1);
    ctx.rotate(0.5);
    wolfBody(ctx, t, 0, false, true);
    ctx.restore();
    return;
  }

  const crouch = w.state === "windup" ? 1 - w.stateT / 0.6 : 0;
  const moving = w.state === "chase" || w.state === "patrol" || w.state === "return" || w.state === "prowl" || w.state === "lunge";
  const bob = moving ? Math.sin(w.walkPh * 2) * 1.4 : 0;

  shadow(ctx, w.x, w.y + 2, 26, 8, 0.26);
  ctx.save();
  ctx.translate(w.x, w.y + bob * 0.4 + crouch * 5);
  ctx.scale(flip, 1);
  if (w.hitT > 0) ctx.translate(Math.sin(t * 70) * 2.4, 0);
  wolfBody(ctx, t, moving ? w.walkPh : 0, w.state === "windup" || w.state === "lunge", false);
  if (w.hitT > 0) {
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = Math.min(0.6, w.hitT * 2);
    ctx.fillStyle = "#ff6b55";
    ctx.beginPath(); ctx.arc(2, -22, 26, 0, TAU); ctx.fill();
  }
  ctx.restore();

  // telegraph ring while winding up
  if (w.state === "windup") {
    ctx.save();
    ctx.strokeStyle = `rgba(255,110,90,${0.35 + crouch * 0.5})`;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.arc(w.x, w.y - 14, 30 - crouch * 10, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }
}

function wolfBody(ctx: CanvasRenderingContext2D, t: number, walkPh: number, aggressive: boolean, dead: boolean) {
  const legSwing = Math.sin(walkPh) * (walkPh ? 1 : 0);
  // legs
  ctx.strokeStyle = "#2c3a4e";
  ctx.lineWidth = 4.6;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-14, -10); ctx.lineTo(-14 + legSwing * 4, 0);
  ctx.moveTo(-6, -10); ctx.lineTo(-6 - legSwing * 4, 1);
  ctx.moveTo(10, -10); ctx.lineTo(10 - legSwing * 4, 0);
  ctx.moveTo(17, -10); ctx.lineTo(17 + legSwing * 4, 1);
  ctx.stroke();
  // tail
  ctx.strokeStyle = "#3b4d66";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(-22, -18);
  ctx.quadraticCurveTo(-32, -22 + Math.sin(t * 3) * 2, -36, -30 + Math.sin(t * 3 + 1) * 3);
  ctx.stroke();
  // body
  const bodyG = ctx.createLinearGradient(0, -32, 0, -6);
  bodyG.addColorStop(0, "#5f7896");
  bodyG.addColorStop(0.5, "#42546e");
  bodyG.addColorStop(1, "#2c3a4e");
  ctx.fillStyle = bodyG;
  ctx.beginPath();
  ctx.moveTo(-24, -12);
  ctx.quadraticCurveTo(-26, -30, -6, -31);
  ctx.lineTo(14, -30);
  ctx.quadraticCurveTo(26, -28, 24, -14);
  ctx.quadraticCurveTo(10, -8, -24, -12);
  ctx.closePath(); ctx.fill();
  // ice shard mane
  ctx.fillStyle = "rgba(165,224,255,0.85)";
  for (let i = 0; i < 4; i++) {
    const mx = -8 + i * 8;
    ctx.beginPath();
    ctx.moveTo(mx - 3.4, -29);
    ctx.lineTo(mx + 1, -40 - (i % 2) * 4);
    ctx.lineTo(mx + 4.4, -29);
    ctx.closePath(); ctx.fill();
  }
  // head
  const headY = -30;
  ctx.fillStyle = "#4a5f7c";
  ctx.beginPath();
  ctx.arc(24, headY, 9.4, 0, TAU);
  ctx.fill();
  // snout
  ctx.fillStyle = "#3b4d66";
  ctx.beginPath();
  ctx.moveTo(28, headY - 4);
  ctx.lineTo(40, headY + 1);
  ctx.lineTo(28, headY + 5);
  ctx.closePath(); ctx.fill();
  // ears
  ctx.fillStyle = "#42546e";
  ctx.beginPath(); ctx.moveTo(18, headY - 6); ctx.lineTo(19, headY - 15); ctx.lineTo(25, headY - 8); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(26, headY - 7); ctx.lineTo(29, headY - 15); ctx.lineTo(32, headY - 6); ctx.closePath(); ctx.fill();
  // eyes
  if (dead) {
    ctx.strokeStyle = "#0e1622";
    ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(26, headY - 3); ctx.lineTo(30, headY + 1); ctx.moveTo(30, headY - 3); ctx.lineTo(26, headY + 1); ctx.stroke();
  } else {
    const eg = aggressive ? "#ff8a70" : "#67c8f4";
    ctx.fillStyle = eg;
    if (aggressive) {
      ctx.shadowColor = eg; ctx.shadowBlur = 8;
    }
    ctx.beginPath(); ctx.arc(27, headY - 2, 1.9, 0, TAU); ctx.fill();
    ctx.shadowBlur = 0;
  }
}

// ════════════════════════════ SETTLEMENT RESIDENTS (Phase 6.2) ══════════════

/** A camp resident: smaller and softer than the hero, colour-coded by role.
 *  Workers wear steel-blue oilskins, warriors wear ash-grey with a weapon in
 *  hand, the medic wears white. Status is read from the resident's live sim
 *  state — injured characters sit, downed characters lie still. */
export function drawResident(ctx: CanvasRenderingContext2D, r: import("./residents").Resident, t: number) {
  const flip = Math.cos(r.face) < 0 ? -1 : 1;
  const moving = r.state === "go" || r.state === "flee" || r.state === "fight";
  const working = r.state === "work";
  const downed = r.downed;
  const sitting = r.injured && !downed && !moving;
  const bob = downed ? 0
    : moving ? Math.sin(r.walkPh * 2) * 1.3
    : working ? Math.sin(t * 6) * 0.5
    : Math.sin(t * 1.8 + r.walkPh) * 0.5;

  const warrior = r.role === "warrior";
  const medic = r.id === "rescue_sv_station";
  // palette
  const coatTop = medic ? "#e8eef4" : warrior ? "#7d8794" : "#4a90b8";
  const coatBot = medic ? "#b8c4cf" : warrior ? "#5a6372" : "#36698a";
  const hood = medic ? "#f2f6fa" : warrior ? "#8c96a4" : "#5ba3cc";

  shadow(ctx, r.x, r.y + 2, downed ? 17 : 13, 5.4, 0.24);
  ctx.save();
  ctx.translate(r.x, r.y - 1 + bob * 0.4);
  if (downed) {
    ctx.translate(0, 4);
    ctx.rotate(flip * 1.42);
  } else if (r.hurtT > 0) {
    ctx.rotate(flip * -0.16 * r.hurtT);
  }
  ctx.scale(flip, 1);
  const squat = sitting ? 4 : 0;

  // legs
  if (!downed) {
    const legPh = Math.sin(r.walkPh) * (moving ? 1 : 0);
    ctx.fillStyle = "#26303e";
    rrect(ctx, -5.4, -12 + legPh * 2.6, 4.8, 12 - Math.max(0, legPh * 2.6), 2.2); ctx.fill();
    rrect(ctx, 0.8, -12 - legPh * 2.6, 4.8, 12 + Math.min(0, legPh * 2.6), 2.2); ctx.fill();
  }

  // torso
  const torsoG = ctx.createLinearGradient(0, -40 + squat, 0, -11);
  torsoG.addColorStop(0, coatTop); torsoG.addColorStop(1, coatBot);
  ctx.fillStyle = torsoG;
  ctx.beginPath();
  ctx.moveTo(-9.6, -11);
  ctx.quadraticCurveTo(-11.2, -30, -6.8, -36 + squat);
  ctx.quadraticCurveTo(0, -41 + squat, 6.8, -36 + squat);
  ctx.quadraticCurveTo(11.2, -30, 9.6, -11);
  ctx.quadraticCurveTo(0, -7.4, -9.6, -11);
  ctx.closePath(); ctx.fill();
  // medic cross
  if (medic) {
    ctx.fillStyle = "#3fae6c";
    ctx.fillRect(-1.4, -30 + squat, 2.8, 9);
    ctx.fillRect(-4.5, -27 + squat, 9, 2.8);
  }

  // back arm
  ctx.fillStyle = coatBot;
  rrect(ctx, -10, -30 + squat, 5, 12, 2.4); ctx.fill();

  // front arm — work swing / combat swing / idle sway
  const swing = working ? Math.sin(t * 6) * 0.9
    : r.state === "fight" && r.atkCd > 0 ? -1.4 + (1 - r.atkCd / 1.5) * 2.2
    : moving ? Math.sin(r.walkPh) * 0.4
    : Math.sin(t * 1.8 + r.walkPh) * 0.08;
  ctx.save();
  ctx.translate(6, -31 + squat);
  ctx.rotate(swing);
  ctx.fillStyle = coatTop;
  rrect(ctx, -2.6, -2.6, 12, 5.6, 2.8); ctx.fill();
  ctx.fillStyle = "#25424f";
  ctx.beginPath(); ctx.arc(10.4, 0, 3.2, 0, TAU); ctx.fill();
  // warrior holds their REAL equipped weapon — reach and look both follow gear
  if (warrior) {
    ctx.translate(11, 0);
    const wep = r.gear?.weapon;
    const metal = wep === "crystalblade" ? "#8be8ff"
      : wep === "warspear" || wep === "ironaxe" ? "#d9e6f2" : "#c9d6e2";
    if (wep === "spear" || wep === "warspear" || (!wep && r.spec === "guard")) {
      const len = wep === "warspear" ? 34 : wep === "spear" ? 30 : 23;
      ctx.strokeStyle = "#8a6a45"; ctx.lineWidth = 2.6;
      ctx.beginPath(); ctx.moveTo(-8, 0); ctx.lineTo(len, 0); ctx.stroke();
      ctx.fillStyle = metal;
      ctx.beginPath(); ctx.moveTo(len, -3.8); ctx.lineTo(len + 9, 0); ctx.lineTo(len, 3.8); ctx.closePath(); ctx.fill();
    } else if (wep === "crystalblade") {
      ctx.strokeStyle = "#5a6372"; ctx.lineWidth = 2.4;
      ctx.beginPath(); ctx.moveTo(-4, 0); ctx.lineTo(4, 0); ctx.stroke();
      const bg = ctx.createLinearGradient(4, -4, 27, 4);
      bg.addColorStop(0, "#d9f2ff"); bg.addColorStop(1, "#67c8f4");
      ctx.fillStyle = bg;
      ctx.beginPath(); ctx.moveTo(4, -3); ctx.lineTo(27, -1.4); ctx.lineTo(27, 1.4); ctx.lineTo(4, 3); ctx.closePath(); ctx.fill();
    } else if (wep === "axe" || wep === "ironaxe") {
      ctx.strokeStyle = "#8a6a45"; ctx.lineWidth = 2.8;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(16, 0); ctx.stroke();
      ctx.fillStyle = metal;
      ctx.beginPath(); ctx.moveTo(14, -7); ctx.lineTo(24, -2); ctx.lineTo(24, 3); ctx.lineTo(14, 7); ctx.closePath(); ctx.fill();
    } else {
      ctx.strokeStyle = "#8a6a45"; ctx.lineWidth = 2.8;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(13, 0); ctx.stroke();
      ctx.fillStyle = "#9fb0c4";
      ctx.beginPath(); ctx.moveTo(12, -5); ctx.lineTo(20, -1); ctx.lineTo(20, 3); ctx.lineTo(12, 5); ctx.closePath(); ctx.fill();
    }
  } else if (working && r.task && (r.task === "wood" || r.task === "stone" || r.task === "ice")) {
    // a small hand tool while working a gathering post
    ctx.translate(11, 0);
    ctx.strokeStyle = "#8a6a45"; ctx.lineWidth = 2.6;
    ctx.beginPath(); ctx.moveTo(-2, 0); ctx.lineTo(13, 0); ctx.stroke();
    ctx.fillStyle = "#9fb0c4";
    ctx.beginPath(); ctx.moveTo(12, -5); ctx.lineTo(19, -1); ctx.lineTo(19, 3); ctx.lineTo(12, 5); ctx.closePath(); ctx.fill();
  }
  ctx.restore();

  // head — hood with face opening
  const hoodG = ctx.createLinearGradient(0, -52 + squat, 0, -38 + squat);
  hoodG.addColorStop(0, hood); hoodG.addColorStop(1, coatBot);
  ctx.fillStyle = hoodG;
  ctx.beginPath(); ctx.arc(0, -43 + squat, 8.4, 0, TAU); ctx.fill();
  ctx.fillStyle = "#241a14";
  ctx.beginPath(); ctx.ellipse(2.2, -42.6 + squat, 5.4, 5.9, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = "#e8c9a8";
  ctx.beginPath(); ctx.ellipse(3, -42.4 + squat, 3.4, 4.3, 0, 0, TAU); ctx.fill();

  // hurt flash
  if (r.hurtT > 0) {
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = Math.min(0.55, r.hurtT * 2);
    ctx.fillStyle = "#ff5050";
    ctx.beginPath(); ctx.arc(0, -24, 16, 0, TAU); ctx.fill();
  }
  ctx.restore();

  // ── name + status badge (small, high-contrast, no HUD dependency) ──
  ctx.save();
  ctx.font = "700 9px Rajdhani, sans-serif";
  ctx.textAlign = "center";
  const ny = r.y - (downed ? 30 : 58);
  const label = r.name.split(" ")[0];
  const w = ctx.measureText(label).width;
  ctx.fillStyle = "rgba(6,12,22,0.55)";
  ctx.fillRect(r.x - w / 2 - 3, ny - 8, w + 6, 10);
  ctx.fillStyle = r.injured || r.downed ? "#ff9d9d" : "rgba(217,242,255,0.85)";
  ctx.fillText(label, r.x, ny);

  // guard alert marker: a visible "!" the moment a sighting is committed
  if (r.role === "warrior" && (r.gs === "alert" || r.gs === "pursue" || r.gs === "attack" || r.gs === "recover")) {
    const p2 = 0.65 + Math.sin(t * 7) * 0.35;
    ctx.fillStyle = `rgba(255,176,99,${p2})`;
    ctx.font = "900 13px Rajdhani, sans-serif";
    ctx.fillText("!", r.x, ny - 11);
  }

  if (r.downed || r.injured || r.unfed >= 2 || r.state === "flee") {
    const pulse = 0.7 + Math.sin(t * 4) * 0.3;
    ctx.fillStyle = r.downed ? `rgba(232,72,72,${pulse})` : r.injured ? `rgba(255,157,138,${pulse})` : `rgba(255,176,99,${pulse})`;
    ctx.beginPath(); ctx.arc(r.x + w / 2 + 9, ny - 3.4, 4.6, 0, TAU); ctx.fill();
    ctx.fillStyle = "#0a1420";
    ctx.font = "900 7px Rajdhani, sans-serif";
    ctx.fillText(r.unfed >= 2 && !r.injured && !r.downed ? "!" : "✚", r.x + w / 2 + 9, ny - 1);
  }
  // thin live hp strip under the name when hurt
  if (r.hp < r.maxHp) {
    const pct = Math.max(0, Math.min(1, r.hp / r.maxHp));
    ctx.fillStyle = "rgba(6,12,22,0.6)";
    ctx.fillRect(r.x - 14, ny + 3, 28, 3);
    ctx.fillStyle = pct > 0.5 ? "#7fd6a4" : pct > 0.3 ? "#ffb063" : "#ff6b6b";
    ctx.fillRect(r.x - 14, ny + 3, 28 * pct, 3);
  }
  ctx.restore();
}
