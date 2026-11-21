import { createEmptyGrid, hasAvailableMoves, moveGrid } from "@/pages/games/game-2048";
import { createMemoryDeck, mountMemoryGame } from "@/pages/games/game-memory";
import {
  createShuffledPuzzle,
  createSolvedPuzzle,
  getAdjacentIndices,
  isPuzzleSolvable,
  isPuzzleSolved,
  mountAerialPuzzleGame,
  solvePuzzle,
} from "@/pages/games/game-puzzle";
import { describe, expect, it, vi } from "vitest";

function verifySolutionPath(board: number[], size: number, path: number[]): boolean {
  const cur = [...board];
  for (const tileIdx of path) {
    const emptyIdx = cur.indexOf(0);
    if (emptyIdx < 0 || !getAdjacentIndices(emptyIdx, size).includes(tileIdx)) {
      return false;
    }
    cur[emptyIdx] = cur[tileIdx] ?? 0;
    cur[tileIdx] = 0;
  }
  return isPuzzleSolved(cur);
}

describe("playground games logic", () => {
  it("merges 2048 tiles cleanly and calculates gained score", () => {
    const grid = createEmptyGrid();
    grid[0] = [2, 2, 4, 0];
    grid[1] = [4, 0, 4, 4];

    const res = moveGrid(grid, "left");
    expect(res.moved).toBe(true);
    expect(res.next[0]).toEqual([4, 4, 0, 0]);
    expect(res.next[1]).toEqual([8, 4, 0, 0]);
    expect(res.gained).toBe(12);
    expect(hasAvailableMoves(res.next)).toBe(true);
  });

  it("generates a non-solved but valid shuffled aerial puzzle", () => {
    const solved = createSolvedPuzzle(3);
    expect(isPuzzleSolved(solved)).toBe(true);

    const shuffled = createShuffledPuzzle(3, 40);
    expect(shuffled.length).toBe(9);
    expect(isPuzzleSolved(shuffled)).toBe(false);
    expect([...shuffled].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("solves 3x3 and 4x4 shuffled puzzles cleanly and rejects unsolvable boards", () => {
    expect(isPuzzleSolvable([1, 2, 3, 4, 5, 6, 8, 7, 0], 3)).toBe(false);
    expect(solvePuzzle([1, 2, 3, 4, 5, 6, 8, 7, 0], 3)).toBeNull();

    for (let i = 0; i < 5; i++) {
      const board3 = createShuffledPuzzle(3);
      const path3 = solvePuzzle(board3, 3);
      expect(path3).not.toBeNull();
      expect(verifySolutionPath(board3, 3, path3 ?? [])).toBe(true);
    }

    for (let i = 0; i < 5; i++) {
      const board4 = createShuffledPuzzle(4);
      const path4 = solvePuzzle(board4, 4);
      expect(path4).not.toBeNull();
      expect(verifySolutionPath(board4, 4, path4 ?? [])).toBe(true);
    }
  });

  it("supports puzzle hint highlight, tile numbers toggle, and 70ms auto-solve demo without win overlay", () => {
    vi.useFakeTimers();
    try {
      const container = document.createElement("div");
      mountAerialPuzzleGame(container);

      const numBtn = container.querySelector<HTMLButtonElement>("#puzzleNumBtn");
      const hintBtn = container.querySelector<HTMLButtonElement>("#puzzleHintBtn");
      const solveBtn = container.querySelector<HTMLButtonElement>("#puzzleSolveBtn");
      const winOverlay = container.querySelector<HTMLElement>("#puzzleWinOverlay");

      expect(container.querySelector(".puzzle-tile-num")).toBeNull();
      numBtn?.click();
      expect(container.querySelector(".puzzle-tile-num")).not.toBeNull();

      hintBtn?.click();
      expect(container.querySelector(".puzzle-tile.hint")).not.toBeNull();

      solveBtn?.click();
      expect(solveBtn?.textContent).toBe("停止演示");
      vi.advanceTimersByTime(70 * 100);

      expect(winOverlay?.hidden).toBe(true);
      expect(solveBtn?.disabled).toBe(true);
      const tiles = Array.from(container.querySelectorAll(".puzzle-tile"));
      expect(tiles[tiles.length - 1]?.classList.contains("empty")).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("creates exact photo pairs from gallery for memory match deck", () => {
    const deck = createMemoryDeck(8);
    expect(deck.length).toBe(16);
    const counts = new Map<string, number>();
    for (const card of deck) {
      counts.set(card.imageName, (counts.get(card.imageName) ?? 0) + 1);
    }
    for (const count of counts.values()) {
      expect(count).toBe(2);
    }
  });

  it("preloads round images before unlocking memory board and flips cards in-place", async () => {
    const pendingImages: Array<{ onload: (() => void) | null }> = [];
    class MockImage {
      decoding = "";
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      private _src = "";
      set src(val: string) {
        this._src = val;
        pendingImages.push(this);
      }
      get src() {
        return this._src;
      }
    }
    vi.stubGlobal("Image", MockImage);

    try {
      const container = document.createElement("div");
      mountMemoryGame(container);

      const overlay = container.querySelector<HTMLElement>("#memPreloadOverlay");
      const firstCard = container.querySelector<HTMLButtonElement>(".mem-card");
      const firstImg = firstCard?.querySelector<HTMLImageElement>("img");
      expect(overlay?.hidden).toBe(false);
      expect(firstImg?.getAttribute("loading")).toBeNull();
      expect(firstImg?.getAttribute("decoding")).toBe("async");

      // Board is locked during preload
      firstCard?.click();
      expect(firstCard?.classList.contains("flipped")).toBe(false);
      expect(pendingImages.length).toBe(8);

      // Complete all preloads
      for (const img of pendingImages) {
        img.onload?.();
      }
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(overlay?.hidden).toBe(true);

      // Click flips card in-place without recreating DOM node
      firstCard?.click();
      expect(firstCard?.classList.contains("flipped")).toBe(true);
      expect(container.querySelector(".mem-card")).toBe(firstCard);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
