import { useEffect, useRef, useState } from "react";
import { Wind, Sword } from "lucide-react";
import type { Game } from "../game/engine";
import { useGame } from "./hooks";
import { ItemIcon } from "./icons";
import { cn } from "@/utils/cn";

/**
 * Virtual joystick (dynamic origin, side configurable) + context action cluster.
 * Push the stick to the rim to sprint. Every action is reachable by touch alone.
 */
export function TouchControls({ game }: { game: Game }) {
  const s = useGame(game);
  const [enabled, setEnabled] = useState(() =>
    typeof window !== "undefined" && (window.matchMedia?.("(pointer: coarse)").matches ?? false)
  );
  const [stick, setStick] = useState<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const activeId = useRef<number | null>(null);
  const zoneRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onTouch = () => setEnabled(true);
    window.addEventListener("touchstart", onTouch, { once: true, passive: true });
    return () => window.removeEventListener("touchstart", onTouch);
  }, []);

  // never leave the player walking when the control unmounts or a touch is lost
  useEffect(() => () => { game.setJoy(0, 0, false); }, [game]);
  useEffect(() => {
    const release = () => { activeId.current = null; setStick(null); game.setJoy(0, 0, false); };
    window.addEventListener("blur", release);
    document.addEventListener("visibilitychange", release);
    return () => {
      window.removeEventListener("blur", release);
      document.removeEventListener("visibilitychange", release);
    };
  }, [game]);

  if (!enabled || s.screen !== "game" || s.modal) return null;

  const it = s.interact;
  const leftHand = s.settings.joyHand === "left";

  const onDown = (e: React.PointerEvent) => {
    if (activeId.current !== null) return;
    e.preventDefault();
    const zone = zoneRef.current!.getBoundingClientRect();
    activeId.current = e.pointerId;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    setStick({ x: 0, y: 0, ox: e.clientX - zone.left, oy: e.clientY - zone.top });
    game.setJoy(0, 0, true);
  };
  const onMove = (e: React.PointerEvent) => {
    if (activeId.current !== e.pointerId || !stick) return;
    e.preventDefault();
    const zone = zoneRef.current!.getBoundingClientRect();
    let dx = e.clientX - zone.left - stick.ox;
    let dy = e.clientY - zone.top - stick.oy;
    const len = Math.hypot(dx, dy);
    const max = 60;
    if (len > max) { dx = (dx / len) * max; dy = (dy / len) * max; }
    setStick({ ...stick, x: dx, y: dy });
    game.setJoy(dx / max, dy / max, true);
  };
  const onUp = (e: React.PointerEvent) => {
    if (activeId.current !== e.pointerId) return;
    activeId.current = null;
    setStick(null);
    game.setJoy(0, 0, false);
  };

  const [pressed, setPressed] = useState<string | null>(null);
  const lastFire = useRef<Record<string, number>>({});

  const btn = (e: React.PointerEvent, act: "attack" | "dodge" | "interact") => {
    e.preventDefault();
    e.stopPropagation();              // never leaks to the movement zone
    // A pointerdown can fire twice if the browser also synthesises a mouse
    // event; 90ms of debounce makes a double-tap impossible to mis-read.
    const now = performance.now();
    if (now - (lastFire.current[act] ?? 0) < 90) return;
    lastFire.current[act] = now;
    setPressed(act);
    window.setTimeout(() => setPressed(cur => (cur === act ? null : cur)), 130);
    game.press(act);
  };

  const sprinting = stick && Math.hypot(stick.x, stick.y) > 54;
  const dodgeReady = s.player.dodgeCd <= 0 && s.player.stamina >= 22;
  const atkReady = s.player.atkCd <= 0 && s.player.stamina >= 13;

  return (
    <>
      {/* movement zone */}
      <div
        ref={zoneRef}
        className={cn("absolute bottom-0 z-30 h-[46%] w-[48%]", leftHand ? "left-0" : "right-0")}
        style={{ touchAction: "none" }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onPointerLeave={onUp}
        onLostPointerCapture={onUp}
      >
        {stick ? (
          <>
            <div
              className={cn("absolute h-32 w-32 -translate-x-1/2 -translate-y-1/2 rounded-full border bg-ink-900/50 backdrop-blur-sm transition-colors",
                sprinting ? "border-ember-400/70" : "border-frost-400/40")}
              style={{ left: stick.ox, top: stick.oy, boxShadow: "inset 0 0 26px rgba(103,200,244,0.2)" }}
            />
            <div
              className="absolute h-14 w-14 -translate-x-1/2 -translate-y-1/2 rounded-full border border-frost-300/70"
              style={{
                left: stick.ox + stick.x, top: stick.oy + stick.y,
                background: sprinting
                  ? "radial-gradient(circle at 35% 30%, rgba(255,186,120,0.95), rgba(224,110,30,0.92))"
                  : "radial-gradient(circle at 35% 30%, rgba(126,196,244,0.9), rgba(30,127,180,0.9))",
                boxShadow: "0 4px 16px rgba(0,0,0,0.5)",
              }}
            />
            {sprinting && (
              <span className="pointer-events-none absolute -translate-x-1/2 font-display text-[10px] font-bold uppercase tracking-[0.2em] text-ember-300"
                style={{ left: stick.ox, top: stick.oy + 76 }}>
                Sprint
              </span>
            )}
          </>
        ) : (
          <div className={cn("absolute flex h-24 w-24 items-center justify-center rounded-full border border-dashed border-frost-400/25 text-frost-300/35",
            leftHand ? "left-[max(2rem,env(safe-area-inset-left))]" : "right-[max(2rem,env(safe-area-inset-right))]")}
            style={{ bottom: "calc(max(1.5rem,env(safe-area-inset-bottom)) + 1rem)" }}>
            <span className="font-display text-[10px] font-bold uppercase tracking-widest">Move</span>
          </div>
        )}
      </div>

      {/* action cluster */}
      <div className={cn("absolute z-30 flex items-end gap-3", leftHand ? "right-0" : "left-0 flex-row-reverse")}
        style={{
          bottom: "max(1.5rem, env(safe-area-inset-bottom))",
          paddingRight: leftHand ? "max(1rem, env(safe-area-inset-right))" : undefined,
          paddingLeft: leftHand ? undefined : "max(1rem, env(safe-area-inset-left))",
        }}>
        {it && (
          <button
            className={cn("touchbtn h-[68px] w-[68px] flex-col gap-0.5",
              !it.ok && "off", pressed === "interact" && "scale-95 brightness-150")}
            onPointerDown={(e) => it.ok && btn(e, "interact")}
            style={it.tag === "quest" ? { borderColor: "rgba(255,176,99,0.6)" } : undefined}
          >
            <ItemIcon icon={it.icon} className="h-6 w-6" />
            <span className="max-w-[62px] truncate font-display text-[9px] font-bold uppercase tracking-wide">
              {it.tag === "locked" ? "Locked" : it.tag === "used" ? "Empty" : it.tag === "tool" ? "Tool" : it.label.split(" ")[0]}
            </span>
          </button>
        )}
        <button className={cn("touchbtn h-16 w-16", !dodgeReady && "off",
            pressed === "dodge" && "scale-95 brightness-150")}
          onPointerDown={(e) => btn(e, "dodge")} aria-label="Dodge">
          <Wind className="h-7 w-7 text-frost-300" />
        </button>
        <button
          className={cn("touchbtn h-[82px] w-[82px]", !atkReady && "off",
            pressed === "attack" && "scale-95 brightness-150")}
          style={{ borderColor: "rgba(255,176,99,0.5)", background: "radial-gradient(circle at 35% 30%, rgba(120,70,40,0.92), rgba(40,20,12,0.94))" }}
          onPointerDown={(e) => btn(e, "attack")}
          aria-label="Attack"
        >
          <Sword className="h-9 w-9 text-ember-300" />
        </button>
      </div>
    </>
  );
}
