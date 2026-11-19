import { postJson, requestJson } from "@/core/api";
import { getStorageItem, removeStorageItem, setStorageItem } from "@/core/storage";
import type { ClashStatusResponse } from "@shared/types";

const AUTH_KEY = "clash_auth_token_v1";
const PWD_STORAGE_KEY = "clash_custom_password_v1";
const AUTH_EXPIRE_MS = 30 * 24 * 60 * 60 * 1000;

export function getStoredPassword(): string {
  const localPwd = getStorageItem(PWD_STORAGE_KEY);
  if (localPwd) return localPwd;
  try {
    return window.sessionStorage.getItem(PWD_STORAGE_KEY) || "";
  } catch {
    return "";
  }
}

export function clearClashAuth(): void {
  removeStorageItem(AUTH_KEY);
  removeStorageItem(PWD_STORAGE_KEY);
  try {
    window.sessionStorage.removeItem(AUTH_KEY);
    window.sessionStorage.removeItem(PWD_STORAGE_KEY);
  } catch {
    // ignore
  }
}

export function isAuthorized(): boolean {
  if (!getStoredPassword()) return false;

  let token = getStorageItem(AUTH_KEY);
  if (!token) {
    try {
      token = window.sessionStorage.getItem(AUTH_KEY);
    } catch {
      token = null;
    }
  }
  if (!token) return false;

  try {
    const data = JSON.parse(token) as { time?: number };
    if (typeof data.time === "number" && Date.now() - data.time <= AUTH_EXPIRE_MS) {
      return true;
    }
  } catch {
    // invalid token
  }
  clearClashAuth();
  return false;
}

export function saveClashAuth(pwd: string, remember: boolean): void {
  const payload = JSON.stringify({ time: Date.now() });
  if (remember) {
    setStorageItem(AUTH_KEY, payload);
    setStorageItem(PWD_STORAGE_KEY, pwd);
  } else {
    try {
      window.sessionStorage.setItem(AUTH_KEY, payload);
      window.sessionStorage.setItem(PWD_STORAGE_KEY, pwd);
    } catch {
      // ignore
    }
  }
}

export async function submitClashAuth(onUnlocked: () => void): Promise<void> {
  const input = document.getElementById("clashAuthInput") as HTMLInputElement | null;
  const err = document.getElementById("authErrorMsg");
  const rememberCheck = document.getElementById("authRememberCheck") as HTMLInputElement | null;
  const pwd = input?.value.trim() || "";

  if (!pwd) {
    if (err) {
      err.style.color = "#ef4444";
      err.textContent = "请输入访问密码";
    }
    return;
  }

  if (err) {
    err.style.color = "#38bdf8";
    err.textContent = "正在验证中...";
  }

  try {
    const data = await requestJson<ClashStatusResponse>(
      `/api/clash?pwd=${encodeURIComponent(pwd)}`,
    );
    if (data.status === "ok") {
      saveClashAuth(pwd, Boolean(rememberCheck?.checked));
      if (err) {
        err.style.color = "#10b981";
        err.textContent = "验证成功，正在解锁...";
      }
      window.setTimeout(onUnlocked, 200);
    } else {
      if (err) {
        err.style.color = "#ef4444";
        err.textContent = data.message || "密码错误，请重新输入";
      }
      input?.select();
    }
  } catch (e) {
    if (err) {
      err.style.color = "#ef4444";
      err.textContent = e instanceof Error ? e.message : "网络连接异常，请重试";
    }
    input?.select();
  }
}

export function openChangePwdModal(): void {
  const curInput = document.getElementById("pwdCurrentInput") as HTMLInputElement | null;
  const newInput = document.getElementById("pwdNewInput") as HTMLInputElement | null;
  const err = document.getElementById("changePwdErrorMsg");
  if (curInput) curInput.value = "";
  if (newInput) newInput.value = "";
  if (err) err.textContent = "";
  document.getElementById("changePwdModal")?.classList.add("show");
  window.setTimeout(() => curInput?.focus(), 150);
}

export function closeChangePwdModal(): void {
  document.getElementById("changePwdModal")?.classList.remove("show");
}

export async function saveNewPassword(onSuccess: () => void): Promise<void> {
  const curInput = document.getElementById("pwdCurrentInput") as HTMLInputElement | null;
  const newInput = document.getElementById("pwdNewInput") as HTMLInputElement | null;
  const err = document.getElementById("changePwdErrorMsg");

  const cur = curInput?.value.trim() || "";
  const next = newInput?.value.trim() || "";

  if (!cur) {
    if (err) {
      err.style.color = "#ef4444";
      err.textContent = "请输入原访问密码";
    }
    return;
  }
  if (!next || next.length < 4) {
    if (err) {
      err.style.color = "#ef4444";
      err.textContent = "新密码至少需要 4 位字符";
    }
    return;
  }

  if (err) {
    err.style.color = "#38bdf8";
    err.textContent = "正在保存至云端...";
  }

  try {
    const data = await postJson<{ status?: string; message?: string }>("/api/clash", {
      action: "change_password",
      old_pwd: cur,
      new_pwd: next,
    });
    if (data.status === "ok") {
      if (getStorageItem(AUTH_KEY)) {
        setStorageItem(PWD_STORAGE_KEY, next);
      } else {
        try {
          window.sessionStorage.setItem(PWD_STORAGE_KEY, next);
        } catch {
          setStorageItem(PWD_STORAGE_KEY, next);
        }
      }
      closeChangePwdModal();
      window.alert("🎉 密码修改成功！请牢记新密码。");
      onSuccess();
    } else if (err) {
      err.style.color = "#ef4444";
      err.textContent = data.message || "原访问密码错误";
    }
  } catch (e) {
    if (err) {
      err.style.color = "#ef4444";
      err.textContent = e instanceof Error ? e.message : "网络请求失败，请稍后重试";
    }
  }
}
