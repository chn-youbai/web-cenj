import { type GalleryDisplayItem, formatFileSize } from "./utils";

export interface LightboxCallbacks {
  getPhotos: () => GalleryDisplayItem[];
  isAdmin: () => boolean;
  onEdit?: (item: GalleryDisplayItem) => void;
  onToggleVisibility?: (item: GalleryDisplayItem) => void;
  onDelete?: (item: GalleryDisplayItem) => void;
}

export interface LightboxController {
  open(index: number): void;
  close(): void;
  isOpen(): boolean;
  refresh(): void;
}

export function createLightbox(callbacks: LightboxCallbacks): LightboxController {
  const lightbox = document.getElementById("lightbox");
  const contentEl = lightbox?.querySelector<HTMLElement>(".lightbox-content");
  const lightboxImg = document.getElementById("lightboxImg") as HTMLImageElement | null;
  const counterEl = document.getElementById("lightboxCounter");
  const titleEl = document.getElementById("lightboxTitle");
  const metaEl = document.getElementById("lightboxMeta");
  const downloadBtn = document.getElementById("lightboxDownloadBtn") as HTMLAnchorElement | null;
  const editBtn = document.getElementById("lightboxEditBtn") as HTMLButtonElement | null;
  const visBtn = document.getElementById("lightboxVisBtn") as HTMLButtonElement | null;
  const deleteBtn = document.getElementById("lightboxDeleteBtn") as HTMLButtonElement | null;
  const zoomResetBtn = document.getElementById("lightboxZoomBtn") as HTMLButtonElement | null;
  const closeBtn = lightbox?.querySelector(".close-btn");
  const prevBtn = lightbox?.querySelector(".nav-arrow.prev");
  const nextBtn = lightbox?.querySelector(".nav-arrow.next");

  let currentIndex = 0;
  let scale = 1;
  let tx = 0;
  let ty = 0;

  let touchStartX = 0;
  let touchStartY = 0;
  let isPanning = false;
  let panStartX = 0;
  let panStartY = 0;
  let pinchStartDist = 0;
  let pinchStartScale = 1;
  let lastTapTime = 0;

  function applyTransform(animate = false): void {
    if (!lightboxImg) return;
    lightboxImg.style.transition = animate
      ? "transform 0.18s ease, opacity 0.14s ease"
      : "opacity 0.14s ease";
    lightboxImg.style.transform = `translate3d(${tx}px, ${ty}px, 0) scale(${scale})`;
    lightboxImg.style.cursor = scale > 1 ? (isPanning ? "grabbing" : "grab") : "zoom-in";
    if (zoomResetBtn) {
      zoomResetBtn.textContent = `${Math.round(scale * 100)}%`;
      zoomResetBtn.hidden = Math.abs(scale - 1) < 0.05;
    }
  }

  function resetZoom(animate = false): void {
    scale = 1;
    tx = 0;
    ty = 0;
    applyTransform(animate);
  }

  function currentPhoto(): GalleryDisplayItem | undefined {
    return callbacks.getPhotos()[currentIndex];
  }

  function renderMeta(): void {
    const photos = callbacks.getPhotos();
    const item = photos[currentIndex];
    if (!item) return;

    if (counterEl) counterEl.textContent = `${currentIndex + 1} / ${photos.length}`;
    if (titleEl) titleEl.textContent = item.title;

    const metaParts: string[] = [item.album];
    if (item.width > 0 && item.height > 0) metaParts.push(`${item.width}×${item.height}`);
    if (item.fileSize > 0) metaParts.push(formatFileSize(item.fileSize));
    if (item.visibility === "private") metaParts.push("私密");
    if (metaEl) metaEl.textContent = metaParts.join(" · ");

    if (downloadBtn) {
      downloadBtn.href = item.downloadUrl;
      downloadBtn.download = item.title;
    }

    const isCloud = item.source === "cloud";
    const admin = callbacks.isAdmin();
    if (editBtn) editBtn.hidden = !(isCloud && admin);
    if (visBtn) {
      visBtn.hidden = !(isCloud && admin);
      visBtn.textContent = item.visibility === "private" ? "设为公开" : "设为私密";
    }
    if (deleteBtn) deleteBtn.hidden = !isCloud;
  }

  function updateLightbox(direction = 0): void {
    const photos = callbacks.getPhotos();
    if (!lightboxImg || photos.length === 0) return;
    if (currentIndex >= photos.length) currentIndex = Math.max(0, photos.length - 1);
    const item = photos[currentIndex];
    if (!item) return;

    resetZoom(false);
    renderMeta();

    if (direction !== 0) {
      lightboxImg.style.opacity = "0";
      window.setTimeout(() => {
        lightboxImg.src = item.fullUrl;
        lightboxImg.style.opacity = "1";
      }, 100);
    } else {
      lightboxImg.src = item.fullUrl;
      lightboxImg.style.opacity = "1";
    }
  }

  function open(index: number): void {
    currentIndex = Math.max(0, index);
    updateLightbox(0);
    lightbox?.classList.add("active");
    document.body.style.overflow = "hidden";
  }

  function close(): void {
    lightbox?.classList.remove("active");
    if (lightboxImg) lightboxImg.src = "";
    resetZoom(false);
    document.body.style.overflow = "";
  }

  function prev(e?: Event): void {
    e?.stopPropagation();
    const len = callbacks.getPhotos().length;
    if (!len) return;
    currentIndex = (currentIndex - 1 + len) % len;
    updateLightbox(-1);
  }

  function next(e?: Event): void {
    e?.stopPropagation();
    const len = callbacks.getPhotos().length;
    if (!len) return;
    currentIndex = (currentIndex + 1) % len;
    updateLightbox(1);
  }

  lightbox?.addEventListener("click", (e) => {
    if (e.target === lightbox || e.target === contentEl) close();
  });
  closeBtn?.addEventListener("click", () => close());
  prevBtn?.addEventListener("click", (e) => prev(e));
  nextBtn?.addEventListener("click", (e) => next(e));
  zoomResetBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    resetZoom(true);
  });

  // Mouse wheel zoom
  contentEl?.addEventListener(
    "wheel",
    (e) => {
      if (!lightbox?.classList.contains("active")) return;
      e.preventDefault();
      const delta = e.deltaY < 0 ? 1.15 : 0.87;
      const nextScale = Math.min(5, Math.max(1, scale * delta));
      scale = nextScale;
      if (scale <= 1.02) {
        resetZoom(false);
      } else {
        applyTransform(false);
      }
    },
    { passive: false },
  );

  // Double click toggle zoom
  lightboxImg?.addEventListener("dblclick", (e) => {
    e.stopPropagation();
    if (scale > 1.1) {
      resetZoom(true);
    } else {
      scale = 2.2;
      tx = 0;
      ty = 0;
      applyTransform(true);
    }
  });

  // Mouse drag pan when zoomed
  lightboxImg?.addEventListener("mousedown", (e) => {
    if (scale <= 1) return;
    e.preventDefault();
    isPanning = true;
    panStartX = e.clientX - tx;
    panStartY = e.clientY - ty;
    applyTransform(false);
  });
  window.addEventListener("mousemove", (e) => {
    if (!isPanning) return;
    tx = e.clientX - panStartX;
    ty = e.clientY - panStartY;
    applyTransform(false);
  });
  window.addEventListener("mouseup", () => {
    if (!isPanning) return;
    isPanning = false;
    applyTransform(false);
  });

  // Touch pinch zoom, pan when zoomed, or swipe prev/next
  lightbox?.addEventListener(
    "touchstart",
    (e) => {
      if (e.touches.length === 2) {
        const t1 = e.touches[0];
        const t2 = e.touches[1];
        if (t1 && t2) {
          pinchStartDist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
          pinchStartScale = scale;
        }
        return;
      }
      const touch = e.changedTouches[0];
      if (!touch) return;
      touchStartX = touch.screenX;
      touchStartY = touch.screenY;
      if (scale > 1) {
        isPanning = true;
        panStartX = touch.clientX - tx;
        panStartY = touch.clientY - ty;
      }
    },
    { passive: true },
  );

  lightbox?.addEventListener(
    "touchmove",
    (e) => {
      if (e.touches.length === 2 && pinchStartDist > 0) {
        const t1 = e.touches[0];
        const t2 = e.touches[1];
        if (t1 && t2) {
          const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
          scale = Math.min(5, Math.max(1, pinchStartScale * (dist / pinchStartDist)));
          if (scale <= 1.02) {
            tx = 0;
            ty = 0;
          }
          applyTransform(false);
        }
        return;
      }
      if (isPanning && e.touches.length === 1 && scale > 1) {
        const t = e.touches[0];
        if (t) {
          tx = t.clientX - panStartX;
          ty = t.clientY - panStartY;
          applyTransform(false);
        }
      }
    },
    { passive: true },
  );

  lightbox?.addEventListener(
    "touchend",
    (e) => {
      isPanning = false;
      pinchStartDist = 0;
      const touch = e.changedTouches[0];
      if (!touch) return;

      // Double-tap zoom on mobile
      const now = Date.now();
      if (now - lastTapTime < 260 && e.target === lightboxImg) {
        lastTapTime = 0;
        if (scale > 1.1) resetZoom(true);
        else {
          scale = 2.2;
          applyTransform(true);
        }
        return;
      }
      lastTapTime = now;

      if (scale <= 1.05) {
        const diffX = touch.screenX - touchStartX;
        const diffY = touch.screenY - touchStartY;
        if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 45) {
          if (diffX < 0) next();
          else prev();
        }
      }
    },
    { passive: true },
  );

  editBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    const item = currentPhoto();
    if (item && callbacks.onEdit) callbacks.onEdit(item);
  });

  visBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    const item = currentPhoto();
    if (item && callbacks.onToggleVisibility) callbacks.onToggleVisibility(item);
  });

  deleteBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    const item = currentPhoto();
    if (item && callbacks.onDelete) callbacks.onDelete(item);
  });

  document.addEventListener("keydown", (e) => {
    if (!lightbox?.classList.contains("active")) return;
    if (e.key === "ArrowLeft") prev();
    else if (e.key === "ArrowRight") next();
    else if (e.key === "Escape") close();
  });

  return {
    open,
    close,
    isOpen: () => Boolean(lightbox?.classList.contains("active")),
    refresh: () => renderMeta(),
  };
}
