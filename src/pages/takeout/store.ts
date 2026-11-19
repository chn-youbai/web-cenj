import { getStorageItem, removeStorageItem, setStorageItem } from "@/core/storage";
import { DEFAULT_MENU, DEFAULT_PEOPLE } from "./menu-data";
import type { DishItem, OrderItem, PersonItem, TakeoutState } from "./types";

export const AUTH_KEY = "takeout_auth_token_v1";
export const PWD_STORAGE_KEY = "takeout_custom_password_v1";
const AUTH_EXPIRE_MS = 30 * 24 * 60 * 60 * 1000;

export const state: TakeoutState = {
  menu: [],
  people: [],
  orders: [],
  selectedDate: "",
  selectedPersonId: "",
  activeCategory: "全部",
  searchQuery: "",
  historyMode: "person",
  currentModalDish: null,
  selectedSpecIndex: 0,
};

function readAuthToken(): string | null {
  const localToken = getStorageItem(AUTH_KEY);
  if (localToken) return localToken;
  try {
    return window.sessionStorage.getItem(AUTH_KEY);
  } catch {
    return null;
  }
}

export function clearAuthToken(): void {
  removeStorageItem(AUTH_KEY);
  try {
    window.sessionStorage.removeItem(AUTH_KEY);
  } catch {
    // ignore
  }
}

export function checkAuth(): boolean {
  const token = readAuthToken();
  if (!token) {
    window.location.replace("./index.html?need_auth=1");
    return false;
  }
  try {
    const data = JSON.parse(token) as { time?: number };
    if (typeof data.time !== "number" || Date.now() - data.time > AUTH_EXPIRE_MS) {
      clearAuthToken();
      window.location.replace("./index.html?need_auth=1");
      return false;
    }
    return true;
  } catch {
    clearAuthToken();
    window.location.replace("./index.html?need_auth=1");
    return false;
  }
}

export function getCustomPassword(): string | null {
  return getStorageItem(PWD_STORAGE_KEY);
}

export function setCustomPassword(nextPassword: string): void {
  setStorageItem(PWD_STORAGE_KEY, nextPassword);
}

export function loadData(): void {
  try {
    const localMenu = getStorageItem("sx_menu");
    state.menu = localMenu ? (JSON.parse(localMenu) as DishItem[]) : [...DEFAULT_MENU];

    const localPeople = getStorageItem("sx_people");
    state.people = localPeople ? (JSON.parse(localPeople) as PersonItem[]) : [...DEFAULT_PEOPLE];

    const localOrders = getStorageItem("sx_orders");
    state.orders = localOrders ? (JSON.parse(localOrders) as OrderItem[]) : [];
  } catch (err) {
    console.error("加载本地数据失败", err);
    state.menu = [...DEFAULT_MENU];
    state.people = [...DEFAULT_PEOPLE];
    state.orders = [];
  }

  if (state.people.length > 0 && !state.selectedPersonId) {
    state.selectedPersonId = state.people[0]?.id ?? "";
  }
}

export function saveLocalData(): void {
  setStorageItem("sx_menu", JSON.stringify(state.menu));
  setStorageItem("sx_people", JSON.stringify(state.people));
  setStorageItem("sx_orders", JSON.stringify(state.orders));
}
