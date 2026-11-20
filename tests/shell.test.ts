import { initCommandPalette } from "@/core/command-palette";
import { initAppShell } from "@/core/shell";
import { beforeEach, describe, expect, it } from "vitest";

describe("Claude App Shell & Global Command Palette", () => {
  beforeEach(() => {
    document.body.className = "";
    document.body.innerHTML = '<main id="stage">Content</main>';
    window.localStorage.clear();
  });

  it("renders desktop sidebar with all 9 navigation items and highlights active page", () => {
    const shell = initAppShell({ activePage: "gallery" });
    expect(shell.activePage).toBe("gallery");

    const navLinks = document.querySelectorAll("#appSidebar .app-nav-link");
    expect(navLinks.length).toBe(9);

    const activeLink = document.querySelector('#appSidebar .app-nav-link[data-nav-id="gallery"]');
    expect(activeLink?.classList.contains("active")).toBe(true);
    expect(activeLink?.getAttribute("aria-current")).toBe("page");
  });

  it("defaults to collapsed slim icon rail and persists expanded state to localStorage", () => {
    const shell = initAppShell({ activePage: "index" });
    expect(document.body.classList.contains("sidebar-collapsed")).toBe(true);

    const collapsed = shell.toggleSidebar();
    expect(collapsed).toBe(false);
    expect(document.body.classList.contains("sidebar-collapsed")).toBe(false);
    expect(window.localStorage.getItem("cenj_sidebar_expanded")).toBe("1");
  });

  it("renders mobile topbar and opens/closes left slide-out drawer", () => {
    const indexShell = initAppShell({ activePage: "index" });
    expect(document.getElementById("mobileTopBar")).not.toBeNull();
    expect(document.getElementById("mobileMenuBtn")).toBeNull();

    const subShell = initAppShell({ activePage: "gallery" });
    expect(document.body.classList.contains("sidebar-collapsed")).toBe(false);
    expect(document.getElementById("mobileMenuBtn")).not.toBeNull();

    const backdrop = document.getElementById("mobileDrawerBackdrop");
    expect(backdrop?.classList.contains("open")).toBe(false);

    subShell.openDrawer();
    expect(backdrop?.classList.contains("open")).toBe(true);

    const drawerLinks = document.querySelectorAll("#mobileDrawerBackdrop .app-nav-link");
    expect(drawerLinks.length).toBe(9);

    indexShell.closeDrawer();
    subShell.closeDrawer();
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
