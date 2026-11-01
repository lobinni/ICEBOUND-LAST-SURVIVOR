// ── ICEBOUND: ration belt — one-tap Eat / Drink / Heal at the screen edge ───
// Reads the inventory live (no duplicate state), so it works through middles
// of fights, freezes and expeditions without opening a single menu.

import { BAL, ITEMS } from "../game/config";
import type { Game, QuickKind } from "../game/engine";
import { useGame } from "./hooks";
import { ItemIcon } from "./icons";
import { cn } from "@/utils/cn";

const SLOT_META: Record<QuickKind, { verb: string; key: string; accent: string }> = {
  food:  { verb: "Eat",   key: "1", accent: "#ffb063" },
  drink: { verb: "Drink", key: "2", accent: "#67c8f4" },
  heal:  { verb: "Heal",  key: "3", accent: "#7fd6a4" },
};

function BeltSlot({ game, kind, critical }: { game: Game; kind: QuickKind; critical: boolean }) {
  const s = useGame(game);
  void s; // re-render driver only — the engine is the source of truth
  const pick = game.beltItem(kind);
  const meta = SLOT_META[kind];
  const empty = !pick;

  return (
    <button
      onPointerDown={(e) => { e.preventDefault(); game.quickUse(kind); }}
      title={pick ? `${meta.verb}: ${ITEMS[pick.id].name} ×${pick.count}` : `${meta.verb} — nothing usable in the pack`}
      aria-label={`${meta.verb} from the field pack`}
      className={cn(
        "touchbtn relative h-14 w-14 flex-col sm:h-16 sm:w-16",
        empty && "off",
        !empty && critical && "animate-pulse-warn"
      )}
      style={!empty ? { borderColor: critical ? "rgba(255,110,90,0.7)" : `${meta.accent}55` } : undefined}
    >
      <ItemIcon
        icon={pick ? ITEMS[pick.id].icon : meta.verb.toLowerCase()}
        className="h-5 w-5 sm:h-6 sm:w-6"
        color={pick ? ITEMS[pick.id].color : undefined}
      />
      <span className="font-display text-[8px] font-bold uppercase tracking-[0.14em] text-frost-300/80">
        {meta.verb}
      </span>
      {/* live count badge */}
      <span className={cn(
        "absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center px-1 font-display text-[10px] font-bold",
        empty ? "bg-ink-800 text-blood-400" : "bg-ink-900 text-frost-200"
      )}
        style={{ clipPath: "polygon(4px 0,100% 0,100% calc(100% - 4px),calc(100% - 4px) 100%,0 100%,0 4px)", border: "1px solid rgba(126,196,244,0.3)" }}>
        {pick ? pick.count : "0"}
      </span>
      {/* desktop key hint */}
      <span className="absolute -bottom-1.5 left-1/2 hidden -translate-x-1/2 rounded bg-black/50 px-1 font-display text-[9px] font-bold text-frost-300/70 sm:block">
        {meta.key}
      </span>
    </button>
  );
}

export function QuickBelt({ game }: { game: Game }) {
  const s = useGame(game);
  if (s.modal || s.player.dead) return null;
  const p = s.player;
  return (
    <div
      className="pointer-events-auto absolute left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 sm:gap-3"
      style={{
        // Clears the action cluster (82px button + padding) and the home bar.
        bottom: "calc(max(0.75rem, env(safe-area-inset-bottom)) + 6.25rem)",
      }}
    >
      <BeltSlot game={game} kind="food"  critical={p.hunger <= 20} />
      <BeltSlot game={game} kind="drink" critical={p.thirst <= 20} />
      <BeltSlot game={game} kind="heal"  critical={p.hp <= 40} />
      {p.temp <= BAL.tempWarn && s.equip.gear === "heatcore" && (
        <span className="chip pointer-events-none absolute -top-6 left-1/2 -translate-x-1/2 whitespace-nowrap border border-ember-400/50 bg-ember-500/15 text-ember-300">
          <ItemIcon icon="heatcore" className="h-3 w-3" /> Heat Core slowing the cold
        </span>
      )}
    </div>
  );
}
