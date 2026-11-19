function openTarget(path: string): void {
  try {
    const win = window.open(path, "_blank");
    if (!win || win.closed || typeof win.closed === "undefined") {
      window.location.href = path;
    }
  } catch {
    window.location.href = path;
  }
}

function bindFiveClickTrigger(
  elementId: string,
  targetUrl: string,
  scaleStep: number,
  timeoutMs: number,
): void {
  const triggerEl = document.getElementById(elementId);
  if (!triggerEl) return;

  let clickCount = 0;
  let resetTimer: number | undefined;

  triggerEl.addEventListener("click", () => {
    clickCount += 1;
    if (resetTimer !== undefined) window.clearTimeout(resetTimer);

    triggerEl.style.transform = `scale(${1 + clickCount * scaleStep})`;
    window.setTimeout(() => {
      triggerEl.style.transform = "";
    }, 150);

    if (clickCount >= 5) {
      clickCount = 0;
      openTarget(targetUrl);
    } else {
      resetTimer = window.setTimeout(() => {
        clickCount = 0;
      }, timeoutMs);
    }
  });
}

export function initSecretTriggers(): void {
  bindFiveClickTrigger("secretBoardTrigger", "./board.html", 0.06, 1800);
  bindFiveClickTrigger("secretClashTrigger", "./clash.html", 0.08, 1500);
}
