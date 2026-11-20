import "@/core/fonts";
import { initAppShell } from "@/core/shell";
import { initAlmanacPage } from "./almanac";
import { initLikesWidget } from "./likes";

initAppShell({ activePage: "index" });
initAlmanacPage();
initLikesWidget();

function syncLikeButtonSlot(): void {
  const likeBtn = document.getElementById("likeBtn");
  const mobileRight = document.querySelector("#mobileTopBar .mobile-topbar-right");
  const desktopActions = document.querySelector(".workspace-topbar .topbar-actions");
  if (!likeBtn || !mobileRight || !desktopActions) return;

  if (window.matchMedia("(max-width: 919px)").matches) {
    if (likeBtn.parentElement !== mobileRight) {
      mobileRight.prepend(likeBtn);
    }
  } else if (likeBtn.parentElement !== desktopActions) {
    desktopActions.append(likeBtn);
  }
}

syncLikeButtonSlot();
window.matchMedia("(max-width: 919px)").addEventListener("change", syncLikeButtonSlot);
