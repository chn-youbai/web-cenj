/**
 * Web-Cenj 前后端共享类型定义
 * 统一规范 Cloudflare Pages Functions 与 Vite MPA 前端的接口契约与数据模型
 */

export interface ApiErrorResponse {
  status?: "error";
  error?: string;
  message?: string;
  detail?: string;
  path?: string;
}

/* ---------- 点赞统计 (/api/click) ---------- */
export interface ClickStatsResponse {
  value: number;
  error?: string;
}

/* ---------- 秘密留言板 (/api/board) ---------- */
export interface GuestbookReply {
  id: number;
  parent_id: number | null;
  nickname: string;
  avatar: string;
  content: string;
  likes: number;
  created_at: number;
}

export interface GuestbookThread extends GuestbookReply {
  replies: GuestbookReply[];
}

export interface BoardListResponse {
  status: "ok" | "error";
  total: number;
  threads: GuestbookThread[];
  fallback?: boolean;
  message?: string;
}

export interface BoardPostResponse {
  status: "ok" | "error";
  message?: string;
  id?: number | null;
  parent_id?: number | null;
  nickname?: string;
  content?: string;
  avatar?: string;
  likes?: number;
  created_at?: number;
  message_id?: number;
}

/* ---------- 图库与视频 (/api/videos, /api/video, /api/upload-asset) ---------- */
export interface VideoItem {
  id: string;
  title: string;
  description?: string;
  duration: number;
  file_size: number;
  poster_url: string;
  asset_url: string;
  download_count?: number;
  created_at?: string;
}

export interface VideosListResponse {
  status: "ok" | "error";
  total?: number;
  videos: VideoItem[];
  message?: string;
}

export interface UploadAssetResponse {
  status?: "ok" | "error";
  id?: string;
  title?: string;
  browser_download_url?: string;
  asset_id?: number;
  size?: number;
  error?: string;
  message?: string;
}

/* ---------- 资源网盘与订阅 (/api/subscription, /api/sub) ---------- */
export type AirportType = "djjc" | "vpn07";

export interface SubscriptionTraffic {
  used: string;
  total: string;
  remaining: string;
  percent?: number;
}

export interface AppleIdGuideCredentials {
  email: string;
  password: string;
}

export interface SubscriptionResponse {
  success: boolean;
  airport_type?: AirportType;
  airport_name?: string;
  plan_name?: string;
  subscribe_url?: string;
  relay_url?: string;
  traffic?: SubscriptionTraffic;
  expired_at?: number;
  expired_date_str?: string;
  from_cache?: boolean;
  cached_at?: string;
  need_credentials?: boolean;
  reset_day?: number | null;
  account_email?: string;
  warning?: string;
  message?: string;
  apple_id?: AppleIdGuideCredentials | null;
  synced_at?: number;
}

/* ---------- Clash Verge 远程云控 (/api/clash) ---------- */
export interface ClashHeartbeat {
  status: "online" | "offline";
  result: string;
  updated_at: string;
  diff_sec: number;
}

export interface ClashCommandRecord {
  command: string;
  payload: string;
  status: "pending" | "done" | "error" | string;
  result: string;
  dispatched_at?: string | null;
  responded_at?: string | null;
  updated_at?: string;
}

export interface ClashRegionSpeedSummary {
  label?: string;
  region?: string;
  flag?: string;
  node_count?: number;
  total_nodes?: number;
  alive_count?: number;
  best_delay: string | number;
  best_node?: string;
  active?: boolean;
  status?: string;
}

export interface ClashSpeedData {
  updated_at?: string;
  regions_summary?: ClashRegionSpeedSummary[];
  [key: string]: unknown;
}

export interface ClashProfileItem {
  uid?: string;
  name: string;
  is_active?: boolean;
  selected?: boolean;
  used_gb?: number;
  total_gb?: number;
  expire?: string;
  url?: string;
  [key: string]: unknown;
}

export interface ClashProfilesData {
  items?: ClashProfileItem[];
  profiles?: ClashProfileItem[];
  [key: string]: unknown;
}

export interface ClashNodeItem {
  name: string;
  delay: string | number;
  delay_num?: number;
  type?: string;
}

export interface ClashNodesData {
  now?: string;
  current?: string;
  regions?: Record<string, ClashNodeItem[]>;
  groups?: Record<string, ClashNodeItem[]>;
  [key: string]: unknown;
}

export interface ClashStatusResponse {
  status: "ok" | "error";
  server_time?: string;
  message?: string;
  heartbeat?: ClashHeartbeat | null;
  latest_command?: ClashCommandRecord | null;
  speed_data?: ClashSpeedData | null;
  profiles_data?: ClashProfilesData | null;
  nodes_data?: ClashNodesData | null;
}

/* ---------- 英语词库与背词 (/api/vocab, /api/derivatives, /api/recite-*) ---------- */
export interface VocabCompactWord {
  b: string;
  u: string;
  w: string;
  p: string;
  m: string;
  f: string;
  n: string;
}

export interface VocabApiResponse {
  status?: "ok" | "error";
  version?: string;
  source?: string;
  updatedAt?: string;
  book?: string;
  total?: number;
  words: VocabCompactWord[];
  message?: string;
}

export interface DerivativeItem {
  word: string;
  pos: string;
  meaning: string;
  level: string;
}

export interface DerivativesApiResponse {
  status: "ok" | "error";
  query?: string;
  rootGroup?: string;
  total?: number;
  derivatives: DerivativeItem[];
  message?: string;
}

export interface GaokaoWord {
  id: number;
  word: string;
  pos?: string;
  meaning: string;
  phonetic?: string;
  example?: string;
  unit?: string;
  group?: string;
  [key: string]: unknown;
}

