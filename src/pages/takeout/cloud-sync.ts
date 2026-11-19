import { saveLocalData, state } from "./store";
import type { DishItem, OrderItem, PersonItem } from "./types";

interface TakeoutCloudPayload {
  updateTime?: string;
  menu?: DishItem[];
  people?: PersonItem[];
  orders?: OrderItem[];
  status?: string;
}

let isSyncing = false;
let toastNotifier: (msg: string) => void = () => {};

export function registerSyncToast(fn: (msg: string) => void): void {
  toastNotifier = fn;
}

export async function syncToCloud(isManual = false): Promise<void> {
  if (isSyncing) return;
  const badge = document.getElementById("cloud-sync-badge");
  if (badge) {
    badge.className = "sync-badge syncing";
    badge.innerHTML = "<span>🔄</span> 同步中...";
  }
  isSyncing = true;

  const payload = {
    updateTime: new Date().toISOString(),
    menu: state.menu,
    people: state.people,
    orders: state.orders,
  };

  try {
    const resp = await fetch("/api/takeout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (resp.ok) {
      const now = new Date();
      const timeStr = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
      if (badge) {
        badge.className = "sync-badge synced";
        badge.innerHTML = `<span>🟢</span> 云端已同步 (${timeStr})`;
      }
      if (isManual) toastNotifier("云端数据同步成功！");
    } else {
      if (badge) {
        badge.className = "sync-badge synced";
        badge.innerHTML = "<span>🟢</span> 云端在线";
      }
      if (isManual) toastNotifier("已保存到本地");
    }
  } catch {
    if (badge) {
      badge.className = "sync-badge";
      badge.innerHTML = `<span>💾</span> 本地存储 (${state.orders.length}条)`;
    }
    if (isManual) toastNotifier("网络离线，已保存至本地");
  } finally {
    isSyncing = false;
  }
}

export async function fetchFromCloud(onDataUpdated: () => void): Promise<void> {
  const badge = document.getElementById("cloud-sync-badge");
  try {
    const resp = await fetch("/api/takeout");
    if (!resp.ok) return;
    const json = (await resp.json()) as TakeoutCloudPayload;

    if (json?.people && json?.orders && json.orders.length > 0) {
      const localOrders = state.orders || [];
      if (localOrders.length === 0 || json.orders.length > localOrders.length) {
        state.people = json.people;
        state.orders = json.orders;
        if (json.menu && json.menu.length > 0) {
          state.menu = json.menu;
        }
        saveLocalData();
        onDataUpdated();
      }
      if (badge) {
        badge.className = "sync-badge synced";
        badge.innerHTML = "<span>🟢</span> 云端已同步";
      }
    } else {
      if (badge) {
        badge.className = "sync-badge synced";
        badge.innerHTML = "<span>🟢</span> 云端在线";
      }
      if (state.orders.length > 0) {
        void syncToCloud(false);
      }
    }
  } catch {
    if (badge) {
      badge.className = "sync-badge";
      badge.innerHTML = "<span>💾</span> 本地模式";
    }
  }
}

export function saveData(autoSync = true): void {
  saveLocalData();
  if (autoSync) {
    void syncToCloud(false);
  }
}
