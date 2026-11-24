import { initCommandPalette } from "@/core/command-palette";
import { NAV_ITEMS, matchSlashCommands } from "@/core/nav-config";
import { getTimeGreeting } from "@/pages/index/omnibox";
import { beforeEach, describe, expect, it } from "vitest";

describe("6-period solar time greeting", () => {
  it("returns the exact 6 period greetings without personal name", () => {
    const summerDay = (hour: number, minute = 0) => new Date(2026, 5, 21, hour, minute, 0);
    expect(getTimeGreeting(summerDay(6, 30))).toBe("早安");
    expect(getTimeGreeting(summerDay(9, 0))).toBe("早上好");
    expect(getTimeGreeting(summerDay(12, 30))).toBe("中午好");
    expect(getTimeGreeting(summerDay(15, 0))).toBe("下午好");
    expect(getTimeGreeting(summerDay(20, 0))).toBe("晚上好");
    expect(getTimeGreeting(summerDay(23, 0))).toBe("晚安");
  });
});

describe("slash jump commands and hidden tools", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("excludes takeout, board, and clash from visible NAV_ITEMS", () => {
    const ids = NAV_ITEMS.map((item) => item.id);
    expect(ids).not.toContain("takeout");
    expect(ids).not.toContain("board");
    expect(ids).not.toContain("clash");
    expect(ids).toContain("game-2048");
    expect(ids).toContain("game-puzzle");
    expect(ids).toContain("game-memory");
  });

  it("matches only exact /bill, /msg, and /clash via matchSlashCommands", () => {
    expect(matchSlashCommands("/")).toEqual([]);
    expect(matchSlashCommands("/b")).toEqual([]);
    expect(matchSlashCommands("/m")).toEqual([]);
    expect(matchSlashCommands("/c")).toEqual([]);
    expect(matchSlashCommands("/bill").map((c) => c.href)).toEqual(["./takeout.html"]);
    expect(matchSlashCommands("/msg").map((c) => c.href)).toEqual(["./board.html"]);
    expect(matchSlashCommands("/clash").map((c) => c.href)).toEqual(["./clash.html"]);
  });

  it("surfaces /bill in command palette when opened with /bill", () => {
    const palette = initCommandPalette();
    palette.open("/bill");
    const bodyText = document.body.textContent ?? "";
    expect(bodyText).toContain("/bill");
    expect(bodyText).toContain("外卖记账");
  });

  it("suggests public slash commands when typing / without leaking hidden commands", () => {
    const palette = initCommandPalette();
    palette.open("/");
    const bodyText = document.body.textContent ?? "";
    expect(bodyText).toContain("/vocab");
    expect(bodyText).toContain("/recite");
    expect(bodyText).toContain("/gallery");
    expect(bodyText).toContain("/pan");
    expect(bodyText).toContain("/2048");
    expect(bodyText).not.toContain("/bill");
    expect(bodyText).not.toContain("/msg");
    expect(bodyText).not.toContain("/clash");
    expect(bodyText).not.toContain("/key");
  });
});
