import "@/core/fonts";
import { postJson } from "@/core/api";
import { initAppShell } from "@/core/shell";
import { fetchFromCloud, registerSyncToast, saveData, syncToCloud } from "./cloud-sync";
import { getTodayDateString } from "./menu-data";
import {
  applyQuickPaste,
  clearDateConfirm,
  closeChangePasswordModal,
  closeConfirmModal,
  closeDishModal,
  closePersonModal,
  closeQuickBackupModal,
  closeQuickPasteModal,
  closeSpecModal,
  confirmAddDishToOrder,
  copyAgainFromTextarea,
  copyWithFeedback,
  deletePerson,
  executeConfirmAction,
  exportBackupJSON,
  exportToCSV,
  importBackupJSON,
  importFromCSVFile,
  logoutAuth,
  onSelectSpecIndex,
  openAddDishModal,
  openAddPersonModal,
  openChangePasswordModal,
  openQuickPasteModal,
  openSpecModal,
  pasteFromClipboard,
  quickCopyBackup,
  resetToInitialData,
  saveCustomDish,
  saveNewPassword,
  savePerson,
  settleAllForPerson,
  showTakeoutToast,
} from "./modals";
import {
  renderAllViews,
  renderCategoryFilter,
  renderHistory,
  renderMenu,
  renderPersonPills,
  renderTodayOrders,
  switchHistoryMode,
  switchMainTab,
  updateWeekdayBadge,
} from "./render";
import {
  buildDateSummaryText,
  buildPersonHistoryText,
  buildPersonUnpaidBillText,
  buildTodaySummaryText,
  buildTotalUnpaidBillText,
} from "./settlement";
import { getCustomPassword, grantAuthToken, isAuthenticated, loadData, state } from "./store";

function setTodayDate(): void {
  const todayStr = getTodayDateString();
  state.selectedDate = todayStr;
  const picker = document.getElementById("order-date-picker") as HTMLInputElement | null;
  if (picker) picker.value = todayStr;
  updateWeekdayBadge();
  renderTodayOrders();
}

function onDateChanged(): void {
  const picker = document.getElementById("order-date-picker") as HTMLInputElement | null;
  if (picker?.value) {
    state.selectedDate = picker.value;
    updateWeekdayBadge();
    renderTodayOrders();
  }
}

function copyTodaySummary(): void {
  const todayOrders = state.orders.filter((o) => o.date === state.selectedDate);
  if (todayOrders.length === 0) {
    showTakeoutToast("当前日期无记录可汇总");
    return;
  }
  const summary = buildTodaySummaryText(state.orders, state.selectedDate);
  void copyWithFeedback(summary, "已复制点餐汇总到剪贴板！");
}

function copyTotalUnpaidBill(): void {
  const { summary, totalAllUnpaid, count } = buildTotalUnpaidBillText(
    state.orders,
    getTodayDateString(),
  );
  if (count === 0) {
    showTakeoutToast("太棒了！当前没有任何未结账单 🎉");
    return;
  }
  void copyWithFeedback(summary, `已复制总待付账单 (共 ¥${totalAllUnpaid.toFixed(2)})！`);
}

function copyPersonUnpaidBill(personName: string): void {
  const { text, totalUnpaid, count } = buildPersonUnpaidBillText(
    state.orders,
    personName,
    getTodayDateString(),
  );
  if (count === 0) {
    showTakeoutToast(`【${personName}】当前无未结账单，已全部结清！🎉`);
    return;
  }
  void copyWithFeedback(text, `已复制【${personName}】的催收账单 (¥${totalUnpaid.toFixed(2)})！`);
}

function copyPersonHistory(personName: string): void {
  const allItems = state.orders.filter((o) => o.personName === personName);
  if (allItems.length === 0) {
    showTakeoutToast(`【${personName}】暂无历史记录`);
    return;
  }
  const text = buildPersonHistoryText(state.orders, personName);
  void copyWithFeedback(text, `已复制【${personName}】的历史记录！`);
}

