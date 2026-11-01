// ── ICEBOUND Phase 5.1: contextual hint card ───────────────────────────────
// One hint at a time, non-blocking, dismissible. Never covers the movement
// controls or the action cluster.

import { useEffect, useState } from "react";
import type { Game } from "../game/engine";
import type { TutorialTip } from "../game/tutorial";
import { useGame } from "./hooks";
import { ItemIcon } from "./icons";

export function TutorialHint({ game }: { game: Game }) {
  const s = useGame(game);
  const [tip, setTip] = useState<TutorialTip | null>(null);

  useEffect(() => game.on("tip", p => {
    setTip(p as TutorialTip);
    // Auto-retire so the card never lingers over gameplay.
    window.setTimeout(() => setTip(cur => (cur === p ? null : cur)), 13000);
  }), [game]);

  // Never compete with a modal or the death screen for attention.
  if (!tip || s.modal || s.player.dead) return null;

  return (
    <div className="pointer-events-none absolute inset-x-0 top-[30%] z-30 flex justify-center px-4">
      <div className="panel animate-rise pointer-events-auto w-full max-w-sm px-4 py-3">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center text-ember-400">
            <ItemIcon icon={tip.icon} className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="font-display text-[14px] font-bold tracking-wide text-frost-200">
              {tip.title}
            </div>
            <p className="mt-0.5 text-[12px] leading-snug text-frost-300/80">{tip.body}</p>
          </div>
        </div>
        <div className="mt-2.5 flex gap-2">
          <button onClick={() => setTip(null)} className="btn btn-frost flex-1 px-3 py-2 text-[11px]">
            Got it
          </button>
          <button
            onClick={() => { game.setSetting({ tips: false }); setTip(null); }}
            className="btn btn-ghost px-3 py-2 text-[11px]"
            title="Turn off all contextual hints (Settings can re-enable them)"
          >
            Stop hints
          </button>
        </div>
      </div>
    </div>
  );
}
