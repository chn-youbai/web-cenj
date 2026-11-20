import "@/core/fonts";
import { initAppShell } from "@/core/shell";
import { initLikesWidget } from "./likes";
import { initGreetingTitle, initHomeOmnibox } from "./omnibox";

initAppShell({ activePage: "index" });
initGreetingTitle();
initHomeOmnibox();
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
