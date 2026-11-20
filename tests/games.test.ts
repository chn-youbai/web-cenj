import { createEmptyGrid, hasAvailableMoves, moveGrid } from "@/pages/index/game-2048";
import { createMemoryDeck } from "@/pages/index/game-memory";
import {
  createShuffledPuzzle,
  createSolvedPuzzle,
  isPuzzleSolved,
} from "@/pages/index/game-puzzle";
import { getTimeGreeting } from "@/pages/index/omnibox";
import { describe, expect, it } from "vitest";

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

  it("returns 6-period sunrise/sunset greetings without personal name", () => {
    const at = (h: number, m = 0) => new Date(2026, 3, 15, h, m, 0); // April 15 (~05:35 sunrise, ~18:25 sunset)
    expect(getTimeGreeting(at(7, 0))).toBe("早安");
    expect(getTimeGreeting(at(9, 30))).toBe("早上好");
    expect(getTimeGreeting(at(12, 45))).toBe("中午好");
    expect(getTimeGreeting(at(15, 30))).toBe("下午好");
    expect(getTimeGreeting(at(20, 0))).toBe("晚上好");
    expect(getTimeGreeting(at(22, 30))).toBe("晚安");
    expect(getTimeGreeting(at(3, 0))).toBe("晚安");
  });
});
