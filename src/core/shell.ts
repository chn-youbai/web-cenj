import { type CommandPaletteController, initCommandPalette } from "./command-palette";
import { escapeHtml } from "./dom";
import { NAV_GROUPS, NAV_ITEMS, type PageId, getNavItem } from "./nav-config";
import { getStorageItem, setStorageItem } from "./storage";
import { initThemeToggle } from "./theme";

export const SIDEBAR_EXPANDED_KEY = "cenj_sidebar_expanded";
export const SIDEBAR_COLLAPSED_KEY = "cenj_sidebar_collapsed";

export interface AppShellOptions {
  activePage: PageId;
}

export interface AppShellController {
  activePage: PageId;
  commandPalette: CommandPaletteController;
  toggleSidebar: () => boolean;
  openDrawer: () => void;
  closeDrawer: () => void;
}

const THEME_SUN_MOON_SVG = `
  <svg class="icon-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
  </svg>
  <svg class="icon-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="4"/>
    <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>
  </svg>
`;

function renderSidebarNavGroups(activePage: PageId): string {
  return NAV_GROUPS.map((group) => {
    const groupItems = NAV_ITEMS.filter((item) => item.group === group.id);
    if (groupItems.length === 0) return "";
    const linksHtml = groupItems
      .map((item) => {
        const isCurrent = item.id === activePage;
        return `
          <a
            href="${item.href}"
            class="app-nav-link${isCurrent ? " active" : ""}"
            data-nav-id="${item.id}"
            ${isCurrent ? 'aria-current="page"' : ""}
            title="${escapeHtml(item.label)} · ${escapeHtml(item.subtitle)}"
          >
            <span class="app-nav-icon">${item.iconSvg}</span>
            <span class="app-nav-label">${escapeHtml(item.label)}</span>
            ${item.requiresAuth ? '<span class="app-nav-lock" aria-label="受密码保护">●</span>' : ""}
          </a>
        `;
      })
      .join("");

    return `
      <div class="app-nav-group" data-group="${group.id}">
        <div class="app-nav-group-title">
          <span class="group-code">${group.code}</span>
          <span class="group-text">${escapeHtml(group.label)}</span>
        </div>
        <div class="app-nav-group-items">${linksHtml}</div>
      </div>
    `;
  }).join("");
}

