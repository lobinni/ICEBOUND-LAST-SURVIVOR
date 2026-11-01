import { useEffect, useState } from "react";
import { Award, Backpack, BookOpen, Gauge, Hammer, ListChecks, Map, Pause, ShieldAlert, Users } from "lucide-react";
import { BAL, ITEMS, REGIONS, WEATHER, phaseOf } from "../game/config";
import type { Game } from "../game/engine";
import { currentQuest } from "../game/systems";
import { capacity, usedSlots } from "../game/state";
import { MAX_LEVEL, progMaxHp, progMaxStamina, xpForNext } from "../game/progression";
import { prepChecklist } from "../game/siege";
import { useGame } from "./hooks";
import { QuickBelt } from "./QuickBelt";
import { ItemIcon } from "./icons";
import { cn } from "@/utils/cn";

/** Count of critical checklist gaps — same source the Command Center shows. */
function countCritical(s: import("../game/types").GameState): number {
  return prepChecklist(s).filter(i => i.severity === "critical").length;
}

function Stat({ icon, label, v, max, grad, warn, warnAt, primary }: {
  icon: string; label: string; v: number; max: number; grad: string;
  warn?: boolean; warnAt?: number;
  /** Health and temperature are life-critical; the rest are secondary. */
  primary?: boolean;
}) {
  const pct = Math.max(0, Math.min(1, v / max));
  const critical = warnAt !== undefined && v <= warnAt;
  const loud = primary || warn || critical;
  return (
    <div className={cn("flex items-center gap-2 transition-opacity",
      (warn || critical) && "animate-pulse-warn",
      // Healthy secondary bars sit back so criticals stand out.
      !loud && "opacity-75")}>
      <span className={cn("flex h-6 w-6 shrink-0 items-center justify-center", critical ? "text-blood-400" : warn ? "text-ember-400" : "text-frost-300")}>
        <ItemIcon icon={icon} className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="mb-0.5 flex items-baseline justify-between">
          <span className={cn("font-display font-bold uppercase tracking-[0.16em]",
            loud ? "text-[10px] text-frost-300/90" : "text-[9px] text-frost-300/65")}>{label}</span>
          <span className={cn("font-display text-[11px] font-bold tabular-nums", critical ? "text-blood-400" : "text-frost-200/90")}>{Math.round(v)}</span>
        </div>
        <div className={cn("statbar", !loud && "h-[7px]")}>
          <i style={{ transform: `scaleX(${pct})`, background: grad }} />
        </div>
      </div>
    </div>
  );
}

