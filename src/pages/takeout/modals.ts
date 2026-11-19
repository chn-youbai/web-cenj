import { postJson } from "@/core/api";
import { copyToClipboard, escapeHtml } from "@/core/dom";
import { saveData, syncToCloud } from "./cloud-sync";
import { DEFAULT_MENU, DEFAULT_PEOPLE, getWeekdayString } from "./menu-data";
import {
  renderAllViews,
  renderHistory,
  renderMenu,
  renderPersonPills,
  renderSettingsPeople,
  renderTodayOrders,
} from "./render";
import { buildCSVExportContent, parseCSVText } from "./settlement";
import { clearAuthToken, getCustomPassword, loadData, setCustomPassword, state } from "./store";
import type { DishItem, DishSpec, TakeoutBackupData } from "./types";

let pendingConfirmCallback: (() => void) | null = null;
let toastTimer: number | undefined;

export function showTakeoutToast(msg: string): void {
  const toast = document.getElementById("toast-el");
  if (!toast) return;
  toast.textContent = msg;
  toast.classList.add("show");
  if (toastTimer !== undefined) {
    window.clearTimeout(toastTimer);
  }
  toastTimer = window.setTimeout(() => {
    toast.classList.remove("show");
  }, 2200);
}

export async function copyWithFeedback(
  text: string,
  successMsg = "已复制到剪贴板！",
): Promise<void> {
  const ok = await copyToClipboard(text);
  showTakeoutToast(ok ? successMsg : "复制成功！若未生效请长按粘贴");
}

export function showConfirmModal(
  title: string,
  message: string,
  confirmBtnText: string,
  onConfirm: () => void,
  isDanger = true,
): void {
  const modal = document.getElementById("confirm-modal");
  const titleEl = document.getElementById("confirm-modal-title");
  const descEl = document.getElementById("confirm-modal-desc");
  const btn = document.getElementById("confirm-modal-action-btn");

  if (titleEl) titleEl.textContent = title;
  if (descEl) descEl.textContent = message;
  if (btn) {
    btn.textContent = confirmBtnText;
    btn.className = isDanger ? "btn btn-danger" : "btn btn-primary";
  }
  pendingConfirmCallback = onConfirm;
  modal?.classList.add("show");
}

export function closeConfirmModal(): void {
  document.getElementById("confirm-modal")?.classList.remove("show");
  pendingConfirmCallback = null;
}

export function executeConfirmAction(): void {
  if (typeof pendingConfirmCallback === "function") {
    const cb = pendingConfirmCallback;
    pendingConfirmCallback = null;
    closeConfirmModal();
    cb();
  }
}

export function logoutAuth(): void {
  showConfirmModal(
    "退出登录",
    "确定退出锁定状态吗？退出后再次进入需要输入访问密码。",
    "退出锁定",
    () => {
      clearAuthToken();
      window.location.replace("./index.html");
    },
    false,
  );
}

export function openChangePasswordModal(): void {
  const curInput = document.getElementById("pwd-current-input") as HTMLInputElement | null;
  const nextInput = document.getElementById("pwd-new-input") as HTMLInputElement | null;
  if (curInput) curInput.value = "";
  if (nextInput) nextInput.value = "";
  document.getElementById("change-pwd-modal")?.classList.add("show");
}

export function closeChangePasswordModal(): void {
  document.getElementById("change-pwd-modal")?.classList.remove("show");
}

export async function saveNewPassword(): Promise<void> {
  const curInput = document.getElementById("pwd-current-input") as HTMLInputElement | null;
  const nextInput = document.getElementById("pwd-new-input") as HTMLInputElement | null;
  const cur = curInput?.value.trim() || "";
  const next = nextInput?.value.trim() || "";

  if (!cur) {
    showTakeoutToast("请输入原访问密码");
    return;
  }
  if (!next || next.length < 4) {
    showTakeoutToast("新密码至少需要 4 位字符");
    return;
  }

  const customLocalPwd = getCustomPassword();
  if (customLocalPwd) {
    if (cur !== customLocalPwd) {
      showTakeoutToast("原访问密码错误");
      return;
    }
  } else {
    try {
      const resp = await postJson<{ ok?: boolean }>("/api/auth", { password: cur });
      if (!resp.ok) {
        showTakeoutToast("原访问密码错误");
        return;
      }
    } catch {
      showTakeoutToast("原访问密码错误或网络异常");
      return;
    }
  }

  setCustomPassword(next);
  closeChangePasswordModal();
  showTakeoutToast("密码修改成功，请牢记新密码！");
}

