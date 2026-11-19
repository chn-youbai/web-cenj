import "@/core/fonts";
import { initAppShell } from "@/core/shell";
import { initTakeoutAuthModal } from "./auth-modal";
import { initSecretTriggers } from "./easter-eggs";
import { initLikesWidget } from "./likes";
import { initGreetingTitle, initHomeOmnibox } from "./omnibox";

initAppShell({ activePage: "index" });
initGreetingTitle();
initHomeOmnibox();
initLikesWidget();
initTakeoutAuthModal();
initSecretTriggers();
