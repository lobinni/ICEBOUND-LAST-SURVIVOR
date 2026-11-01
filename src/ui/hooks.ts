import { useSyncExternalStore } from "react";
import type { Game } from "../game/engine";

/** Subscribe a component to authoritative game-state changes. */
export function useGame(game: Game) {
  const ver = useSyncExternalStore(game.subscribe, game.getVer);
  void ver;
  return game.state;
}
