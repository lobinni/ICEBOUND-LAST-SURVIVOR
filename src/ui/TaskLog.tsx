// ── ICEBOUND: Expedition Log — guided story objectives + daily tasks ───────

import { useEffect, useMemo, useState } from "react";
import { ITEMS, REGIONS } from "../game/config";
import type { DailyTask } from "../game/types";
import type { Game } from "../game/engine";
import { activeSideQuests, currentQuest, mainQuests, sideQuests, type QuestDef } from "../game/systems";
import { CHAPTERS as STORY_CHAPTERS } from "../game/story";
import { dailySecondsRemaining, questChecklist } from "../game/tasks";
import { useGame } from "./hooks";
import { ItemIcon } from "./icons";
import { Shell } from "./Shell";
import { cn } from "@/utils/cn";

type LogTab = "story" | "side" | "daily";

const CHAPTERS: Record<number, string> = Object.fromEntries(
  Object.values(STORY_CHAPTERS).map(c => [c.id, `${c.subtitle} — ${c.title}`]),
);

function ProgressBar({ value, max, complete }: { value: number; max: number; complete?: boolean }) {
  return (
    <div className="statbar h-2">
      <i style={{
        transform: `scaleX(${Math.min(1, value / Math.max(1, max))})`,
        background: complete
          ? "linear-gradient(90deg,#3fae6c,#9be2b5)"
          : "linear-gradient(90deg,#f07f2c,#ffb063)",
      }} />
    </div>
  );
}

function RewardStrip({ q }: { q: QuestDef }) {
  if (!q.reward || Object.keys(q.reward).length === 0) return null;
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      <span className="font-display text-[9px] font-bold uppercase tracking-[0.18em] text-frost-300/45">Reward</span>
      {(Object.entries(q.reward) as [keyof typeof ITEMS, number][]).map(([id, n]) => (
        <span key={id} className="chip border border-moss-400/30 bg-moss-400/10 text-moss-400">
          <ItemIcon icon={ITEMS[id].icon} className="h-3 w-3" color={ITEMS[id].color} />
          {n}× {ITEMS[id].name}
        </span>
      ))}
      {q.unlocks && (
        <span className="chip border border-ember-400/30 bg-ember-500/10 text-ember-300">
          <ItemIcon icon={REGIONS[q.unlocks].icon} className="h-3 w-3" />
          Unlock {REGIONS[q.unlocks].name}
        </span>
      )}
    </div>
  );
}

