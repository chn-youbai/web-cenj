import "@/core/fonts";
import { escapeHtml, optById } from "@/core/dom";
import { initAppShell } from "@/core/shell";
import { showToast } from "@/core/toast";
import type {
  MediaItem,
  MediaListResponse,
  MediaListStats,
  MediaUploadResponse,
  MediaVisibility,
  PanChunkMeta,
  PanChunkUploadResponse,
} from "@shared/types";
import { createLightbox } from "./lightbox";
import { EMBEDDED_IMAGES, IMAGE_CDN_BASE, getImageUrl } from "./photos";
import {
  AERIAL_ALBUM_NAME,
  type GalleryDisplayItem,
  type GalleryKindFilter,
  type GalleryVisibilityFilter,
  MEDIA_GH_CHUNK_SIZE,
  captureVideoPoster,
  detectMediaKind,
  filterGalleryItems,
  formatDuration,
  formatFileSize,
  generateImageThumbnail,
  selectMediaTier,
} from "./utils";

initAppShell({ activePage: "gallery" });

const ADMIN_PWD_SESSION_KEY = "cenj_pan_admin_pwd_v1";

interface QueueTask {
  id: string;
  name: string;
  tierLabel: string;
  progress: number;
  status: "pending" | "uploading" | "done" | "error";
  detail: string;
}

const state = {
  staticImages: [...EMBEDDED_IMAGES],
  cloudItems: [] as MediaItem[],
  stats: {
    total: 0,
    photoCount: 0,
    videoCount: 0,
    privateCount: 0,
    totalBytes: 0,
    cfUsedBytes: 0,
  } as MediaListStats,
  isAdmin: false,
  adminPassword: "",
  kind: "all" as GalleryKindFilter,
  album: "all",
  visibility: "all" as GalleryVisibilityFilter,
  query: "",
  queue: [] as QueueTask[],
  pendingFiles: [] as File[],
  activeVideoItem: null as GalleryDisplayItem | null,
  pendingAdminAction: null as (() => void) | null,
};

try {
  state.adminPassword = window.sessionStorage.getItem(ADMIN_PWD_SESSION_KEY) || "";
} catch {
  // ignore
}

function getAuthHeaders(): Record<string, string> {
  return state.adminPassword ? { "X-Admin-Password": state.adminPassword } : {};
}

function buildMediaUrl(
  item: MediaItem,
  opts: { thumb?: boolean; download?: boolean } = {},
): string {
  const params = new URLSearchParams({ id: item.id });
  if (opts.thumb) params.set("thumb", "1");
  if (opts.download) params.set("download", "1");
  if (item.visibility === "private" && state.adminPassword) {
    params.set("pwd", state.adminPassword);
  }
  return `/api/media-file?${params.toString()}`;
}

function buildCombinedItems(): GalleryDisplayItem[] {
  const cloudDisplay: GalleryDisplayItem[] = state.cloudItems.map((m) => {
    const fallbackPoster = m.poster_url || "";
    const thumbUrl = m.has_thumb
      ? buildMediaUrl(m, { thumb: true })
      : m.kind === "photo"
        ? buildMediaUrl(m)
        : fallbackPoster;

    return {
      source: "cloud",
      id: m.id,
      kind: m.kind,
      title: m.title,
      album: m.album || "默认相册",
      description: m.description || "",
      visibility: m.visibility,
      storageTier: m.storage_tier,
      thumbUrl,
      fullUrl: buildMediaUrl(m),
      downloadUrl: buildMediaUrl(m, { download: true }),
      fileSize: m.file_size,
      width: m.width,
      height: m.height,
      duration: m.duration,
      createdAt: m.created_at,
      cloudItem: m,
    };
  });

  const staticDisplay: GalleryDisplayItem[] = state.staticImages.map((imgName, idx) => {
    const url = getImageUrl(imgName);
    return {
      source: "static",
      id: `aerial_${idx}_${imgName}`,
      kind: "photo",
      title: `航拍精选 No.${String(idx + 1).padStart(2, "0")}`,
      album: AERIAL_ALBUM_NAME,
      description: "内置航拍摄影默认相册",
      visibility: "public",
      thumbUrl: url,
      fullUrl: url,
      downloadUrl: url,
      fileSize: 0,
      width: 0,
      height: 0,
      duration: 0,
      createdAt: 0,
    };
  });

  return [...cloudDisplay, ...staticDisplay];
}

