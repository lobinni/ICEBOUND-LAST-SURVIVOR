import { useEffect, useRef, useState } from "react";
import { Game } from "./game/engine";
import { useGame } from "./ui/hooks";
import { HUD } from "./ui/HUD";
import { TouchControls } from "./ui/TouchControls";
import { Modals } from "./ui/Modals";
import { Toasts } from "./ui/Toasts";
import { BossBar, ExpeditionSummary, RegionBanner } from "./ui/RegionUI";
import { LoadingScreen, OrientationHint } from "./ui/Boot";
import { TutorialHint } from "./ui/Tutorial";
import { EndingScreen } from "./ui/Ending";
import { GameOver, Intro, MainMenu } from "./ui/Menus";
import { cn } from "./utils/cn";

export default function App() {
  const [game] = useState(() => new Game());
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const s = useGame(game);

  useEffect(() => {
    if (canvasRef.current) game.attach(canvasRef.current);
    return () => game.destroy();
  }, [game]);

  // keep the canvas correct through resizes / orientation changes / keyboard insets
  useEffect(() => {
    const vv = window.visualViewport;
    const onChange = () => window.dispatchEvent(new Event("resize"));
    vv?.addEventListener("resize", onChange);
    window.addEventListener("orientationchange", onChange);
    return () => {
      vv?.removeEventListener("resize", onChange);
      window.removeEventListener("orientationchange", onChange);
    };
  }, []);

  return (
    <div
      className={cn(
        "relative h-full w-full overflow-hidden bg-ink-950",
        s.settings.bigText && "text-[1.09em] [--ib-scale:1.09]",
        s.settings.highContrast && "hc"
      )}
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      <canvas ref={canvasRef} className="absolute inset-0 block h-full w-full" />
      {s.screen === "game" && (
        <>
          <HUD game={game} />
          <BossBar game={game} />
          <RegionBanner game={game} />
          <ExpeditionSummary game={game} />
          <TouchControls game={game} />
          <TutorialHint game={game} />
          <OrientationHint />
        </>
      )}
      <EndingScreen game={game} />
      <Modals game={game} />
      <Toasts game={game} />
      {s.screen === "menu" && <MainMenu game={game} />}
      {s.screen === "intro" && <Intro game={game} />}
      {s.screen === "over" && <GameOver game={game} />}
      <LoadingScreen game={game} />
      {game.fatalError && (
        <div className="absolute inset-0 z-[100] flex items-center justify-center bg-ink-950 p-6 text-center">
          <div className="panel max-w-sm px-6 py-5">
            <h2 className="font-display text-xl font-bold tracking-wide text-blood-400">Unable to start ICEBOUND</h2>
            <p className="mt-2 text-[13px] leading-relaxed text-frost-300/80">{game.fatalError}</p>
            <p className="mt-2 text-[11px] text-frost-300/50">Try updating the browser or enabling hardware-accelerated Canvas.</p>
          </div>
        </div>
      )}
    </div>
  );
}
