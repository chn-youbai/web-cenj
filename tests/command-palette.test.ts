import { initCommandPalette } from "@/core/command-palette";
import { beforeEach, describe, expect, it } from "vitest";

describe("command palette (⌘K)", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    document.documentElement.dataset.theme = "light";
  });

  it("opens, filters Chinese page keywords, and closes on Escape", () => {
    const palette = initCommandPalette();
    palette.open();
    expect(palette.isOpen()).toBe(true);

    const input = document.getElementById("cmdPaletteInput") as HTMLInputElement;
    expect(input).not.toBeNull();
    input.value = "网盘";
    input.dispatchEvent(new Event("input"));

    const titles = Array.from(document.querySelectorAll(".cmd-item-title")).map(
      (el) => el.textContent,
    );
    expect(titles.some((t) => t?.includes("资源网盘"))).toBe(true);

    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(palette.isOpen()).toBe(false);
  });

  it("shows direct English vocabulary lookup action when typing an English word", () => {
    const palette = initCommandPalette();
    palette.open("ephemeral");

    const titles = Array.from(document.querySelectorAll(".cmd-item-title")).map(
      (el) => el.textContent,
    );
    expect(titles[0]).toContain("ephemeral");
  });

  it("toggles site theme when invoking the theme command", () => {
    const palette = initCommandPalette();
    palette.open("深色");

    const themeBtn = Array.from(
      document.querySelectorAll<HTMLButtonElement>(".cmd-palette-item"),
    ).find((btn) => btn.textContent?.includes("切换深浅色主题"));
    expect(themeBtn).toBeDefined();

    themeBtn?.click();
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(palette.isOpen()).toBe(false);
  });
});