function getVisiblePhotosForLightbox(): GalleryDisplayItem[] {
  const filtered = filterGalleryItems(buildCombinedItems(), {
    kind: state.kind,
    album: state.album,
    visibility: state.visibility,
    query: state.query,
  });
  return filtered.filter((i) => i.kind === "photo");
}

function openModal(id: string): void {
  const el = optById(id);
  if (el) el.hidden = false;
}

function closeModal(id: string): void {
  const el = optById(id);
  if (el) el.hidden = true;
}

function syncAdminUI(): void {
  const adminBtn = optById("btnGalAdmin");
  const adminText = optById("btnGalAdminText");
  const visSwitch = optById("galVisSwitch");
  const uploadVisField = optById("uploadVisField");

  if (adminBtn) adminBtn.classList.toggle("is-unlocked", state.isAdmin);
  if (adminText) adminText.textContent = state.isAdmin ? "已解锁 · 锁定" : "私密解锁";
  if (visSwitch) visSwitch.hidden = !state.isAdmin;
  if (uploadVisField) uploadVisField.hidden = !state.isAdmin;

  if (!state.isAdmin) {
    state.visibility = "all";
    const visSel = optById<HTMLSelectElement>("uploadVisSelect");
    if (visSel) visSel.value = "public";
  }
}

function renderStatsAndAlbums(): void {
  const combined = buildCombinedItems();
  const totalPhotos = combined.filter((i) => i.kind === "photo").length;
  const totalVideos = combined.filter((i) => i.kind === "video").length;

  const countAll = optById("countAll");
  const countPhoto = optById("countPhoto");
  const countVideo = optById("countVideo");
  if (countAll) countAll.textContent = String(combined.length);
  if (countPhoto) countPhoto.textContent = String(totalPhotos);
  if (countVideo) countVideo.textContent = String(totalVideos);

  const statsEl = optById("galStatsLine");
  if (statsEl) {
    const parts = [`${totalPhotos} 张照片`, `${totalVideos} 个视频`];
    if (state.isAdmin && state.stats.privateCount > 0) {
      parts.push(`含 ${state.stats.privateCount} 项私密`);
    }
    parts.push(`CF 极速库已用 ${formatFileSize(state.stats.cfUsedBytes)} / 5 GB`);
    statsEl.textContent = parts.join(" · ");
  }

  // Album chips + datalist
  const albumCounts = new Map<string, number>();
  for (const item of combined) {
    albumCounts.set(item.album, (albumCounts.get(item.album) ?? 0) + 1);
  }
  const albums = Array.from(albumCounts.keys());
  if (state.album !== "all" && !albumCounts.has(state.album)) {
    state.album = "all";
  }

  const chipsEl = optById("galAlbumChips");
  if (chipsEl) {
    chipsEl.innerHTML = [
      `<button type="button" class="gal-chip${state.album === "all" ? " active" : ""}" data-album="all">全部相册 (${combined.length})</button>`,
      ...albums.map(
        (name) =>
          `<button type="button" class="gal-chip${state.album === name ? " active" : ""}" data-album="${escapeHtml(name)}">${escapeHtml(name)} (${albumCounts.get(name) ?? 0})</button>`,
      ),
    ].join("");
  }

  const datalist = optById("albumSuggestions");
  if (datalist) {
    const userAlbums = new Set(["日常摄影", "旅行记忆", "视频精选", ...albums]);
    userAlbums.delete(AERIAL_ALBUM_NAME);
    datalist.innerHTML = Array.from(userAlbums)
      .map((name) => `<option value="${escapeHtml(name)}">`)
      .join("");
  }
}

function renderQueue(): void {
  const wrap = optById("galQueue");
  const list = optById("galQueueList");
  const title = optById("galQueueTitle");
  if (!wrap || !list) return;

  if (state.queue.length === 0) {
    wrap.hidden = true;
    return;
  }
  wrap.hidden = false;
  const activeCount = state.queue.filter(
    (t) => t.status === "uploading" || t.status === "pending",
  ).length;
  if (title) {
    title.textContent =
      activeCount > 0
        ? `正在上传媒体 (${activeCount} 项进行中)`
        : `上传队列 (${state.queue.length})`;
  }

  list.innerHTML = state.queue
    .map(
      (task) => `
      <div class="gal-q-item">
        <div class="gal-q-top">
          <span class="gal-q-name">${escapeHtml(task.name)} · ${escapeHtml(task.tierLabel)}</span>
          <span class="gal-q-status ${task.status === "done" ? "is-done" : task.status === "error" ? "is-error" : ""}">
            ${escapeHtml(task.detail)}
          </span>
        </div>
        <div class="gal-q-track">
          <div class="gal-q-fill ${task.status === "done" ? "is-done" : task.status === "error" ? "is-error" : ""}" style="width:${task.progress}%"></div>
        </div>
      </div>
    `,
    )
    .join("");
}