export function initAppShell(options: AppShellOptions): AppShellController {
  const { activePage } = options;
  const activeMeta = getNavItem(activePage);

  document.body.classList.add("has-app-shell");
  document.body.dataset.activePage = activePage;

  const isHomePage = activePage === "index";
  const isCollapsed = isHomePage
    ? getStorageItem(SIDEBAR_EXPANDED_KEY) !== "1"
    : getStorageItem(SIDEBAR_COLLAPSED_KEY) === "1";
  document.body.classList.toggle("sidebar-collapsed", isCollapsed);

  document.getElementById("appSidebar")?.remove();
  document.getElementById("mobileTopBar")?.remove();
  document.getElementById("mobileDrawerBackdrop")?.remove();

  // 1. Unified left rail / collapsible sidebar (slim rail on mobile only for homepage)
  const sidebar = document.createElement("aside");
  sidebar.id = "appSidebar";
  sidebar.className = "app-sidebar";
  sidebar.setAttribute("aria-label", "全站主导航");
  sidebar.innerHTML = `
    <div class="app-sidebar-top">
      <a href="./index.html" class="app-brand" title="返回首页工作台">
        <span class="app-brand-mark" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2L13.6 9.1L19.9 5.6L15.1 11.1L22 12L15.1 12.9L19.9 18.4L13.6 14.9L12 22L10.4 14.9L4.1 18.4L8.9 12.9L2 12L8.9 11.1L4.1 5.6L10.4 9.1Z"/>
          </svg>
        </span>
        <span class="app-brand-text">
          <span class="app-brand-name">Cenj</span>
          <span class="app-brand-edition">EDITION</span>
        </span>
      </a>
      <button
        type="button"
        class="sidebar-collapse-btn"
        id="sidebarCollapseBtn"
        aria-label="展开或收起侧边导航"
        aria-controls="mobileDrawerBackdrop"
        aria-expanded="false"
        title="展开 / 收起侧边导航"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <rect x="3" y="4" width="18" height="16" rx="2.5"/>
          <path d="M9 4v16"/>
        </svg>
      </button>
    </div>

    <div class="app-sidebar-search">
      <button type="button" class="sidebar-cmd-btn" data-cmd-open aria-label="打开快捷搜索与命令面板 (⌘K)">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <circle cx="11" cy="11" r="7"/>
          <path d="M21 21l-4.35-4.35"/>
        </svg>
        <span class="sidebar-cmd-label">搜索或查词...</span>
        <kbd class="sidebar-cmd-kbd">⌘K</kbd>
      </button>
    </div>

    <nav class="app-sidebar-nav" aria-label="模块分组">
      ${renderSidebarNavGroups(activePage)}
    </nav>

    <div class="app-sidebar-footer">
      <div class="sidebar-current-pill" title="当前所在模块">
        <span class="current-dot" aria-hidden="true"></span>
        <span class="current-name">${escapeHtml(activeMeta.shortLabel)}</span>
      </div>
      <button type="button" class="theme-toggle-btn" data-theme-toggle aria-label="切换深浅色主题">
        ${THEME_SUN_MOON_SVG}
      </button>
    </div>
  `;

  // 2. Mobile minimalist top bar
  const mobileTopBar = document.createElement("header");
  mobileTopBar.id = "mobileTopBar";
  mobileTopBar.className = "mobile-topbar";
  mobileTopBar.innerHTML = `
    <div class="mobile-topbar-left">
      ${
        isHomePage
          ? ""
          : `<button
        type="button"
        class="mobile-menu-btn"
        id="mobileMenuBtn"
        aria-label="打开全站导航菜单"
        aria-expanded="false"
        aria-controls="mobileDrawerBackdrop"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true">
          <path d="M4 7h16M4 12h16M4 17h12"/>
        </svg>
      </button>`
      }
      <a href="./index.html" class="mobile-topbar-brand" title="返回工作台">
        <span class="mobile-topbar-mark" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2L13.6 9.1L19.9 5.6L15.1 11.1L22 12L15.1 12.9L19.9 18.4L13.6 14.9L12 22L10.4 14.9L4.1 18.4L8.9 12.9L2 12L8.9 11.1L4.1 5.6L10.4 9.1Z"/>
          </svg>
        </span>
        <span class="mobile-topbar-title">${escapeHtml(activeMeta.label)}</span>
      </a>
    </div>
    <div class="mobile-topbar-right">
      <button type="button" class="theme-toggle-btn mobile-theme-btn" data-theme-toggle aria-label="切换深浅色主题">
        ${THEME_SUN_MOON_SVG}
      </button>
    </div>
  `;

  // 3. Mobile left slide-out navigation drawer
  const mobileDrawerBackdrop = document.createElement("div");
  mobileDrawerBackdrop.id = "mobileDrawerBackdrop";
  mobileDrawerBackdrop.className = "mobile-drawer-backdrop";
  mobileDrawerBackdrop.setAttribute("role", "dialog");
  mobileDrawerBackdrop.setAttribute("aria-modal", "true");
  mobileDrawerBackdrop.setAttribute("aria-label", "全站导航抽屉");
  mobileDrawerBackdrop.setAttribute("aria-hidden", "true");
  mobileDrawerBackdrop.innerHTML = `
    <aside class="mobile-drawer-panel">
      <div class="mobile-drawer-header">
        <a href="./index.html" class="app-brand">
          <span class="app-brand-mark" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2L13.6 9.1L19.9 5.6L15.1 11.1L22 12L15.1 12.9L19.9 18.4L13.6 14.9L12 22L10.4 14.9L4.1 18.4L8.9 12.9L2 12L8.9 11.1L4.1 5.6L10.4 9.1Z"/>
            </svg>
          </span>
          <span class="app-brand-text">
            <span class="app-brand-name">Cenj</span>
            <span class="app-brand-edition">EDITION</span>
          </span>
        </a>
        <button type="button" class="mobile-drawer-close" id="mobileDrawerCloseBtn" aria-label="关闭导航菜单">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </button>
      </div>

      <div class="mobile-drawer-search">
        <button type="button" class="sidebar-cmd-btn" data-cmd-open aria-label="打开快捷搜索或查词">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <circle cx="11" cy="11" r="7"/>
            <path d="M21 21l-4.35-4.35"/>
          </svg>
          <span class="sidebar-cmd-label">搜索页面或英文查词...</span>
        </button>
      </div>

      <nav class="app-sidebar-nav mobile-drawer-nav" aria-label="移动端全站导航">
        ${renderSidebarNavGroups(activePage)}
      </nav>

      <div class="app-sidebar-footer">
        <div class="sidebar-current-pill">
          <span class="current-dot" aria-hidden="true"></span>
          <span class="current-name">${escapeHtml(activeMeta.shortLabel)}</span>
        </div>
        <button type="button" class="theme-toggle-btn" data-theme-toggle aria-label="切换深浅色主题">
          ${THEME_SUN_MOON_SVG}
        </button>
      </div>
    </aside>
  `;

  document.body.prepend(sidebar);
  document.body.prepend(mobileTopBar);
  document.body.appendChild(mobileDrawerBackdrop);

  function toggleSidebar(): boolean {
    const collapsed = !document.body.classList.contains("sidebar-collapsed");
    document.body.classList.toggle("sidebar-collapsed", collapsed);
    setStorageItem(SIDEBAR_EXPANDED_KEY, collapsed ? "0" : "1");
    setStorageItem(SIDEBAR_COLLAPSED_KEY, collapsed ? "1" : "0");
    return collapsed;
  }

  function openDrawer(): void {
    mobileDrawerBackdrop.classList.add("open");
    mobileDrawerBackdrop.setAttribute("aria-hidden", "false");
    document.getElementById("sidebarCollapseBtn")?.setAttribute("aria-expanded", "true");
  }

  function closeDrawer(): void {
    mobileDrawerBackdrop.classList.remove("open");
    mobileDrawerBackdrop.setAttribute("aria-hidden", "true");
    document.getElementById("sidebarCollapseBtn")?.setAttribute("aria-expanded", "false");
  }

  document.getElementById("sidebarCollapseBtn")?.addEventListener("click", () => {
    if (window.matchMedia("(max-width: 919px)").matches) {
      if (mobileDrawerBackdrop.classList.contains("open")) {
        closeDrawer();
      } else {
        openDrawer();
      }
      return;
    }
    toggleSidebar();
  });

  document.getElementById("mobileMenuBtn")?.addEventListener("click", () => {
    if (mobileDrawerBackdrop.classList.contains("open")) {
      closeDrawer();
    } else {
      openDrawer();
    }
  });

  document.getElementById("mobileDrawerCloseBtn")?.addEventListener("click", closeDrawer);
  mobileDrawerBackdrop.addEventListener("click", (e) => {
    if (e.target === mobileDrawerBackdrop) {
      closeDrawer();
    }
  });

  for (const cmdTrigger of mobileDrawerBackdrop.querySelectorAll<HTMLElement>("[data-cmd-open]")) {
    cmdTrigger.addEventListener("click", () => {
      closeDrawer();
    });
  }

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && mobileDrawerBackdrop.classList.contains("open")) {
      closeDrawer();
    }
  });

  initThemeToggle();
  const commandPalette = initCommandPalette();

  return {
    activePage,
    commandPalette,
    toggleSidebar,
    openDrawer,
    closeDrawer,
  };
}
