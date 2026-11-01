// ── ICEBOUND Phase 5.1: contextual onboarding ──────────────────────────────
// Short, situational hints instead of a blocking tutorial. Each tip fires at
// most once per save, only one can be on screen at a time, and the whole
// system can be switched off in Settings for experienced players.

import { BAL } from "./config";
import type { GameState } from "./types";
import { capacity, countItem, usedSlots } from "./state";

export interface TutorialTip {
  id: string;
  title: string;
  body: string;
  icon: string;
  /** Higher wins when several tips qualify on the same frame. */
  priority: number;
  /** Fires when this becomes true. Must read real game state only. */
  when: (s: GameState) => boolean;
}

const near = (s: GameState, x: number, y: number, r: number) =>
  Math.hypot(s.player.x - x, s.player.y - y) < r;

export const TIPS: TutorialTip[] = [
  {
    id: "move", priority: 100, icon: "move",
    title: "Move out",
    body: "WASD or the left stick to walk. Hold Shift (or push the stick to its rim) to sprint — sprinting burns stamina.",
    when: s => s.stats.distance < 10,
  },
  {
    id: "gather", priority: 90, icon: "wood",
    title: "Gather what you can carry",
    body: "Stand close to a resource and press E, or tap the hand button. Fallen branches and rock outcrops need no tools.",
    when: s => !!s.interact && s.interact.kind === "node" && s.stats.gathered === 0,
  },
  {
    id: "temperature", priority: 85, icon: "temp",
    title: "You are losing heat",
    body: "Body temperature falls faster at night and in bad weather. Firelight, shelter and warmer clothing all slow the loss.",
    when: s => s.player.temp <= 62,
  },
  {
    id: "outpost", priority: 80, icon: "shelter",
    title: "The damaged outpost",
    body: "Interact with the shelter to open the construction roadmap. It shows the exact materials for the next upgrade.",
    when: s => s.region === "forest" && s.shelter.stage === 0 &&
      near(s, -60, -190, 190),
  },
  {
    id: "craft", priority: 75, icon: "hammer",
    title: "Craft your first tool",
    body: "Press C to open crafting. A Stone Axe (3 Wood + 2 Stone) lets you fell Frost Pines and doubles as a weapon.",
    when: s => countItem(s, "wood") >= 3 && countItem(s, "stone") >= 2 &&
      !s.crafted.includes("axe"),
  },
  {
    id: "belt", priority: 72, icon: "meat",
    title: "The ration belt",
    body: "Keys 1 / 2 / 3 — or the belt icons at the bottom — eat, drink and heal instantly without opening a menu.",
    when: s => s.player.hunger <= 55 || s.player.thirst <= 55,
  },
  {
    id: "combat", priority: 70, icon: "wolf",
    title: "Something is hunting you",
    body: "Space attacks, Q dodges. Every creature telegraphs before it strikes — dodge through the warning, then hit it during its recovery.",
    when: s => s.enemies.some(e => !e.dead && e.alerted &&
      Math.hypot(e.x - s.player.x, e.y - s.player.y) < 340),
  },
  {
    id: "fire", priority: 65, icon: "fire",
    title: "Keep the fire fed",
    body: "A lit campfire warms the whole camp, cooks meat, melts ice into water and keeps ordinary predators at the treeline. It burns wood to do it.",
    when: s => s.shelter.fire.built && !s.shelter.fire.lit,
  },
  {
    id: "pack", priority: 60, icon: "backpack",
    title: "Your pack is filling up",
    body: "Each distinct item takes a slot. Store surplus in the Supply Cache at the outpost, or raise your limit with the Porter upgrade.",
    when: s => usedSlots(s) >= capacity(s) - 2,
  },
  {
    id: "quests", priority: 55, icon: "quests",
    title: "Expedition Log",
    body: "Your current objective is tracked bottom-left. Open the full log for the exact requirements of every step, plus optional side work.",
    when: s => s.questsDone.length >= 1,
  },
  {
    id: "progress", priority: 50, icon: "progress",
    title: "You are getting better at this",
    body: "Gathering, crafting, fighting and exploring all earn experience. Each level grants an upgrade point — spend it in the Survivor Record (P).",
    when: s => s.progression.points >= 1,
  },
  {
    id: "expedition", priority: 45, icon: "map",
    title: "Preparing an expedition",
    body: "The Expedition Gate opens the travel map. It lists each region's threats and a readiness checklist — food, water, medicine, a weapon and free slots.",
    when: s => !!s.flags.sawGate,
  },
  {
    id: "discovery", priority: 40, icon: "compass",
    title: "Points of interest",
    body: "Hidden sites shimmer faintly as you approach. Walk to one to record it, claim its supplies and read what the last person there left behind.",
    when: s => s.stats.discoveries >= 1,
  },
];

const TIP_COOLDOWN = 9; // in-game seconds between tips, so they never stack

export interface TutorialPick { tip: TutorialTip }

/**
 * Pick the next tip to show, or null. Marks the tip as seen so it never
 * repeats. Returns null when tips are disabled, a tip is on cooldown, or
 * nothing currently qualifies.
 */
export function pickTutorialTip(s: GameState, lastShownAt: number): TutorialTip | null {
  if (!s.settings.tips) return null;
  if (s.screen !== "game" || s.modal || s.player.dead) return null;
  if (s.time - lastShownAt < TIP_COOLDOWN) return null;

  let best: TutorialTip | null = null;
  for (const tip of TIPS) {
    if (s.flags[`tip_${tip.id}`]) continue;
    if (!tip.when(s)) continue;
    if (!best || tip.priority > best.priority) best = tip;
  }
  return best;
}

export const markTipSeen = (s: GameState, id: string) => { s.flags[`tip_${id}`] = true; };

export const tipsSeenCount = (s: GameState) =>
  TIPS.filter(t => s.flags[`tip_${t.id}`]).length;

/** Used by Settings to let a player replay the guidance. */
export function resetTips(s: GameState) {
  for (const t of TIPS) delete s.flags[`tip_${t.id}`];
}

void BAL;