function StoryDetail({ game, q }: { game: Game; q: QuestDef }) {
  const s = useGame(game);
  const done = s.questsDone.includes(q.id);
  const active = currentQuest(s)?.id === q.id;
  const steps = questChecklist(s, q.id);
  const completed = steps.filter(x => x.done).length;
  const progress = steps.length ? completed / steps.length : Math.min(1, q.cur(s) / q.max);

  return (
    <div className={cn("panel-soft mb-3 px-4 py-3", active && "border-ember-400/50 shadow-[0_0_24px_rgba(255,143,61,0.12)]")}>
      <div className="flex items-start gap-3">
        <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center",
          done ? "text-moss-400" : active ? "text-ember-400" : "text-frost-300/60")}>
          <ItemIcon icon={done ? "done" : "flag"} className="h-6 w-6" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <h3 className="font-display text-lg font-bold leading-tight tracking-wide text-frost-200">{q.title}</h3>
            <span className={cn("chip text-[9px]", done ? "bg-moss-400/15 text-moss-400" : active ? "bg-ember-500/15 text-ember-300" : "bg-frost-500/10 text-frost-300")}>
              {done ? "Complete" : active ? "Active" : "Up next"}
            </span>
          </div>
          <p className="mt-1 text-[12px] leading-snug text-frost-300/75">{q.hint}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.14em] text-frost-300/50">
            <span>{CHAPTERS[q.chapter]}</span>
            {q.side && <span className="chip bg-frost-500/15 text-[8px] text-frost-300">Optional</span>}
            {q.region && (
              <span className="flex items-center gap-1 text-frost-300/70">
                <ItemIcon icon={REGIONS[q.region].icon} className="h-3 w-3" /> {REGIONS[q.region].name}
              </span>
            )}
            <span>{completed}/{Math.max(steps.length, 1)} requirements</span>
          </div>
        </div>
      </div>

      <div className="mt-3">
        <div className="mb-1.5 flex items-center justify-between">
          <span className="font-display text-[10px] font-bold uppercase tracking-[0.2em] text-frost-300/55">How to complete</span>
          <span className={cn("font-display text-[11px] font-bold", done ? "text-moss-400" : "text-ember-300")}>
            {Math.round(progress * 100)}%
          </span>
        </div>
        <ProgressBar value={progress} max={1} complete={done} />
      </div>

      <div className="mt-2 space-y-1.5">
        {steps.map(st => (
          <div key={st.id} className={cn("flex items-start gap-2.5 px-2 py-1.5",
            st.done ? "bg-moss-400/[0.06]" : "bg-ink-900/25")}
            style={{ clipPath: "polygon(6px 0,100% 0,100% calc(100% - 6px),calc(100% - 6px) 100%,0 100%,0 6px)" }}>

            <span className={cn("mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center", st.done ? "text-moss-400" : "text-frost-300/60")}>
              <ItemIcon icon={st.done ? "done" : st.icon} className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <div className={cn("font-display text-[13px] font-bold tracking-wide", st.done ? "text-frost-300/60 line-through" : "text-frost-200")}>
                {st.label}
              </div>
              {!st.done && st.detail && <div className="text-[10.5px] leading-snug text-frost-300/60">{st.detail}</div>}
              {!st.done && st.region && st.region !== s.region && (
                <div className="text-[10.5px] font-semibold text-ember-300">Travel to {REGIONS[st.region].name}</div>
              )}
              {st.guide && !st.done && (
                <button
                  onClick={() => {
                    game.guideToMaterial(st.guide === "ice" || st.guide === "wood" || st.guide === "stone" ? st.guide : "ice");
                  }}
                  className="chip mt-1 border border-frost-400/30 bg-frost-500/10 text-frost-200 transition-colors hover:border-ember-400/60"
                >
                  <ItemIcon icon={st.icon} className="h-2.5 w-2.5" />
                  Guide to source
                </button>
              )}
            </div>
            <span className={cn("shrink-0 font-display text-[12px] font-bold tabular-nums", st.done ? "text-moss-400" : "text-ember-300")}>
              {Math.min(st.current, st.goal)}/{st.goal}
            </span>
          </div>
        ))}
      </div>

      <RewardStrip q={q} />

      {active && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button onClick={() => game.openModal("map")} className="btn btn-ghost px-3 py-2 text-[11px]">
            <ItemIcon icon="map" className="h-3.5 w-3.5" /> Open map
          </button>
          <button onClick={() => game.openModal("help")} className="btn btn-ghost px-3 py-2 text-[11px]">
            <ItemIcon icon="help" className="h-3.5 w-3.5" /> Field handbook
          </button>
        </div>
      )}
    </div>
  );
}

