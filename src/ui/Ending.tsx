// ── ICEBOUND Phase 5.1: ending sequence ────────────────────────────────────
// Story resolution + a run summary. Continuing never resets the save: the
// world, outpost, inventory and progression are all left exactly as they are.

import { useEffect, useState } from "react";
import { BAL, LOGS, REGIONS, REGION_ORDER } from "../game/config";
import { ALL_DISCOVERY_COUNT } from "../game/discoveries";
import { TRANSMISSIONS } from "../game/story";
import { mainQuests, sideQuests } from "../game/systems";
import type { Game } from "../game/engine";
import { useGame } from "./hooks";
import { ItemIcon } from "./icons";
import { cn } from "@/utils/cn";

const RESOLUTION = [
  "The lattice under the glacier was never a power source. It was a lung, and the aurora taught it to breathe.",
  "Hoffmann scaled it to the reactor anyway. What woke in the containment yard put on the Guardian frame like a coat and walked.",
  "Nilsen logged an objection. Bergmann got nine people as far as a helipad whose rotors were already iced. None of them left the ice.",
  "You pulled the core out of the thing that wore their machine, carried it home through five regions of their frozen work, and sent the warning they never could.",
];

export function EndingScreen({ game }: { game: Game }) {
  const s = useGame(game);
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(0);

  useEffect(() => game.on("ending", () => { setPage(0); setOpen(true); }), [game]);
  if (!open) return null;

  const days = Math.max(1, Math.floor(s.time / BAL.dayLength) + 1);
  const mainDone = mainQuests().filter(q => s.questsDone.includes(q.id)).length;
  const sideDone = sideQuests().filter(q => s.questsDone.includes(q.id)).length;
  const regionsFound = REGION_ORDER.filter(r => s.regions[r]?.discovered).length;
  const logCount = Object.keys(LOGS).length + TRANSMISSIONS.length;

  const rows: [string, string, string][] = [
    ["progress", "Survivor level", String(s.progression.level)],
    ["sun", "Days survived", String(days)],
    ["flag", "Main objectives", `${mainDone}/${mainQuests().length}`],
    ["quests", "Side objectives", `${sideDone}/${sideQuests().length}`],
    ["map", "Regions reached", `${regionsFound}/${REGION_ORDER.length}`],
    ["compass", "Sites recorded", `${s.stats.discoveries}/${ALL_DISCOVERY_COUNT}`],
    ["journal", "Records recovered", `${s.logs.length}/${logCount}`],
    ["wolf", "Creatures defeated", String(s.stats.kills)],
    ["core", "Guardians destroyed", String(s.stats.bosses)],
    ["crate", "Containers opened", String(s.stats.containers)],
  ];

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-ink-950/85 p-4 backdrop-blur-sm">
      <div className="panel animate-rise flex max-h-[90dvh] w-full max-w-lg flex-col overflow-hidden">
        <div className="border-b border-frost-400/15 px-6 py-4 text-center">
          <div className="mb-1.5 flex justify-center text-ember-400">
            <ItemIcon icon="bolt" className="h-8 w-8" />
          </div>
          <h2 className="title-grad font-display text-3xl font-bold tracking-[0.12em]">
            THE LAST TRANSMISSION
          </h2>
          <p className="mt-1 font-display text-[10px] uppercase tracking-[0.3em] text-frost-300/55">
            Chapter VI · resolution
          </p>
        </div>

        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-6 py-4">
          {page === 0 ? (
            <div className="space-y-2.5">
              {RESOLUTION.map((line, i) => (
                <p key={i} className="animate-rise text-[13px] leading-relaxed text-frost-300/85"
                  style={{ animationDelay: `${i * 110}ms` }}>
                  {line}
                </p>
              ))}
              <div className="panel-soft mt-3 border-ember-400/35 px-4 py-3">
                <p className="text-[13px] leading-relaxed text-frost-200">
                  The storm will come back. The outpost is still standing, the fire is still
                  burning, and for the first time since the crash the radio is not the only
                  thing out here making noise.
                </p>
              </div>
            </div>
          ) : (
            <>
              <div className="mb-2 flex items-center gap-2">
                <span className="font-display text-[10px] font-bold uppercase tracking-[0.22em] text-frost-300/50">
                  Expedition record
                </span>
                <span className="h-px flex-1 bg-frost-400/15" />
              </div>
              <div className="grid gap-1.5 sm:grid-cols-2">
                {rows.map(([icon, label, value]) => (
                  <div key={label} className="panel-soft flex items-center gap-2.5 px-3 py-2">
                    <ItemIcon icon={icon} className="h-4 w-4 shrink-0 text-frost-300" />
                    <span className="min-w-0 flex-1 truncate text-[11px] text-frost-300/75">{label}</span>
                    <span className="font-display text-[13px] font-bold tabular-nums text-frost-200">{value}</span>
                  </div>
                ))}
              </div>

              <div className="mb-2 mt-4 flex items-center gap-2">
                <span className="font-display text-[10px] font-bold uppercase tracking-[0.22em] text-frost-300/50">
                  Regions
                </span>
                <span className="h-px flex-1 bg-frost-400/15" />
              </div>
              <div className="flex flex-wrap gap-1.5">
                {REGION_ORDER.map(id => {
                  const seen = s.regions[id]?.discovered;
                  return (
                    <span key={id} className={cn("chip border",
                      seen ? "border-moss-400/40 bg-moss-400/10 text-moss-400"
                           : "border-frost-400/15 bg-ink-800/60 text-frost-300/40")}>
                      <ItemIcon icon={REGIONS[id].icon} className="h-3 w-3" />
                      {REGIONS[id].name}
                    </span>
                  );
                })}
              </div>

              {(sideDone < sideQuests().length || s.stats.discoveries < ALL_DISCOVERY_COUNT) && (
                <p className="mt-3 text-[11px] leading-snug text-frost-300/60">
                  Unfinished work remains: optional objectives and unrecorded sites are still out
                  there, and the regions repopulate. Your save continues exactly as it is.
                </p>
              )}
            </>
          )}
        </div>

        <div className="border-t border-frost-400/15 px-6 py-3">
          {page === 0 ? (
            <button onClick={() => setPage(1)} className="btn btn-ember w-full px-4 py-3 text-sm">
              <ItemIcon icon="done" className="h-4 w-4" /> Expedition record
            </button>
          ) : (
            <div className="space-y-2">
              <button onClick={() => { setOpen(false); game.resumeAfterEnding(); }} className="btn btn-ember w-full px-4 py-3 text-sm">
                <ItemIcon icon="play" className="h-4 w-4" /> Continue surviving
              </button>
              <p className="text-center text-[10px] text-frost-300/45">
                Nothing is reset. Free roam continues from this moment.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
