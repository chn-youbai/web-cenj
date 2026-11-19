/**
 * 轻量化全局 / 指定节点 Toast 提示工具
 */

let hideTimer: number | undefined;

export function showToast(
  message: string,
  durationMs = 2600,
  elementOrId: HTMLElement | string = "toast",
): void {
  let toastEl =
    typeof elementOrId === "string" ? document.getElementById(elementOrId) : elementOrId;

  if (!toastEl) {
    toastEl = document.createElement("div");
    toastEl.id = typeof elementOrId === "string" ? elementOrId : "toast";
    toastEl.className = "toast";
    document.body.appendChild(toastEl);
  }

  toastEl.textContent = message;
  toastEl.classList.add("show");

  if (hideTimer !== undefined) {
    window.clearTimeout(hideTimer);
  }
  hideTimer = window.setTimeout(() => {
    toastEl?.classList.remove("show");
  }, durationMs);
}
