import { escapeHtml } from "@/core/dom";
import { CATEGORIES, getTodayDateString, getWeekdayString } from "./menu-data";
import {
  calculateOverallStats,
  calculatePersonStats,
  groupOrdersByDate,
  toNumericPrice,
} from "./settlement";
import { state } from "./store";
import type { HistoryMode, MainTab } from "./types";

export function updateWeekdayBadge(): void {
  const badge = document.getElementById("order-weekday-text");
  const titleDate = document.getElementById("order-list-title-date");
  const weekday = getWeekdayString(state.selectedDate);
  const todayStr = getTodayDateString();

  if (state.selectedDate === todayStr) {
    if (badge) badge.textContent = `${weekday} (今天)`;
    if (titleDate) titleDate.textContent = "今日";
  } else {
    if (badge) badge.textContent = weekday;
    if (titleDate) titleDate.textContent = `${state.selectedDate.slice(5)} `;
  }
}

export function renderPersonPills(): void {
  const container = document.getElementById("person-pill-container");
  if (!container) return;

  if (!state.selectedPersonId && state.people.length > 0) {
    state.selectedPersonId = state.people[0]?.id ?? "";
  }

  if (state.people.length === 0) {
    container.innerHTML =
      '<div style="font-size:12px; color:var(--text-sub); padding:6px 0;">暂无订餐人员，请在右上角添加</div>';
    return;
  }

  let html = "";
  for (const p of state.people) {
    const isSel = p.id === state.selectedPersonId;
    html += `
      <div class="person-pill ${isSel ? "active" : ""}" data-person-id="${escapeHtml(p.id)}">
        <span>👤 ${escapeHtml(p.name)}</span>
      </div>
    `;
  }
  container.innerHTML = html;
}

export function renderSettingsPeople(): void {
  const container = document.getElementById("settings-people-list");
  if (!container) return;

  if (state.people.length === 0) {
    container.innerHTML = '<div class="empty-state">暂无订餐人员</div>';
    return;
  }

  let html = "";
  for (const p of state.people) {
    html += `
      <div class="setting-item">
        <div style="font-weight:600; font-size:14px;">👤 ${escapeHtml(p.name)}</div>
        <div style="display:flex; gap:6px;">
          <button class="icon-btn" style="color:var(--danger); border-color:#fecaca;" data-delete-person-id="${escapeHtml(p.id)}">删除</button>
        </div>
      </div>
    `;
  }
  container.innerHTML = html;
}

export function renderCategoryFilter(): void {
  const container = document.getElementById("category-filter-container");
  if (!container) return;

  let html = "";
  for (const cat of CATEGORIES) {
    const isAct = cat === state.activeCategory;
    html += `
      <div class="filter-chip menu-filter-pill ${isAct ? "active" : ""}" data-category="${escapeHtml(cat)}">
        ${escapeHtml(cat)}
      </div>
    `;
  }
  container.innerHTML = html;
}

export function renderMenu(): void {
  const container = document.getElementById("dish-grid-container");
  if (!container) return;

  let list = state.menu;
  if (state.activeCategory !== "全部") {
    list = list.filter((d) => d.category === state.activeCategory);
  }
  if (state.searchQuery) {
    list = list.filter(
      (d) =>
        d.name.toLowerCase().includes(state.searchQuery) ||
        d.category.toLowerCase().includes(state.searchQuery),
    );
  }

  if (list.length === 0) {
    container.innerHTML =
      '<div class="empty-state" style="grid-column: 1 / -1;">未找到相关菜品</div>';
    return;
  }

  let html = "";
  for (const dish of list) {
    let priceText = "";
    if (dish.specs.length === 1) {
      priceText = `¥${dish.specs[0]?.price ?? 0}`;
    } else {
      const prices = dish.specs.map((s) => s.price);
      const minP = Math.min(...prices);
      const maxP = Math.max(...prices);
      priceText = minP === maxP ? `¥${minP}` : `¥${minP} - ¥${maxP}`;
    }

    const specsPreview = dish.specs.map((s) => s.name).join(" / ");
    html += `
      <div class="dish-card" data-dish-id="${escapeHtml(dish.id)}">
        <div class="dish-top-row">
          <div>
            <span class="dish-name">${escapeHtml(dish.name)}</span>
            <span class="dish-category-tag">${escapeHtml(dish.category)}</span>
          </div>
          <div class="dish-specs-preview">${escapeHtml(specsPreview)}</div>
        </div>
        <div class="dish-bottom-row">
          <div class="dish-price">${escapeHtml(priceText)}</div>
          <button class="dish-add-btn" type="button">+</button>
        </div>
      </div>
    `;
  }
  container.innerHTML = html;
}