export function HUD({ game }: { game: Game }) {
  const s = useGame(game);
  const [flash, setFlash] = useState(0);
  const [finale, setFinale] = useState(false);

  useEffect(() => game.on("flash", () => setFlash(f => f + 1)), [game]);
  useEffect(() => game.on("finale", () => setFinale(true)), [game]);

  const p = s.player;
  const ph = phaseOf(s.time);
  const day = Math.floor(s.time / BAL.dayLength) + 1;
  const phaseLabel = ph < 0.06 ? "Dawn" : ph < 0.5 ? "Daylight" : ph < BAL.nightStart ? "Dusk" : ph <= BAL.nightEnd ? "Night" : "Dawn";
  const night = phaseLabel === "Night" || phaseLabel === "Dawn";
  const q = currentQuest(s);
  const it = s.interact;
  const region = REGIONS[s.region];
  const weather = WEATHER[s.weather.kind];
  const slots = usedSlots(s), cap = capacity(s);
  const dailyDone = s.daily.tasks.filter(t => t.complete).length;
  const residents = s.settlement.residents.length;
  const residentAlert = s.settlement.residents.some(r => r.downed || r.injured)
    || s.settlement.residents.some(r => r.unfed >= 2);
  // defense shows live siege pressure or the next scheduled assult's warning
  const siege = s.siege;
  const siegeLive = siege.events.find(e => e.status === "active" && !e.resolved) ?? null;
  const siegeSoon = siegeLive ? null : siege.events.find(e => e.status === "scheduled" && !e.resolved && (e.kind !== "night" || e.startAt - s.time < 480 * 0.12)) ?? null;
  const siegeBadge = siegeLive ? "!" : siegeSoon ? "⚠" : undefined;
  // command-center badge surfaces the count of critical preparation gaps
  const cmdCritical = s.settlement.residents.length > 0 ? countCritical(s) : 0;
  const cmdBadge = cmdCritical > 0 ? String(cmdCritical) : undefined;
  // Layout differs on touch: the virtual stick claims a bottom corner.
  const touch = typeof window !== "undefined" && (window.matchMedia?.("(pointer: coarse)").matches ?? false);
  const leftStick = s.settings.joyHand === "left";

  // ── live status effects (derived from actual game state) ──
  type Eff = { id: string; label: string; icon: string; tone: "bad" | "warn" | "good" };
  const effects: Eff[] = [];
  if (p.temp <= 12) effects.push({ id: "freezing", label: "Freezing", icon: "temp", tone: "bad" });
  else if (p.temp <= BAL.tempWarn) effects.push({ id: "cold", label: "Cold", icon: "temp", tone: "warn" });
  if (p.hunger <= 10) effects.push({ id: "starving", label: "Starving", icon: "hunger", tone: "bad" });
  else if (p.hunger <= 25) effects.push({ id: "hungry", label: "Hungry", icon: "hunger", tone: "warn" });
  if (p.thirst <= 10) effects.push({ id: "parched", label: "Dehydrated", icon: "thirst", tone: "bad" });
  else if (p.thirst <= 25) effects.push({ id: "thirsty", label: "Thirsty", icon: "thirst", tone: "warn" });
  if (p.stamina <= 15) effects.push({ id: "tired", label: "Exhausted", icon: "bolt", tone: "warn" });
  if (p.hp <= 30) effects.push({ id: "wounded", label: "Wounded", icon: "heart", tone: "bad" });
  if (s.weather.kind === "blizzard") effects.push({ id: "bliz", label: "Blizzard", icon: "wind", tone: "bad" });
  if (s.region === "forest" && s.shelter.fire.lit &&
      Math.hypot(p.x - 200, p.y + 60) < BAL.tempFireR) effects.push({ id: "warm", label: "Warm", icon: "fire", tone: "good" });
  else if (s.region === "forest" && s.shelter.stage >= 1 &&
      Math.hypot(p.x + 60, p.y + 190) < BAL.tempShelterR) effects.push({ id: "shelter", label: "Sheltered", icon: "shelter", tone: "good" });
  if (s.equip.gear === "heatcore") effects.push({ id: "heat", label: "Heat Core", icon: "heatcore", tone: "good" });

  const TAG_TONE: Record<string, string> = {
    gather: "btn-frost", tool: "btn-danger", locked: "btn-danger", used: "btn-ghost",
    quest: "btn-ember", action: "btn-frost", travel: "btn-ember", danger: "btn-danger",
  };

  return (
    <div className="pointer-events-none absolute inset-0 z-20 select-none">
      {/* vitals */}
      <div className="panel pointer-events-auto absolute left-3 w-[190px] space-y-1.5 px-3 py-2.5 sm:left-4 sm:w-[220px] sm:space-y-2"
        style={{
          top: "max(0.75rem, env(safe-area-inset-top))",
          // Guarantees contrast over white snow and dark cave interiors alike.
          boxShadow: "0 0 0 1px rgba(4,10,18,0.85), 0 10px 40px rgba(0,0,0,0.65)",
        }}>
        <Stat icon="heart" label="Health" v={p.hp} max={progMaxHp(s)} grad="linear-gradient(90deg,#e84848,#ff8a70)" warnAt={30} primary />
        <Stat icon="temp" label="Temp" v={p.temp} max={100} grad="linear-gradient(90deg,#1e7fb4,#a5e0ff)" warn={p.temp <= BAL.tempWarn} primary />
        <Stat icon="hunger" label="Food" v={p.hunger} max={100} grad="linear-gradient(90deg,#e76f1e,#ffb063)" warnAt={22} />
        <Stat icon="thirst" label="Water" v={p.thirst} max={100} grad="linear-gradient(90deg,#37a7e0,#7fd8ff)" warnAt={22} />
        <Stat icon="bolt" label="Stamina" v={p.stamina} max={progMaxStamina(s)} grad="linear-gradient(90deg,#3fae6c,#9be2b5)" />
        {/* survivor level + experience */}
        <button onClick={() => game.openModal("progress")}
          className="w-full border-t border-frost-400/10 pt-1.5 text-left transition-colors hover:border-ember-400/30">
          <div className="mb-0.5 flex items-baseline justify-between">
            <span className="font-display text-[10px] font-bold uppercase tracking-[0.16em] text-frost-300/75">
              Level {s.progression.level}
            </span>
            {s.progression.points > 0 ? (
              <span className="animate-pulse-warn font-display text-[10px] font-bold text-ember-300">
                {s.progression.points} pt
              </span>
            ) : (
              <span className="font-display text-[10px] font-bold tabular-nums text-frost-300/55">
                {s.progression.level >= MAX_LEVEL ? "MAX" : `${s.progression.xp}/${xpForNext(s.progression.level)}`}
              </span>
            )}
          </div>
          <div className="statbar h-1.5">
            <i style={{
              transform: `scaleX(${s.progression.level >= MAX_LEVEL ? 1 : Math.min(1, s.progression.xp / xpForNext(s.progression.level))})`,
              background: "linear-gradient(90deg,#1e7fb4,#a5e0ff)",
            }} />
          </div>
        </button>

        {/* equipment strip */}
        <div className="flex items-center gap-1 border-t border-frost-400/10 pt-1.5">
          {(["tool", "weapon", "armor", "gear"] as const).map(slot => {
            const item = s.equip[slot];
            return (
              <span key={slot} title={item ? ITEMS[item].name : slot}
                className={cn("flex h-6 w-6 items-center justify-center", item ? "text-ember-300" : "text-frost-300/20")}>
                <ItemIcon icon={item ? ITEMS[item].icon : slot === "tool" ? "axe" : slot === "weapon" ? "spear" : slot === "armor" ? "parka" : "lantern"} className="h-3.5 w-3.5" />
              </span>
            );
          })}
          <span className={cn("ml-auto font-display text-[10px] font-bold tabular-nums", slots >= cap ? "text-blood-400" : "text-frost-300/55")}>
            {slots}/{cap}
          </span>
        </div>
      </div>

      {/* status effects */}
      {effects.length > 0 && (
        <div className="pointer-events-none absolute left-3 top-[228px] flex max-h-[54px] w-[190px] flex-wrap gap-1 overflow-hidden sm:left-4 sm:top-[248px] sm:max-h-[84px] sm:w-[220px]">
          {effects.slice(0, 5).map(e => (
            <span key={e.id}
              className={cn("chip border backdrop-blur-sm",
                e.tone === "bad" ? "animate-pulse-warn border-blood-400/50 bg-blood-500/20 text-blood-400"
                  : e.tone === "warn" ? "border-ember-400/50 bg-ember-500/15 text-ember-300"
                  : "border-moss-400/50 bg-moss-400/15 text-moss-400")}>
              <ItemIcon icon={e.icon} className="h-3 w-3" />{e.label}
            </span>
          ))}
        </div>
      )}

      {/* clock · region · weather · buttons */}
      <div className="absolute right-3 flex flex-col items-end gap-2 sm:right-4"
        style={{ top: "max(0.75rem, env(safe-area-inset-top))" }}>
        <div className="pointer-events-auto flex flex-wrap items-center justify-end gap-1.5">
          <div className="panel-soft chip flex items-center px-2.5 py-1.5 text-frost-200">
            <ItemIcon icon={region.icon} className="h-3.5 w-3.5 text-ember-300" />
            <span className="hidden sm:inline">{region.name}</span>
          </div>
          <div className="panel-soft chip flex items-center px-2.5 py-1.5 text-frost-200">
            <ItemIcon icon={night ? "moon" : "sun"} className="h-3.5 w-3.5 text-ember-300" />
            D{day}
          </div>
          <div className={cn("panel-soft chip flex items-center px-2.5 py-1.5",
            s.weather.kind === "blizzard" ? "animate-pulse-warn text-blood-400" : "text-frost-200")}>
            <ItemIcon icon={weather.icon} className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{weather.name}</span>
          </div>
          {s.savedFlash > 0 && (
            <div className="chip animate-toast-in bg-moss-400/20 text-moss-400">
              <ItemIcon icon="save" className="h-3 w-3" /> Saved
            </div>
          )}
        </div>
        <div className="pointer-events-auto flex gap-1.5">
          {[
            { icon: <ListChecks className="h-4 w-4" />, act: () => game.openModal("quest"), label: "Expedition Log", badge: `${dailyDone}/3` },
            { icon: <Award className="h-4 w-4" />, act: () => game.openModal("progress"), label: "Survivor (P)", badge: s.progression.points > 0 ? String(s.progression.points) : undefined },
            { icon: <Users className="h-4 w-4" />, act: () => game.openModal("settlement"), label: "Settlement (N)", badge: residents > 0 ? String(residents) : undefined, alert: residentAlert },
            { icon: <Gauge className="h-4 w-4" />, act: () => game.openModal("command"), label: "Command Center (G)", badge: cmdBadge, alert: cmdCritical > 0 },
            { icon: <ShieldAlert className="h-4 w-4" />, act: () => game.openModal("defense"), label: "Defense (D)", badge: siegeBadge, alert: !!siegeLive },
            { icon: <Map className="h-4 w-4" />, act: () => game.openModal("map"), label: "Map (M)" },
            { icon: <BookOpen className="h-4 w-4" />, act: () => game.openModal("journal"), label: "Logs (J)" },
            { icon: <Hammer className="h-4 w-4" />, act: () => game.openModal("craft"), label: "Craft (C)" },
            { icon: <Backpack className="h-4 w-4" />, act: () => game.openModal("inv"), label: "Pack (I)" },
            { icon: <Pause className="h-4 w-4" />, act: () => game.openModal("pause"), label: "Pause (Esc)" },
          ].map((b, i) => (
            <button key={i} title={b.label} onClick={b.act}
              className="touchbtn relative h-9 w-9 sm:h-10 sm:w-10"
              style={{ clipPath: "polygon(8px 0,100% 0,100% calc(100% - 8px),calc(100% - 8px) 100%,0 100%,0 8px)", borderRadius: 0 }}>
              {b.icon}
              {"badge" in b && b.badge && (
                <span className={cn("absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center bg-ink-900 px-0.5 font-display text-[8px] font-bold",
                  "alert" in b && b.alert ? "animate-pulse-warn text-blood-400" : dailyDone === 3 ? "text-moss-400" : "text-ember-300")}
                  style={{ border: "1px solid rgba(126,196,244,0.35)" }}>
                  {b.badge}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* objective tracker */}
      {q && !s.modal && (
        <button onClick={() => game.openModal("quest")}
          className={cn(
            "panel pointer-events-auto absolute w-[200px] px-3.5 py-2.5 text-left transition-transform hover:scale-[1.02] sm:w-[266px]",
            // The joystick owns the lower-left (or lower-right) 48%×46% of the
            // screen on touch, so the tracker sits opposite it and above it.
            touch ? (leftStick ? "right-3 sm:right-4" : "left-3 sm:left-4") : "left-3 sm:left-4",
          )}
          style={{
            bottom: touch
              ? "calc(max(0.75rem, env(safe-area-inset-bottom)) + 11.5rem)"
              : "max(0.75rem, env(safe-area-inset-bottom))",
          }}>
          <div className="mb-1 flex items-center gap-1.5 text-ember-400">
            <ItemIcon icon="flag" className="h-3.5 w-3.5" />
            <span className="font-display text-[10px] font-bold uppercase tracking-[0.2em]">Objective</span>
            {q.region && q.region !== s.region && (
              <span className="ml-auto chip bg-frost-500/15 text-[9px] text-frost-300">{REGIONS[q.region].name}</span>
            )}
          </div>
          <div className="font-display text-[15px] font-bold leading-tight text-frost-200">{q.title}</div>
          <div className="mt-1 text-[11px] leading-snug text-frost-300/75">{q.hint}</div>
          {q.max > 1 && (
            <div className="mt-1.5 flex items-center gap-2">
              <div className="statbar flex-1">
                <i style={{ transform: `scaleX(${Math.min(1, q.cur(s) / q.max)})`, background: "linear-gradient(90deg,#f07f2c,#ffb063)" }} />
              </div>
              <span className="font-display text-[11px] font-bold text-ember-300">{Math.min(q.cur(s), q.max)}/{q.max}</span>
            </div>
          )}
        </button>
      )}

      {!q && !s.modal && (
        <div className={cn("panel pointer-events-auto absolute px-4 py-2.5",
            touch ? (leftStick ? "right-3 sm:right-4" : "left-3 sm:left-4") : "left-3 sm:left-4")}
          style={{
            bottom: touch
              ? "calc(max(0.75rem, env(safe-area-inset-bottom)) + 11.5rem)"
              : "max(0.75rem, env(safe-area-inset-bottom))",
          }}>
          <div className="flex items-center gap-2 text-moss-400">
            <ItemIcon icon="done" className="h-4 w-4" />
            <span className="font-display text-sm font-bold tracking-wide">All objectives complete — free roam</span>
          </div>
        </div>
      )}

      {/* ration belt (Eat / Drink / Heal) */}
      <QuickBelt game={game} />

      {/* interact prompt (desktop) */}
      {it && !s.modal && (
        <button onClick={() => game.interactNow()} disabled={!it.ok}
          className={cn("pointer-events-auto absolute bottom-5 left-1/2 hidden -translate-x-1/2 items-center gap-2.5 px-5 py-2.5 sm:flex",
            "btn", TAG_TONE[it.tag] ?? "btn-frost")}
          style={!it.ok ? { opacity: 0.75, pointerEvents: "none" } : undefined}>
          <ItemIcon icon={it.icon} className="h-4 w-4" />
          {it.ok && <span className="rounded bg-black/25 px-1.5 py-0.5 font-display text-[11px] font-bold">E</span>}
          <span className="text-sm">{it.label}</span>
          {it.sub && <span className="text-[11px] opacity-80">· {it.sub}</span>}
        </button>
      )}

      {/* critical-state overlays */}
      {p.temp <= BAL.tempWarn && (
        <div className="lowfx-temp animate-pulse-warn pointer-events-none absolute inset-0" style={{ opacity: 0.4 + (1 - p.temp / BAL.tempWarn) * 0.5 }} />
      )}
      {p.hp <= 30 && !p.dead && <div className="lowfx-hp animate-pulse-warn pointer-events-none absolute inset-0" />}
      <div key={flash} className="pointer-events-none absolute inset-0"
        style={flash > 0 ? { boxShadow: "inset 0 0 120px 20px rgba(232,72,72,0.5)", animation: "pulse-warn 0.5s 1" } : undefined} />

      {/* finale */}
      {finale && (
        <div className="pointer-events-auto absolute inset-0 z-40 flex items-center justify-center bg-ink-950/70 p-4 backdrop-blur-sm">
          <div className="panel animate-rise max-w-lg px-7 py-6 text-center">
            <div className="mb-2 flex justify-center text-ember-400"><ItemIcon icon="core" className="h-10 w-10" /></div>
            <h2 className="title-grad font-display text-3xl font-bold tracking-widest">THE CORE IS COLD</h2>
            <p className="mt-3 text-sm leading-relaxed text-frost-300/85">
              The Guardian is scrap and its core sits contained in your research station. The logs
              and the recovered signals finally agree on what happened here: they tried to power
              the arctic from a cave, and the aurora answered.
            </p>
            <p className="mt-2 text-sm text-frost-200">
              The station has power, an antenna, and now something worth saying. Use the Research
              Station again to send the last transmission.
            </p>
            <button onClick={() => setFinale(false)} className="btn btn-ember mt-4 px-6 py-2.5 text-sm">
              <ItemIcon icon="bolt" className="h-4 w-4" /> Send the warning
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
