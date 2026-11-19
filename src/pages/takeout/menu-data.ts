import type { DishItem, PersonItem } from "./types";

export const CATEGORIES = [
  "全部",
  "特色小吃",
  "滋补炖品",
  "营养汤馄饨",
  "营养汤面/粉",
  "营养套餐饭",
  "卤味系列",
  "现炒热卖",
] as const;

export const WEEKDAYS = [
  "星期日",
  "星期一",
  "星期二",
  "星期三",
  "星期四",
  "星期五",
  "星期六",
] as const;

export const DEFAULT_MENU: DishItem[] = [
  // 1. 特色小吃
  { id: "tx-1", name: "鲜肉蒸饺", category: "特色小吃", specs: [{ name: "标配", price: 5 }] },
  {
    id: "tx-2",
    name: "葱油拌面/米粉/粿条",
    category: "特色小吃",
    specs: [
      { name: "葱油拌面", price: 5 },
      { name: "葱油拌米粉", price: 5 },
      { name: "葱油拌粿条", price: 5 },
    ],
  },
  {
    id: "tx-3",
    name: "飘香拌面/米粉/粿条",
    category: "特色小吃",
    specs: [
      { name: "飘香拌面", price: 5 },
      { name: "飘香拌米粉", price: 5 },
      { name: "飘香拌粿条", price: 5 },
    ],
  },
  {
    id: "tx-4",
    name: "香脆汤馄饨",
    category: "特色小吃",
    specs: [
      { name: "小份", price: 8 },
      { name: "中份", price: 10 },
      { name: "大份", price: 12 },
      { name: "豪华份", price: 15 },
    ],
  },
  {
    id: "tx-5",
    name: "拌馄饨",
    category: "特色小吃",
    specs: [
      { name: "小份", price: 8 },
      { name: "中份", price: 10 },
      { name: "大份", price: 12 },
      { name: "豪华份", price: 15 },
    ],
  },
  {
    id: "tx-6",
    name: "馄饨汤面/米粉/粿条",
    category: "特色小吃",
    specs: [
      { name: "馄饨汤面", price: 10 },
      { name: "馄饨汤米粉", price: 10 },
      { name: "馄饨汤粿条", price: 10 },
    ],
  },
  {
    id: "tx-7",
    name: "馄饨拌面/米粉/粿条",
    category: "特色小吃",
    specs: [
      { name: "馄饨拌面", price: 10 },
      { name: "馄饨拌米粉", price: 10 },
      { name: "馄饨拌粿条", price: 10 },
    ],
  },
  { id: "tx-8", name: "炸馄饨", category: "特色小吃", specs: [{ name: "标配", price: 10 }] },
  { id: "tx-9", name: "炸饺", category: "特色小吃", specs: [{ name: "标配", price: 8 }] },
  {
    id: "tx-10",
    name: "酸菜肉丝汤面/米粉/粿条",
    category: "特色小吃",
    specs: [
      { name: "汤面", price: 10 },
      { name: "汤米粉", price: 10 },
      { name: "汤粿条", price: 10 },
    ],
  },
  {
    id: "tx-11",
    name: "青菜肉丝汤面/米粉/粿条",
    category: "特色小吃",
    specs: [
      { name: "汤面", price: 10 },
      { name: "汤米粉", price: 10 },
      { name: "汤粿条", price: 10 },
    ],
  },
  { id: "tx-12", name: "螺蛳粉", category: "特色小吃", specs: [{ name: "标配", price: 11 }] },
  { id: "tx-13", name: "酸辣粉", category: "特色小吃", specs: [{ name: "标配", price: 11 }] },
  {
    id: "tx-14",
    name: "酸辣面/米粉/粿条/馄饨",
    category: "特色小吃",
    specs: [
      { name: "酸辣面", price: 11 },
      { name: "酸辣米粉", price: 11 },
      { name: "酸辣粿条", price: 11 },
      { name: "酸辣馄饨", price: 11 },
    ],
  },
  {
    id: "tx-15",
    name: "鸡蛋面/米粉/粿条",
    category: "特色小吃",
    specs: [
      { name: "鸡蛋面", price: 8 },
      { name: "鸡蛋米粉", price: 8 },
      { name: "鸡蛋粿条", price: 8 },
    ],
  },
  {
    id: "tx-16",
    name: "红烧炸酱拌面/米粉/粿条",
    category: "特色小吃",
    specs: [
      { name: "拌面小份", price: 10 },
      { name: "拌面大份", price: 12 },
      { name: "拌粉小份", price: 10 },
      { name: "拌粉大份", price: 12 },
      { name: "拌粿条小份", price: 10 },
      { name: "拌粿条大份", price: 12 },
    ],
  },
  {
    id: "tx-17",
    name: "红烧炸酱汤面/米粉/粿条",
    category: "特色小吃",
    specs: [
      { name: "汤面小份", price: 10 },
      { name: "汤面大份", price: 12 },
      { name: "汤粉小份", price: 10 },
      { name: "汤粉大份", price: 12 },
      { name: "汤粿条小份", price: 10 },
      { name: "汤粿条大份", price: 12 },
    ],
  },
  {
    id: "tx-18",
    name: "老北京炸酱面/粉/粿条",
    category: "特色小吃",
    specs: [
      { name: "炸酱面", price: 13 },
      { name: "炸酱米粉", price: 13 },
      { name: "炸酱粿条", price: 13 },
      { name: "桂林米粉", price: 13 },
    ],
  },
  {
    id: "tx-19",
    name: "牛腩拌面/米粉/粿条",
    category: "特色小吃",
    specs: [
      { name: "牛腩拌面", price: 15 },
      { name: "牛腩拌米粉", price: 15 },
      { name: "牛腩拌粿条", price: 15 },
      { name: "桂林米粉", price: 15 },
    ],
  },
  {
    id: "tx-20",
    name: "牛腩汤面/米粉/粿条",
    category: "特色小吃",
    specs: [
      { name: "牛腩汤面", price: 15 },
      { name: "牛腩汤米粉", price: 15 },
      { name: "牛腩汤粿条", price: 15 },
      { name: "桂林米粉", price: 15 },
    ],
  },
  {
    id: "tx-21",
    name: "青菜汤面/米粉/粿条",
    category: "特色小吃",
    specs: [
      { name: "小份(6元)", price: 6 },
      { name: "加量大份(8元)", price: 8 },
    ],
  },
  {
    id: "tx-22",
    name: "酸菜汤面/米粉/粿条",
    category: "特色小吃",
    specs: [
      { name: "小份(6元)", price: 6 },
      { name: "加量大份(8元)", price: 8 },
    ],
  },
  {
    id: "tx-23",
    name: "现蒸小笼包",
    category: "特色小吃",
    specs: [{ name: "标配一笼", price: 8 }],
  },

  // 2. 滋补炖品
  { id: "dp-1", name: "虫草花排骨汤", category: "滋补炖品", specs: [{ name: "原盅", price: 9 }] },
  { id: "dp-2", name: "茶树菇猪肚汤", category: "滋补炖品", specs: [{ name: "原盅", price: 9 }] },
  { id: "dp-3", name: "花旗参乌鸡汤", category: "滋补炖品", specs: [{ name: "原盅", price: 9 }] },
  { id: "dp-4", name: "花旗参鸽子汤", category: "滋补炖品", specs: [{ name: "原盅", price: 12 }] },

  // 3. 营养汤馄饨
  { id: "th-1", name: "排骨汤馄饨", category: "营养汤馄饨", specs: [{ name: "标配", price: 15 }] },
  { id: "th-2", name: "乌鸡汤馄饨", category: "营养汤馄饨", specs: [{ name: "标配", price: 15 }] },
  { id: "th-3", name: "猪肚汤馄饨", category: "营养汤馄饨", specs: [{ name: "标配", price: 15 }] },
  { id: "th-4", name: "鸽子汤馄饨", category: "营养汤馄饨", specs: [{ name: "标配", price: 20 }] },

  // 4. 营养汤面/粉
  {
    id: "tm-1",
    name: "排骨汤面/粿条/米粉",
    category: "营养汤面/粉",
    specs: [
      { name: "排骨汤面", price: 13 },
      { name: "排骨汤米粉", price: 13 },
      { name: "排骨汤粿条", price: 13 },
    ],
  },
  {
    id: "tm-2",
    name: "乌鸡汤面/粿条/米粉",
    category: "营养汤面/粉",
    specs: [
      { name: "乌鸡汤面", price: 14 },
      { name: "乌鸡汤米粉", price: 14 },
      { name: "乌鸡汤粿条", price: 14 },
    ],
  },
  {
    id: "tm-3",
    name: "猪肚汤面/粿条/米粉",
    category: "营养汤面/粉",
    specs: [
      { name: "猪肚汤面", price: 14 },
      { name: "猪肚汤米粉", price: 14 },
      { name: "猪肚汤粿条", price: 14 },
    ],
  },
  {
    id: "tm-4",
    name: "鸽子汤面/粿条/米粉",
    category: "营养汤面/粉",
    specs: [
      { name: "鸽子汤面", price: 18 },
      { name: "鸽子汤米粉", price: 18 },
      { name: "鸽子汤粿条", price: 18 },
    ],
  },

  // 5. 营养套餐饭
  { id: "tc-1", name: "荷包蛋饭", category: "营养套餐饭", specs: [{ name: "套餐", price: 13 }] },
  { id: "tc-2", name: "酸菜肉丝饭", category: "营养套餐饭", specs: [{ name: "套餐", price: 15 }] },
  { id: "tc-3", name: "鸡腿饭", category: "营养套餐饭", specs: [{ name: "套餐", price: 15 }] },
  { id: "tc-4", name: "鸭腿饭", category: "营养套餐饭", specs: [{ name: "套餐", price: 16 }] },
  { id: "tc-5", name: "红烧牛腩饭", category: "营养套餐饭", specs: [{ name: "套餐", price: 20 }] },
  { id: "tc-6", name: "排骨汤饭", category: "营养套餐饭", specs: [{ name: "套餐", price: 16 }] },
  { id: "tc-7", name: "乌鸡汤饭", category: "营养套餐饭", specs: [{ name: "套餐", price: 16 }] },
  { id: "tc-8", name: "猪肚汤饭", category: "营养套餐饭", specs: [{ name: "套餐", price: 16 }] },
  { id: "tc-9", name: "鸽子汤饭", category: "营养套餐饭", specs: [{ name: "套餐", price: 20 }] },

  // 6. 卤味系列
  { id: "lw-1", name: "豆干", category: "卤味系列", specs: [{ name: "1块", price: 1 }] },
  { id: "lw-2", name: "茶叶蛋", category: "卤味系列", specs: [{ name: "1个", price: 2 }] },
  { id: "lw-3", name: "香肠", category: "卤味系列", specs: [{ name: "1根", price: 2 }] },
  { id: "lw-4", name: "荷包蛋", category: "卤味系列", specs: [{ name: "1个", price: 3 }] },
  { id: "lw-5", name: "鸡腿", category: "卤味系列", specs: [{ name: "1只", price: 8 }] },
  { id: "lw-6", name: "鸭腿", category: "卤味系列", specs: [{ name: "1只", price: 9 }] },
  { id: "lw-7", name: "生馄饨 (斤)", category: "卤味系列", specs: [{ name: "1斤", price: 30 }] },
  { id: "lw-8", name: "生水饺 (斤)", category: "卤味系列", specs: [{ name: "1斤", price: 18 }] },

  // 7. 现炒热卖
  {
    id: "xc-1",
    name: "鸡蛋炒米粉",
    category: "现炒热卖",
    specs: [
      { name: "标配 (10元)", price: 10 },
      { name: "加料 (12元)", price: 12 },
      { name: "豪华/大份 (15元)", price: 15 },
    ],
  },
  {
    id: "xc-2",
    name: "鸡蛋桂林米粉",
    category: "现炒热卖",
    specs: [
      { name: "标配 (10元)", price: 10 },
      { name: "加料 (12元)", price: 12 },
      { name: "豪华/大份 (15元)", price: 15 },
    ],
  },
  {
    id: "xc-3",
    name: "鸡蛋炒饭",
    category: "现炒热卖",
    specs: [
      { name: "标配 (10元)", price: 10 },
      { name: "加料 (12元)", price: 12 },
      { name: "豪华/大份 (15元)", price: 15 },
    ],
  },
  {
    id: "xc-4",
    name: "鸡蛋炒面",
    category: "现炒热卖",
    specs: [
      { name: "标配 (10元)", price: 10 },
      { name: "加料 (12元)", price: 12 },
      { name: "豪华/大份 (15元)", price: 15 },
    ],
  },
  {
    id: "xc-5",
    name: "鸡蛋炒粿条",
    category: "现炒热卖",
    specs: [
      { name: "标配 (10元)", price: 10 },
      { name: "加料 (12元)", price: 12 },
      { name: "豪华/大份 (15元)", price: 15 },
    ],
  },
  {
    id: "xc-6",
    name: "扬州炒饭",
    category: "现炒热卖",
    specs: [
      { name: "标配 (10元)", price: 10 },
      { name: "加料 (12元)", price: 12 },
      { name: "豪华/大份 (15元)", price: 15 },
    ],
  },
  {
    id: "xc-7",
    name: "紫菜炒饭",
    category: "现炒热卖",
    specs: [
      { name: "标配 (10元)", price: 10 },
      { name: "加料 (12元)", price: 12 },
      { name: "豪华/大份 (15元)", price: 15 },
    ],
  },
];

export const DEFAULT_PEOPLE: PersonItem[] = [
  { id: "p-1", name: "自己" },
  { id: "p-2", name: "张三" },
  { id: "p-3", name: "李四" },
  { id: "p-4", name: "王五" },
];

export function getWeekdayString(dateStr: string): string {
  if (!dateStr) return "";
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return "";
  return WEEKDAYS[d.getDay()] ?? "";
}

export function getTodayDateString(now: Date = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