function renderGrid(): void {
  const grid = optById("mediaGrid");
  const empty = optById("galEmptyState");
  if (!grid || !empty) return;

  const visible = filterGalleryItems(buildCombinedItems(), {
    kind: state.kind,
    album: state.album,
    visibility: state.visibility,
    query: state.query,
  });

  if (visible.length === 0) {
    grid.innerHTML = "";
    empty.hidden = false;
    return;
  }
  empty.hidden = true;

  grid.innerHTML = visible
    .map((item) => {
      const isVideo = item.kind === "video";
      const isPrivate = item.visibility === "private";
      const thumbHtml = item.thumbUrl
        ? `<img src="${escapeHtml(item.thumbUrl)}" alt="${escapeHtml(item.title)}" loading="lazy">`
        : `<div class="media-thumb-fallback">${isVideo ? "VIDEO" : "PHOTO"}</div>`;

      const sizeText = item.fileSize > 0 ? formatFileSize(item.fileSize) : "航拍精选";

      return `
        <article class="media-card" data-media-id="${escapeHtml(item.id)}" tabindex="0" role="button" aria-label="${escapeHtml(item.title)}">
          <div class="media-thumb-wrap">
            ${thumbHtml}
            <div class="media-badge-top">
              ${isPrivate ? '<span class="media-pill is-private">私密</span>' : ""}
              ${item.source === "cloud" ? `<span class="media-pill">${escapeHtml(item.album)}</span>` : ""}
            </div>
            ${isVideo ? '<div class="media-play-badge">▶</div>' : ""}
            ${isVideo && item.duration > 0 ? `<div class="media-duration-pill">${formatDuration(item.duration)}</div>` : ""}
          </div>
          <div class="media-card-foot">
            <div class="media-card-title">${escapeHtml(item.title)}</div>
            <div class="media-card-meta">
              <span>${escapeHtml(item.album)}</span>
              <span>${escapeHtml(sizeText)}</span>
            </div>
          </div>
        </article>
      `;
    })
    .join("");
}

const lightbox = createLightbox({
  getPhotos: getVisiblePhotosForLightbox,
  isAdmin: () => state.isAdmin,
  onEdit: (item) => openEditModal(item),
  onToggleVisibility: (item) => {
    requireAdmin(() => void toggleMediaVisibility(item));
  },
  onDelete: (item) => {
    requireAdmin(() => void deleteMediaItem(item));
  },
});

function openVideoModal(item: GalleryDisplayItem): void {
  const modal = optById("videoModal");
  const player = optById<HTMLVideoElement>("activePlayer");
  const titleEl = optById("videoModalTitle");
  const metaEl = optById("videoModalMeta");
  const dlBtn = optById<HTMLAnchorElement>("videoDownloadBtn");
  const editBtn = optById<HTMLButtonElement>("videoEditBtn");
  const visBtn = optById<HTMLButtonElement>("videoVisBtn");
  const delBtn = optById<HTMLButtonElement>("videoDeleteBtn");
  if (!modal || !player || !titleEl || !metaEl || !dlBtn) return;

  state.activeVideoItem = item;
  titleEl.textContent = item.title;
  const parts: string[] = [item.album];
  if (item.duration > 0) parts.push(`时长 ${formatDuration(item.duration)}`);
  if (item.fileSize > 0) parts.push(`体积 ${formatFileSize(item.fileSize)}`);
  if (item.visibility === "private") parts.push("私密");
  metaEl.textContent = parts.join(" · ");

  player.poster = item.thumbUrl || "";
  player.src = item.fullUrl;
  player.load();
  dlBtn.href = item.downloadUrl;
  dlBtn.download = item.title;

  const isCloud = item.source === "cloud";
  if (editBtn) editBtn.hidden = !(isCloud && state.isAdmin);
  if (visBtn) {
    visBtn.hidden = !(isCloud && state.isAdmin);
    visBtn.textContent = item.visibility === "private" ? "设为公开" : "设为私密";
  }
  if (delBtn) delBtn.hidden = !isCloud;

  modal.classList.add("active");
  document.body.style.overflow = "hidden";
  player.play().catch(() => undefined);
}

