import "@/core/fonts";
import { initAppShell } from "@/core/shell";
import { initTakeoutAuthModal } from "./auth-modal";
import { initPlayground } from "./games";
import { initLikesWidget } from "./likes";
import { initGreetingTitle, initHomeOmnibox } from "./omnibox";

initAppShell({ activePage: "index" });
initGreetingTitle();
initHomeOmnibox();
initPlayground();
initLikesWidget();
initTakeoutAuthModal();