export interface ReciteSyncPayload {
  key?: string;
  updatedAt: number;
  marksCount?: number;
  marks: Record<string, unknown>;
  settings: Record<string, unknown>;
}

export interface ReciteSyncResponse {
  status: "ok" | "empty" | "fallback" | "local_only" | "conflict" | "error";
  key?: string;
  updatedAt?: number;
  marksCount?: number;
  data?: ReciteSyncPayload | null;
  cloudData?: ReciteSyncPayload | null;
  message?: string;
}

/* ---------- 外卖记账 (/api/takeout) ---------- */
export interface TakeoutBackupResponse {
  status?: "ok" | "empty" | "local_only" | "error";
  data?: unknown;
  updateTime?: string;
  message?: string;
}

/* ---------- 资源网盘 (/api/pan, /api/pan-file) ---------- */
export type PanCategory = "software" | "document" | "image" | "archive" | "media" | "other";
export type PanVisibility = "public" | "private";
export type PanStorageTier = "cf_d1" | "gh_single" | "gh_chunked" | "external_link";

export interface PanChunkMeta {
  index: number;
  url: string;
  asset_id?: number;
  size: number;
}

export interface PanFileItem {
  id: string;
  name: string;
  size: number;
  mime_type: string;
  category: PanCategory;
  visibility: PanVisibility;
  storage_tier: PanStorageTier;
  folder_path?: string;
  asset_url: string;
  asset_id?: number | null;
  chunks?: PanChunkMeta[];
  note: string;
  downloads: number;
  direct_url?: string;
  download_url?: string;
  created_at: number;
  updated_at: number;
}

export interface PanListStats {
  total: number;
  publicCount: number;
  privateCount: number;
  totalBytes: number;
  cfUsedBytes: number;
}

export interface PanListResponse {
  status: "ok" | "error";
  isAdmin: boolean;
  files: PanFileItem[];
  stats: PanListStats;
  message?: string;
}

export interface PanUploadResponse {
  status: "ok" | "error";
  file?: PanFileItem;
  message?: string;
  error?: string;
}

export interface PanChunkUploadResponse {
  status: "ok" | "error";
  chunk?: PanChunkMeta;
  message?: string;
  error?: string;
}

export type PanApiKeyStatus = "active" | "expired" | "revoked";

export interface PanApiKeyItem {
  id: string;
  label: string;
  key_prefix: string;
  can_read: boolean;
  can_write: boolean;
  can_delete: boolean;
  can_private: boolean;
  allowed_origins: string[];
  expires_at: number | null;
  revoked: boolean;
  status: PanApiKeyStatus;
  use_count: number;
  last_used_at: number | null;
  created_at: number;
}

export interface PanApiKeysListResponse {
  status: "ok" | "error";
  keys: PanApiKeyItem[];
  message?: string;
  error?: string;
}

export interface PanApiKeyCreateResponse {
  status: "ok" | "error";
  key?: PanApiKeyItem;
  secret?: string;
  message?: string;
  error?: string;
}

/* ---------- 视界画廊统一媒体库 (/api/media, /api/media-file) ---------- */
export type MediaKind = "photo" | "video";
export type MediaVisibility = "public" | "private";
export type MediaStorageTier = "cf_d1" | "gh_single" | "gh_chunked";

export interface MediaItem {
  id: string;
  kind: MediaKind;
  title: string;
  album: string;
  description: string;
  visibility: MediaVisibility;
  storage_tier: MediaStorageTier;
  mime_type: string;
  file_size: number;
  width: number;
  height: number;
  duration: number;
  asset_url: string;
  asset_id?: number | null;
  chunks?: PanChunkMeta[];
  has_thumb: boolean;
  poster_url?: string;
  downloads: number;
  created_at: number;
  updated_at: number;
}

export interface MediaListStats {
  total: number;
  photoCount: number;
  videoCount: number;
  privateCount: number;
  totalBytes: number;
  cfUsedBytes: number;
}

export interface MediaListResponse {
  status: "ok" | "error";
  isAdmin: boolean;
  items: MediaItem[];
  albums: string[];
  stats: MediaListStats;
  message?: string;
}

export interface MediaUploadResponse {
  status: "ok" | "error";
  item?: MediaItem;
  message?: string;
  error?: string;
}

/* ---------- 临时私人订阅链接 (/api/sub-links, /api/sub) ---------- */
export type TempSubLinkStatus = "active" | "expired" | "exhausted" | "revoked";

export interface TempSubLinkItem {
  token: string;
  airport: AirportType;
  label: string;
  expires_at: number | null;
  max_uses: number | null;
  used_count: number;
  revoked: boolean;
  status: TempSubLinkStatus;
  created_at: number;
  last_used_at: number | null;
}

export interface SubLinksListResponse {
  status: "ok" | "error";
  links: TempSubLinkItem[];
  message?: string;
  error?: string;
}

/* ---------- 网盘临时共享剪切板 (/api/pan-clips) ---------- */
export type PanClipKind = "text" | "image" | "mixed";

export interface PanClipItem {
  id: string;
  kind: PanClipKind;
  content: string;
  preview: string;
  has_image: boolean;
  image_mime: string;
  image_size: number;
  image_url?: string;
  visibility: PanVisibility;
  burn_after_read: boolean;
  expires_at: number;
  created_at: number;
}

export interface PanClipsListResponse {
  status: "ok" | "error";
  isAdmin: boolean;
  clips: PanClipItem[];
  activeCount: number;
  message?: string;
  error?: string;
}

export interface PanClipCreateResponse {
  status: "ok" | "error";
  clip?: PanClipItem;
  message?: string;
  error?: string;
}

export interface PanClipConsumeResponse {
  status: "ok" | "error";
  clip?: PanClipItem;
  image_data_url?: string;
  burned?: boolean;
  message?: string;
  error?: string;
}
