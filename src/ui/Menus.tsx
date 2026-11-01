import { useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";
import keyart from "../assets/keyart.jpg";
import gameoverImg from "../assets/gameover.jpg";
import type { Game } from "../game/engine";
import { BAL, LOGS, REGIONS, REGION_ORDER } from "../game/config";
import { DIFFICULTIES, DIFFICULTY_ORDER, type DifficultyId } from "../game/difficulty";
import { useGame } from "./hooks";
import { ItemIcon } from "./icons";
import { HelpModal, SettingsModal } from "./Modals";
import { Credits } from "./Credits";
import { cn } from "@/utils/cn";

function Backdrop({ src, dim = 0.45 }: { src: string; dim?: number }) {
  return (
    <>
      <img src={src} alt="" className="absolute inset-0 h-full w-full object-cover" draggable={false} />
      <div className="absolute inset-0" style={{ background: `linear-gradient(160deg, rgba(5,10,18,${dim + 0.25}) 0%, rgba(5,10,18,${dim}) 45%, rgba(5,10,18,${dim + 0.3}) 100%)` }} />
      <div className="menu-snow pointer-events-none absolute inset-0 opacity-60" />
    </>
  );
}

export function MainMenu({ game }: { game: Game }) {
  useGame(game);
  const [confirmNew, setConfirmNew] = useState(false);
  const [modal, setModal] = useState<"settings" | "help" | "credits" | null>(null);
  const [saveExists, setSaveExists] = useState(game.hasSave());
  const [slot, setSlot] = useState(() => game.saveSummary());
  useEffect(() => {
    const off = game.on("saved", () => { setSaveExists(game.hasSave()); setSlot(game.saveSummary()); });
    setSaveExists(game.hasSave());
    setSlot(game.saveSummary());
    return off;
  }, [game]);

  return (
    <div className="absolute inset-0 z-30 overflow-hidden">
      <Backdrop src={keyart} />
      <div className="relative z-10 flex h-full flex-col items-center justify-center px-5 text-center">
        <div className="chip mb-4 border border-frost-400/30 bg-ink-900/60 text-frost-300">
          Arctic Incident · Kvesta Station · File 07
        </div>
        <h1 className="title-grad font-display text-[17vw] font-bold leading-[0.9] tracking-[0.06em] sm:text-7xl md:text-8xl">
          ICEBOUND
        </h1>
        <div className="font-display mt-1 text-[5vw] font-bold tracking-[0.55em] text-ember-400 sm:text-2xl" style={{ textIndent: "0.55em" }}>
          LAST SURVIVOR
        </div>
        <p className="mt-4 max-w-md text-[13px] leading-relaxed text-frost-300/80">
          The station went dark. The storm never ended. Rebuild the outpost, cross five frozen
          regions, and find out what the ice is hiding.
        </p>

        <div className="mt-8 flex w-full max-w-[280px] flex-col gap-2.5">
          <button
            disabled={!saveExists}
            onClick={() => game.continueGame()}
            className="btn btn-frost px-6 py-3.5 text-sm"
          >
            <ItemIcon icon="play" className="h-4 w-4" />
            Continue Expedition
            {!saveExists && <span className="text-[10px] opacity-70">(no record)</span>}
          </button>
          {saveExists && slot && (
            <div className="panel-soft -mt-1 px-3 py-2 text-left">
              <div className="flex items-center justify-between gap-2">
                <span className="font-display text-[10px] font-bold uppercase tracking-[0.18em] text-frost-300/55">
                  Saved expedition
                </span>
                <span className="chip bg-frost-500/15 text-[9px] text-frost-300">{slot.difficulty}</span>
              </div>
              <div className="mt-0.5 text-[11px] text-frost-200">
                Day {slot.day} · {slot.region} · Level {slot.level}
              </div>
              <div className="text-[10px] text-frost-300/55">
                {slot.done} objectives complete
              </div>
            </div>
          )}
          {!confirmNew ? (
            <button onClick={() => (saveExists ? setConfirmNew(true) : (game.state.screen = "intro", game.bump()))} className="btn btn-ember px-6 py-3.5 text-sm">
              <ItemIcon icon="flag" className="h-4 w-4" /> New Expedition
            </button>
          ) : (
            <div className="panel border-blood-400/50 p-3">
              <p className="mb-2 text-[12px] text-blood-400">Overwrite the existing expedition record?</p>
              <div className="flex gap-2">
                <button onClick={() => { setConfirmNew(false); game.state.screen = "intro"; game.bump(); }} className="btn btn-danger flex-1 px-3 py-2 text-xs">Start over</button>
                <button onClick={() => setConfirmNew(false)} className="btn btn-ghost flex-1 px-3 py-2 text-xs">Cancel</button>
              </div>
            </div>
          )}
          <div className="flex gap-2.5">
            <button onClick={() => setModal("help")} className="btn btn-ghost flex-1 px-4 py-3 text-xs">
              <ItemIcon icon="help" className="h-4 w-4" /> Field Handbook
            </button>
            <button onClick={() => setModal("settings")} className="btn btn-ghost flex-1 px-4 py-3 text-xs">
              <ItemIcon icon="settings" className="h-4 w-4" /> Settings
            </button>
          </div>
          <button onClick={() => setModal("credits")} className="btn btn-ghost w-full px-4 py-2.5 text-xs">
            <ItemIcon icon="journal" className="h-4 w-4" /> Credits
          </button>
          {!game.audioReady && (
            <p className="text-center text-[10px] leading-snug text-frost-300/45">
              Sound starts on your first tap — mobile browsers block autoplay.
            </p>
          )}
        </div>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[10px] uppercase tracking-[0.22em] text-frost-300/45">
          {REGION_ORDER.map(id => (
            <span key={id} className="flex items-center gap-1">
              <ItemIcon icon={REGIONS[id].icon} className="h-3 w-3" />
              {REGIONS[id].name}
            </span>
          ))}
        </div>
        <div className="mt-3 text-[10px] uppercase tracking-[0.25em] text-frost-300/45">
          v5.5 · offline · no account · your save stays on this device
        </div>
      </div>

      {modal === "settings" && <SettingsModal game={game} onBack={() => setModal(null)} />}
      {modal === "help" && <HelpModal game={game} onBack={() => setModal(null)} />}
      {modal === "credits" && <Credits onBack={() => setModal(null)} />}
    </div>
  );
}

// ── intro ────────────────────────────────────────────────────────────────────

const INTRO_STEPS = [
  {
    tag: "MAYDAY",
    text: "67°N. Research station KVESTA-9 went silent during the storm of the century. You crossed the ice sheet alone to find them.",
  },
  {
    tag: "THE CRASH",
    text: "Then the aurora came down like a wave. Your pod tore through the sky and buried itself in the snow. You walked away. Somehow.",
  },
  {
    tag: "PROTOCOL: SURVIVE",
    text: "Reach the outpost. Rebuild it. Keep warm, keep fed, keep moving. And if you hear howling beyond the treeline — do not answer.",
  },
];

export function Intro({ game }: { game: Game }) {
  const [i, setI] = useState(0);
  const [diff, setDiff] = useState<DifficultyId>("survival");
  const step = INTRO_STEPS[i];
  const last = i === INTRO_STEPS.length - 1;
  const start = () => { game.newGame(); game.setDifficulty(diff); };
  return (
    <div className="absolute inset-0 z-30 overflow-hidden">
      <Backdrop src={keyart} dim={0.62} />
      <div className="relative z-10 flex h-full items-end justify-center px-4 pb-[10vh] sm:items-center sm:pb-0">
        <div key={i} className="panel animate-rise max-w-lg px-6 py-6 sm:px-8">
          <div className="chip mb-3 bg-ember-500/15 text-[10px] text-ember-300">{step.tag}</div>
          <p className="text-[15px] leading-relaxed text-frost-200">{step.text}</p>
          {last && (
            <div className="mt-4 border-t border-frost-400/10 pt-3">
              <div className="mb-2 font-display text-[10px] font-bold uppercase tracking-[0.22em] text-frost-300/55">
                Choose your expedition
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {DIFFICULTY_ORDER.map(id => (
                  <button key={id} onClick={() => setDiff(id)}
                    className={cn("btn px-2 py-2 text-[11px]", diff === id ? "btn-ember" : "btn-ghost")}>
                    {DIFFICULTIES[id].name}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-[11px] leading-snug text-frost-300/70">{DIFFICULTIES[diff].tagline}</p>
              <ul className="mt-1.5 space-y-0.5">
                {DIFFICULTIES[diff].effects.map(e => (
                  <li key={e} className="flex items-start gap-1.5 text-[10.5px] leading-snug text-frost-300/60">
                    <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-ember-400" />{e}
                  </li>
                ))}
              </ul>
              <p className="mt-1.5 text-[10px] text-frost-300/45">You can change this at any time in Settings.</p>
            </div>
          )}

          <div className="mt-5 flex items-center justify-between">
            <div className="flex gap-1.5">
              {INTRO_STEPS.map((_, d) => (
                <span key={d} className={cn("h-1.5 w-6", d <= i ? "bg-ember-400" : "bg-ink-700")} style={{ clipPath: "polygon(2px 0,100% 0,calc(100% - 2px) 100%,0 100%)" }} />
              ))}
            </div>
            <button onClick={() => (last ? start() : setI(i + 1))} className={cn("btn px-6 py-2.5 text-sm", last ? "btn-ember" : "btn-frost")}>
              {last ? "Begin the expedition" : "Continue"} <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          {!last && (
            <button onClick={start} className="mt-3 w-full text-center text-[11px] uppercase tracking-[0.2em] text-frost-300/50 hover:text-frost-200">
              Skip intro
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── game over ────────────────────────────────────────────────────────────────

export function GameOver({ game }: { game: Game }) {
  const s = useGame(game);
  const days = Math.max(1, Math.floor(s.time / BAL.dayLength) + 1);
  const has = game.hasSave();
  return (
    <div className="absolute inset-0 z-30 overflow-hidden">
      <Backdrop src={gameoverImg} dim={0.5} />
      <div className="relative z-10 flex h-full items-center justify-center px-4">
        <div className="panel animate-rise w-full max-w-md px-6 py-7 text-center sm:px-8">
          <div className="chip mx-auto mb-3 bg-blood-500/15 text-[10px] text-blood-400">Expedition terminated</div>
          <h2 className="font-display text-4xl font-bold tracking-[0.1em] text-frost-200">THE COLD<br />TAKES YOU</h2>
          <p className="mt-3 text-[13px] leading-relaxed text-frost-300/80">{s.cause || "The arctic took you."}</p>
          <p className="mt-1 text-[11px] text-frost-300/50">Fell in: {REGIONS[s.region].name}</p>

          <div className="mt-5 grid grid-cols-2 gap-2 text-left">
            {[
              ["Survivor level", String(s.progression.level)],
              ["Days survived", String(days)],
              ["Sites discovered", String(s.stats.discoveries)],
              ["Regions explored", `${REGION_ORDER.filter(r => s.regions[r]?.discovered).length}/${REGION_ORDER.length}`],
              ["Creatures defeated", String(s.stats.kills)],
              ["Guardians slain", String(s.stats.bosses)],
              ["Containers looted", String(s.stats.containers)],
              ["Logs recovered", `${s.logs.length}/${Object.keys(LOGS).length}`],
              ["Resources gathered", String(s.stats.gathered)],
              ["Distance walked", `${Math.round(s.stats.distance / 40)} m`],
            ].map(([l, v]) => (
              <div key={l} className="panel-soft px-3 py-2">
                <div className="text-[10px] uppercase tracking-[0.16em] text-frost-300/55">{l}</div>
                <div className="font-display text-lg font-bold text-frost-200">{v}</div>
              </div>
            ))}
          </div>

          <div className="mt-5 space-y-2">
            <button onClick={() => game.recoverAtOutpost()} className="btn btn-ember w-full px-4 py-3 text-sm">
              <ItemIcon icon="shelter" className="h-4 w-4" /> Recover at the outpost
            </button>
            <p className="-mt-1 text-[10.5px] leading-snug text-frost-300/55">
              Keeps your story, equipment, base and progression.
              {game.difficulty.deathMaterialLoss > 0
                ? ` Costs ${Math.round(game.difficulty.deathMaterialLoss * 100)}% of carried raw materials.`
                : " Costs nothing on Story difficulty."}
            </p>
            {has && (
              <button onClick={() => game.continueGame()} className="btn btn-frost w-full px-4 py-3 text-sm">
                <ItemIcon icon="save" className="h-4 w-4" /> Load last save
              </button>
            )}
            <button onClick={() => { game.state.screen = "intro"; game.bump(); }} className="btn btn-ember w-full px-4 py-3 text-sm">
              <ItemIcon icon="reset" className="h-4 w-4" /> New expedition
            </button>
            <button onClick={() => game.backToMenu()} className="btn btn-ghost w-full px-4 py-3 text-sm">
              <ItemIcon icon="exit" className="h-4 w-4" /> Main menu
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