function copyDateSummary(dateStr: string): void {
  const dayOrders = state.orders.filter((o) => o.date === dateStr);
  if (dayOrders.length === 0) {
    showTakeoutToast(`${dateStr} 无记录可汇总`);
    return;
  }
  const summary = buildDateSummaryText(state.orders, dateStr);
  void copyWithFeedback(summary, `已复制 ${dateStr} 账单明细！`);
}

function toggleOrderStatus(orderId: string): void {
  const ord = state.orders.find((o) => o.id === orderId);
  if (ord) {
    ord.isSettled = !ord.isSettled;
    saveData();
    renderHistory();
    renderTodayOrders();
    showTakeoutToast(ord.isSettled ? "已标记为结清" : "已重置为未结");
  }
}

function bindEvents(): void {
  document.getElementById("cloud-sync-badge")?.addEventListener("click", () => {
    void syncToCloud(true);
  });
  document.getElementById("btnHeaderCopySummary")?.addEventListener("click", copyTodaySummary);
  document.getElementById("btnBottomCopySummary")?.addEventListener("click", copyTodaySummary);
  document.getElementById("btnClearDate")?.addEventListener("click", clearDateConfirm);

  document.getElementById("order-date-picker")?.addEventListener("change", onDateChanged);
  document.getElementById("btnTodayDate")?.addEventListener("click", setTodayDate);

  document.getElementById("btnOpenAddPersonTop")?.addEventListener("click", openAddPersonModal);
  document.getElementById("btnManagePeopleTab")?.addEventListener("click", () => {
    switchMainTab("settings");
  });
  document
    .getElementById("btnOpenAddPersonSettings")
    ?.addEventListener("click", openAddPersonModal);
  document.getElementById("btnOpenAddDish")?.addEventListener("click", openAddDishModal);

  const searchInput = document.getElementById("dish-search-input") as HTMLInputElement | null;
  searchInput?.addEventListener("input", () => {
    state.searchQuery = searchInput.value.trim().toLowerCase();
    renderMenu();
  });

  // Delegated list interactions
  document.getElementById("person-pill-container")?.addEventListener("click", (e) => {
    const pill = (e.target as HTMLElement | null)?.closest<HTMLElement>("[data-person-id]");
    const id = pill?.dataset.personId;
    if (!id) return;
    state.selectedPersonId = id;
    renderPersonPills();
    const p = state.people.find((item) => item.id === id);
    if (p) showTakeoutToast(`当前订餐人：${p.name}`);
  });

  document.getElementById("category-filter-container")?.addEventListener("click", (e) => {
    const chip = (e.target as HTMLElement | null)?.closest<HTMLElement>("[data-category]");
    const cat = chip?.dataset.category;
    if (!cat) return;
    state.activeCategory = cat;
    renderCategoryFilter();
    renderMenu();
  });

  document.getElementById("dish-grid-container")?.addEventListener("click", (e) => {
    const card = (e.target as HTMLElement | null)?.closest<HTMLElement>("[data-dish-id]");
    const dishId = card?.dataset.dishId;
    if (dishId) openSpecModal(dishId);
  });

  document.getElementById("today-items-container")?.addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement | null)?.closest<HTMLElement>("[data-delete-order-id]");
    const orderId = btn?.dataset.deleteOrderId;
    if (!orderId) return;
    state.orders = state.orders.filter((o) => o.id !== orderId);
    saveData();
    renderTodayOrders();
    renderPersonPills();
    showTakeoutToast("已移除该记录");
  });

  document.getElementById("settings-people-list")?.addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement | null)?.closest<HTMLElement>("[data-delete-person-id]");
    const id = btn?.dataset.deletePersonId;
    if (id) deletePerson(id);
  });

  // History tab
  document.getElementById("btnCopyTotalUnpaid")?.addEventListener("click", copyTotalUnpaidBill);
  document.getElementById("btn-hist-person")?.addEventListener("click", () => {
    switchHistoryMode("person");
  });
  document.getElementById("btn-hist-date")?.addEventListener("click", () => {
    switchHistoryMode("date");
  });
  document.getElementById("only-unpaid-check")?.addEventListener("change", renderHistory);
  document.getElementById("btnExportCsv")?.addEventListener("click", exportToCSV);

  document.getElementById("history-list-container")?.addEventListener("click", (e) => {
    const target = e.target as HTMLElement | null;
    if (!target) return;

    const statusBadge = target.closest<HTMLElement>("[data-toggle-order-id]");
    const orderId = statusBadge?.dataset.toggleOrderId;
    if (orderId) {
      toggleOrderStatus(orderId);
      return;
    }

    const actionEl = target.closest<HTMLElement>("[data-action]");
    const action = actionEl?.dataset.action;
    if (!action || !actionEl) return;

    if (action === "copy-person-debt") {
      const personName = decodeURIComponent(actionEl.dataset.personName ?? "");
      if (personName) copyPersonUnpaidBill(personName);
    } else if (action === "settle-all") {
      const personName = decodeURIComponent(actionEl.dataset.personName ?? "");
      if (personName) settleAllForPerson(personName);
    } else if (action === "copy-person-history") {
      const personName = decodeURIComponent(actionEl.dataset.personName ?? "");
      if (personName) copyPersonHistory(personName);
    } else if (action === "copy-date-summary") {
      const dateStr = actionEl.dataset.date ?? "";
      if (dateStr) copyDateSummary(dateStr);
    }
  });

  // Settings tab
  document.getElementById("btnQuickCopyBackup")?.addEventListener("click", quickCopyBackup);
  document.getElementById("btnOpenQuickPaste")?.addEventListener("click", openQuickPasteModal);
  document.getElementById("btnSyncCloudManual")?.addEventListener("click", () => {
    void syncToCloud(true);
  });
  document.getElementById("btnExportBackupJson")?.addEventListener("click", exportBackupJSON);
  document.getElementById("import-json-file")?.addEventListener("change", importBackupJSON);
  document.getElementById("import-csv-file")?.addEventListener("change", importFromCSVFile);
  document.getElementById("btnOpenChangePwd")?.addEventListener("click", openChangePasswordModal);
  document.getElementById("btnLogoutAuth")?.addEventListener("click", logoutAuth);
  document.getElementById("cardReturnHome")?.addEventListener("click", () => {
    window.location.href = "./index.html";
  });
  document.getElementById("btnResetInitial")?.addEventListener("click", resetToInitialData);

  // Bottom tab bar
  document.getElementById("tabBtnOrder")?.addEventListener("click", () => {
    switchMainTab("order");
  });
  document.getElementById("tabBtnHistory")?.addEventListener("click", () => {
    switchMainTab("history");
  });
  document.getElementById("tabBtnSettings")?.addEventListener("click", () => {
    switchMainTab("settings");
  });

  // Modals
  document.getElementById("modal-specs-container")?.addEventListener("click", (e) => {
    const opt = (e.target as HTMLElement | null)?.closest<HTMLElement>("[data-spec-idx]");
    if (!opt) return;
    const idx = Number.parseInt(opt.dataset.specIdx ?? "", 10);
    if (!Number.isNaN(idx)) onSelectSpecIndex(idx);
  });
  document.getElementById("btnCloseSpecModal")?.addEventListener("click", closeSpecModal);
  document.getElementById("btnConfirmAddDish")?.addEventListener("click", confirmAddDishToOrder);

  document.getElementById("btnClosePersonModal")?.addEventListener("click", closePersonModal);
  document.getElementById("btnSavePerson")?.addEventListener("click", savePerson);

  document.getElementById("btnCloseDishModal")?.addEventListener("click", closeDishModal);
  document.getElementById("btnSaveCustomDish")?.addEventListener("click", saveCustomDish);

  document.getElementById("btnCloseConfirmModal")?.addEventListener("click", closeConfirmModal);
  document.getElementById("btnCancelConfirmModal")?.addEventListener("click", closeConfirmModal);
  document
    .getElementById("confirm-modal-action-btn")
    ?.addEventListener("click", executeConfirmAction);

  document
    .getElementById("btnCloseQuickBackupModal")
    ?.addEventListener("click", closeQuickBackupModal);
  document.getElementById("btnCopyAgainBackup")?.addEventListener("click", copyAgainFromTextarea);

  document
    .getElementById("btnCloseQuickPasteModal")
    ?.addEventListener("click", closeQuickPasteModal);
  document.getElementById("btnPasteClipboard")?.addEventListener("click", () => {
    void pasteFromClipboard();
  });
  document.getElementById("btnApplyPasteMerge")?.addEventListener("click", () => {
    applyQuickPaste("merge");
  });
  document.getElementById("btnApplyPasteOverwrite")?.addEventListener("click", () => {
    applyQuickPaste("overwrite");
  });

  document
    .getElementById("btnCloseChangePwdModal")
    ?.addEventListener("click", closeChangePasswordModal);
  document.getElementById("btnSaveNewPwd")?.addEventListener("click", () => {
    void saveNewPassword();
  });
}

