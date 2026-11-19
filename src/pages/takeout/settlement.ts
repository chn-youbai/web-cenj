import { getTodayDateString, getWeekdayString } from "./menu-data";
import type { OrderItem, PersonItem } from "./types";

export interface PersonStatsGroup {
  name: string;
  personId: string;
  total: number;
  unpaidTotal: number;
  items: OrderItem[];
}

export interface DateStatsGroup {
  date: string;
  weekday: string;
  total: number;
  items: OrderItem[];
}

export interface OverallStats {
  totalAll: number;
  totalUnpaid: number;
  unpaidCount: number;
}

export function toNumericPrice(price: unknown): number {
  const val = Number.parseFloat(String(price ?? 0));
  return Number.isFinite(val) ? val : 0;
}

export function calculateOverallStats(orders: OrderItem[]): OverallStats {
  let totalAll = 0;
  let totalUnpaid = 0;
  let unpaidCount = 0;
  for (const order of orders) {
    const p = toNumericPrice(order.price);
    totalAll += p;
    if (!order.isSettled) {
      totalUnpaid += p;
      unpaidCount += 1;
    }
  }
  return { totalAll, totalUnpaid, unpaidCount };
}

export function calculatePersonStats(orders: OrderItem[]): PersonStatsGroup[] {
  const map = new Map<string, PersonStatsGroup>();
  for (const order of orders) {
    let group = map.get(order.personName);
    if (!group) {
      group = {
        name: order.personName,
        personId: order.personId,
        total: 0,
        unpaidTotal: 0,
        items: [],
      };
      map.set(order.personName, group);
    }
    const p = toNumericPrice(order.price);
    group.items.push(order);
    group.total += p;
    if (!order.isSettled) {
      group.unpaidTotal += p;
    }
  }
  return Array.from(map.values());
}

export function groupOrdersByDate(orders: OrderItem[]): DateStatsGroup[] {
  const map = new Map<string, DateStatsGroup>();
  for (const order of orders) {
    const weekday = order.weekday || getWeekdayString(order.date);
    const key = `${order.date}__${weekday}`;
    let group = map.get(key);
    if (!group) {
      group = {
        date: order.date,
        weekday,
        total: 0,
        items: [],
      };
      map.set(key, group);
    }
    group.items.push(order);
    group.total += toNumericPrice(order.price);
  }

  return Array.from(map.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([, group]) => group);
}

export function buildTodaySummaryText(orders: OrderItem[], dateStr: string): string {
  const todayOrders = orders.filter((o) => o.date === dateStr);
  const weekday = getWeekdayString(dateStr);
  let summary = `【沙县外卖点餐汇总】\n📅 日期：${dateStr} (${weekday})\n--------------------\n`;

  const personMap = new Map<string, OrderItem[]>();
  let totalAll = 0;
  for (const order of todayOrders) {
    const list = personMap.get(order.personName) ?? [];
    list.push(order);
    personMap.set(order.personName, list);
    totalAll += toNumericPrice(order.price);
  }

  for (const [name, items] of personMap.entries()) {
    summary += `👤 ${name}：\n`;
    let subTotal = 0;
    for (const item of items) {
      const specRemark = [item.specName, item.remark].filter(Boolean).join(" | ");
      summary += `  · ${item.dishName} ${specRemark ? `[${specRemark}]` : ""} - ¥${item.price}\n`;
      subTotal += toNumericPrice(item.price);
    }
    summary += `  小计：¥${subTotal.toFixed(2)}\n\n`;
  }

  summary += `--------------------\n💰 今日总金额：¥${totalAll.toFixed(2)} (共 ${todayOrders.length} 份)`;
  return summary;
}

export function buildTotalUnpaidBillText(
  orders: OrderItem[],
  todayStr: string = getTodayDateString(),
): { summary: string; totalAllUnpaid: number; count: number } {
  const unpaidOrders = orders.filter((o) => !o.isSettled);
  const groups = calculatePersonStats(unpaidOrders).sort((a, b) => b.unpaidTotal - a.unpaidTotal);
  const totalAllUnpaid = groups.reduce((acc, g) => acc + g.unpaidTotal, 0);
  const weekday = getWeekdayString(todayStr);

  let summary = `【📢 外卖待结账单总览】\n📅 统计时间：${todayStr} (${weekday})\n💰 待收总额：¥${totalAllUnpaid.toFixed(2)} (共 ${unpaidOrders.length} 笔未付)\n------------------------------\n`;

  for (const p of groups) {
    summary += `👤 ${p.name}：待付 ¥${p.unpaidTotal.toFixed(2)} (${p.items.length}笔)\n`;
    for (const item of p.items) {
      const specRemark = [item.specName, item.remark].filter(Boolean).join(" | ");
      const itemWeekday = item.weekday || getWeekdayString(item.date);
      summary += `   · ${item.date} (${itemWeekday}) ${item.dishName}${specRemark ? ` [${specRemark}]` : ""} - ¥${toNumericPrice(item.price).toFixed(2)}\n`;
    }
    summary += "\n";
  }

  summary +=
    "------------------------------\n请各位对照明细微信转账给我，收到后我会标记结清，多谢配合！🙏❤️";

  return { summary, totalAllUnpaid, count: unpaidOrders.length };
}

