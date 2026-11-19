import { getStorageItem, setStorageItem } from "./storage";

export type ThemeMode = "light" | "dark";

export const THEME_STORAGE_KEY = "cenj_theme_v1";

export const THEME_COLORS: Record<ThemeMode, string> = {
  light: "#faf9f5",
  dark: "#262624",
};

export function getSavedTheme(): ThemeMode | null {
  const saved = getStorageItem(THEME_STORAGE_KEY);
  return saved === "light" || saved === "dark" ? saved : null;
}

export function getPreferredTheme(): ThemeMode {
  const saved = getSavedTheme();
  if (saved) return saved;
  if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return "light";
}

export function applyTheme(theme: ThemeMode): void {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;

  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (meta) {
    meta.content = THEME_COLORS[theme];
  }

  const nextLabel = theme === "dark" ? "切换为暖纸浅色模式" : "切换为暖炭深色模式";
  for (const btn of document.querySelectorAll<HTMLButtonElement>("[data-theme-toggle]")) {
    btn.setAttribute("aria-label", nextLabel);
    btn.setAttribute("title", nextLabel);
    btn.setAttribute("aria-pressed", String(theme === "dark"));
  }
}

export function toggleTheme(): ThemeMode {
  const current = document.documentElement.dataset.theme === "dark" ? "dark" : "light";
  const next: ThemeMode = current === "dark" ? "light" : "dark";
  setStorageItem(THEME_STORAGE_KEY, next);
  applyTheme(next);
  return next;
}

export function initThemeToggle(): ThemeMode {
  const initial = getPreferredTheme();
  applyTheme(initial);

  for (const btn of document.querySelectorAll<HTMLButtonElement>("[data-theme-toggle]")) {
    btn.addEventListener("click", () => {
      toggleTheme();
    });
  }

  if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (e: MediaQueryListEvent): void => {
      if (!getSavedTheme()) {
        applyTheme(e.matches ? "dark" : "light");
      }
    };
    if (typeof mq.addEventListener === "function") {
      mq.addEventListener("change", onChange);
    }
  }

  return initial;
}
