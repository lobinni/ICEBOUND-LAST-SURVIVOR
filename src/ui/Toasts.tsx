import { useEffect, useState } from "react";
import type { Game } from "../game/engine";
import type { ToastMsg } from "../game/types";
import { ItemIcon } from "./icons";
import { cn } from "@/utils/cn";

export function Toasts({ game }: { game: Game }) {
  const [items, setItems] = useState<ToastMsg[]>([]);

  useEffect(() => {
    const off = game.on("toast", (p) => {
      const msg = p as ToastMsg;
      // Hard cap: never more than three on screen at once (spec 6).
      setItems(list => [...list, msg].slice(-3));
      window.setTimeout(() => {
        setItems(list => list.filter(i => i.id !== msg.id));
      }, msg.kind === "quest" || msg.kind === "discovery" ? 5200 : 3400);
    });
    return off;
  }, [game]);

  return (
    <div className="pointer-events-none fixed inset-x-0 top-14 z-50 flex flex-col items-center gap-2 px-4 sm:top-16">
      {items.map(m => (
        <div
          key={m.id}
          className={cn(
            "panel animate-toast-in flex max-w-md items-center gap-3 px-4 py-2.5",
            m.kind === "quest" && "border-ember-400/60 shadow-[0_0_34px_rgba(255,143,61,0.25)]",
            m.kind === "warn" && "border-blood-400/60",
            m.kind === "error" && "border-blood-500/70",
            m.kind === "good" && "border-moss-400/60"
          )}
        >
          <span
            className={cn(
              "flex h-8 w-8 shrink-0 items-center justify-center",
              m.kind === "quest" ? "text-ember-400" : m.kind === "warn" || m.kind === "error" ? "text-blood-400" : m.kind === "good" ? "text-moss-400" : "text-frost-300"
            )}
          >
            <ItemIcon icon={m.icon ?? (m.kind === "quest" ? "done" : m.kind === "warn" ? "warn" : "flag")} className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <div className={cn("font-display text-[15px] font-bold leading-tight tracking-wide", m.kind === "warn" || m.kind === "error" ? "text-blood-400" : "text-frost-200")}>
              {m.title}
            </div>
            {m.sub && <div className="text-[12px] leading-snug text-frost-300/80">{m.sub}</div>}
          </div>
          {m.kind === "quest" && (
            <div className="pointer-events-none absolute inset-0 overflow-hidden">
              <div className="animate-shine absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-ember-300/20 to-transparent" />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
