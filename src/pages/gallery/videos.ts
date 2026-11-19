import { escapeHtml } from "@/core/dom";
import type { VideoItem, VideosListResponse } from "@shared/types";

export function formatDuration(sec: number): string {
  const sTotal = Math.round(sec || 0);
  const m = Math.floor(sTotal / 60);
  const s = sTotal % 60;
  return `${m < 10 ? "0" : ""}${m}:${s < 10 ? "0" : ""}${s}`;
}

export function formatBytes(bytes: number): string {
  if (!bytes) return "未知大小";
  const mb = bytes / (1024 * 1024);
  if (mb >= 1000) return `${(mb / 1024).toFixed(2)} GB`;
  return `${mb.toFixed(1)} MB`;
}

export interface VideosController {
  fetchVideos(): Promise<void>;
  renderVideos(): void;
  hasVideos(): boolean;
  closeModal(): void;
}

export function createVideosController(isVideoCategoryActive: () => boolean): VideosController {
  const vGrid = document.getElementById("videoGrid");
  const vCountEl = document.getElementById("videoCount");
  const videoModal = document.getElementById("videoModal");
  const videoModalCard = videoModal?.querySelector(".video-modal-card");
  const videoModalClose = videoModal?.querySelector(".video-modal-close");
  const activePlayer = document.getElementById("activePlayer") as HTMLVideoElement | null;
  const videoModalTitle = document.getElementById("videoModalTitle");
  const videoModalMeta = document.getElementById("videoModalMeta");
  const videoDownloadBtn = document.getElementById("videoDownloadBtn") as HTMLAnchorElement | null;

  let loadedVideos: VideoItem[] = [];

  function openVideoModal(v: VideoItem): void {
    if (!videoModal || !activePlayer || !videoModalTitle || !videoModalMeta || !videoDownloadBtn) {
      return;
    }
    videoModalTitle.textContent = v.title;
    videoModalMeta.textContent = `时长: ${formatDuration(v.duration)} · 体积: ${formatBytes(v.file_size)}`;

    const ext = (v.asset_url || "").toLowerCase().endsWith(".mov") ? "video.mov" : "video.mp4";
    activePlayer.poster = v.poster_url || "";
    activePlayer.src = `/api/video?id=${encodeURIComponent(v.id)}&name=${ext}`;
    activePlayer.load();
    videoDownloadBtn.href = `/api/video?id=${encodeURIComponent(v.id)}&download=1`;

    videoModal.classList.add("active");
    document.body.style.overflow = "hidden";
    activePlayer.play().catch((err) => {
      console.warn("Autoplay prevented, user can tap play:", err);
    });
  }

  function closeModal(): void {
    if (!videoModal || !activePlayer) return;
    videoModal.classList.remove("active");
    activePlayer.pause();
    activePlayer.src = "";
    document.body.style.overflow = "";
  }

  function renderVideos(): void {
    if (!vGrid) return;
    if (loadedVideos.length === 0) {
      vGrid.innerHTML = `
        <div class="video-state">
          <div style="font-size: 2.5rem; line-height: 1;">🎬</div>
          <p style="font-size: 17px; font-weight: 600; color: var(--c-label);">暂无已上架的视频</p>
          <p style="font-size: 14px; color: var(--c-label-2); max-width: 320px;">点击右上角「+ 投递视频」直接从手机相册上传 500MB~2GB 航拍大作</p>
          <a href="./upload.html" class="upload-link-btn" style="margin-top: 4px;">去手机相册上传视频 &rarr;</a>
        </div>
      `;
      return;
    }

    vGrid.innerHTML = "";
    for (const v of loadedVideos) {
      const card = document.createElement("div");
      card.className = "video-item-card";
      card.addEventListener("click", () => openVideoModal(v));

      const durationStr = formatDuration(v.duration);
      const sizeStr = formatBytes(v.file_size);
      const posterSrc = v.poster_url || "./posters/vid_img_0802.jpg";
      const safeTitle = escapeHtml(v.title);

      card.innerHTML = `
        <div class="video-thumb-wrap">
          <img src="${escapeHtml(posterSrc)}" alt="${safeTitle}" loading="lazy">
          <div class="video-play-badge">▶</div>
          <div class="video-duration-pill">${durationStr}</div>
        </div>
        <div class="video-info-box">
          <div class="video-title">${safeTitle}</div>
          <div class="video-meta-row">
            <span>文件: ${sizeStr}</span>
            <span>原画秒播 / 下载</span>
          </div>
        </div>
      `;
      vGrid.appendChild(card);
    }
  }

  async function fetchVideos(): Promise<void> {
    if (vGrid && isVideoCategoryActive()) {
      vGrid.innerHTML =
        '<div class="video-state"><span class="ui-spinner" aria-hidden="true"></span><span>加载视频专区中...</span></div>';
    }

    try {
      const res = await fetch(`/api/videos?t=${Date.now()}`);
      const data = (await res.json()) as VideosListResponse;
      loadedVideos = Array.isArray(data.videos) ? data.videos : [];
      if (vCountEl) vCountEl.textContent = String(loadedVideos.length);
      if (isVideoCategoryActive()) {
        renderVideos();
      }
    } catch {
      if (vGrid && isVideoCategoryActive()) {
        vGrid.innerHTML = '<div class="video-state error">视频加载失败，请刷新重试</div>';
      }
    }
  }

  videoModal?.addEventListener("click", (e) => {
    if (e.target === videoModal) closeModal();
  });
  videoModalCard?.addEventListener("click", (e) => e.stopPropagation());
  videoModalClose?.addEventListener("click", closeModal);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && videoModal?.classList.contains("active")) {
      closeModal();
    }
  });

  return {
    fetchVideos,
    renderVideos,
    hasVideos: () => loadedVideos.length > 0,
    closeModal,
  };
}