export function buildPersonUnpaidBillText(
  orders: OrderItem[],
  personName: string,
  todayStr: string = getTodayDateString(),
): { text: string; totalUnpaid: number; count: number } {
  const unpaidItems = orders.filter((o) => o.personName === personName && !o.isSettled);
  const totalUnpaid = unpaidItems.reduce((acc, o) => acc + toNumericPrice(o.price), 0);
  const weekday = getWeekdayString(todayStr);

  let text = `【🔔 外卖账单催收提醒】\n👤 订餐人：${personName}\n💰 待付金额：¥${totalUnpaid.toFixed(2)} (共 ${unpaidItems.length} 笔未结)\n📅 截止日期：${todayStr} (${weekday})\n------------------------------\n📋 待付明细：\n`;

  for (const item of unpaidItems) {
    const specRemark = [item.specName, item.remark].filter(Boolean).join(" | ");
    const itemWeekday = item.weekday || getWeekdayString(item.date);
    text += `  · ${item.date} (${itemWeekday}) ${item.dishName}${specRemark ? ` [${specRemark}]` : ""} - ¥${toNumericPrice(item.price).toFixed(2)}\n`;
  }

  text += "------------------------------\n看到麻烦微信转账给我一下哦，感谢配合！🙏❤️";
  return { text, totalUnpaid, count: unpaidItems.length };
}

export function buildPersonHistoryText(orders: OrderItem[], personName: string): string {
  const allItems = orders.filter((o) => o.personName === personName);
  const total = allItems.reduce((acc, o) => acc + toNumericPrice(o.price), 0);

  let text = `【📋 外卖历史消费明细】\n👤 订餐人：${personName}\n💰 累计消费：¥${total.toFixed(2)} (共 ${allItems.length} 笔，已全结清)\n------------------------------\n📋 历史明细：\n`;

  for (const item of allItems) {
    const specRemark = [item.specName, item.remark].filter(Boolean).join(" | ");
    const itemWeekday = item.weekday || getWeekdayString(item.date);
    text += `  · ${item.date} (${itemWeekday}) ${item.dishName}${specRemark ? ` [${specRemark}]` : ""} - ¥${toNumericPrice(item.price).toFixed(2)} (已结)\n`;
  }

  text += "------------------------------\n账单均已结清，感谢支持！🎉";
  return text;
}

export function buildDateSummaryText(orders: OrderItem[], dateStr: string): string {
  const dayOrders = orders.filter((o) => o.date === dateStr);
  const weekday = getWeekdayString(dateStr);
  let summary = `【沙县外卖点餐流水】\n📅 日期：${dateStr} (${weekday})\n--------------------\n`;

  const personMap = new Map<string, OrderItem[]>();
  let totalAll = 0;
  for (const order of dayOrders) {
    const list = personMap.get(order.personName) ?? [];
    list.push(order);
    personMap.set(order.personName, list);
    totalAll += toNumericPrice(order.price);
  }

  for (const [name, items] of personMap.entries()) {
    summary += `👤 ${name}：\n`;
    let subTotal = 0;
    for (const item of items) {
      const specRemark = [item.specName, item.remark].filter(Boolean).join(" | ");
      const statusStr = item.isSettled ? "已结" : "未结";
      summary += `  · ${item.dishName} ${specRemark ? `[${specRemark}]` : ""} - ¥${item.price} (${statusStr})\n`;
      subTotal += toNumericPrice(item.price);
    }
    summary += `  小计：¥${subTotal.toFixed(2)}\n\n`;
  }

  summary += `--------------------\n💰 当日总额：¥${totalAll.toFixed(2)} (共 ${dayOrders.length} 份)`;
  return summary;
}

