import {
  buildCSVExportContent,
  buildPersonHistoryText,
  buildPersonUnpaidBillText,
  buildTodaySummaryText,
  buildTotalUnpaidBillText,
  calculateOverallStats,
  calculatePersonStats,
  groupOrdersByDate,
  parseCSVText,
  toNumericPrice,
} from "@/pages/takeout/settlement";
import type { OrderItem } from "@/pages/takeout/types";
import { describe, expect, it } from "vitest";

const sampleOrders: OrderItem[] = [
  {
    id: "ord-1",
    date: "2026-11-18",
    weekday: "周三",
    personId: "p-1",
    personName: "自己",
    dishId: "d-1",
    dishName: "飘香拌面",
    specName: "大份",
    price: 8,
    remark: "少葱",
    isSettled: false,
    createTime: "2026-11-18T11:30:00Z",
  },
  {
    id: "ord-2",
    date: "2026-11-18",
    weekday: "周三",
    personId: "p-2",
    personName: "小明",
    dishId: "d-2",
    dishName: "炖罐乌鸡汤",
    specName: "常规",
    price: 15.5,
    remark: "",
    isSettled: false,
    createTime: "2026-11-18T11:32:00Z",
  },
  {
    id: "ord-3",
    date: "2026-11-17",
    weekday: "周二",
    personId: "p-1",
    personName: "自己",
    dishId: "d-3",
    dishName: "卤蛋",
    specName: "",
    price: 2.5,
    remark: "",
    isSettled: true,
    createTime: "2026-11-17T12:00:00Z",
  },
];

describe("takeout settlement helpers", () => {
  it("converts numeric prices safely", () => {
    expect(toNumericPrice("12.50")).toBe(12.5);
    expect(toNumericPrice(undefined)).toBe(0);
    expect(toNumericPrice("abc")).toBe(0);
  });

  it("calculates overall stats and person groups accurately", () => {
    const overall = calculateOverallStats(sampleOrders);
    expect(overall.totalAll).toBeCloseTo(26, 2);
    expect(overall.totalUnpaid).toBeCloseTo(23.5, 2);
    expect(overall.unpaidCount).toBe(2);

    const byPerson = calculatePersonStats(sampleOrders);
    expect(byPerson).toHaveLength(2);
    const selfGroup = byPerson.find((g) => g.name === "自己");
    const mingGroup = byPerson.find((g) => g.name === "小明");
    expect(selfGroup?.total).toBeCloseTo(10.5, 2);
    expect(selfGroup?.unpaidTotal).toBeCloseTo(8, 2);
    expect(mingGroup?.unpaidTotal).toBeCloseTo(15.5, 2);
  });

  it("groups orders by date in descending order", () => {
    const grouped = groupOrdersByDate(sampleOrders);
    expect(grouped).toHaveLength(2);
    expect(grouped[0]?.date).toBe("2026-11-18");
    expect(grouped[0]?.total).toBeCloseTo(23.5, 2);
    expect(grouped[1]?.date).toBe("2026-11-17");
    expect(grouped[1]?.total).toBeCloseTo(2.5, 2);
  });

  it("builds summary and reminder texts cleanly", () => {
    const todayText = buildTodaySummaryText(sampleOrders, "2026-11-18");
    expect(todayText).toContain("飘香拌面");
    expect(todayText).toContain("¥23.50 (共 2 份)");

    const unpaidBill = buildTotalUnpaidBillText(sampleOrders, "2026-11-18");
    expect(unpaidBill.totalAllUnpaid).toBeCloseTo(23.5, 2);
    expect(unpaidBill.count).toBe(2);
    expect(unpaidBill.summary).toContain("小明：待付 ¥15.50");

    const personUnpaid = buildPersonUnpaidBillText(sampleOrders, "自己", "2026-11-18");
    expect(personUnpaid.totalUnpaid).toBeCloseTo(8, 2);
    expect(personUnpaid.count).toBe(1);
    expect(personUnpaid.text).toContain("飘香拌面");

    const historyText = buildPersonHistoryText(sampleOrders, "自己");
    expect(historyText).toContain("累计消费：¥10.50");
    expect(historyText).toContain("卤蛋");
  });

  it("round-trips CSV export and import", () => {
    const csv = buildCSVExportContent(sampleOrders);
    expect(csv.startsWith("\uFEFF")).toBe(true);

    const parsed = parseCSVText(csv);
    expect(parsed).not.toBeNull();
    expect(parsed?.orders).toHaveLength(3);
    expect(parsed?.people.map((p) => p.name)).toEqual(["自己", "小明"]);
    expect(parsed?.orders[0]?.dishName).toBe("飘香拌面");
    expect(parsed?.orders[2]?.isSettled).toBe(true);
  });

  it("returns null on invalid CSV text", () => {
    expect(parseCSVText("")).toBeNull();
    expect(parseCSVText("点餐日期,星期")).toBeNull();
  });
});