function bootAuthenticatedApp(): void {
  loadData();
  bindEvents();
  setTodayDate();
  renderAllViews();

  void fetchFromCloud(() => {
    renderAllViews();
  });
}

function openInPageAuthGate(): void {
  const backdrop = document.getElementById("takeoutAuthBackdrop");
  const input = document.getElementById("takeoutAuthInput") as HTMLInputElement | null;
  const errEl = document.getElementById("takeoutAuthError");
  const submitBtn = document.getElementById("takeoutAuthSubmit") as HTMLButtonElement | null;
  if (!backdrop) return;

  backdrop.classList.add("show");
  setTimeout(() => input?.focus(), 80);

  const attemptUnlock = async () => {
    const pwd = input?.value.trim() || "";
    if (!pwd) {
      if (errEl) {
        errEl.style.color = "var(--c-danger)";
        errEl.textContent = "请输入访问密码";
      }
      input?.focus();
      return;
    }

    const customPwd = getCustomPassword();
    if (customPwd) {
      if (pwd === customPwd) {
        grantAuthToken();
        backdrop.classList.remove("show");
        bootAuthenticatedApp();
      } else {
        if (errEl) {
          errEl.style.color = "var(--c-danger)";
          errEl.textContent = "密码错误，请重新输入";
        }
        input?.select();
      }
      return;
    }

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = "验证中...";
    }
    try {
      const resp = await postJson<{ ok?: boolean }>("/api/auth", { password: pwd });
      if (resp.ok) {
        grantAuthToken();
        backdrop.classList.remove("show");
        bootAuthenticatedApp();
      } else {
        if (errEl) {
          errEl.style.color = "var(--c-danger)";
          errEl.textContent = "密码错误，请重新输入";
        }
        input?.select();
      }
    } catch (err) {
      if (errEl) {
        errEl.style.color = "var(--c-danger)";
        errEl.textContent = err instanceof Error ? err.message : "密码错误或网络异常";
      }
      input?.select();
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = "解锁进入";
      }
    }
  };

  submitBtn?.addEventListener("click", () => {
    void attemptUnlock();
  });
  input?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void attemptUnlock();
    }
  });
}

function init(): void {
  initAppShell({ activePage: "takeout" });
  registerSyncToast(showTakeoutToast);
  if (!isAuthenticated()) {
    openInPageAuthGate();
    return;
  }
  bootAuthenticatedApp();
}

document.addEventListener("DOMContentLoaded", init);
