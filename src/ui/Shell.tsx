import { X } from "lucide-react";
import { ItemIcon } from "./icons";
import { cn } from "@/utils/cn";

// ── shell ────────────────────────────────────────────────────────────────────

export function Shell({ title, icon, onClose, children, wide, sub }: {
  title: string; icon: string; onClose: () => void; children: React.ReactNode; wide?: boolean; sub?: string;
}) {
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-ink-950/55 p-2 backdrop-blur-[3px] sm:items-center sm:p-6" onClick={onClose}>
      <div
        className={cn("panel animate-rise flex max-h-[90dvh] w-full flex-col overflow-hidden", wide ? "max-w-2xl" : "max-w-lg")}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-frost-400/15 px-4 py-3 sm:px-5">
          <div className="flex items-center gap-2.5">
            <span className="text-ember-400"><ItemIcon icon={icon} className="h-5 w-5" /></span>
            <div>
              <h2 className="font-display text-lg font-bold uppercase leading-none tracking-[0.18em] text-frost-200">{title}</h2>
              {sub && <p className="mt-1 text-[11px] text-frost-300/60">{sub}</p>}
            </div>
          </div>
          <button onClick={onClose} className="touchbtn h-9 w-9" style={{ borderRadius: 0, clipPath: "polygon(6px 0,100% 0,100% calc(100% - 6px),calc(100% - 6px) 100%,0 100%,0 6px)" }}>
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-4 py-3 sm:px-5">{children}</div>
      </div>
    </div>
  );
}

