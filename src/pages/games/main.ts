import "@/core/fonts";
import { initAppShell } from "@/core/shell";
import { initPlayground } from "./games";

initAppShell({ activePage: "games" });
initPlayground();
