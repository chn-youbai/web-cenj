import type { PanCategory, PanFileItem, PanStorageTier, PanVisibility } from "@shared/types";

export const PAN_CF_D1_LIMIT = 20 * 1024 * 1024; // <= 20 MB -> Cloudflare D1 边缘直存
export const PAN_GH_SINGLE_LIMIT = 90 * 1024 * 1024; // 20 - 90 MB -> GitHub Releases 单步直传
export const PAN_GH_CHUNK_SIZE = 80 * 1024 * 1024; // > 90 MB -> GitHub Releases 80 MB 分片

export type PanPreviewKind = "image" | "text" | "pdf" | "audio" | "video" | "none";
export type PanSortBy = "newest" | "downloads" | "size" | "name";
export type PanCategoryFilter = "all" | PanCategory;
export type PanVisibilityFilter = "all" | PanVisibility;

export const PAN_CATEGORY_LABELS: Record<PanCategory, string> = {
  software: "软件",
  document: "文档",
  image: "图片",
  archive: "压缩包",
  media: "影音",
  other: "其他",
};

export const PAN_TIER_LABELS: Record<PanStorageTier, string> = {
  cf_d1: "CF 极速",
  gh_single: "GitHub 直传",
  gh_chunked: "GitHub 分片",
  external_link: "外链",
};

export type PanUploadTierPreference = "auto" | "cf_d1" | "gh_single" | "gh_chunked";

export function selectUploadTier(
  sizeBytes: number,
  preferredTier: PanUploadTierPreference = "auto",
): "cf_d1" | "gh_single" | "gh_chunked" {
  if (preferredTier !== "auto") {
    return preferredTier;
  }
  if (sizeBytes <= PAN_CF_D1_LIMIT) return "cf_d1";
  if (sizeBytes <= PAN_GH_SINGLE_LIMIT) return "gh_single";
  return "gh_chunked";
}

export function validateUploadTierSize(
  sizeBytes: number,
  tier: "cf_d1" | "gh_single" | "gh_chunked",
): string | null {
  if (tier === "cf_d1" && sizeBytes > PAN_CF_D1_LIMIT) {
    return "CF 边缘极速 (D1) 仅支持 ≤ 20 MB 文件，请改用自动分级或 GitHub 存储";
  }
  if (tier === "gh_single" && sizeBytes > PAN_GH_SINGLE_LIMIT) {
    return "GitHub 直传单次上限 90 MB，请改用自动分级或 GitHub 分片";
  }
  return null;
}

export function inferPanCategory(fileName: string, mimeType = ""): PanCategory {
  const lower = fileName.toLowerCase();
  const mime = mimeType.toLowerCase();
  const ext = lower.includes(".") ? lower.slice(lower.lastIndexOf(".") + 1) : "";

  if (
    ["apk", "exe", "msi", "dmg", "pkg", "deb", "rpm", "appimage", "ipa"].includes(ext) ||
    mime.includes("android.package-archive") ||
    mime.includes("x-msdownload")
  ) {
    return "software";
  }
  if (
    mime.startsWith("image/") ||
    ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "ico", "avif", "heic"].includes(ext)
  ) {
    return "image";
  }
  if (
    mime.startsWith("video/") ||
    mime.startsWith("audio/") ||
    ["mp4", "mkv", "webm", "mov", "avi", "mp3", "wav", "flac", "ogg", "m4a"].includes(ext)
  ) {
    return "media";
  }
  if (["zip", "rar", "7z", "tar", "gz", "bz2", "xz", "tgz", "iso"].includes(ext)) {
    return "archive";
  }
  if (
    mime.startsWith("text/") ||
    mime === "application/pdf" ||
    mime.includes("json") ||
    mime.includes("xml") ||
    [
      "pdf",
      "doc",
      "docx",
      "xls",
      "xlsx",
      "ppt",
      "pptx",
      "txt",
      "md",
      "csv",
      "json",
      "yaml",
      "yml",
      "toml",
      "ini",
      "log",
      "ts",
      "js",
      "py",
      "html",
      "css",
      "sh",
    ].includes(ext)
  ) {
    return "document";
  }
  return "other";
}

export function getPreviewKind(
  fileName: string,
  mimeType: string,
  sizeBytes: number,
  storageTier: PanStorageTier,
): PanPreviewKind {
  if (storageTier === "external_link") return "none";

  const lower = fileName.toLowerCase();
  const mime = mimeType.toLowerCase();
  const ext = lower.includes(".") ? lower.slice(lower.lastIndexOf(".") + 1) : "";

  if (
    mime.startsWith("image/") ||
    ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "avif"].includes(ext)
  ) {
    return sizeBytes <= 25 * 1024 * 1024 ? "image" : "none";
  }
  if (mime === "application/pdf" || ext === "pdf") {
    return sizeBytes <= 25 * 1024 * 1024 ? "pdf" : "none";
  }
  if (mime.startsWith("audio/") || ["mp3", "wav", "ogg", "m4a", "flac"].includes(ext)) {
    return "audio";
  }
  if (mime.startsWith("video/") || ["mp4", "webm", "mov"].includes(ext)) {
    return "video";
  }
  if (
    mime.startsWith("text/") ||
    mime.includes("json") ||
    mime.includes("xml") ||
    [
      "txt",
      "md",
      "csv",
      "json",
      "yaml",
      "yml",
      "toml",
      "ini",
      "log",
      "ts",
      "js",
      "py",
      "html",
      "css",
      "sh",
      "sql",
      "conf",
    ].includes(ext)
  ) {
    return sizeBytes <= 2 * 1024 * 1024 ? "text" : "none";
  }
  return "none";
}

export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "--";
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(kb >= 100 ? 0 : 1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(mb >= 100 ? 0 : 1)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}

export function formatRelativeTime(ts: number, now = Date.now()): string {
  if (!ts) return "";
  const diffSec = Math.max(0, Math.floor((now - ts) / 1000));
  if (diffSec < 60) return "刚刚";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} 分钟前`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour} 小时前`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 30) return `${diffDay} 天前`;
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function filterAndSortPanFiles(
  files: PanFileItem[],
  opts: {
    query: string;
    category: PanCategoryFilter;
    visibility: PanVisibilityFilter;
    sortBy: PanSortBy;
  },
): PanFileItem[] {
  const q = opts.query.trim().toLowerCase();
  const filtered = files.filter((item) => {
    if (opts.category !== "all" && item.category !== opts.category) return false;
    if (opts.visibility !== "all" && item.visibility !== opts.visibility) return false;
    if (q) {
      const hay =
        `${item.name} ${item.folder_path || ""} ${item.note} ${PAN_CATEGORY_LABELS[item.category]}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const sorted = [...filtered];
  sorted.sort((a, b) => {
    if (opts.sortBy === "downloads")
      return b.downloads - a.downloads || b.created_at - a.created_at;
    if (opts.sortBy === "size") return b.size - a.size || b.created_at - a.created_at;
    if (opts.sortBy === "name") return a.name.localeCompare(b.name, "zh-CN");
    return b.created_at - a.created_at;
  });
  return sorted;
}