export function renderTodayOrders(): void {
  const container = document.getElementById("today-items-container");
  if (!container) return;

  const todayOrders = state.orders.filter((o) => o.date === state.selectedDate);
  const totalPrice = todayOrders.reduce((sum, o) => sum + toNumericPrice(o.price), 0);

  const totalEl = document.getElementById("today-total-price");
  const countEl = document.getElementById("today-item-count");
  if (totalEl) totalEl.textContent = `¥${totalPrice.toFixed(2)}`;
  if (countEl) countEl.textContent = String(todayOrders.length);

  if (todayOrders.length === 0) {
    container.innerHTML = `
      <div class="empty-state" style="padding: 20px;">
        <div style="font-size:24px; margin-bottom:4px;">🥢</div>
        <div>${escapeHtml(state.selectedDate)} (${escapeHtml(getWeekdayString(state.selectedDate))}) 暂无点餐记录</div>
        <div style="font-size:11px; margin-top:4px;">请在上方选人后点击菜品加入</div>
      </div>
    `;
    return;
  }

  let html = "";
  for (const o of todayOrders) {
    const specRemarkText = [o.specName, o.remark].filter(Boolean).join(" · ");
    html += `
      <div class="order-item-row">
        <div class="order-item-main">
          <span class="order-person-tag">${escapeHtml(o.personName)}</span>
          <div>
            <div class="order-dish-title">${escapeHtml(o.dishName)}</div>
            ${specRemarkText ? `<div class="order-dish-remark">${escapeHtml(specRemarkText)}</div>` : ""}
          </div>
        </div>
        <div class="order-item-right">
          <span class="order-item-price">¥${toNumericPrice(o.price).toFixed(2)}</span>
          <button class="delete-item-btn" title="删除此项" data-delete-order-id="${escapeHtml(o.id)}" type="button">✕</button>
        </div>
      </div>
    `;
  }
  container.innerHTML = html;
}

