import { type CommandPaletteController, initCommandPalette } from "./command-palette";
import { escapeHtml } from "./dom";
import { NAV_GROUPS, NAV_ITEMS, type PageId, getNavItem } from "./nav-config";
import { getStorageItem, setStorageItem } from "./storage";
import { initThemeToggle } from "./theme";

export const SIDEBAR_COLLAPSED_KEY = "cenj_sidebar_collapsed";

export interface AppShellOptions {
  activePage: PageId;
}

export interface AppShellController {
  activePage: PageId;
  commandPalette: CommandPaletteController;
  toggleSidebar: () => boolean;
  openMoreSheet: () => void;
  closeMoreSheet: () => void;
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

function renderMobileTabBar(activePage: PageId): string {
  const primaryItems = NAV_ITEMS.filter((item) => item.mobilePrimary);
  const isSecondaryActive = !primaryItems.some((item) => item.id === activePage);

  const tabsHtml = primaryItems
    .map((item) => {
      const isCurrent = item.id === activePage;
      return `
        <a
          href="${item.href}"
          class="mobile-tab-item${isCurrent ? " active" : ""}"
          data-mobile-tab="${item.id}"
          ${isCurrent ? 'aria-current="page"' : ""}
        >
          <span class="mobile-tab-icon">${item.iconSvg}</span>
          <span class="mobile-tab-label">${escapeHtml(item.shortLabel)}</span>
        </a>
      `;
    })
    .join("");

  return `
    ${tabsHtml}
    <button
      type="button"
      class="mobile-tab-item${isSecondaryActive ? " active" : ""}"
      id="mobileMoreTabBtn"
      aria-expanded="false"
      aria-controls="mobileMoreSheetBackdrop"
    >
      <span class="mobile-tab-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <circle cx="5" cy="12" r="1.5"/>
          <circle cx="12" cy="12" r="1.5"/>
          <circle cx="19" cy="12" r="1.5"/>
        </svg>
      </span>
      <span class="mobile-tab-label">更多</span>
    </button>
  `;
}

function renderMoreSheetGroups(activePage: PageId): string {
  return NAV_GROUPS.map((group) => {
    const groupItems = NAV_ITEMS.filter((item) => item.group === group.id);
    if (groupItems.length === 0) return "";
    return `
      <div class="more-sheet-group">
        <div class="more-sheet-group-header">${group.code} · ${escapeHtml(group.label)}</div>
        <div class="more-sheet-grid">
          ${groupItems
            .map((item) => {
              const isCurrent = item.id === activePage;
              return `
                <a
                  href="${item.href}"
                  class="more-sheet-card${isCurrent ? " active" : ""}"
                  data-sheet-nav="${item.id}"
                  ${isCurrent ? 'aria-current="page"' : ""}
                >
                  <span class="more-card-icon">${item.iconSvg}</span>
                  <span class="more-card-body">
                    <span class="more-card-title">${escapeHtml(item.label)}</span>
                    <span class="more-card-sub">${escapeHtml(item.subtitle)}</span>
                  </span>
                </a>
              `;
            })
            .join("")}
        </div>
      </div>
    `;
  }).join("");
}

export function initAppShell(options: AppShellOptions): AppShellController {
  const { activePage } = options;
  const activeMeta = getNavItem(activePage);

  document.body.classList.add("has-app-shell");
  document.body.dataset.activePage = activePage;

  const isCollapsed = getStorageItem(SIDEBAR_COLLAPSED_KEY) === "1";
  document.body.classList.toggle("sidebar-collapsed", isCollapsed);

  document.getElementById("appSidebar")?.remove();
  document.getElementById("mobileTabBar")?.remove();
  document.getElementById("mobileMoreSheetBackdrop")?.remove();

  // 1. Desktop collapsible sidebar
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
        aria-label="折叠或展开侧边栏"
        title="折叠 / 展开侧边栏"
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

  // 2. Mobile bottom TabBar
  const mobileTabBar = document.createElement("nav");
  mobileTabBar.id = "mobileTabBar";
  mobileTabBar.className = "mobile-tabbar";
  mobileTabBar.setAttribute("aria-label", "底部快捷导航");
  mobileTabBar.innerHTML = renderMobileTabBar(activePage);

  // 3. Mobile "More" Bottom Sheet
  const moreSheetBackdrop = document.createElement("div");
  moreSheetBackdrop.id = "mobileMoreSheetBackdrop";
  moreSheetBackdrop.className = "more-sheet-backdrop";
  moreSheetBackdrop.setAttribute("role", "dialog");
  moreSheetBackdrop.setAttribute("aria-modal", "true");
  moreSheetBackdrop.setAttribute("aria-label", "全站功能导航抽屉");
  moreSheetBackdrop.setAttribute("aria-hidden", "true");
  moreSheetBackdrop.innerHTML = `
    <div class="more-sheet-panel">
      <div class="ui-sheet-handle" aria-hidden="true"></div>
      <div class="more-sheet-header">
        <div class="more-sheet-title-wrap">
          <span class="more-sheet-eyebrow">EDITION · CENJ</span>
          <strong class="more-sheet-title">全站工作台导航</strong>
        </div>
        <div class="more-sheet-actions">
          <button type="button" class="more-sheet-cmd-btn" data-cmd-open aria-label="全局搜索或查词">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <circle cx="11" cy="11" r="7"/>
              <path d="M21 21l-4.35-4.35"/>
            </svg>
            <span>搜索 / 查词</span>
          </button>
          <button type="button" class="theme-toggle-btn" data-theme-toggle aria-label="切换深浅色主题">
            ${THEME_SUN_MOON_SVG}
          </button>
          <button type="button" class="more-sheet-close-btn" id="moreSheetCloseBtn" aria-label="关闭导航抽屉">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>
      </div>
      <div class="more-sheet-body">
        ${renderMoreSheetGroups(activePage)}
      </div>
    </div>
  `;

  document.body.prepend(sidebar);
  document.body.appendChild(mobileTabBar);
  document.body.appendChild(moreSheetBackdrop);

  function toggleSidebar(): boolean {
    const next = !document.body.classList.contains("sidebar-collapsed");
    document.body.classList.toggle("sidebar-collapsed", next);
    setStorageItem(SIDEBAR_COLLAPSED_KEY, next ? "1" : "0");
    return next;
  }

  function openMoreSheet(): void {
    moreSheetBackdrop.classList.add("open");
    moreSheetBackdrop.setAttribute("aria-hidden", "false");
    document.getElementById("mobileMoreTabBtn")?.setAttribute("aria-expanded", "true");
  }

  function closeMoreSheet(): void {
    moreSheetBackdrop.classList.remove("open");
    moreSheetBackdrop.setAttribute("aria-hidden", "true");
    document.getElementById("mobileMoreTabBtn")?.setAttribute("aria-expanded", "false");
  }

  document.getElementById("sidebarCollapseBtn")?.addEventListener("click", () => {
    toggleSidebar();
  });

  document.getElementById("mobileMoreTabBtn")?.addEventListener("click", () => {
    if (moreSheetBackdrop.classList.contains("open")) {
      closeMoreSheet();
    } else {
      openMoreSheet();
    }
  });

  document.getElementById("moreSheetCloseBtn")?.addEventListener("click", closeMoreSheet);
  moreSheetBackdrop.addEventListener("click", (e) => {
    if (e.target === moreSheetBackdrop) {
      closeMoreSheet();
    }
  });

  for (const cmdTrigger of moreSheetBackdrop.querySelectorAll<HTMLElement>("[data-cmd-open]")) {
    cmdTrigger.addEventListener("click", () => {
      closeMoreSheet();
    });
  }

  initThemeToggle();
  const commandPalette = initCommandPalette();

  return {
    activePage,
    commandPalette,
    toggleSidebar,
    openMoreSheet,
    closeMoreSheet,
  };
}
