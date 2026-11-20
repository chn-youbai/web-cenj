/**
 * 全站 10 页统一导航元数据配置
 * 供桌面端可折叠侧边栏、手机端滑出抽屉与全局 ⌘K 命令面板共同复用
 */

export type PageId =
  | "index"
  | "vocab"
  | "recite"
  | "gallery"
  | "upload"
  | "pan"
  | "games"
  | "takeout"
  | "board"
  | "clash";

export type NavGroupId = "workspace" | "learn" | "media" | "resource" | "tools";

export interface NavGroupMeta {
  id: NavGroupId;
  code: string;
  label: string;
}

export interface NavItemMeta {
  id: PageId;
  label: string;
  shortLabel: string;
  subtitle: string;
  href: string;
  group: NavGroupId;
  keywords: string[];
  iconSvg: string;
  requiresAuth?: boolean;
  mobilePrimary?: boolean;
  homeQuick?: boolean;
}

export const NAV_GROUPS: readonly NavGroupMeta[] = [
  { id: "workspace", code: "00", label: "今日" },
  { id: "learn", code: "01", label: "学习" },
  { id: "media", code: "02", label: "媒体" },
  { id: "resource", code: "03", label: "资源" },
  { id: "tools", code: "04", label: "工具" },
] as const;

export const NAV_ITEMS: readonly NavItemMeta[] = [
  {
    id: "index",
    label: "每日一页",
    shortLabel: "日历",
    subtitle: "单向历 · 每日节律与宜忌",
    href: "./index.html",
    group: "workspace",
    keywords: ["home", "index", "calendar", "almanac", "首页", "日历", "单向历", "今日"],
    iconSvg:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2.5L13.7 9.1L19.5 6.8L15.4 12L19.5 17.2L13.7 14.9L12 21.5L10.3 14.9L4.5 17.2L8.6 12L4.5 6.8L10.3 9.1Z"/></svg>',
    mobilePrimary: true,
    homeQuick: false,
  },
  {
    id: "vocab",
    label: "英语查词",
    shortLabel: "查词",
    subtitle: "高中 7 册 · 四六级 · 词根衍生",
    href: "./vocab.html",
    group: "learn",
    keywords: ["vocab", "dictionary", "word", "english", "查词", "英语", "单词", "词典", "四六级"],
    iconSvg:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 4h6a4 4 0 0 1 4 4v13a3 3 0 0 0-3-3H2z"/><path d="M22 4h-6a4 4 0 0 0-4 4v13a3 3 0 0 1 3-3h7z"/></svg>',
    mobilePrimary: true,
    homeQuick: true,
  },
  {
    id: "recite",
    label: "智能过词",
    shortLabel: "过词",
    subtitle: "高考 2050 核心词 · 云端同步",
    href: "./recite.html",
    group: "learn",
    keywords: ["recite", "flashcard", "gaokao", "背单词", "过词", "高考", "2050", "闪卡"],
    iconSvg:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="2.5"/><path d="M8 9h8M8 13h6M8 17h4"/></svg>',
    mobilePrimary: true,
    homeQuick: true,
  },
  {
    id: "gallery",
    label: "视界画廊",
    shortLabel: "画廊",
    subtitle: "精选航拍摄影 · 4K 视频秒播",
    href: "./gallery.html",
    group: "media",
    keywords: ["gallery", "photo", "video", "画廊", "图库", "照片", "摄影", "视频", "航拍"],
    iconSvg:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>',
    mobilePrimary: true,
    homeQuick: true,
  },
  {
    id: "upload",
    label: "投递视频",
    shortLabel: "投递",
    subtitle: "边缘中继直传 · 自动入库画廊",
    href: "./upload.html",
    group: "media",
    keywords: ["upload", "video", "release", "投递", "上传", "发布", "视频上传"],
    iconSvg:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 20h16"/></svg>',
    mobilePrimary: false,
    homeQuick: true,
  },
  {
    id: "pan",
    label: "资源网盘",
    shortLabel: "网盘",
    subtitle: "客户端高速直下 · 节点订阅中枢",
    href: "./pan.html",
    group: "resource",
    keywords: [
      "pan",
      "download",
      "clash",
      "sub",
      "appleid",
      "网盘",
      "下载",
      "订阅",
      "资源",
      "机场",
    ],
    iconSvg:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>',
    requiresAuth: true,
    mobilePrimary: false,
    homeQuick: true,
  },
  {
    id: "games",
    label: "摸鱼游乐场",
    shortLabel: "游乐场",
    subtitle: "2048 · 航拍拼图 · 记忆翻卡",
    href: "./games.html",
    group: "tools",
    keywords: ["games", "2048", "puzzle", "memory", "游戏", "摸鱼", "游乐场", "拼图", "翻卡"],
    iconSvg:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="6" width="18" height="12" rx="4"/><path d="M8 10v4M6 12h4M15.5 11h.01M18 13h.01"/></svg>',
    mobilePrimary: false,
    homeQuick: false,
  },
  {
    id: "takeout",
    label: "外卖记账",
    shortLabel: "记账",
    subtitle: "沙县点餐日历 · 月度账单统计",
    href: "./takeout.html",
    group: "tools",
    keywords: ["takeout", "food", "bill", "外卖", "记账", "沙县", "账单", "日历"],
    iconSvg:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 3h16v18l-2.5-1.5L15 21l-3-1.5L9 21l-2.5-1.5L4 21V3z"/><path d="M8 8h8M8 12h8M8 16h5"/></svg>',
    requiresAuth: true,
    mobilePrimary: false,
    homeQuick: true,
  },
  {
    id: "board",
    label: "秘密留言板",
    shortLabel: "留言板",
    subtitle: "匿名互动树洞 · 楼中楼回复",
    href: "./board.html",
    group: "tools",
    keywords: ["board", "guestbook", "message", "comment", "留言", "留言板", "树洞", "评论"],
    iconSvg:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
    mobilePrimary: false,
    homeQuick: true,
  },
  {
    id: "clash",
    label: "Clash 云控",
    shortLabel: "云控",
    subtitle: "远程节点切换 · 延迟探测终端",
    href: "./clash.html",
    group: "tools",
    keywords: ["clash", "verge", "proxy", "node", "云控", "终端", "节点", "测速"],
    iconSvg:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 9l3 3-3 3M13 15h4"/></svg>',
    requiresAuth: true,
    mobilePrimary: false,
    homeQuick: false,
  },
] as const;

export function getNavItem(id: PageId): NavItemMeta {
  const found = NAV_ITEMS.find((item) => item.id === id);
  if (!found) {
    return NAV_ITEMS[0] as NavItemMeta;
  }
  return found;
}

export function filterNavItems(query: string): NavItemMeta[] {
  const clean = query.trim().replace(/^\/+/, "").toLowerCase();
  if (!clean) {
    return [...NAV_ITEMS];
  }
  return NAV_ITEMS.filter((item) => {
    if (item.id.toLowerCase().includes(clean)) return true;
    if (item.label.toLowerCase().includes(clean)) return true;
    if (item.shortLabel.toLowerCase().includes(clean)) return true;
    if (item.subtitle.toLowerCase().includes(clean)) return true;
    return item.keywords.some((kw) => kw.toLowerCase().includes(clean));
  });
}
