import { createEmptyGrid, hasAvailableMoves, moveGrid } from "@/pages/games/game-2048";
import { createMemoryDeck, mountMemoryGame } from "@/pages/games/game-memory";
import {
  createShuffledPuzzle,
  createSolvedPuzzle,
  isPuzzleSolved,
} from "@/pages/games/game-puzzle";
import { describe, expect, it, vi } from "vitest";

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
