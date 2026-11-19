import "@/core/fonts";
import { initAppShell } from "@/core/shell";
import { createLightbox } from "./lightbox";
import { EMBEDDED_IMAGES, IMAGE_CDN_BASE, getImageUrl } from "./photos";
import { createVideosController } from "./videos";

initAppShell({ activePage: "gallery" });

type GalleryCategory = "photo" | "video";

let images = [...EMBEDDED_IMAGES];
let currentCategory: GalleryCategory = "photo";

const grid = document.getElementById("galleryGrid");
const videoGrid = document.getElementById("videoGrid");
const photoBtn = document.getElementById("tabPhotoBtn");
const videoBtn = document.getElementById("tabVideoBtn");
const photoCountEl = document.getElementById("photoCount");

const lightbox = createLightbox(() => images);
const videos = createVideosController(() => currentCategory === "video");

function renderGallery(): void {
  if (photoCountEl) photoCountEl.textContent = String(images.length);
  if (!grid) return;

  grid.innerHTML = "";
  images.forEach((imgName, index) => {
    const item = document.createElement("div");
    item.className = "gallery-item";
    item.tabIndex = 0;
    item.setAttribute("role", "button");
    item.setAttribute("aria-label", `查看照片 ${index + 1}`);
    item.addEventListener("click", () => lightbox.open(index));
    item.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        lightbox.open(index);
      }
    });

    const numStr = String(index + 1).padStart(2, "0");
    item.innerHTML = `
      <img src="${getImageUrl(imgName)}" alt="照片 ${index + 1}" loading="lazy">
      <div class="overlay">
        <span>No. ${numStr}</span>
      </div>
    `;
    grid.appendChild(item);
  });
}

function switchCategory(cat: GalleryCategory): void {
  currentCategory = cat;
  if (cat === "photo") {
    photoBtn?.classList.add("active");
    videoBtn?.classList.remove("active");
    if (grid) grid.style.display = "grid";
    if (videoGrid) videoGrid.style.display = "none";
  } else {
    videoBtn?.classList.add("active");
    photoBtn?.classList.remove("active");
    if (grid) grid.style.display = "none";
    if (videoGrid) videoGrid.style.display = "grid";
    if (videos.hasVideos()) {
      videos.renderVideos();
    } else {
      void videos.fetchVideos();
    }
  }
}

photoBtn?.addEventListener("click", () => switchCategory("photo"));
videoBtn?.addEventListener("click", () => switchCategory("video"));

renderGallery();
void videos.fetchVideos();

fetch(`${IMAGE_CDN_BASE}/images.json`)
  .then((res) => (res.ok ? (res.json() as Promise<unknown>) : null))
  .then((cloudImages) => {
    if (Array.isArray(cloudImages) && cloudImages.length > 0) {
      const valid = cloudImages.filter((item): item is string => typeof item === "string");
      if (valid.length > 0 && (valid.length !== images.length || valid[0] !== images[0])) {
        images = valid;
        renderGallery();
      }
    }
  })
  .catch(() => {
    // Keep embedded fallback list
  });
