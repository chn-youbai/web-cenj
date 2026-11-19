import {
  THEME_COLORS,
  THEME_STORAGE_KEY,
  applyTheme,
  getPreferredTheme,
  initThemeToggle,
  toggleTheme,
} from "@/core/theme";
import { beforeEach, describe, expect, it } from "vitest";

describe("core/theme", () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
    document.head.innerHTML = '<meta name="theme-color" content="#faf9f5">';
    document.body.innerHTML = '<button type="button" data-theme-toggle>Theme</button>';
  });

  it("applies light and dark theme attributes and updates meta theme-color", () => {
    applyTheme("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    expect(meta?.content).toBe(THEME_COLORS.dark);
    const btn = document.querySelector<HTMLButtonElement>("[data-theme-toggle]");
    expect(btn?.getAttribute("aria-pressed")).toBe("true");

    applyTheme("light");
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(meta?.content).toBe(THEME_COLORS.light);
    expect(btn?.getAttribute("aria-pressed")).toBe("false");
  });

  it("persists theme preference when toggled and respects saved preference", () => {
    applyTheme("light");
    const next = toggleTheme();
    expect(next).toBe("dark");
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    expect(getPreferredTheme()).toBe("dark");
  });

  it("wires click handler via initThemeToggle", () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "light");
    const initial = initThemeToggle();
    expect(initial).toBe("light");

    const btn = document.querySelector<HTMLButtonElement>("[data-theme-toggle]");
    btn?.click();
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
  });
});
