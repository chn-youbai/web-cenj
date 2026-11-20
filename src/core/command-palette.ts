import { escapeHtml } from "./dom";
import { NAV_ITEMS, type NavItemMeta, filterNavItems, matchSlashCommands } from "./nav-config";
import { getJsonStorage, removeStorageItem, setJsonStorage, setStorageItem } from "./storage";
import { toggleTheme } from "./theme";

export interface CommandItem {
  id: string;
  category: string;
  title: string;
  subtitle: string;
  badge?: string;
  kbd?: string;
  iconSvg: string;
  isHiddenSlash?: boolean;
  action: () => void;
}

export interface CommandPaletteController {
  open: (initialQuery?: string) => void;
  close: () => void;
  isOpen: () => boolean;
}

const RECENT_STORAGE_KEY = "cenj_cmd_recent_v1";
const MAX_RECENT_IDS = 5;

let singletonController: CommandPaletteController | null = null;

function isEnglishWordQuery(q: string): boolean {
  const clean = q.trim();
  return /^[a-zA-Z]{2,32}$/.test(clean);
}

function getRecentIds(): string[] {
  const list = getJsonStorage<unknown>(RECENT_STORAGE_KEY, []);
  return Array.isArray(list) ? list.filter((x): x is string => typeof x === "string") : [];
}

function recordRecentId(id: string): void {
  const next = [id, ...getRecentIds().filter((x) => x !== id)].slice(0, MAX_RECENT_IDS);
  setJsonStorage(RECENT_STORAGE_KEY, next);
}

function fuzzyScore(text: string, query: string): number {
  if (!query) return 1;
  const t = text.toLowerCase();
  const q = query.toLowerCase();
  const idx = t.indexOf(q);
  if (idx !== -1) {
    return 100 - idx;
  }
  let qi = 0;
  let score = 0;
  let streak = 0;
  for (let i = 0; i < t.length && qi < q.length; i++) {
    if (t[i] === q[qi]) {
      qi++;
      streak++;
      score += 4 + streak * 2;
    } else {
      streak = 0;
    }
  }
  return qi === q.length ? score : 0;
}

function highlightMatch(text: string, query: string): string {
  const clean = query.trim();
  if (!clean) return escapeHtml(text);

  const lowerText = text.toLowerCase();
  const lowerQuery = clean.toLowerCase();
  const exactIdx = lowerText.indexOf(lowerQuery);
  if (exactIdx !== -1) {
    const before = escapeHtml(text.slice(0, exactIdx));
    const mid = escapeHtml(text.slice(exactIdx, exactIdx + clean.length));
    const after = escapeHtml(text.slice(exactIdx + clean.length));
    return `${before}<mark class="cmd-match">${mid}</mark>${after}`;
  }

  // Fuzzy character highlight
  const chars = [...text];
  const qChars = [...lowerQuery];
  let qi = 0;
  const matchedIndices = new Set<number>();
  for (let i = 0; i < chars.length && qi < qChars.length; i++) {
    if (chars[i]?.toLowerCase() === qChars[qi]) {
      matchedIndices.add(i);
      qi++;
    }
  }
  if (qi < qChars.length) return escapeHtml(text);

  return chars
    .map((ch, i) =>
      matchedIndices.has(i) ? `<mark class="cmd-match">${escapeHtml(ch)}</mark>` : escapeHtml(ch),
    )
    .join("");
}

function toggleSidebarFromCommand(): void {
  const btn = document.getElementById("sidebarCollapseBtn");
  if (btn) {
    btn.click();
    return;
  }
  const collapsed = !document.body.classList.contains("sidebar-collapsed");
  document.body.classList.toggle("sidebar-collapsed", collapsed);
  setStorageItem("cenj_sidebar_expanded", collapsed ? "0" : "1");
  setStorageItem("cenj_sidebar_collapsed", collapsed ? "1" : "0");
}

