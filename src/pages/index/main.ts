import "@/core/fonts";
import { initThemeToggle } from "@/core/theme";
import { initTakeoutAuthModal } from "./auth-modal";
import { initSecretTriggers } from "./easter-eggs";
import { initLikesWidget } from "./likes";

initThemeToggle();
initLikesWidget();
initTakeoutAuthModal();
initSecretTriggers();
