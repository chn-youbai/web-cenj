import { escapeHtml } from "./dom";
import { NAV_ITEMS, type NavItemMeta, filterNavItems } from "./nav-config";
import { toggleTheme } from "./theme";

export interface CommandItem {
  id: string;
  title: string;
  subtitle: string;
  badge?: string;
  iconSvg: string;
  action: () => void;
}

export interface CommandPaletteController {
  open: (initialQuery?: string) => void;
  close: () => void;
  isOpen: () => boolean;
}

let singletonController: CommandPaletteController | null = null;

function isEnglishWordQuery(q: string): boolean {
  const clean = q.trim();
  return /^[a-zA-Z]{2,32}$/.test(clean);
}

function buildCommandItems(query: string, closePalette: () => void): CommandItem[] {
  const clean = query.trim();
  const items: CommandItem[] = [];

  if (isEnglishWordQuery(clean)) {
    items.push({
      id: `lookup-${clean.toLowerCase()}`,
      title: `查询英语单词 “${clean}”`,
      subtitle: "跳转至英语查词系统查看完整音标、词根与衍生词",
      badge: "查词直达",
      iconSvg:
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/></svg>',
      action: () => {
        closePalette();
        window.location.href = `./vocab.html?q=${encodeURIComponent(clean)}`;
      },
    });
  }

  const matchedPages: NavItemMeta[] = filterNavItems(clean);
  for (const page of matchedPages) {
    items.push({
      id: `page-${page.id}`,
      title: page.label,
      subtitle: page.subtitle,
      badge: page.requiresAuth ? "需密码" : page.shortLabel,
      iconSvg: page.iconSvg,
      action: () => {
        closePalette();
        window.location.href = page.href;
      },
    });
  }

  const themeMatch =
    !clean ||
    ["theme", "dark", "light", "主题", "深色", "浅色", "夜间", "黑夜", "白天"].some((k) =>
      k.includes(clean.toLowerCase()),
    );
  if (themeMatch) {
    items.push({
      id: "cmd-toggle-theme",
      title: "切换深浅色主题",
      subtitle: "在 Claude 暖米白纸感与暖炭黑模式之间切换",
      badge: "外观",
      iconSvg:
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>',
      action: () => {
        toggleTheme();
        closePalette();
      },
    });
  }

  if (items.length === 0 && clean) {
    for (const fallback of NAV_ITEMS.slice(0, 4)) {
      items.push({
        id: `fallback-${fallback.id}`,
        title: fallback.label,
        subtitle: fallback.subtitle,
        badge: fallback.shortLabel,
        iconSvg: fallback.iconSvg,
        action: () => {
          closePalette();
          window.location.href = fallback.href;
        },
      });
    }
  }

  return items;
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
      <div class="ui-sheet-handle" aria-hidden="true"></div>
      <div class="cmd-palette-search">
        <svg class="cmd-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <circle cx="11" cy="11" r="7"/>
          <path d="M21 21l-4.35-4.35"/>
        </svg>
        <input
          type="text"
          id="cmdPaletteInput"
          class="cmd-palette-input"
          placeholder="输入英文直接查词，或输入页面名称 / 快捷跳转..."
          autocomplete="off"
          spellcheck="false"
        />
        <button type="button" class="cmd-palette-esc" id="cmdPaletteCloseBtn" aria-label="关闭命令面板">ESC</button>
      </div>
      <div class="cmd-palette-list" id="cmdPaletteList" role="listbox"></div>
      <div class="cmd-palette-footer">
        <span><kbd>↑</kbd> <kbd>↓</kbd> 选择</span>
        <span><kbd>Enter</kbd> 直达</span>
        <span><kbd>⌘K</kbd> 随时呼出</span>
      </div>
    </div>
  `;

  document.body.appendChild(backdrop);

  const inputEl = backdrop.querySelector<HTMLInputElement>("#cmdPaletteInput");
  const listEl = backdrop.querySelector<HTMLDivElement>("#cmdPaletteList");
  const closeBtn = backdrop.querySelector<HTMLButtonElement>("#cmdPaletteCloseBtn");

  let activeIndex = 0;
  let currentItems: CommandItem[] = [];

  function close(): void {
    backdrop.classList.remove("open");
    backdrop.setAttribute("aria-hidden", "true");
  }

  function renderList(): void {
    if (!listEl) return;
    const q = inputEl?.value ?? "";
    currentItems = buildCommandItems(q, close);
    if (activeIndex >= currentItems.length) {
      activeIndex = 0;
    }

    listEl.innerHTML = currentItems
      .map((item, idx) => {
        const isSelected = idx === activeIndex;
        return `
          <button
            type="button"
            class="cmd-palette-item${isSelected ? " active" : ""}"
            role="option"
            aria-selected="${isSelected}"
            data-cmd-idx="${idx}"
          >
            <span class="cmd-item-icon">${item.iconSvg}</span>
            <span class="cmd-item-body">
              <span class="cmd-item-title">${escapeHtml(item.title)}</span>
              <span class="cmd-item-sub">${escapeHtml(item.subtitle)}</span>
            </span>
            ${item.badge ? `<span class="cmd-item-badge">${escapeHtml(item.badge)}</span>` : ""}
          </button>
        `;
      })
      .join("");

    for (const btn of listEl.querySelectorAll<HTMLButtonElement>("[data-cmd-idx]")) {
      btn.addEventListener("click", () => {
        const idx = Number.parseInt(btn.dataset.cmdIdx ?? "0", 10);
        currentItems[idx]?.action();
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
      inputEl?.focus();
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
      currentItems[activeIndex]?.action();
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
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
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