function buildActionCommands(closePalette: () => void): CommandItem[] {
  const cmds: CommandItem[] = [
    {
      id: "cmd-toggle-theme",
      category: "外观",
      title: "切换深浅色主题",
      subtitle: "在暖米白纸感与暖炭黑模式之间切换",
      iconSvg:
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>',
      action: () => {
        toggleTheme();
        closePalette();
      },
    },
    {
      id: "cmd-toggle-sidebar",
      category: "视图",
      title: "展开 / 收起侧边栏",
      subtitle: "切换左侧导航栏形态",
      iconSvg:
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M9 4v16"/></svg>',
      action: () => {
        toggleSidebarFromCommand();
        closePalette();
      },
    },
    {
      id: "cmd-go-home",
      category: "导航",
      title: "返回首页工作台",
      subtitle: "index.html",
      iconSvg: NAV_ITEMS[0]?.iconSvg ?? "",
      action: () => {
        closePalette();
        window.location.href = "./index.html";
      },
    },
  ];

  for (const page of NAV_ITEMS) {
    if (page.id === "index") continue;
    cmds.push({
      id: `page-${page.id}`,
      category: "跳转",
      title: page.label,
      subtitle: page.subtitle,
      badge: page.requiresAuth ? "需密码" : undefined,
      iconSvg: page.iconSvg,
      action: () => {
        closePalette();
        window.location.href = page.href;
      },
    });
  }

  cmds.push({
    id: "cmd-clear-recent",
    category: "系统",
    title: "清除命令面板最近使用记录",
    subtitle: "重置置顶历史",
    iconSvg:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>',
    action: () => {
      removeStorageItem(RECENT_STORAGE_KEY);
      closePalette();
    },
  });

  return cmds;
}

function sortWithRecents(items: CommandItem[]): CommandItem[] {
  const recentIds = getRecentIds();
  if (recentIds.length === 0) return items;

  const recentSet = new Set(recentIds);
  const recentItems: CommandItem[] = [];
  for (const rid of recentIds) {
    const found = items.find((item) => item.id === rid);
    if (found) {
      recentItems.push({ ...found, badge: found.badge ?? "最近使用" });
    }
  }
  const rest = items.filter((item) => !recentSet.has(item.id));
  return [...recentItems, ...rest];
}

