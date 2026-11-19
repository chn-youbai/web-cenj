import { getStorageItem, setStorageItem } from "@/core/storage";
import { mount2048Game } from "./game-2048";
import { mountMemoryGame } from "./game-memory";
import { mountAerialPuzzleGame } from "./game-puzzle";

export type PlaygroundGameId = "2048" | "puzzle" | "memory";

const GAME_TAB_KEY = "cenj_home_game_tab_v1";

export function initPlayground(): void {
  const root = document.getElementById("playgroundSection");
  if (!root) return;

  const tabs = Array.from(root.querySelectorAll<HTMLButtonElement>("[data-game-tab]"));
  const panels: Record<PlaygroundGameId, HTMLElement | null> = {
    "2048": document.getElementById("panelGame2048"),
    puzzle: document.getElementById("panelGamePuzzle"),
    memory: document.getElementById("panelGameMemory"),
  };
  const mounted: Record<PlaygroundGameId, boolean> = {
    "2048": false,
    puzzle: false,
    memory: false,
  };

  function activateGame(id: PlaygroundGameId): void {
    for (const tab of tabs) {
      const isTarget = tab.dataset.gameTab === id;
      tab.classList.toggle("active", isTarget);
      tab.setAttribute("aria-selected", String(isTarget));
    }

    for (const key of Object.keys(panels) as PlaygroundGameId[]) {
      const panel = panels[key];
      if (!panel) continue;
      panel.hidden = key !== id;
    }

    const targetPanel = panels[id];
    if (targetPanel && !mounted[id]) {
      mounted[id] = true;
      if (id === "2048") mount2048Game(targetPanel);
      else if (id === "puzzle") mountAerialPuzzleGame(targetPanel);
      else mountMemoryGame(targetPanel);
    }

    setStorageItem(GAME_TAB_KEY, id);
  }

  for (const tab of tabs) {
    tab.addEventListener("click", () => {
      const id = (tab.dataset.gameTab as PlaygroundGameId | undefined) ?? "2048";
      activateGame(id);
    });
  }

  const saved = getStorageItem(GAME_TAB_KEY) as PlaygroundGameId | null;
  const initial: PlaygroundGameId =
    saved === "2048" || saved === "puzzle" || saved === "memory" ? saved : "2048";
  activateGame(initial);
}
