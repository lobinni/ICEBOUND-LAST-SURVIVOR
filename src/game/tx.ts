// ── ICEBOUND Phase 4.3: atomic resource transactions ───────────────────────
// Every path that moves items goes through here so the rules can never drift:
// crafting, building, quest rewards, daily rewards, gathering, containers,
// discoveries, storage transfer and consumption.

import { ITEMS } from "./config";
import type { GameState, ItemId } from "./types";
import { addItem, capacity, countItem, removeItem, usedSlots } from "./state";

export type Bag = "inv" | "storage";

// ── inspection (pure, no mutation) ─────────────────────────────────────────

export function stackCeiling(id: ItemId, bag: Bag) {
  return ITEMS[id].stack * (bag === "storage" ? 4 : 1);
}

/** How many of `id` can still enter `bag` right now (0 if none). */
export function spaceFor(s: GameState, id: ItemId, bag: Bag = "inv"): number {
  const cur = countItem(s, id, bag);
  const room = stackCeiling(id, bag) - cur;
  if (room <= 0) return 0;
  // A brand-new stack needs a free slot in the field pack.
  if (bag === "inv" && cur <= 0 && usedSlots(s) >= capacity(s)) return 0;
  return room;
}

export const hasItems = (
  s: GameState,
  needs: Partial<Record<ItemId, number>>,
  bag: Bag = "inv",
) => (Object.entries(needs) as [ItemId, number][]).every(
  ([id, n]) => Number.isFinite(n) && n >= 0 && countItem(s, id, bag) >= n,
);

/** First reason the cost cannot be paid, or null when it can. */
export function whyCannotPay(s: GameState, needs: Partial<Record<ItemId, number>>): string | null {
  for (const [id, n] of Object.entries(needs) as [ItemId, number][]) {
    const have = countItem(s, id);
    if (have < n) return `Missing ${ITEMS[id].name} (${have}/${n})`;
  }
  return null;
}

// ── mutations (each returns exactly what it changed) ───────────────────────

/** Pay a cost. Returns false WITHOUT mutating if any part cannot be paid. */
export function pay(s: GameState, needs: Partial<Record<ItemId, number>>, bag: Bag = "inv"): boolean {
  if (!hasItems(s, needs, bag)) return false;                  // validate first
  for (const [id, n] of Object.entries(needs) as [ItemId, number][]) {
    if (!removeItem(s, id, n, bag)) return false;              // defensive: never partially paid
  }
  return true;
}

/** True when `id` can be equipped right now (exists and is an equippable). */
export function canEquip(s: GameState, id: ItemId): boolean {
  const def = ITEMS[id];
  return !!def.equip && countItem(s, id) > 0;
}

/**
 * Grant items, overflowing safely instead of being lost.
 * Returns how the grant was split so callers can report it honestly.
 * `pickup` is only used when both bags are genuinely full.
 */
export function grant(
  s: GameState,
  id: ItemId,
  n: number,
  opts: { pickup?: (n: number) => void } = {},
): { packed: number; stored: number; dropped: number } {
  // Story-critical items bypass capacity entirely. Dropping one on the ground
  // would let region travel delete it and permanently block the main quest —
  // there are exactly two Frost Sigils in the world and the gate needs both.
  if (ITEMS[id].cat === "key") {
    // Key stacks still respect their configured ceiling: repeating a guarded
    // unique reward can never create duplicate keycards or Guardian Cores.
    const held = (s.inv[id] ?? 0) + (s.storage[id] ?? 0);
    const packed = Math.max(0, Math.min(n, ITEMS[id].stack - held));
    if (packed > 0) s.inv[id] = (s.inv[id] ?? 0) + packed;
    return { packed, stored: 0, dropped: 0 };
  }
  const packed = addItem(s, id, n, "inv");
  let left = n - packed;
  let stored = 0;
  if (left > 0) {
    stored = addItem(s, id, left, "storage");
    left -= stored;
  }
  const dropped = left;
  if (dropped > 0 && opts.pickup) opts.pickup(dropped);
  return { packed, stored, dropped };
}
