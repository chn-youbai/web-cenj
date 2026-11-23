import type { MediaItem, MediaKind, MediaStorageTier, MediaVisibility } from "@shared/types";

export const MEDIA_CF_D1_LIMIT = 20 * 1024 * 1024; // <= 20 MB -> Cloudflare D1 边缘极速
export const MEDIA_GH_SINGLE_LIMIT = 90 * 1024 * 1024; // 20 - 90 MB -> GitHub 单步直传
export const MEDIA_GH_CHUNK_SIZE = 80 * 1024 * 1024; // > 90 MB -> GitHub 80 MB 分片

export const AERIAL_ALBUM_NAME = "航拍精选";

export type GalleryKindFilter = "all" | MediaKind;
export type GalleryVisibilityFilter = "all" | MediaVisibility;

export interface GalleryDisplayItem {
  source: "cloud" | "static";
  id: string;
  kind: MediaKind;
  title: string;
  album: string;
  description: string;
  visibility: MediaVisibility;
  storageTier?: MediaStorageTier;
  thumbUrl: string;
  fullUrl: string;
  downloadUrl: string;
  fileSize: number;
  width: number;
  height: number;
  duration: number;
  createdAt: number;
  cloudItem?: MediaItem;
}

export function selectMediaTier(sizeBytes: number): "cf_d1" | "gh_single" | "gh_chunked" {
  if (sizeBytes <= MEDIA_CF_D1_LIMIT) return "cf_d1";
  if (sizeBytes <= MEDIA_GH_SINGLE_LIMIT) return "gh_single";
  return "gh_chunked";
}

export function detectMediaKind(file: { name: string; type?: string }): MediaKind | null {
  const mime = (file.type || "").toLowerCase();
  const lower = file.name.toLowerCase();
  if (mime.startsWith("video/") || /\.(mp4|mov|webm|mkv|avi|m4v|3gp)$/.test(lower)) {
    return "video";
  }
  if (mime.startsWith("image/") || /\.(jpg|jpeg|png|webp|gif|bmp|avif|heic|svg)$/.test(lower)) {
    return "photo";
  }
  return null;
}

export function formatDuration(sec: number): string {
  const sTotal = Math.max(0, Math.round(sec || 0));
  const m = Math.floor(sTotal / 60);
  const s = sTotal % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
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

export function filterGalleryItems(
  items: GalleryDisplayItem[],
  opts: {
    kind: GalleryKindFilter;
    album: string;
    visibility: GalleryVisibilityFilter;
    query: string;
  },
): GalleryDisplayItem[] {
  const q = opts.query.trim().toLowerCase();
  return items.filter((item) => {
    if (opts.kind !== "all" && item.kind !== opts.kind) return false;
    if (opts.album !== "all" && item.album !== opts.album) return false;
    if (opts.visibility !== "all" && item.visibility !== opts.visibility) return false;
    if (q) {
      const hay = `${item.title} ${item.album} ${item.description}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

export interface GeneratedThumb {
  blob: Blob | null;
  width: number;
  height: number;
}

export async function generateImageThumbnail(file: File, maxSide = 640): Promise<GeneratedThumb> {
  return new Promise((resolve) => {
    const objUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const w = img.naturalWidth || 0;
      const h = img.naturalHeight || 0;
      try {
        const scale = Math.min(1, maxSide / Math.max(1, w, h));
        const tw = Math.max(1, Math.round(w * scale));
        const th = Math.max(1, Math.round(h * scale));
        const canvas = document.createElement("canvas");
        canvas.width = tw;
        canvas.height = th;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          URL.revokeObjectURL(objUrl);
          resolve({ blob: null, width: w, height: h });
          return;
        }
        ctx.drawImage(img, 0, 0, tw, th);
        canvas.toBlob(
          (blob) => {
            URL.revokeObjectURL(objUrl);
            resolve({ blob, width: w, height: h });
          },
          "image/webp",
          0.78,
        );
      } catch {
        URL.revokeObjectURL(objUrl);
        resolve({ blob: null, width: w, height: h });
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(objUrl);
      resolve({ blob: null, width: 0, height: 0 });
    };
    img.src = objUrl;
  });
}

export interface CapturedVideoMeta {
  blob: Blob | null;
  width: number;
  height: number;
  duration: number;
}

export async function captureVideoPoster(file: File, maxSide = 640): Promise<CapturedVideoMeta> {
  return new Promise((resolve) => {
    const objUrl = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;

    let settled = false;
    const finish = (result: CapturedVideoMeta) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      URL.revokeObjectURL(objUrl);
      video.src = "";
      resolve(result);
    };

    const timer = window.setTimeout(() => {
      finish({
        blob: null,
        width: video.videoWidth || 0,
        height: video.videoHeight || 0,
        duration: Math.round(video.duration || 0),
      });
    }, 5000);

    video.onloadedmetadata = () => {
      const targetTime = video.duration > 1.2 ? 1.0 : Math.max(0, (video.duration || 0) * 0.2);
      try {
        video.currentTime = targetTime;
      } catch {
        finish({
          blob: null,
          width: video.videoWidth || 0,
          height: video.videoHeight || 0,
          duration: Math.round(video.duration || 0),
        });
      }
    };

    video.onseeked = () => {
      const w = video.videoWidth || 0;
      const h = video.videoHeight || 0;
      const duration = Math.round(video.duration || 0);
      if (w <= 0 || h <= 0) {
        finish({ blob: null, width: w, height: h, duration });
        return;
      }
      try {
        const scale = Math.min(1, maxSide / Math.max(1, w, h));
        const tw = Math.max(1, Math.round(w * scale));
        const th = Math.max(1, Math.round(h * scale));
        const canvas = document.createElement("canvas");
        canvas.width = tw;
        canvas.height = th;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          finish({ blob: null, width: w, height: h, duration });
          return;
        }
        ctx.drawImage(video, 0, 0, tw, th);
        canvas.toBlob(
          (blob) => finish({ blob, width: w, height: h, duration }),
          "image/webp",
          0.78,
        );
      } catch {
        finish({ blob: null, width: w, height: h, duration });
      }
    };

    video.onerror = () => finish({ blob: null, width: 0, height: 0, duration: 0 });
    video.src = objUrl;
  });
}
