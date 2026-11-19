/**
 * 弹窗 Esc 关闭与背景点击关闭辅助器
 */

export function bindModalDismiss(backdropEl: HTMLElement | null, onClose: () => void): () => void {
  if (!backdropEl) return () => {};

  const onBackdropClick = (e: MouseEvent) => {
    if (e.target === backdropEl) {
      onClose();
    }
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      const style = window.getComputedStyle(backdropEl);
      if (style.display !== "none" || backdropEl.classList.contains("active")) {
        onClose();
      }
    }
  };

  backdropEl.addEventListener("click", onBackdropClick);
  document.addEventListener("keydown", onKeyDown);

  return () => {
    backdropEl.removeEventListener("click", onBackdropClick);
    document.removeEventListener("keydown", onKeyDown);
  };
}
