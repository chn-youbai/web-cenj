import { postJson } from "@/core/api";
import { getStorageItem, removeStorageItem, setStorageItem } from "@/core/storage";

const TAKEOUT_AUTH_KEY = "takeout_auth_token_v1";
const TAKEOUT_PWD_KEY = "takeout_custom_password_v1";
const AUTH_EXPIRE_MS = 30 * 24 * 60 * 60 * 1000;

function isTakeoutAuthorized(): boolean {
  let token: string | null = getStorageItem(TAKEOUT_AUTH_KEY);
  if (!token) {
    try {
      token = window.sessionStorage.getItem(TAKEOUT_AUTH_KEY);
    } catch {
      token = null;
    }
  }
  if (!token) return false;
  try {
    const data = JSON.parse(token) as { time?: number };
    if (typeof data.time === "number" && Date.now() - data.time < AUTH_EXPIRE_MS) {
      return true;
    }
  } catch {
    // malformed token
  }
  removeStorageItem(TAKEOUT_AUTH_KEY);
  try {
    window.sessionStorage.removeItem(TAKEOUT_AUTH_KEY);
  } catch {
    // ignore
  }
  return false;
}

export function initTakeoutAuthModal(): void {
  const takeoutBtn = document.getElementById("takeoutBtn");
  const modal = document.getElementById("authModalBackdrop");
  const input = document.getElementById("takeoutAuthInput") as HTMLInputElement | null;
  const errEl = document.getElementById("authErrorMsg");
  const rememberCheck = document.getElementById("authRememberCheck") as HTMLInputElement | null;
  const cancelBtn = document.getElementById("authCancelBtn");
  const submitBtn = document.getElementById("authSubmitBtn") as HTMLButtonElement | null;

  if (!takeoutBtn || !modal) return;

  function openModal(initialErr = ""): void {
    if (errEl) {
      errEl.style.color = "#d70015";
      errEl.textContent = initialErr;
    }
    if (input) input.value = "";
    modal?.classList.add("show");
    window.setTimeout(() => input?.focus(), 150);
  }

  function closeModal(): void {
    modal?.classList.remove("show");
  }

  function grantAccess(): void {
    const payload = JSON.stringify({ time: Date.now() });
    if (rememberCheck?.checked) {
      setStorageItem(TAKEOUT_AUTH_KEY, payload);
    } else {
      try {
        window.sessionStorage.setItem(TAKEOUT_AUTH_KEY, payload);
      } catch {
        // ignore
      }
    }
    if (errEl) {
      errEl.style.color = "#248a3d";
      errEl.textContent = "验证成功，正在进入...";
    }
    window.setTimeout(() => {
      window.location.href = "./takeout.html";
    }, 250);
  }

  async function submitAuth(): Promise<void> {
    const pwd = input?.value.trim() || "";
    if (!pwd) {
      if (errEl) {
        errEl.style.color = "#d70015";
        errEl.textContent = "请输入访问密码";
      }
      return;
    }

    const customLocalPwd = getStorageItem(TAKEOUT_PWD_KEY);
    if (customLocalPwd) {
      if (pwd === customLocalPwd) {
        grantAccess();
      } else {
        if (errEl) {
          errEl.style.color = "#d70015";
          errEl.textContent = "密码错误，请重新输入";
        }
        input?.select();
      }
      return;
    }

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = "验证中...";
    }
    try {
      const resp = await postJson<{ ok?: boolean }>("/api/auth", { password: pwd });
      if (resp.ok) {
        grantAccess();
      } else {
        if (errEl) {
          errEl.style.color = "#d70015";
          errEl.textContent = "密码错误，请重新输入";
        }
        input?.select();
      }
    } catch (err) {
      if (errEl) {
        errEl.style.color = "#d70015";
        errEl.textContent = err instanceof Error ? err.message : "密码错误或网络异常";
      }
      input?.select();
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = "解锁";
      }
    }
  }

  takeoutBtn.addEventListener("click", () => {
    if (isTakeoutAuthorized()) {
      window.location.href = "./takeout.html";
      return;
    }
    openModal();
  });

  cancelBtn?.addEventListener("click", closeModal);
  submitBtn?.addEventListener("click", () => {
    void submitAuth();
  });

  input?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      void submitAuth();
    }
  });

  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeModal();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeModal();
  });

  try {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get("need_auth") === "1") {
      openModal("请先输入访问密码解锁进入");
    }
  } catch {
    // ignore
  }
}