function StoryTab({ game }: { game: Game }) {
  const s = useGame(game);
  const main = mainQuests();
  const active = currentQuest(s);
  const activeIdx = main.findIndex(q => q.id === active?.id);
  const [selected, setSelected] = useState(active?.id ?? main[main.length - 1].id);

  useEffect(() => {
    if (active?.id) setSelected(active.id);
  }, [active?.id]);

  const selectedQuest = main.find(q => q.id === selected) ?? active ?? main[0];
  let lastChapter = 0;

  return (
    <div>
      <StoryDetail game={game} q={selectedQuest} />

      <div className="mb-1.5 flex items-center gap-2">
        <span className="font-display text-[10px] font-bold uppercase tracking-[0.22em] text-frost-300/50">Story route</span>
        <span className="h-px flex-1 bg-frost-400/15" />
        <span className="font-display text-[10px] text-frost-300/45">
          {main.filter(q => s.questsDone.includes(q.id)).length}/{main.length}
        </span>
      </div>

      <div className="space-y-1.5">
        {main.map((q, i) => {
          const done = s.questsDone.includes(q.id);
          const isActive = q.id === active?.id;
          const available = done || isActive || i === activeIdx + 1 || !active;
          const header = q.chapter !== lastChapter ? (lastChapter = q.chapter, CHAPTERS[q.chapter]) : null;
          return (
            <div key={q.id}>
              {header && (
                <div className="mb-1 mt-3 flex items-center gap-2 first:mt-0">
                  <span className="h-px flex-1 bg-frost-400/10" />
                  <span className="font-display text-[9px] font-bold uppercase tracking-[0.2em] text-frost-300/40">{header}</span>
                  <span className="h-px flex-1 bg-frost-400/10" />
                </div>
              )}
              <button disabled={!available} onClick={() => available && setSelected(q.id)}
                className={cn("panel-soft flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors",
                  selected === q.id && available && "border-ember-400/45",
                  !available && "opacity-30")}>
                <span className={cn("flex h-5 w-5 shrink-0 items-center justify-center", done ? "text-moss-400" : isActive ? "text-ember-400" : "text-frost-300/40")}>
                  <ItemIcon icon={done ? "done" : available ? "flag" : "warn"} className="h-3.5 w-3.5" />
                </span>
                <span className={cn("min-w-0 flex-1 truncate font-display text-[13px] font-bold tracking-wide",
                  done ? "text-frost-300/55" : "text-frost-200")}>
                  {available ? q.title : "Undiscovered objective"}
                </span>
                {isActive && <span className="chip bg-ember-500/15 text-[8px] text-ember-300">Active</span>}
                {!isActive && available && !done && <span className="chip bg-frost-500/10 text-[8px] text-frost-300/60">Next</span>}
              </button>
            </div>
          );
        })}
      </div>

      {!active && (
        <div className="panel-soft mt-3 flex items-center gap-3 border-moss-400/40 px-3 py-3 text-moss-400">
          <ItemIcon icon="done" className="h-5 w-5" />
          <span className="font-display text-sm font-bold tracking-wide">Every story objective complete — the arctic is yours.</span>
        </div>
      )}
    </div>
  );
}

function taskAction(task: DailyTask): "help" | "craft" | "map" | null {
  if (task.kind === "gather_any" || task.kind === "gather_item") return "help";
  if (task.kind === "craft_any") return "craft";
  if (task.kind === "visit_region" || task.kind === "open_container") return "map";
  return null;
}

function taskActionLabel(action: ReturnType<typeof taskAction>) {
  if (action === "help") return "Resource guide";
  if (action === "craft") return "Open crafting";
  return "Open map";
}

