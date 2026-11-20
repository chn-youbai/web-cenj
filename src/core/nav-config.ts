/**
 * 全站统一导航元数据配置
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
  | "game-2048"
  | "game-puzzle"
  | "game-memory"
  | "takeout"
  | "board"
  | "clash";

export type NavGroupId = "workspace" | "learn" | "media" | "resource" | "playground";

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
}

export interface SlashCommandRoute {
  command: string;
  label: string;
  subtitle: string;
  href: string;
  requiresAuth?: boolean;
  iconSvg: string;
}

export const NAV_GROUPS: readonly NavGroupMeta[] = [
  { id: "workspace", code: "00", label: "首页" },
  { id: "learn", code: "01", label: "学习" },
  { id: "media", code: "02", label: "媒体" },
  { id: "resource", code: "03", label: "资源" },
  { id: "playground", code: "04", label: "游乐场" },
] as const;

export const NAV_ITEMS: readonly NavItemMeta[] = [
  {
    id: "index",
    label: "首页",
    shortLabel: "首页",
    subtitle: "即输即查英语 · 指令直达",
    href: "./index.html",
    group: "workspace",
    keywords: ["home", "index", "首页", "主页"],
    iconSvg:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2.5L13.7 9.1L19.5 6.8L15.4 12L19.5 17.2L13.7 14.9L12 21.5L10.3 14.9L4.5 17.2L8.6 12L4.5 6.8L10.3 9.1Z"/></svg>',
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
  },
  {
    id: "pan",
    label: "资源网盘",
    shortLabel: "网盘",
    subtitle: "客户端高速直下 · 节点订阅中枢",
    href: "./pan.html",
    group: "resource",
    keywords: ["pan", "download", "sub", "appleid", "网盘", "下载", "订阅", "资源", "机场"],
    iconSvg:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>',
    requiresAuth: true,
  },
  {
    id: "game-2048",
    label: "2048",
    shortLabel: "2048",
    subtitle: "暖纸风数字合并挑战",
    href: "./games.html?tab=2048",
    group: "playground",
    keywords: ["2048", "game", "games", "游戏", "摸鱼", "游乐场"],
    iconSvg:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M3 12h18M12 3v18"/></svg>',
  },
  {
    id: "game-puzzle",
    label: "航拍拼图",
    shortLabel: "拼图",
    subtitle: "121 张航拍精选滑动拼图",
    href: "./games.html?tab=puzzle",
    group: "playground",
    keywords: ["puzzle", "game", "games", "拼图", "航拍", "游戏", "摸鱼"],
    iconSvg:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7a2 2 0 0 1 2-2h3.5a2 2 0 1 1 5 0H18a2 2 0 0 1 2 2v3.5a2 2 0 1 1 0 5V19a2 2 0 0 1-2 2h-3.5a2 2 0 1 0-5 0H6a2 2 0 0 1-2-2v-3.5a2 2 0 1 0 0-5V7z"/></svg>',
  },
  {
    id: "game-memory",
    label: "记忆翻卡",
    shortLabel: "翻卡",
    subtitle: "图库实景配对翻牌记忆",
    href: "./games.html?tab=memory",
    group: "playground",
    keywords: ["memory", "card", "game", "games", "翻卡", "记忆", "配对", "游戏", "摸鱼"],
    iconSvg:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="4" width="11" height="14" rx="2"/><path d="M9 2h9a2 2 0 0 1 2 2v12"/></svg>',
  },
] as const;

export const SLASH_COMMANDS: readonly SlashCommandRoute[] = [
  {
    command: "/bill",
    label: "外卖记账",
    subtitle: "沙县点餐日历 · 月度账单统计",
    href: "./takeout.html",
    requiresAuth: true,
    iconSvg:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 3h16v18l-2.5-1.5L15 21l-3-1.5L9 21l-2.5-1.5L4 21V3z"/><path d="M8 8h8M8 12h8M8 16h5"/></svg>',
  },
  {
    command: "/msg",
    label: "秘密留言板",
    subtitle: "匿名互动树洞 · 楼中楼回复",
    href: "./board.html",
    iconSvg:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
  },
  {
    command: "/clash",
    label: "Clash 云控",
    subtitle: "远程节点切换 · 延迟探测终端",
    href: "./clash.html",
    requiresAuth: true,
    iconSvg:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 9l3 3-3 3M13 15h4"/></svg>',
  },
] as const;

const EXTRA_PAGE_META: Partial<Record<PageId, NavItemMeta>> = {
  games: {
    id: "games",
    label: "摸鱼游乐场",
    shortLabel: "游乐场",
    subtitle: "2048 · 航拍拼图 · 记忆翻卡",
    href: "./games.html",
    group: "playground",
    keywords: [],
    iconSvg: NAV_ITEMS[6]?.iconSvg ?? "",
  },
  takeout: {
    id: "takeout",
    label: "外卖记账",
    shortLabel: "记账",
    subtitle: "沙县点餐日历 · 月度账单统计",
    href: "./takeout.html",
    group: "workspace",
    keywords: [],
    iconSvg: SLASH_COMMANDS[0]?.iconSvg ?? "",
    requiresAuth: true,
  },
  board: {
    id: "board",
    label: "秘密留言板",
    shortLabel: "留言板",
    subtitle: "匿名互动树洞 · 楼中楼回复",
    href: "./board.html",
    group: "workspace",
    keywords: [],
    iconSvg: SLASH_COMMANDS[1]?.iconSvg ?? "",
  },
  clash: {
    id: "clash",
    label: "Clash 云控",
    shortLabel: "云控",
    subtitle: "远程节点切换 · 延迟探测终端",
    href: "./clash.html",
    group: "workspace",
    keywords: [],
    iconSvg: SLASH_COMMANDS[2]?.iconSvg ?? "",
    requiresAuth: true,
  },
};

export function getNavItem(id: PageId): NavItemMeta {
  const found = NAV_ITEMS.find((item) => item.id === id) ?? EXTRA_PAGE_META[id];
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

export function matchSlashCommands(query: string): SlashCommandRoute[] {
  const raw = query.trim().toLowerCase();
  if (!raw.startsWith("/")) return [];
  if (raw === "/") return [...SLASH_COMMANDS];
  return SLASH_COMMANDS.filter((cmd) => cmd.command.startsWith(raw));
}
