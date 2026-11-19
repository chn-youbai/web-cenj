import { getImageUrl } from "./photos";

export interface LightboxController {
  open(index: number): void;
  close(): void;
  isOpen(): boolean;
}

export function createLightbox(getImages: () => string[]): LightboxController {
  const lightbox = document.getElementById("lightbox");
  const lightboxImg = document.getElementById("lightboxImg") as HTMLImageElement | null;
  const counterEl = document.getElementById("lightboxCounter");
  const closeBtn = lightbox?.querySelector(".close-btn");
  const prevBtn = lightbox?.querySelector(".nav-arrow.prev");
  const nextBtn = lightbox?.querySelector(".nav-arrow.next");

  let currentIndex = 0;
  let touchStartX = 0;
  let touchStartY = 0;

  function updateLightbox(direction = 0): void {
    const images = getImages();
    if (!lightboxImg || !counterEl || images.length === 0) return;

    const targetSrc = getImageUrl(images[currentIndex] || "");
    if (direction !== 0) {
      lightboxImg.style.opacity = "0";
      lightboxImg.style.transform = `translateX(${direction > 0 ? "25px" : "-25px"}) scale(0.96)`;
      window.setTimeout(() => {
        lightboxImg.src = targetSrc;
        counterEl.textContent = `${currentIndex + 1} / ${images.length}`;
        lightboxImg.style.opacity = "1";
        lightboxImg.style.transform = "translateX(0) scale(1)";
      }, 120);
    } else {
      lightboxImg.src = targetSrc;
      counterEl.textContent = `${currentIndex + 1} / ${images.length}`;
      lightboxImg.style.opacity = "1";
      lightboxImg.style.transform = "none";
    }
  }

  function open(index: number): void {
    currentIndex = index;
    updateLightbox(0);
    lightbox?.classList.add("active");
    document.body.style.overflow = "hidden";
  }

  function close(): void {
    lightbox?.classList.remove("active");
    if (lightboxImg) lightboxImg.src = "";
    document.body.style.overflow = "";
  }

  function prev(e?: Event): void {
    e?.stopPropagation();
    const len = getImages().length;
    if (!len) return;
    currentIndex = (currentIndex - 1 + len) % len;
    updateLightbox(-1);
  }

  function next(e?: Event): void {
    e?.stopPropagation();
    const len = getImages().length;
    if (!len) return;
    currentIndex = (currentIndex + 1) % len;
    updateLightbox(1);
  }

  lightbox?.addEventListener("click", (e) => {
    if (e.target === lightbox) close();
  });
  closeBtn?.addEventListener("click", () => close());
  prevBtn?.addEventListener("click", (e) => prev(e));
  nextBtn?.addEventListener("click", (e) => next(e));

  lightbox?.addEventListener(
    "touchstart",
    (e) => {
      const touch = e.changedTouches[0];
      if (!touch) return;
      touchStartX = touch.screenX;
      touchStartY = touch.screenY;
    },
    { passive: true },
  );

  lightbox?.addEventListener(
    "touchend",
    (e) => {
      const touch = e.changedTouches[0];
      if (!touch) return;
      const diffX = touch.screenX - touchStartX;
      const diffY = touch.screenY - touchStartY;
      if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 40) {
        if (diffX < 0) next();
        else prev();
      }
    },
    { passive: true },
  );

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
  };
}
