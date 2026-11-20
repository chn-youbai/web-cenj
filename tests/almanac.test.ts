import { buildAlmanacDay, getDateSeed, getTimeGreeting } from "@/pages/index/almanac";
import { describe, expect, it } from "vitest";

describe("daily almanac homepage", () => {
  it("returns 6-period sunrise/sunset greetings without personal name", () => {
    const at = (h: number, m = 0) => new Date(2026, 3, 15, h, m, 0);
    expect(getTimeGreeting(at(7, 0))).toBe("早安");
    expect(getTimeGreeting(at(9, 30))).toBe("早上好");
    expect(getTimeGreeting(at(12, 45))).toBe("中午好");
    expect(getTimeGreeting(at(15, 30))).toBe("下午好");
    expect(getTimeGreeting(at(20, 0))).toBe("晚上好");
    expect(getTimeGreeting(at(22, 30))).toBe("晚安");
    expect(getTimeGreeting(at(3, 0))).toBe("晚安");
  });

  it("produces deterministic Yi/Ji and date fields for the same calendar day", () => {
    const d1 = new Date(2026, 10, 19, 9, 0, 0);
    const d2 = new Date(2026, 10, 19, 21, 30, 0);
    expect(getDateSeed(d1)).toBe(getDateSeed(d2));

    const a1 = buildAlmanacDay(d1);
    const a2 = buildAlmanacDay(d2);
    expect(a1.dayNumber).toBe("19");
    expect(a1.yiji).toEqual(a2.yiji);
    expect(a1.lunarText.length).toBeGreaterThan(0);
  });
});