export function renderHistory(): void {
  const container = document.getElementById("history-list-container");
  if (!container) return;

  const onlyUnpaidCheck = document.getElementById("only-unpaid-check") as HTMLInputElement | null;
  const onlyUnpaid = onlyUnpaidCheck ? onlyUnpaidCheck.checked : false;

  const stats = calculateOverallStats(state.orders);
  const unpaidValEl = document.getElementById("stat-total-unpaid");
  const allValEl = document.getElementById("stat-total-all");
  const unpaidCountEl = document.getElementById("stat-unpaid-count");

  if (unpaidValEl) unpaidValEl.textContent = `¥${stats.totalUnpaid.toFixed(2)}`;
  if (allValEl) allValEl.textContent = `¥${stats.totalAll.toFixed(2)}`;
  if (unpaidCountEl) unpaidCountEl.textContent = `${stats.unpaidCount} 笔`;

  const displayOrders = onlyUnpaid ? state.orders.filter((o) => !o.isSettled) : state.orders;

  if (displayOrders.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🎉</div>
        <div>没有找到符合条件的记录</div>
      </div>
    `;
    return;
  }

  if (state.historyMode === "person") {
    const groups = calculatePersonStats(displayOrders);
    let html = "";
    for (const p of groups) {
      const hasUnpaid = p.unpaidTotal > 0;
      const encodedName = encodeURIComponent(p.name);
      html += `
        <div class="person-debt-card">
          <div class="person-debt-header">
            <div class="person-debt-name">
              <span>👤</span> ${escapeHtml(p.name)}
            </div>
            <div class="person-debt-amount ${hasUnpaid ? "unpaid" : "paid"}">
              ${hasUnpaid ? `待结: ¥${p.unpaidTotal.toFixed(2)}` : "已全部结清"}
            </div>
          </div>

          <div style="font-size:12px; color:var(--text-muted); margin-bottom:8px;">
            共 ${p.items.length} 笔订单 · 累计消费 ¥${p.total.toFixed(2)}
          </div>

          <div style="max-height: 240px; overflow-y:auto; font-size:12px;">
            ${p.items
              .map(
                (item) => `
              <div class="record-row">
                <div>
                  <span style="color:var(--text-muted); font-size:11px;">${escapeHtml(item.date)} (${escapeHtml(item.weekday || getWeekdayString(item.date))})</span>
                  <div style="font-weight:600;">${escapeHtml(item.dishName)} ${item.specName ? `[${escapeHtml(item.specName)}]` : ""}</div>
                </div>
                <div style="display:flex; align-items:center; gap:8px;">
                  <span style="font-weight:700;">¥${toNumericPrice(item.price).toFixed(2)}</span>
                  <span class="status-badge ${item.isSettled ? "paid" : "unpaid"}" data-toggle-order-id="${escapeHtml(item.id)}">
                    ${item.isSettled ? "已结" : "未结"}
                  </span>
                </div>
              </div>
            `,
              )
              .join("")}
          </div>

          <div class="person-debt-actions">
            ${
              hasUnpaid
                ? `
              <button class="debt-action-btn btn-copy-person-debt" data-action="copy-person-debt" data-person-name="${encodedName}" type="button">
                <span>📋</span> 复制催收账单
              </button>
              <button class="debt-action-btn btn-settle-all" data-action="settle-all" data-person-name="${encodedName}" type="button">
                ✓ 结清全部 (¥${p.unpaidTotal.toFixed(2)})
              </button>
            `
                : `
              <span style="font-size:11px; color:var(--text-sub);">全部账单已结清</span>
              <button class="debt-action-btn btn-copy-person-history" data-action="copy-person-history" data-person-name="${encodedName}" type="button">
                <span>📋</span> 复制已结记录
              </button>
            `
            }
          </div>
        </div>
      `;
    }
    container.innerHTML = html;
  } else {
    const groups = groupOrdersByDate(displayOrders);
    let html = "";
    for (const d of groups) {
      html += `
        <div class="date-group-card">
          <div class="date-group-header">
            <div class="date-group-title">
              <span>📅 ${escapeHtml(d.date)}</span>
              <span class="date-group-weekday">${escapeHtml(d.weekday)}</span>
            </div>
            <div style="display:flex; align-items:center; gap:8px;">
              <span style="font-weight:800; color:var(--primary); font-size:14px;">
                当日总计: ¥${d.total.toFixed(2)}
              </span>
              <button class="debt-action-btn btn-copy-person-history" style="padding:4px 8px; font-size:11px;" data-action="copy-date-summary" data-date="${escapeHtml(d.date)}" title="复制当日账单明细" type="button">
                <span>📋</span> 复制当日
              </button>
            </div>
          </div>
          <div>
            ${d.items
              .map(
                (item) => `
              <div class="record-row">
                <div style="display:flex; align-items:center; flex:1; overflow:hidden;">
                  <span class="record-person-badge">${escapeHtml(item.personName)}</span>
                  <span style="font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                    ${escapeHtml(item.dishName)} ${item.specName ? `(${escapeHtml(item.specName)})` : ""}
                  </span>
                </div>
                <div style="display:flex; align-items:center; gap:8px;">
                  <span style="font-weight:700;">¥${toNumericPrice(item.price).toFixed(2)}</span>
                  <span class="status-badge ${item.isSettled ? "paid" : "unpaid"}" data-toggle-order-id="${escapeHtml(item.id)}">
                    ${item.isSettled ? "已结" : "未结"}
                  </span>
                </div>
              </div>
            `,
              )
              .join("")}
          </div>
        </div>
      `;
    }
    container.innerHTML = html;
  }
}

export function switchMainTab(tab: MainTab): void {
  for (const el of document.querySelectorAll(".tab-content")) el.classList.remove("active");
  for (const el of document.querySelectorAll(".tab-item")) el.classList.remove("active");

  const tabItems = document.querySelectorAll(".tab-item");
  if (tab === "order") {
    document.getElementById("tab-order")?.classList.add("active");
    tabItems[0]?.classList.add("active");
    renderTodayOrders();
  } else if (tab === "history") {
    document.getElementById("tab-history")?.classList.add("active");
    tabItems[1]?.classList.add("active");
    renderHistory();
  } else if (tab === "settings") {
    document.getElementById("tab-settings")?.classList.add("active");
    tabItems[2]?.classList.add("active");
    renderSettingsPeople();
  }
}

export function switchHistoryMode(mode: HistoryMode): void {
  state.historyMode = mode;
  document.getElementById("btn-hist-person")?.classList.toggle("active", mode === "person");
  document.getElementById("btn-hist-date")?.classList.toggle("active", mode === "date");
  renderHistory();
}

export function renderAllViews(): void {
  renderPersonPills();
  renderCategoryFilter();
  renderMenu();
  renderTodayOrders();
  renderSettingsPeople();
}