function parseCSVLine(line: string): string[] {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      values.push(current.trim());
      current = "";
    } else if (char !== undefined) {
      current += char;
    }
  }
  values.push(current.trim());
  return values;
}

export function parseCSVText(
  csvText: string,
): { people: PersonItem[]; orders: OrderItem[] } | null {
  if (!csvText) return null;
  const cleanText = csvText.replace(/^\uFEFF/, "").trim();
  const rawLines = cleanText.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (rawLines.length < 2) return null;

  const headerLine = rawLines[0];
  if (!headerLine) return null;
  const headers = parseCSVLine(headerLine);

  let dateIdx = headers.findIndex((h) => h.includes("日期"));
  const weekdayIdx = headers.findIndex((h) => h.includes("星期"));
  let personIdx = headers.findIndex(
    (h) => h.includes("订餐人") || h.includes("人员") || h.includes("姓名"),
  );
  let dishIdx = headers.findIndex((h) => h.includes("菜品") || h.includes("名称"));
  const specIdx = headers.findIndex((h) => h.includes("规格") || h.includes("变体"));
  let priceIdx = headers.findIndex(
    (h) => h.includes("实付金额") || h.includes("金额") || h.includes("价格"),
  );
  const remarkIdx = headers.findIndex((h) => h.includes("备注") || h.includes("口味"));
  const statusIdx = headers.findIndex(
    (h) => h.includes("状态") || h.includes("结清") || h.includes("结算"),
  );
  const timeIdx = headers.findIndex((h) => h.includes("时间"));

  if (dateIdx === -1) dateIdx = 0;
  if (personIdx === -1) personIdx = 2;
  if (dishIdx === -1) dishIdx = 3;
  if (priceIdx === -1) priceIdx = 5;

  const orders: OrderItem[] = [];
  const peopleMap = new Map<string, PersonItem>();

  for (let r = 1; r < rawLines.length; r += 1) {
    const rawLine = rawLines[r];
    if (!rawLine) continue;
    const row = parseCSVLine(rawLine);
    if (row.length < 3) continue;

    const date = row[dateIdx] || "";
    const weekday = weekdayIdx !== -1 ? (row[weekdayIdx] ?? "") : "";
    const personName = (personIdx !== -1 ? row[personIdx] : "") || "自己";
    const dishName = (dishIdx !== -1 ? row[dishIdx] : "") || "未知菜品";
    const specName = specIdx !== -1 ? (row[specIdx] ?? "") : "";
    const priceStr = priceIdx !== -1 ? (row[priceIdx] ?? "0") : "0";
    const price = Number.parseFloat(priceStr.replace(/[^0-9.]/g, "")) || 0;
    const remark = remarkIdx !== -1 ? (row[remarkIdx] ?? "") : "";
    const statusText = statusIdx !== -1 ? (row[statusIdx] ?? "") : "";
    const isSettled =
      statusText.includes("已结") ||
      statusText.includes("是") ||
      statusText.toLowerCase() === "true";
    const createTime = timeIdx !== -1 ? (row[timeIdx] ?? "") : new Date().toISOString();

    let person = peopleMap.get(personName);
    if (!person) {
      person = {
        id: `p-${Date.now()}-${peopleMap.size}`,
        name: personName,
      };
      peopleMap.set(personName, person);
    }

    orders.push({
      id: `ord-csv-${Date.now()}-${r}-${Math.floor(Math.random() * 1000)}`,
      date: date || getTodayDateString(),
      weekday,
      personId: person.id,
      personName,
      dishId: `dish-${r}`,
      dishName,
      specName,
      price,
      remark,
      isSettled,
      createTime,
    });
  }

  if (orders.length === 0) return null;

  return {
    people: Array.from(peopleMap.values()),
    orders,
  };
}

export function buildCSVExportContent(orders: OrderItem[]): string {
  let csvContent = "\uFEFF";
  csvContent += "点餐日期,星期,订餐人,菜品名称,规格/变体,金额(元),口味备注,结清状态,创建时间\n";

  for (const o of orders) {
    const row = [
      o.date,
      o.weekday || "",
      `"${(o.personName || "").replace(/"/g, '""')}"`,
      `"${(o.dishName || "").replace(/"/g, '""')}"`,
      `"${(o.specName || "").replace(/"/g, '""')}"`,
      o.price || 0,
      `"${(o.remark || "").replace(/"/g, '""')}"`,
      o.isSettled ? "已结清" : "未结清",
      o.createTime || "",
    ];
    csvContent += `${row.join(",")}\n`;
  }

  return csvContent;
}