function closeVideoModal(): void {
  const modal = optById("videoModal");
  const player = optById<HTMLVideoElement>("activePlayer");
  if (!modal || !player) return;
  modal.classList.remove("active");
  player.pause();
  player.src = "";
  state.activeVideoItem = null;
  document.body.style.overflow = "";
}

async function fetchMediaList(silent = false): Promise<boolean> {
  try {
    const resp = await fetch("/api/media", {
      headers: getAuthHeaders(),
      cache: "no-store",
    });
    const data = (await resp.json()) as MediaListResponse;
    if (!resp.ok || data.status !== "ok") {
      if (!silent) showToast(data.message || "云端媒体库同步失败");
      return false;
    }

    state.cloudItems = data.items || [];
    state.stats = data.stats;
    state.isAdmin = Boolean(data.isAdmin);
    if (!state.isAdmin && state.adminPassword) {
      state.adminPassword = "";
      try {
        window.sessionStorage.removeItem(ADMIN_PWD_SESSION_KEY);
      } catch {
        // ignore
      }
    }
    syncAdminUI();
    renderStatsAndAlbums();
    renderGrid();
    if (lightbox.isOpen()) lightbox.refresh();
    return true;
  } catch {
    if (!silent) showToast("网络异常，暂时仅展示内置航拍相册");
    return false;
  }
}

function requireAdmin(action: () => void): void {
  if (state.isAdmin) {
    action();
    return;
  }
  state.pendingAdminAction = action;
  const pwdInput = optById<HTMLInputElement>("galAdminPwdInput");
  if (pwdInput) pwdInput.value = "";
  openModal("galAdminModal");
  window.setTimeout(() => pwdInput?.focus(), 40);
}

function xhrUpload(
  url: string,
  body: Blob,
  headers: Record<string, string>,
  onProgress: (loaded: number, total: number) => void,
): Promise<{ status: number; text: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url, true);
    for (const [k, v] of Object.entries(headers)) {
      xhr.setRequestHeader(k, v);
    }
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded, e.total);
    };
    xhr.onload = () => resolve({ status: xhr.status, text: xhr.responseText || "" });
    xhr.onerror = () => reject(new Error("网络中断"));
    xhr.send(body);
  });
}

async function uploadMediaThumb(mediaId: string, thumbBlob: Blob | null): Promise<void> {
  if (!thumbBlob || thumbBlob.size === 0 || thumbBlob.size > 512 * 1024) return;
  try {
    await fetch(`/api/media?action=thumb&id=${encodeURIComponent(mediaId)}`, {
      method: "POST",
      headers: {
        "Content-Type": thumbBlob.type || "image/webp",
        ...getAuthHeaders(),
      },
      body: thumbBlob,
    });
  } catch {
    // non-fatal: original file still accessible
  }
}