export function renderModalSpecs(): void {
  const dish = state.currentModalDish;
  if (!dish) return;

  const container = document.getElementById("modal-specs-container");
  if (!container) return;

  let html = "";
  dish.specs.forEach((spec, idx) => {
    const isAct = idx === state.selectedSpecIndex;
    html += `
      <div class="spec-option ${isAct ? "active" : ""}" data-spec-idx="${idx}">
        <span class="spec-name">${escapeHtml(spec.name)}</span>
        <span class="spec-price">¥${spec.price}</span>
      </div>
    `;
  });
  container.innerHTML = html;

  const currentSpec = dish.specs[state.selectedSpecIndex] ?? dish.specs[0];
  const priceInput = document.getElementById("modal-custom-price") as HTMLInputElement | null;
  if (priceInput) {
    priceInput.value = String(currentSpec ? currentSpec.price : 10);
  }
}

export function openSpecModal(dishId: string): void {
  const dish = state.menu.find((d) => d.id === dishId);
  if (!dish) return;

  const currentPerson = state.people.find((p) => p.id === state.selectedPersonId);
  const personName = currentPerson ? currentPerson.name : "未选订餐人";

  state.currentModalDish = dish;
  state.selectedSpecIndex = 0;

  const nameEl = document.getElementById("modal-dish-name");
  const targetEl = document.getElementById("modal-target-person");
  const remarkInput = document.getElementById("modal-dish-remark") as HTMLInputElement | null;

  if (nameEl) nameEl.textContent = dish.name;
  if (targetEl) targetEl.textContent = `订餐人：${personName}`;
  if (remarkInput) remarkInput.value = "";

  renderModalSpecs();
  document.getElementById("spec-modal")?.classList.add("show");
}

export function closeSpecModal(): void {
  document.getElementById("spec-modal")?.classList.remove("show");
  state.currentModalDish = null;
}

export function onSelectSpecIndex(idx: number): void {
  state.selectedSpecIndex = idx;
  renderModalSpecs();
}