function DailyRow({ game, task }: { game: Game; task: DailyTask }) {
  const action = taskAction(task);
  const reward = ITEMS[task.reward.item];
  return (
    <div className={cn("panel-soft px-3.5 py-3", task.complete && "border-moss-400/35")}>
      <div className="flex items-start gap-3">
        <span className={cn("invslot flex h-11 w-11 shrink-0 items-center justify-center", task.complete && "border-moss-400/50")}>
          <ItemIcon icon={task.complete ? "done" : task.icon} className="h-5 w-5" color={task.complete ? "#7fd6a4" : undefined} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <h3 className={cn("font-display text-[15px] font-bold tracking-wide", task.complete ? "text-moss-400" : "text-frost-200")}>
              {task.title}
            </h3>
            {task.complete && <span className="chip bg-moss-400/15 text-[8px] text-moss-400">Complete</span>}
          </div>
          <p className="mt-0.5 text-[11px] leading-snug text-frost-300/65">{task.instruction}</p>

          <div className="mt-2 flex items-center gap-2">
            <div className="flex-1"><ProgressBar value={task.progress} max={task.goal} complete={task.complete} /></div>
            <span className={cn("font-display text-[12px] font-bold tabular-nums", task.complete ? "text-moss-400" : "text-ember-300")}>
              {Math.min(task.progress, task.goal)}/{task.goal}
            </span>
          </div>

          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <span className="chip border border-moss-400/25 bg-moss-400/[0.08] text-moss-400">
              <ItemIcon icon={reward.icon} className="h-3 w-3" color={reward.color} />
              {task.reward.n}× {reward.name} {task.rewarded ? "delivered" : "reward"}
            </span>
            {action && !task.complete && (
              <button onClick={() => game.openModal(action)} className="btn btn-ghost px-3 py-1.5 text-[9px]">
                <ItemIcon icon={action === "help" ? "help" : action === "craft" ? "hammer" : "map"} className="h-3 w-3" />
                {taskActionLabel(action)}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function DailyTab({ game }: { game: Game }) {
  const s = useGame(game);
  const seconds = dailySecondsRemaining(s);
  const mm = Math.floor(seconds / 60).toString().padStart(2, "0");
  const ss = Math.floor(seconds % 60).toString().padStart(2, "0");
  const completed = s.daily.tasks.filter(t => t.complete).length;

  return (
    <div>
      <div className="panel-soft mb-3 px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-ember-300">
              <ItemIcon icon="sun" className="h-4 w-4" />
              <span className="font-display text-sm font-bold uppercase tracking-[0.16em]">Day {s.daily.day} assignments</span>
            </div>
            <p className="mt-1 text-[11px] leading-snug text-frost-300/65">
              Optional field work. Progress comes only from your actions; time stops while paused, in menus, or away from the game.
            </p>
          </div>
          <div className="shrink-0 text-right">
            <div className="font-display text-lg font-bold tabular-nums text-frost-200">{mm}:{ss}</div>
            <div className="text-[9px] uppercase tracking-[0.16em] text-frost-300/45">until next day</div>
            <div className="mt-1 text-[9px] text-frost-300/45">{s.daily.completedTotal} completed all-time</div>
          </div>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <div className="flex-1"><ProgressBar value={completed} max={3} complete={completed === 3} /></div>
          <span className={cn("font-display text-xs font-bold", completed === 3 ? "text-moss-400" : "text-ember-300")}>{completed}/3</span>
        </div>
      </div>

      <div className="space-y-2">
        {s.daily.tasks.map(task => <DailyRow key={task.id} game={game} task={task} />)}
      </div>

      <div className="mt-3 flex items-start gap-2 px-1 text-[10.5px] leading-snug text-frost-300/50">
        <ItemIcon icon="save" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>Task progress and delivered rewards are saved locally. Incomplete tasks are replaced when the next in-game day begins; there is no login streak or real-world timer.</span>
      </div>
    </div>
  );
}

function SideTab({ game }: { game: Game }) {
  const s = useGame(game);
  const list = activeSideQuests(s);
  const all = sideQuests();
  const done = all.filter(q => s.questsDone.includes(q.id)).length;

  return (
    <div>
      <div className="panel-soft mb-3 px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-ember-300">
              <ItemIcon icon="compass" className="h-4 w-4" />
              <span className="font-display text-sm font-bold uppercase tracking-[0.16em]">Optional work</span>
            </div>
            <p className="mt-1 text-[11px] leading-snug text-frost-300/65">
              Side objectives never block the story. They reward exploration, salvage and a
              fully developed outpost, and they stay available after the ending.
            </p>
          </div>
          <span className={cn("shrink-0 font-display text-xl font-bold", done === all.length ? "text-moss-400" : "text-ember-300")}>
            {done}/{all.length}
          </span>
        </div>
      </div>

      {list.length === 0 ? (
        <p className="py-8 text-center text-[12px] text-frost-300/55">
          No optional objectives yet. They unlock as you explore, salvage and develop the outpost.
        </p>
      ) : (
        <div className="space-y-2">
          {list.map(q => {
            const complete = s.questsDone.includes(q.id);
            const cur = Math.min(q.cur(s), q.max);
            return (
              <div key={q.id} className={cn("panel-soft px-3.5 py-3", complete && "border-moss-400/35")}>
                <div className="flex items-start gap-3">
                  <span className={cn("invslot flex h-10 w-10 shrink-0 items-center justify-center", complete && "border-moss-400/50")}>
                    <ItemIcon icon={complete ? "done" : "flag"} className="h-4 w-4"
                      color={complete ? "#7fd6a4" : undefined} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className={cn("font-display text-[15px] font-bold tracking-wide",
                        complete ? "text-moss-400" : "text-frost-200")}>{q.title}</span>
                      {complete && <span className="chip bg-moss-400/15 text-[8px] text-moss-400">Complete</span>}
                    </div>
                    <p className="mt-0.5 text-[11px] leading-snug text-frost-300/65">{q.hint}</p>
                    <div className="mt-2 flex items-center gap-2">
                      <div className="flex-1"><ProgressBar value={cur} max={q.max} complete={complete} /></div>
                      <span className={cn("font-display text-[12px] font-bold tabular-nums",
                        complete ? "text-moss-400" : "text-ember-300")}>{cur}/{q.max}</span>
                    </div>
                    <RewardStrip q={q} />
                  </div>
                </div>
              </div>
            );
          })}
          {list.length < all.length && (
            <p className="pt-1 text-center text-[10px] text-frost-300/45">
              {all.length - list.length} further optional objective{all.length - list.length === 1 ? "" : "s"} still locked.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export function TaskLogModal({ game }: { game: Game }) {
  const s = useGame(game);
  const [tab, setTab] = useState<LogTab>("story");
  const dailyDone = s.daily.tasks.filter(t => t.complete).length;
  const mainList = mainQuests();
  const mainDone = mainList.filter(q => s.questsDone.includes(q.id)).length;
  const sideList = sideQuests();
  const sideDone = sideList.filter(q => s.questsDone.includes(q.id)).length;
  const sub = useMemo(() => tab === "story"
    ? `${mainDone}/${mainList.length} story objectives complete`
    : tab === "side"
    ? `${sideDone}/${sideList.length} optional objectives complete`
    : `Day ${s.daily.day} · ${dailyDone}/3 assignments complete`,
  [tab, mainDone, mainList.length, sideDone, sideList.length, s.daily.day, dailyDone]);

  return (
    <Shell title="Expedition Log" icon="quests" onClose={() => game.closeModal()} wide sub={sub}>
      <div className="mb-3 grid grid-cols-3 gap-1.5">
        <button onClick={() => setTab("story")} className={cn("btn px-2 py-2.5 text-[11px]", tab === "story" ? "btn-ember" : "btn-ghost")}>
          <ItemIcon icon="flag" className="h-4 w-4" /> Story
          <span className="ml-0.5 font-display text-[9px] opacity-70">{mainDone}/{mainList.length}</span>
        </button>
        <button onClick={() => setTab("side")} className={cn("btn px-2 py-2.5 text-[11px]", tab === "side" ? "btn-ember" : "btn-ghost")}>
          <ItemIcon icon="compass" className="h-4 w-4" /> Side
          <span className={cn("ml-0.5 font-display text-[9px] font-bold", sideDone === sideList.length ? "text-moss-400" : "opacity-70")}>{sideDone}/{sideList.length}</span>
        </button>
        <button onClick={() => setTab("daily")} className={cn("btn relative px-2 py-2.5 text-[11px]", tab === "daily" ? "btn-ember" : "btn-ghost")}>
          <ItemIcon icon="sun" className="h-4 w-4" /> Daily
          <span className={cn("ml-0.5 font-display text-[9px] font-bold", dailyDone === 3 ? "text-moss-400" : "opacity-70")}>{dailyDone}/3</span>
        </button>
      </div>
      {tab === "story" ? <StoryTab game={game} /> : tab === "side" ? <SideTab game={game} /> : <DailyTab game={game} />}
    </Shell>
  );
}