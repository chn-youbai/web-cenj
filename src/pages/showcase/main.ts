import "@/core/fonts";
import { initAppShell } from "@/core/shell";
import "@/styles/showcase.css";
import {
  probeClashBeacon,
  probeDjjcRelay,
  probeDownloadApi,
  probeTakeoutKv,
  probeVideoRange,
  probeVocabDb,
} from "./probes";

const HALL_IDS = ["hall-video", "hall-vocab", "hall-download", "hall-clash", "hall-takeout"];

function scrollToHall(id: string): void {
  const el = document.getElementById(id);
  el?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function updateActiveNav(): void {
  const navItems = document.querySelectorAll(".hall-nav-item");
  let currentId = HALL_IDS[0] ?? "hall-video";

  for (const id of HALL_IDS) {
    const el = document.getElementById(id);
    if (el) {
      const rect = el.getBoundingClientRect();
      if (rect.top <= 180) {
        currentId = id;
      }
    }
  }

  HALL_IDS.forEach((id, index) => {
    navItems[index]?.classList.toggle("active", id === currentId);
  });
}

document.addEventListener("DOMContentLoaded", () => {
  initAppShell({ activePage: "showcase" });
  for (const item of document.querySelectorAll<HTMLElement>(".hall-nav-item[data-hall]")) {
    item.addEventListener("click", () => {
      const hallId = item.dataset.hall;
      if (hallId) scrollToHall(hallId);
    });
  }

  window.addEventListener("scroll", updateActiveNav, { passive: true });

  document.getElementById("btnProbeVideo")?.addEventListener("click", () => void probeVideoRange());
  document.getElementById("btnProbeVocab")?.addEventListener("click", () => void probeVocabDb());
  document
    .getElementById("btnProbeDownload")
    ?.addEventListener("click", () => void probeDownloadApi());
  document.getElementById("btnProbeDjjc")?.addEventListener("click", () => void probeDjjcRelay());
  document
    .getElementById("btnProbeClash")
    ?.addEventListener("click", () => void probeClashBeacon());
  document
    .getElementById("btnProbeTakeout")
    ?.addEventListener("click", () => void probeTakeoutKv());
});
