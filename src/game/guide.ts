// ── ICEBOUND: material run guidance — real navigation to nearby resources ──

import { WORLD } from "./config";
import type { GameState, WNode } from "./types";
/** Closest usable construction material source. */
export function materialGuidePoint(s: GameState, target: "ice" | "wood" | "stone"): { x: number; y: number; label: string } | null {
  if (s.region !== "forest") return null;
  const p = s.player;
  let best: WNode | null = null;
  let bd = Infinity;
  const matches = (n: WNode) => {
    if (target === "ice") return n.kind === "ice";
    if (target === "wood") return n.kind === "branch" || n.kind === "tree";
    return n.kind === "stone";
  };
  for (const n of s.nodes) {
    if (!matches(n) || n.amount <= 0) continue;
    const d = Math.hypot(n.x - p.x, n.y - p.y);
    if (d < bd) { bd = d; best = n; }
  }
  if (best) {
    const label = target === "ice" ? "river ice" : target === "wood" ? "wood source" : "rock outcrop";
    return { x: best.x, y: best.y, label };
  }
  if (target === "ice") return { x: 0, y: WORLD.riverY, label: "Frozen River" };
  return null;
}