async function uploadSingleMediaFile(
  file: File,
  opts: { album: string; visibility: MediaVisibility; description: string },
): Promise<void> {
  const kind = detectMediaKind(file);
  if (!kind) {
    showToast(`跳过不支持的文件「${file.name}」`);
    return;
  }

  const tier = selectMediaTier(file.size);
  const task: QueueTask = {
    id: `mq_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    name: file.name,
    tierLabel: tier === "cf_d1" ? "CF 极速" : tier === "gh_single" ? "GitHub 直传" : "GitHub 分片",
    progress: 0,
    status: "uploading",
    detail: kind === "photo" ? "生成缩略图..." : "截取首帧封面...",
  };
  state.queue.unshift(task);
  renderQueue();

  try {
    let thumbBlob: Blob | null = null;
    let width = 0;
    let height = 0;
    let duration = 0;

    if (kind === "photo") {
      const thumbRes = await generateImageThumbnail(file);
      thumbBlob = thumbRes.blob;
      width = thumbRes.width;
      height = thumbRes.height;
    } else {
      const posterRes = await captureVideoPoster(file);
      thumbBlob = posterRes.blob;
      width = posterRes.width;
      height = posterRes.height;
      duration = posterRes.duration;
    }

    const title = file.name.replace(/\.[^/.]+$/, "") || file.name;
    const mimeType = file.type || (kind === "video" ? "video/mp4" : "image/jpeg");

    let createdId = "";

    if (tier === "cf_d1" || tier === "gh_single") {
      const res = await xhrUpload(
        "/api/media?action=upload",
        file,
        {
          ...getAuthHeaders(),
          "Content-Type": mimeType,
          "X-File-Name": encodeURIComponent(file.name),
          "X-Title": encodeURIComponent(title),
          "X-Media-Kind": kind,
          "X-Media-Album": encodeURIComponent(opts.album),
          "X-Media-Visibility": opts.visibility,
          "X-Media-Desc": encodeURIComponent(opts.description),
          "X-Media-Mime": encodeURIComponent(mimeType),
          "X-Media-Width": String(width),
          "X-Media-Height": String(height),
          "X-Duration": String(duration),
          "X-Media-Size": String(file.size),
        },
        (loaded, total) => {
          const pct = Math.min(97, Math.round((loaded / Math.max(1, total)) * 100));
          task.progress = pct;
          task.detail = `${pct}%`;
          renderQueue();
        },
      );

      const parsed = JSON.parse(res.text || "{}") as MediaUploadResponse;
      if (res.status < 200 || res.status >= 300 || parsed.status !== "ok" || !parsed.item) {
        throw new Error(parsed.error || parsed.message || `上传失败 (${res.status})`);
      }
      createdId = parsed.item.id;
    } else {
      const totalChunks = Math.ceil(file.size / MEDIA_GH_CHUNK_SIZE);
      const uploadedChunks: PanChunkMeta[] = [];

      for (let idx = 0; idx < totalChunks; idx++) {
        const start = idx * MEDIA_GH_CHUNK_SIZE;
        const end = Math.min(file.size, start + MEDIA_GH_CHUNK_SIZE);
        const blob = file.slice(start, end);

        const res = await xhrUpload(
          `/api/media?action=chunk&index=${idx}`,
          blob,
          {
            ...getAuthHeaders(),
            "Content-Type": "application/octet-stream",
            "X-File-Name": encodeURIComponent(file.name),
            "X-Media-Visibility": opts.visibility,
          },
          (loaded, total) => {
            const overall = Math.min(
              95,
              Math.round(((idx + loaded / Math.max(1, total)) / totalChunks) * 100),
            );
            task.progress = overall;
            task.detail = `分片 ${idx + 1}/${totalChunks} · ${overall}%`;
            renderQueue();
          },
        );

        const parsed = JSON.parse(res.text || "{}") as PanChunkUploadResponse;
        if (res.status < 200 || res.status >= 300 || parsed.status !== "ok" || !parsed.chunk) {
          throw new Error(parsed.error || `分片 ${idx + 1} 上传失败`);
        }
        uploadedChunks.push(parsed.chunk);
      }

      const commitResp = await fetch("/api/media?action=commit_chunks", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
        body: JSON.stringify({
          kind,
          title,
          album: opts.album,
          description: opts.description,
          visibility: opts.visibility,
          mime_type: mimeType,
          file_size: file.size,
          width,
          height,
          duration,
          chunks: uploadedChunks,
        }),
      });
      const commitData = (await commitResp.json()) as MediaUploadResponse;
      if (!commitResp.ok || commitData.status !== "ok" || !commitData.item) {
        throw new Error(commitData.error || "分片索引保存失败");
      }
      createdId = commitData.item.id;
    }

    if (createdId && thumbBlob) {
      task.progress = 98;
      task.detail = "保存封面缩略图...";
      renderQueue();
      await uploadMediaThumb(createdId, thumbBlob);
    }

    task.progress = 100;
    task.status = "done";
    task.detail = "已上架画廊";
    renderQueue();
    await fetchMediaList(true);
  } catch (err) {
    task.status = "error";
    task.detail = err instanceof Error ? err.message : "上传失败";
    renderQueue();
    showToast(`「${file.name}」${task.detail}`);
  }
}

async function runUploadQueue(
  files: File[],
  opts: { album: string; visibility: MediaVisibility; description: string },
): Promise<void> {
  for (const file of files) {
    await uploadSingleMediaFile(file, opts);
  }
}

function setPendingUploadFiles(fileList: FileList | File[]): void {
  const valid = Array.from(fileList).filter((f) => detectMediaKind(f) !== null);
  state.pendingFiles = valid;
  const label = optById("uploadSelectLabel");
  const submitBtn = optById<HTMLButtonElement>("uploadSubmitBtn");
  if (label) {
    label.textContent =
      valid.length > 0
        ? `已选择 ${valid.length} 个媒体文件（${valid
            .map((f) => f.name)
            .slice(0, 2)
            .join("、")}${valid.length > 2 ? " 等" : ""}）`
        : "点击选择照片或视频（支持多选 / 拖拽）";
  }
  if (submitBtn) submitBtn.disabled = valid.length === 0;
}

function openEditModal(item: GalleryDisplayItem): void {
  const idEl = optById<HTMLInputElement>("editMediaId");
  const titleEl = optById<HTMLInputElement>("editMediaTitle");
  const albumEl = optById<HTMLInputElement>("editMediaAlbum");
  const visEl = optById<HTMLSelectElement>("editMediaVis");
  const descEl = optById<HTMLInputElement>("editMediaDesc");
  if (idEl) idEl.value = item.id;
  if (titleEl) titleEl.value = item.title;
  if (albumEl) albumEl.value = item.album;
  if (visEl) visEl.value = item.visibility;
  if (descEl) descEl.value = item.description || "";
  openModal("galEditModal");
}

async function toggleMediaVisibility(item: GalleryDisplayItem): Promise<void> {
  const nextVis: MediaVisibility = item.visibility === "private" ? "public" : "private";
  try {
    const resp = await fetch("/api/media", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      body: JSON.stringify({ id: item.id, visibility: nextVis }),
    });
    const data = (await resp.json()) as MediaUploadResponse;
    if (!resp.ok || data.status !== "ok") {
      showToast(data.error || "切换失败");
      return;
    }
    showToast(
      nextVis === "private" ? `已将「${item.title}」设为私密` : `已将「${item.title}」设为公开`,
    );
    await fetchMediaList(true);
    if (state.activeVideoItem?.id === item.id) {
      const refreshed = buildCombinedItems().find((i) => i.id === item.id);
      if (refreshed) openVideoModal(refreshed);
    }
  } catch {
    showToast("网络错误，切换失败");
  }
}

async function deleteMediaItem(item: GalleryDisplayItem): Promise<void> {
  if (!window.confirm(`确定永久删除「${item.title}」吗？此操作不可撤销。`)) return;
  try {
    const resp = await fetch(`/api/media?id=${encodeURIComponent(item.id)}`, {
      method: "DELETE",
      headers: getAuthHeaders(),
    });
    const data = (await resp.json()) as { status?: string; error?: string };
    if (!resp.ok || data.status !== "ok") {
      showToast(data.error || "删除失败");
      return;
    }
    showToast(`已删除「${item.title}」`);
    if (lightbox.isOpen()) lightbox.close();
    if (state.activeVideoItem?.id === item.id) closeVideoModal();
    await fetchMediaList(true);
  } catch {
    showToast("网络错误，删除失败");
  }
}

function bindEvents(): void {
  // Type tabs
  const kindSwitch = optById("galKindSwitch");
  kindSwitch?.addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-kind]");
    const kind = btn?.dataset.kind as GalleryKindFilter | undefined;
    if (!kind) return;
    state.kind = kind;
    for (const item of kindSwitch.querySelectorAll<HTMLButtonElement>("[data-kind]")) {
      item.classList.toggle("active", item.dataset.kind === kind);
    }
    renderGrid();
  });

  // Visibility filter
  const visSwitch = optById("galVisSwitch");
  visSwitch?.addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-vis]");
    const vis = btn?.dataset.vis as GalleryVisibilityFilter | undefined;
    if (!vis) return;
    state.visibility = vis;
    for (const item of visSwitch.querySelectorAll<HTMLButtonElement>("[data-vis]")) {
      item.classList.toggle("active", item.dataset.vis === vis);
    }
    renderGrid();
  });

  // Album chips
  optById("galAlbumChips")?.addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-album]");
    const album = btn?.dataset.album;
    if (!album) return;
    state.album = album;
    renderStatsAndAlbums();
    renderGrid();
  });

  // Search
  const searchInput = optById<HTMLInputElement>("galSearchInput");
  const searchClear = optById("galSearchClear");
  searchInput?.addEventListener("input", () => {
    state.query = searchInput.value;
    if (searchClear) searchClear.hidden = !state.query;
    renderGrid();
  });
  searchClear?.addEventListener("click", () => {
    state.query = "";
    if (searchInput) searchInput.value = "";
    searchClear.hidden = true;
    renderGrid();
  });

  // Grid click -> Lightbox or Video modal
  const grid = optById("mediaGrid");
  const handleCardActivate = (card: HTMLElement | null) => {
    const id = card?.dataset.mediaId;
    if (!id) return;
    const combined = buildCombinedItems();
    const target = combined.find((i) => i.id === id);
    if (!target) return;
    if (target.kind === "video") {
      openVideoModal(target);
    } else {
      const photos = getVisiblePhotosForLightbox();
      const idx = photos.findIndex((p) => p.id === target.id);
      lightbox.open(Math.max(0, idx));
    }
  };
  grid?.addEventListener("click", (e) => {
    handleCardActivate((e.target as HTMLElement).closest<HTMLElement>(".media-card"));
  });
  grid?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      const card = (e.target as HTMLElement).closest<HTMLElement>(".media-card");
      if (card) {
        e.preventDefault();
        handleCardActivate(card);
      }
    }
  });

  // Upload modal & file picker
  const fileInput = optById<HTMLInputElement>("galFileInput");
  optById("btnOpenUploadModal")?.addEventListener("click", () => {
    setPendingUploadFiles([]);
    openModal("uploadModal");
  });
  optById("uploadDropArea")?.addEventListener("click", () => fileInput?.click());
  optById("uploadDropArea")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      fileInput?.click();
    }
  });
  fileInput?.addEventListener("change", () => {
    if (fileInput.files) setPendingUploadFiles(fileInput.files);
  });

  optById<HTMLFormElement>("uploadForm")?.addEventListener("submit", (e) => {
    e.preventDefault();
    if (state.pendingFiles.length === 0) return;
    const files = [...state.pendingFiles];
    const album = (optById<HTMLInputElement>("uploadAlbumInput")?.value || "").trim() || "默认相册";
    const vis = (
      state.isAdmin ? optById<HTMLSelectElement>("uploadVisSelect")?.value || "public" : "public"
    ) as MediaVisibility;
    const desc = (optById<HTMLInputElement>("uploadDescInput")?.value || "").trim();

    closeModal("uploadModal");
    if (fileInput) fileInput.value = "";
    setPendingUploadFiles([]);
    void runUploadQueue(files, { album, visibility: vis, description: desc });
  });

  // Full-page drag & drop instant upload
  let dragDepth = 0;
  const dragOverlay = optById("galDragOverlay");
  window.addEventListener("dragenter", (e) => {
    if (!e.dataTransfer?.types.includes("Files")) return;
    e.preventDefault();
    dragDepth += 1;
    if (dragOverlay) dragOverlay.hidden = false;
  });
  window.addEventListener("dragover", (e) => {
    if (!e.dataTransfer?.types.includes("Files")) return;
    e.preventDefault();
  });
  window.addEventListener("dragleave", () => {
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0 && dragOverlay) dragOverlay.hidden = true;
  });
  window.addEventListener("drop", (e) => {
    e.preventDefault();
    dragDepth = 0;
    if (dragOverlay) dragOverlay.hidden = true;
    const dropped = Array.from(e.dataTransfer?.files || []).filter(
      (f) => detectMediaKind(f) !== null,
    );
    if (dropped.length === 0) return;
    const album =
      state.album !== "all" && state.album !== AERIAL_ALBUM_NAME ? state.album : "日常摄影";
    const vis = (
      state.isAdmin ? optById<HTMLSelectElement>("uploadVisSelect")?.value || "public" : "public"
    ) as MediaVisibility;
    void runUploadQueue(dropped, { album, visibility: vis, description: "" });
  });

  optById("btnGalClearQueue")?.addEventListener("click", () => {
    state.queue = state.queue.filter((t) => t.status === "uploading" || t.status === "pending");
    renderQueue();
  });

  // Admin unlock / lock
  optById("btnGalAdmin")?.addEventListener("click", () => {
    if (state.isAdmin) {
      state.isAdmin = false;
      state.adminPassword = "";
      try {
        window.sessionStorage.removeItem(ADMIN_PWD_SESSION_KEY);
      } catch {
        // ignore
      }
      showToast("已锁定私密空间");
      void fetchMediaList(true);
      return;
    }
    requireAdmin(() => showToast("管理权限已解锁"));
  });

  optById<HTMLFormElement>("galAdminForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const pwdInput = optById<HTMLInputElement>("galAdminPwdInput");
    const submitBtn = optById<HTMLButtonElement>("galAdminSubmitBtn");
    const pwd = (pwdInput?.value || "").trim();
    if (!pwd) {
      showToast("请输入管理密码");
      return;
    }
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = "验证中...";
    }
    state.adminPassword = pwd;
    await fetchMediaList(true);
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = "解锁";
    }
    if (state.isAdmin) {
      try {
        window.sessionStorage.setItem(ADMIN_PWD_SESSION_KEY, pwd);
      } catch {
        // ignore
      }
      closeModal("galAdminModal");
      const pending = state.pendingAdminAction;
      state.pendingAdminAction = null;
      if (pending) pending();
      else showToast("已解锁私密空间与媒体管理");
    } else {
      showToast("管理密码错误");
      if (pwdInput) {
        pwdInput.value = "";
        pwdInput.focus();
      }
    }
  });

  // Edit form
  optById<HTMLFormElement>("galEditForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const id = optById<HTMLInputElement>("editMediaId")?.value || "";
    const title = (optById<HTMLInputElement>("editMediaTitle")?.value || "").trim();
    const album = (optById<HTMLInputElement>("editMediaAlbum")?.value || "").trim() || "默认相册";
    const visibility = (optById<HTMLSelectElement>("editMediaVis")?.value ||
      "public") as MediaVisibility;
    const description = (optById<HTMLInputElement>("editMediaDesc")?.value || "").trim();
    const submitBtn = optById<HTMLButtonElement>("editMediaSubmitBtn");

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = "保存中...";
    }
    try {
      const resp = await fetch("/api/media", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ id, title, album, visibility, description }),
      });
      const data = (await resp.json()) as MediaUploadResponse;
      if (!resp.ok || data.status !== "ok") {
        showToast(data.error || "保存失败");
      } else {
        closeModal("galEditModal");
        showToast("已保存修改");
        await fetchMediaList(true);
        if (state.activeVideoItem?.id === id) {
          const refreshed = buildCombinedItems().find((i) => i.id === id);
          if (refreshed) openVideoModal(refreshed);
        }
      }
    } catch {
      showToast("网络错误，保存失败");
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = "保存修改";
      }
    }
  });

  // Video modal actions
  const videoModal = optById("videoModal");
  videoModal?.addEventListener("click", (e) => {
    if (e.target === videoModal) closeVideoModal();
  });
  videoModal
    ?.querySelector(".video-modal-card")
    ?.addEventListener("click", (e) => e.stopPropagation());
  videoModal?.querySelector(".video-modal-close")?.addEventListener("click", closeVideoModal);
  optById("videoEditBtn")?.addEventListener("click", () => {
    if (state.activeVideoItem) openEditModal(state.activeVideoItem);
  });
  optById("videoVisBtn")?.addEventListener("click", () => {
    const item = state.activeVideoItem;
    if (item) requireAdmin(() => void toggleMediaVisibility(item));
  });
  optById("videoDeleteBtn")?.addEventListener("click", () => {
    const item = state.activeVideoItem;
    if (item) requireAdmin(() => void deleteMediaItem(item));
  });

  // Modals close
  for (const closeBtn of document.querySelectorAll<HTMLElement>("[data-close-modal]")) {
    closeBtn.addEventListener("click", () => {
      const targetId = closeBtn.dataset.closeModal;
      if (targetId) closeModal(targetId);
    });
  }
  for (const backdrop of document.querySelectorAll<HTMLElement>(".gal-modal-backdrop")) {
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) closeModal(backdrop.id);
    });
  }
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (videoModal?.classList.contains("active")) {
      closeVideoModal();
      return;
    }
    for (const id of ["galEditModal", "galAdminModal", "uploadModal"]) {
      const el = optById(id);
      if (el && !el.hidden) closeModal(id);
    }
  });
}

bindEvents();
renderStatsAndAlbums();
renderGrid();
void fetchMediaList(true);

if (new URLSearchParams(window.location.search).get("upload") === "1") {
  openModal("uploadModal");
}

fetch(`${IMAGE_CDN_BASE}/images.json`)
  .then((res) => (res.ok ? (res.json() as Promise<unknown>) : null))
  .then((cloudImages) => {
    if (Array.isArray(cloudImages) && cloudImages.length > 0) {
      const valid = cloudImages.filter((item): item is string => typeof item === "string");
      if (
        valid.length > 0 &&
        (valid.length !== state.staticImages.length || valid[0] !== state.staticImages[0])
      ) {
        state.staticImages = valid;
        renderStatsAndAlbums();
        renderGrid();
      }
    }
  })
  .catch(() => {
    // Keep embedded fallback list
  });