export function confirmAddDishToOrder(): void {
  const dish = state.currentModalDish;
  if (!dish) return;

  const currentPerson = state.people.find((p) => p.id === state.selectedPersonId);
  if (!currentPerson) {
    showTakeoutToast("请先选择订餐人");
    return;
  }

  const spec = dish.specs[state.selectedSpecIndex] ?? { name: "标配", price: 10 };
  const priceInput = document.getElementById("modal-custom-price") as HTMLInputElement | null;
  const remarkInput = document.getElementById("modal-dish-remark") as HTMLInputElement | null;
  const finalPrice = Number.parseFloat(priceInput?.value || "") || spec.price;
  const remark = remarkInput?.value.trim() || "";

  state.orders.push({
    id: `ord-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    date: state.selectedDate,
    weekday: getWeekdayString(state.selectedDate),
    personId: currentPerson.id,
    personName: currentPerson.name,
    dishId: dish.id,
    dishName: dish.name,
    specName: spec.name,
    price: finalPrice,
    remark,
    isSettled: false,
    createTime: new Date().toISOString(),
  });

  saveData();
  closeSpecModal();
  renderTodayOrders();
  showTakeoutToast(`已为【${currentPerson.name}】添加：${dish.name}`);
}

export function openAddPersonModal(): void {
  const input = document.getElementById("person-name-input") as HTMLInputElement | null;
  if (input) input.value = "";
  document.getElementById("person-modal")?.classList.add("show");
}

export function closePersonModal(): void {
  document.getElementById("person-modal")?.classList.remove("show");
}

export function savePerson(): void {
  const input = document.getElementById("person-name-input") as HTMLInputElement | null;
  const name = input?.value.trim() || "";
  if (!name) {
    showTakeoutToast("请输入人员姓名");
    return;
  }
  if (state.people.some((p) => p.name === name)) {
    showTakeoutToast("该人员姓名已存在");
    return;
  }

  const newPerson = { id: `p-${Date.now()}`, name };
  state.people.push(newPerson);
  state.selectedPersonId = newPerson.id;
  saveData();
  closePersonModal();
  renderPersonPills();
  renderSettingsPeople();
  showTakeoutToast(`已添加人员：${name}`);
}

export function deletePerson(id: string): void {
  const person = state.people.find((item) => item.id === id);
  if (!person) return;

  showConfirmModal(
    "确认删除订餐人",
    `确定删除订餐人【${person.name}】吗？删除后其历史已记账单将继续保留。`,
    "确认删除",
    () => {
      state.people = state.people.filter((item) => item.id !== id);
      if (state.selectedPersonId === id) {
        state.selectedPersonId = state.people[0]?.id ?? "";
      }
      saveData();
      renderPersonPills();
      renderSettingsPeople();
      showTakeoutToast(`已删除人员：${person.name}`);
    },
    true,
  );
}

export function openAddDishModal(): void {
  const nameInput = document.getElementById("new-dish-name") as HTMLInputElement | null;
  const specsInput = document.getElementById("new-dish-specs") as HTMLInputElement | null;
  if (nameInput) nameInput.value = "";
  if (specsInput) specsInput.value = "";
  document.getElementById("dish-modal")?.classList.add("show");
}

export function closeDishModal(): void {
  document.getElementById("dish-modal")?.classList.remove("show");
}

export function saveCustomDish(): void {
  const nameInput = document.getElementById("new-dish-name") as HTMLInputElement | null;
  const catSelect = document.getElementById("new-dish-category") as HTMLSelectElement | null;
  const specsInput = document.getElementById("new-dish-specs") as HTMLInputElement | null;

  const name = nameInput?.value.trim() || "";
  const category = catSelect?.value || "特色小吃";
  const rawSpecs = specsInput?.value.trim() || "";

  if (!name) {
    showTakeoutToast("请输入菜品名称");
    return;
  }

  let specs: DishSpec[] = [];
  if (rawSpecs.includes(":") || rawSpecs.includes("：")) {
    const parts = rawSpecs.split(/[,，]/);
    for (const part of parts) {
      const [sName, sPrice] = part.split(/[:：]/);
      if (sName && sPrice) {
        specs.push({ name: sName.trim(), price: Number.parseFloat(sPrice.trim()) || 0 });
      }
    }
  } else {
    const fixedP = Number.parseFloat(rawSpecs) || 10;
    specs.push({ name: "标配", price: fixedP });
  }

  if (specs.length === 0) {
    specs = [{ name: "标配", price: 10 }];
  }

  const newDish: DishItem = {
    id: `custom-${Date.now()}`,
    name,
    category,
    specs,
  };

  state.menu.unshift(newDish);
  saveData();
  closeDishModal();
  renderMenu();
  showTakeoutToast(`已成功添加新菜品：${name}`);
}

export function clearDateConfirm(): void {
  const count = state.orders.filter((o) => o.date === state.selectedDate).length;
  if (count === 0) {
    showTakeoutToast("当前日期无记录");
    return;
  }
  showConfirmModal(
    "清空当日账单",
    `确定要清空【${state.selectedDate}】的所有点餐记录（共 ${count} 份）吗？`,
    "确认清空",
    () => {
      state.orders = state.orders.filter((o) => o.date !== state.selectedDate);
      saveData();
      renderTodayOrders();
      renderPersonPills();
      showTakeoutToast("已清空当日记录");
      void syncToCloud(true);
    },
    true,
  );
}

export function settleAllForPerson(personName: string): void {
  showConfirmModal(
    "结清账单",
    `确定要将【${personName}】名下的所有未付外卖全部结清吗？`,
    "确认全部结清",
    () => {
      for (const o of state.orders) {
        if (o.personName === personName) {
          o.isSettled = true;
        }
      }
      saveData();
      renderTodayOrders();
      renderHistory();
      showTakeoutToast(`已结清 ${personName} 的全部账单！`);
      void syncToCloud(true);
    },
    false,
  );
}

export function quickCopyBackup(): void {
  const backup: TakeoutBackupData = {
    version: "2.0",
    exportDate: new Date().toISOString(),
    menu: state.menu,
    people: state.people,
    orders: state.orders,
  };
  const jsonStr = JSON.stringify(backup);
  const ta = document.getElementById("quick-backup-text") as HTMLTextAreaElement | null;
  if (ta) ta.value = jsonStr;
  document.getElementById("quick-backup-modal")?.classList.add("show");

  void copyToClipboard(jsonStr).then((ok) => {
    showTakeoutToast(ok ? "已复制备份代码到剪贴板！" : "已生成备份代码，可长按文本框复制");
  });
}

export function closeQuickBackupModal(): void {
  document.getElementById("quick-backup-modal")?.classList.remove("show");
}

export function copyAgainFromTextarea(): void {
  const ta = document.getElementById("quick-backup-text") as HTMLTextAreaElement | null;
  if (ta) {
    void copyWithFeedback(ta.value, "已重新复制到剪贴板！");
  }
}

export function openQuickPasteModal(): void {
  const ta = document.getElementById("quick-paste-text") as HTMLTextAreaElement | null;
  if (ta) ta.value = "";
  document.getElementById("quick-paste-modal")?.classList.add("show");
}

export function closeQuickPasteModal(): void {
  document.getElementById("quick-paste-modal")?.classList.remove("show");
}

export async function pasteFromClipboard(): Promise<void> {
  const ta = document.getElementById("quick-paste-text") as HTMLTextAreaElement | null;
  try {
    if (navigator.clipboard?.readText && ta) {
      const text = await navigator.clipboard.readText();
      ta.value = text;
      showTakeoutToast("已自动从剪贴板读取！");
    } else {
      showTakeoutToast("请直接在输入框中长按粘贴");
    }
  } catch {
    showTakeoutToast("请手动在输入框中长按粘贴");
  }
}

export function applyQuickPaste(mode: "merge" | "overwrite"): void {
  const ta = document.getElementById("quick-paste-text") as HTMLTextAreaElement | null;
  const raw = ta?.value.trim() || "";
  if (!raw) {
    showTakeoutToast("请先输入或粘贴备份代码");
    return;
  }

  let data: Partial<TakeoutBackupData> | null = null;
  let isFromCSV = false;

  try {
    data = JSON.parse(raw) as Partial<TakeoutBackupData>;
  } catch {
    const csvParsed = parseCSVText(raw);
    if (csvParsed) {
      data = csvParsed;
      isFromCSV = true;
    }
  }

  if (!data?.people || !data?.orders) {
    showTakeoutToast("无法识别数据，请确认是 JSON 备份代码或 CSV 文本");
    return;
  }

  if (mode === "overwrite") {
    state.people = data.people;
    state.orders = data.orders;
    if (data.menu) state.menu = data.menu;
  } else {
    const existPersonNames = new Set(state.people.map((p) => p.name));
    for (const p of data.people) {
      if (!existPersonNames.has(p.name)) {
        state.people.push(p);
        existPersonNames.add(p.name);
      }
    }

    const existOrderIds = new Set(state.orders.map((o) => o.id));
    for (const o of data.orders) {
      if (!existOrderIds.has(o.id)) {
        state.orders.push(o);
        existOrderIds.add(o.id);
      }
    }
  }

  saveData();
  loadData();
  renderAllViews();
  closeQuickPasteModal();
  showTakeoutToast(
    isFromCSV
      ? `成功从粘贴的 CSV 导入 ${data.orders.length} 条记录！`
      : mode === "overwrite"
        ? "已全量覆盖还原！"
        : "已成功合并导入数据！",
  );
  void syncToCloud(true);
}

export function exportBackupJSON(): void {
  const backup: TakeoutBackupData = {
    version: "2.0",
    exportDate: new Date().toISOString(),
    menu: state.menu,
    people: state.people,
    orders: state.orders,
  };

  const dataStr = `data:text/json;charset=utf-8,${encodeURIComponent(JSON.stringify(backup, null, 2))}`;
  const dlAnchor = document.createElement("a");
  dlAnchor.setAttribute("href", dataStr);
  dlAnchor.setAttribute("download", `沙县外卖完整备份_${state.selectedDate}.json`);
  dlAnchor.click();
  showTakeoutToast("已导出备份 JSON 文件");
}

export function importBackupJSON(event: Event): void {
  const input = event.target as HTMLInputElement | null;
  const file = input?.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const text = typeof e.target?.result === "string" ? e.target.result : "";
      const data = JSON.parse(text) as Partial<TakeoutBackupData>;
      if (data.people && data.orders) {
        state.people = data.people;
        state.orders = data.orders;
        if (data.menu) state.menu = data.menu;
        saveData();
        loadData();
        renderAllViews();
        showTakeoutToast("备份数据还原成功！");
        void syncToCloud(true);
      } else {
        showTakeoutToast("无效的备份文件结构");
      }
    } catch {
      showTakeoutToast("解析备份文件出错");
    }
  };
  reader.readAsText(file);
}

export function exportToCSV(): void {
  if (state.orders.length === 0) {
    showTakeoutToast("暂无点餐记录可导出");
    return;
  }

  const csvContent = buildCSVExportContent(state.orders);
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `沙县外卖记账流水_${state.selectedDate}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
  showTakeoutToast("已导出 Excel CSV 格式文件");
}

export function importFromCSVFile(event: Event): void {
  const input = event.target as HTMLInputElement | null;
  const file = input?.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const text = typeof e.target?.result === "string" ? e.target.result : "";
      const data = parseCSVText(text);
      if (!data || data.orders.length === 0) {
        showTakeoutToast("未能识别出有效的 CSV 账单流水");
        return;
      }

      showConfirmModal(
        "导入 CSV 账单",
        `从 CSV 文件中成功识别出 ${data.orders.length} 条账单记录、${data.people.length} 位订餐人。确定导入吗？`,
        "确认导入并合并",
        () => {
          const existNames = new Set(state.people.map((p) => p.name));
          for (const p of data.people) {
            if (!existNames.has(p.name)) {
              state.people.push(p);
              existNames.add(p.name);
            }
          }

          const nameToId = new Map<string, string>();
          for (const p of state.people) {
            nameToId.set(p.name, p.id);
          }

          for (const o of data.orders) {
            const existingId = nameToId.get(o.personName);
            if (existingId) o.personId = existingId;
            state.orders.push(o);
          }

          saveData();
          loadData();
          renderAllViews();
          showTakeoutToast(`成功从 CSV 导入 ${data.orders.length} 条账单记录！`);
          void syncToCloud(true);
        },
        false,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      showTakeoutToast(`读取 CSV 文件出错: ${msg}`);
    }
  };
  reader.readAsText(file, "utf-8");
}

export function resetToInitialData(): void {
  showConfirmModal(
    "重置所有数据",
    "确定要恢复为初始默认状态吗？注意：这会清空你录入的所有历史点单记录！",
    "确认重置",
    () => {
      state.menu = [...DEFAULT_MENU];
      state.people = [...DEFAULT_PEOPLE];
      state.orders = [];
      saveData();
      loadData();
      renderAllViews();
      showTakeoutToast("已恢复为初始数据");
      void syncToCloud(true);
    },
    true,
  );
}
