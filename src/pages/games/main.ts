import "@/core/fonts";
import type { PageId } from "@/core/nav-config";
import { initAppShell } from "@/core/shell";
import { getStorageItem } from "@/core/storage";
import { initPlayground } from "./games";

const queryTab = new URLSearchParams(window.location.search).get("tab");
const savedTab = getStorageItem("cenj_home_game_tab_v1");
const resolvedTab =
  queryTab === "2048" || queryTab === "puzzle" || queryTab === "memory"
    ? queryTab
    : savedTab === "2048" || savedTab === "puzzle" || savedTab === "memory"
      ? savedTab
      : "2048";

initAppShell({ activePage: `game-${resolvedTab}` as PageId });
initPlayground();