function buildCommandItems(
  query: string,
  closePalette: () => void,
): { items: CommandItem[]; matchQuery: string; mode: "command" | "quick-open" } {
  const trimmed = query.trim();

  // VS Code `>` Command Mode
  if (trimmed.startsWith(">")) {
    const cmdQuery = trimmed.slice(1).trim();
    const allCmds = buildActionCommands(closePalette);
    if (!cmdQuery) {
      return { items: sortWithRecents(allCmds), matchQuery: "", mode: "command" };
    }
    const scored = allCmds
      .map((item) => ({
        item,
        score: Math.max(
          fuzzyScore(`${item.category} ${item.title}`, cmdQuery),
          fuzzyScore(item.subtitle, cmdQuery) * 0.5,
        ),
      }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((entry) => entry.item);

    return { items: scored, matchQuery: cmdQuery, mode: "command" };
  }

  // Quick Open Mode (pages, exact slash commands, English vocab lookup, theme)
  const items: CommandItem[] = [];

  for (const cmd of matchSlashCommands(trimmed)) {
    items.push({
      id: `slash-${cmd.command}`,
      category: "指令",
      title: `${cmd.command} · ${cmd.label}`,
      subtitle: cmd.subtitle,
      badge: cmd.requiresAuth ? "需密码" : "直达",
      iconSvg: cmd.iconSvg,
      isHiddenSlash: true,
      action: () => {
        closePalette();
        window.location.href = cmd.href;
      },
    });
  }

  if (isEnglishWordQuery(trimmed)) {
    items.push({
      id: `lookup-${trimmed.toLowerCase()}`,
      category: "查词",
      title: `查询单词 “${trimmed}”`,
      subtitle: "跳转查词系统",
      kbd: "Enter",
      iconSvg:
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/></svg>',
      action: () => {
        closePalette();
        window.location.href = `./vocab.html?q=${encodeURIComponent(trimmed)}`;
      },
    });
  }

  const matchedPages: NavItemMeta[] = trimmed.startsWith("/") ? [] : filterNavItems(trimmed);
  for (const page of matchedPages) {
    items.push({
      id: `page-${page.id}`,
      category: "页面",
      title: page.label,
      subtitle: page.subtitle,
      badge: page.requiresAuth ? "需密码" : undefined,
      iconSvg: page.iconSvg,
      action: () => {
        closePalette();
        window.location.href = page.href;
      },
    });
  }

  const themeMatch =
    !trimmed ||
    ["theme", "dark", "light", "主题", "深色", "浅色", "夜间", "黑夜", "白天"].some((k) =>
      k.includes(trimmed.toLowerCase()),
    );
  if (themeMatch && !trimmed.startsWith("/")) {
    items.push({
      id: "cmd-toggle-theme",
      category: "外观",
      title: "切换深浅色主题",
      subtitle: "暖米白 / 暖炭黑",
      iconSvg:
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>',
      action: () => {
        toggleTheme();
        closePalette();
      },
    });
  }

  const finalItems = !trimmed ? sortWithRecents(items) : items;
  return { items: finalItems, matchQuery: trimmed, mode: "quick-open" };
}

export function initCommandPalette(): CommandPaletteController {
  const existingRoot = document.getElementById("cmdPaletteBackdrop");
  if (singletonController && existingRoot) {
    return singletonController;
  }

  existingRoot?.remove();

  const backdrop = document.createElement("div");
  backdrop.id = "cmdPaletteBackdrop";
  backdrop.className = "cmd-palette-backdrop";
  backdrop.setAttribute("role", "dialog");
  backdrop.setAttribute("aria-modal", "true");
  backdrop.setAttribute("aria-label", "全局快捷命令面板");
  backdrop.setAttribute("aria-hidden", "true");

  backdrop.innerHTML = `
    <div class="cmd-palette-dialog">
      <div class="cmd-palette-search">
        <span class="cmd-mode-prefix" id="cmdModePrefix" aria-hidden="true">⌘</span>
        <input
          type="text"
          id="cmdPaletteInput"
          class="cmd-palette-input"
          placeholder="搜索页面、输入英文查词，或输入 > 运行命令..."
          autocomplete="off"
          spellcheck="false"
        />
        <button type="button" class="cmd-palette-esc" id="cmdPaletteCloseBtn" aria-label="关闭命令面板">ESC</button>
      </div>
      <div class="cmd-palette-list" id="cmdPaletteList" role="listbox"></div>
      <div class="cmd-palette-footer">
        <span id="cmdPaletteHint">输入 <code>&gt;</code> 切换命令模式</span>
        <span><kbd>↑↓</kbd> 选择 · <kbd>Enter</kbd> 执行 · <kbd>⌘⇧P</kbd> 命令</span>
      </div>
    </div>
  `;

  document.body.appendChild(backdrop);

  const inputEl = backdrop.querySelector<HTMLInputElement>("#cmdPaletteInput");
  const listEl = backdrop.querySelector<HTMLDivElement>("#cmdPaletteList");
  const closeBtn = backdrop.querySelector<HTMLButtonElement>("#cmdPaletteCloseBtn");
  const modePrefixEl = backdrop.querySelector<HTMLSpanElement>("#cmdModePrefix");
  const hintEl = backdrop.querySelector<HTMLSpanElement>("#cmdPaletteHint");

  let activeIndex = 0;
  let currentItems: CommandItem[] = [];

  function close(): void {
    backdrop.classList.remove("open");
    backdrop.setAttribute("aria-hidden", "true");
  }

  function invokeItem(item: CommandItem | undefined): void {
    if (!item) return;
    if (!item.isHiddenSlash && item.id !== "cmd-clear-recent" && !item.id.startsWith("lookup-")) {
      recordRecentId(item.id);
    }
    item.action();
  }

  function renderList(): void {
    if (!listEl) return;
    const q = inputEl?.value ?? "";
    const { items, matchQuery, mode } = buildCommandItems(q, close);
    currentItems = items;
    if (activeIndex >= currentItems.length) {
      activeIndex = 0;
    }

    if (modePrefixEl) {
      modePrefixEl.textContent = mode === "command" ? ">" : "⌘";
      modePrefixEl.classList.toggle("is-command", mode === "command");
    }
    if (hintEl) {
      hintEl.innerHTML =
        mode === "command"
          ? "命令模式 · 清空 <code>&gt;</code> 返回页面检索"
          : "输入 <code>&gt;</code> 切换命令模式";
    }

    if (currentItems.length === 0) {
      listEl.innerHTML = `<div class="cmd-palette-empty">未找到匹配的页面或命令</div>`;
      return;
    }

    let renderedDivider = false;
    listEl.innerHTML = currentItems
      .map((item, idx) => {
        const isSelected = idx === activeIndex;
        const isRecent = item.badge === "最近使用";
        let dividerHtml = "";
        if (
          !isRecent &&
          idx > 0 &&
          currentItems[idx - 1]?.badge === "最近使用" &&
          !renderedDivider
        ) {
          renderedDivider = true;
          dividerHtml = `<div class="cmd-palette-divider" role="separator"></div>`;
        }
        const rightMeta = item.kbd
          ? `<kbd class="cmd-item-kbd">${escapeHtml(item.kbd)}</kbd>`
          : item.badge
            ? `<span class="cmd-item-badge">${escapeHtml(item.badge)}</span>`
            : "";

        return `${dividerHtml}
          <button
            type="button"
            class="cmd-palette-item${isSelected ? " active" : ""}"
            role="option"
            aria-selected="${isSelected}"
            data-cmd-idx="${idx}"
          >
            <span class="cmd-item-icon">${item.iconSvg}</span>
            <span class="cmd-item-line">
              <span class="cmd-item-category">${escapeHtml(item.category)}:</span>
              <span class="cmd-item-title">${highlightMatch(item.title, matchQuery)}</span>
              <span class="cmd-item-sub">${escapeHtml(item.subtitle)}</span>
            </span>
            ${rightMeta}
          </button>
        `;
      })
      .join("");

    for (const btn of listEl.querySelectorAll<HTMLButtonElement>("[data-cmd-idx]")) {
      btn.addEventListener("click", () => {
        const idx = Number.parseInt(btn.dataset.cmdIdx ?? "0", 10);
        invokeItem(currentItems[idx]);
      });
      btn.addEventListener("mouseenter", () => {
        const idx = Number.parseInt(btn.dataset.cmdIdx ?? "0", 10);
        if (idx !== activeIndex) {
          activeIndex = idx;
          updateActiveHighlight();
        }
      });
    }
  }

  function updateActiveHighlight(): void {
    if (!listEl) return;
    const buttons = listEl.querySelectorAll<HTMLButtonElement>("[data-cmd-idx]");
    for (const btn of buttons) {
      const idx = Number.parseInt(btn.dataset.cmdIdx ?? "0", 10);
      const selected = idx === activeIndex;
      btn.classList.toggle("active", selected);
      btn.setAttribute("aria-selected", String(selected));
      if (selected && typeof btn.scrollIntoView === "function") {
        btn.scrollIntoView({ block: "nearest" });
      }
    }
  }

  function open(initialQuery = ""): void {
    backdrop.classList.add("open");
    backdrop.setAttribute("aria-hidden", "false");
    activeIndex = 0;
    if (inputEl) {
      inputEl.value = initialQuery;
    }
    renderList();
    window.setTimeout(() => {
      if (inputEl) {
        inputEl.focus();
        const len = inputEl.value.length;
        inputEl.setSelectionRange(len, len);
      }
    }, 10);
  }

  function isOpen(): boolean {
    return backdrop.classList.contains("open");
  }

  inputEl?.addEventListener("input", () => {
    activeIndex = 0;
    renderList();
  });

  inputEl?.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (currentItems.length > 0) {
        activeIndex = (activeIndex + 1) % currentItems.length;
        updateActiveHighlight();
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (currentItems.length > 0) {
        activeIndex = (activeIndex - 1 + currentItems.length) % currentItems.length;
        updateActiveHighlight();
      }
    } else if (e.key === "Enter") {
      e.preventDefault();
      invokeItem(currentItems[activeIndex]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      close();
    }
  });

  closeBtn?.addEventListener("click", close);
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) {
      close();
    }
  });

  window.addEventListener("keydown", (e) => {
    const key = e.key.toLowerCase();
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && key === "p") {
      e.preventDefault();
      if (isOpen() && inputEl?.value.startsWith(">")) {
        close();
      } else {
        open("> ");
      }
      return;
    }
    if ((e.metaKey || e.ctrlKey) && !e.shiftKey && key === "k") {
      e.preventDefault();
      if (isOpen()) {
        close();
      } else {
        open();
      }
      return;
    }
    if (e.key === "Escape" && isOpen()) {
      close();
    }
  });

  for (const trigger of document.querySelectorAll<HTMLElement>("[data-cmd-open]")) {
    trigger.addEventListener("click", () => open());
  }

  singletonController = { open, close, isOpen };
  return singletonController;
}
