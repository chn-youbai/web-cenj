/**
 * 安全的 localStorage / sessionStorage 读写封装
 */

export function getStorageItem(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function setStorageItem(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // ignore quota/private mode errors
  }
}

export function removeStorageItem(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

export function getJsonStorage<T>(key: string, fallback: T): T {
  const raw = getStorageItem(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function setJsonStorage(key: string, value: unknown): void {
  try {
    setStorageItem(key, JSON.stringify(value));
  } catch {
    // ignore
  }
}
