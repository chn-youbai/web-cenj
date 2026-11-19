import { initCommandPalette } from "@/core/command-palette";
import { initAppShell } from "@/core/shell";
import { beforeEach, describe, expect, it } from "vitest";

describe("Claude App Shell & Global Command Palette", () => {
  beforeEach(() => {
    document.body.className = "";
    document.body.innerHTML = '<main id="stage">Content</main>';
    window.localStorage.clear();
  });

  it("renders desktop sidebar with all 10 navigation items and highlights active page", () => {
    const shell = initAppShell({ activePage: "gallery" });
    expect(shell.activePage).toBe("gallery");

    const navLinks = document.querySelectorAll("#appSidebar .app-nav-link");
    expect(navLinks.length).toBe(10);

    const activeLink = document.querySelector('#appSidebar .app-nav-link[data-nav-id="gallery"]');
    expect(activeLink?.classList.contains("active")).toBe(true);
    expect(activeLink?.getAttribute("aria-current")).toBe("page");
  });

  it("toggles sidebar collapse state and persists to localStorage", () => {
    const shell = initAppShell({ activePage: "index" });
    expect(document.body.classList.contains("sidebar-collapsed")).toBe(false);

    const collapsed = shell.toggleSidebar();
    expect(collapsed).toBe(true);
    expect(document.body.classList.contains("sidebar-collapsed")).toBe(true);
    expect(window.localStorage.getItem("cenj_sidebar_collapsed")).toBe("1");
  });

  it("opens and closes mobile More Bottom Sheet", () => {
    const shell = initAppShell({ activePage: "index" });
    const backdrop = document.getElementById("mobileMoreSheetBackdrop");
    expect(backdrop?.classList.contains("open")).toBe(false);

    shell.openMoreSheet();
    expect(backdrop?.classList.contains("open")).toBe(true);

    shell.closeMoreSheet();
    expect(backdrop?.classList.contains("open")).toBe(false);
  });

  it("filters pages and offers instant English word lookup in ⌘K Command Palette", () => {
    const palette = initCommandPalette();
    palette.open("ephemeral");
    expect(palette.isOpen()).toBe(true);

    const firstOption = document.querySelector("#cmdPaletteList .cmd-palette-item .cmd-item-title");
    expect(firstOption?.textContent).toContain("ephemeral");

    palette.close();
    expect(palette.isOpen()).toBe(false);
  });
});
