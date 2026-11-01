// ── ICEBOUND Phase 5.3: credits ────────────────────────────────────────────

import keyart from "../assets/keyart.jpg";
import { ALL_DISCOVERY_COUNT } from "../game/discoveries";
import { REGION_ORDER } from "../game/config";
import { mainQuests, sideQuests } from "../game/systems";
import { ItemIcon } from "./icons";

const SECTIONS: { title: string; lines: string[] }[] = [
  {
    title: "Design & Engineering",
    lines: [
      "Game design, systems architecture and programming",
      "Custom Canvas 2.5D rendering engine",
      "Procedural world generation and terrain painting",
    ],
  },
  {
    title: "Art",
    lines: [
      "All environments, creatures, props and interface art drawn",
      "procedurally with Canvas 2D — layered gradients and vector paths.",
      "Key art and defeat illustration generated for this project.",
    ],
  },
  {
    title: "Audio",
    lines: [
      "Every sound synthesised at runtime with the Web Audio API.",
      "Ambient wind, storm beds, campfire, combat, creatures and UI —",
      "no sample files, no streaming, no network requests.",
    ],
  },
  {
    title: "Technology",
    lines: [
      "TypeScript · React · Vite · Tailwind CSS",
      "Canvas 2D rendering · Web Audio synthesis",
      "localStorage persistence · fully offline single-player",
    ],
  },
  {
    title: "Typefaces",
    lines: ["Rajdhani and Exo 2 — bundled locally via @fontsource"],
  },
];

export function Credits({ onBack }: { onBack: () => void }) {
  return (
    <div className="absolute inset-0 z-40 overflow-hidden">
      <img src={keyart} alt="" className="absolute inset-0 h-full w-full object-cover" draggable={false} />
      <div className="absolute inset-0 bg-gradient-to-b from-ink-950/85 via-ink-950/90 to-ink-950/95" />
      <div className="menu-snow pointer-events-none absolute inset-0 opacity-40" />

      <div className="relative z-10 flex h-full flex-col">
        <div className="shrink-0 px-6 pb-3 pt-[max(1.25rem,env(safe-area-inset-top))] text-center">
          <h2 className="title-grad font-display text-3xl font-bold tracking-[0.14em]">CREDITS</h2>
          <p className="mt-1 font-display text-[10px] uppercase tracking-[0.3em] text-frost-300/55">
            Icebound: Last Survivor
          </p>
        </div>

        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-6 pb-4">
          <div className="mx-auto max-w-md space-y-4">
            {SECTIONS.map(sec => (
              <div key={sec.title} className="panel-soft px-4 py-3">
                <div className="mb-1.5 font-display text-[10px] font-bold uppercase tracking-[0.22em] text-ember-300">
                  {sec.title}
                </div>
                {sec.lines.map(l => (
                  <p key={l} className="text-[12px] leading-relaxed text-frost-300/80">{l}</p>
                ))}
              </div>
            ))}

            <div className="panel-soft px-4 py-3">
              <div className="mb-1.5 font-display text-[10px] font-bold uppercase tracking-[0.22em] text-ember-300">
                The Expedition
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[12px] text-frost-300/80">
                <span>Regions</span><span className="text-right font-display font-bold text-frost-200">{REGION_ORDER.length}</span>
                <span>Main objectives</span><span className="text-right font-display font-bold text-frost-200">{mainQuests().length}</span>
                <span>Optional objectives</span><span className="text-right font-display font-bold text-frost-200">{sideQuests().length}</span>
                <span>Points of interest</span><span className="text-right font-display font-bold text-frost-200">{ALL_DISCOVERY_COUNT}</span>
              </div>
            </div>

            <p className="px-2 text-center text-[11px] leading-relaxed text-frost-300/60">
              Thank you for surviving the ice. Everything in this build runs offline —
              no account, no network, no tracking. Your save lives on this device only.
            </p>
          </div>
        </div>

        <div className="shrink-0 px-6 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <button onClick={onBack} className="btn btn-frost mx-auto block w-full max-w-xs px-6 py-3 text-sm">
            <ItemIcon icon="exit" className="h-4 w-4" /> Back to menu
          </button>
        </div>
      </div>
    </div>
  );
}
