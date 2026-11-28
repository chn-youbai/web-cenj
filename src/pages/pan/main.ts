import "@/core/fonts";
import { copyToClipboard, escapeHtml, optById } from "@/core/dom";
import { initAppShell } from "@/core/shell";
import { showToast } from "@/core/toast";
import type {
  PanApiKeyCreateResponse,
  PanApiKeyItem,
  PanApiKeysListResponse,
  PanCategory,
  PanChunkMeta,
  PanChunkUploadResponse,
  PanFileItem,
  PanListResponse,
  PanListStats,
  PanUploadResponse,
  PanVisibility,
} from "@shared/types";
import {
  PAN_CATEGORY_LABELS,
  PAN_GH_CHUNK_SIZE,
  PAN_TIER_LABELS,
  type PanCategoryFilter,
  type PanSortBy,
  type PanUploadTierPreference,
  type PanVisibilityFilter,
  buildGitHubMirrorUrl,
  filterAndSortPanFiles,
  formatFileSize,
  formatRelativeTime,
  getPreviewKind,
  inferPanCategory,
  selectUploadTier,
  validateUploadTierSize,
} from "./utils";

initAppShell({ activePage: "pan" });

const ADMIN_PWD_SESSION_KEY = "cenj_pan_admin_pwd_v1";

interface QueueTask {
  id: string;
  name: string;
  size: number;
  tierLabel: string;
  progress: number;
  status: "pending" | "uploading" | "done" | "error";
  detail: string;
}

const state = {
  files: [] as PanFileItem[],
  stats: {
    total: 0,
    publicCount: 0,
    privateCount: 0,
    totalBytes: 0,
    cfUsedBytes: 0,
  } as PanListStats,
  isAdmin: false,
  adminPassword: "",
  query: "",
  category: "all" as PanCategoryFilter,
  visibility: "all" as PanVisibilityFilter,
  sortBy: "newest" as PanSortBy,
  queue: [] as QueueTask[],
  apiKeys: [] as PanApiKeyItem[],
  apiTab: "docs" as "docs" | "keys",
  pendingAdminAction: null as (() => void) | null,
};

try {
  state.adminPassword = window.sessionStorage.getItem(ADMIN_PWD_SESSION_KEY) || "";
} catch {
  // ignore
}

function getAuthHeaders(): Record<string, string> {
  return state.adminPassword ? { "X-Admin-Password": state.adminPassword } : {};
}

function buildFileUrl(file: PanFileItem, inline = false): string {
  const params = new URLSearchParams({ id: file.id });
  if (inline) params.set("inline", "1");
  if (file.visibility === "private" && state.adminPassword) {
    params.set("pwd", state.adminPassword);
  }
  return `/api/pan-file?${params.toString()}`;
}

function buildFriendlyDirectUrl(file: PanFileItem, download = false): string {
  const base =
    file.direct_url ||
    `/api/pan-raw/${encodeURIComponent(file.id)}/${encodeURIComponent(file.name)}`;
  return download ? `${base}?download=1` : base;
}

function getFileExtBadge(fileName: string): string {
  const clean = fileName.trim();
  const dot = clean.lastIndexOf(".");
  if (dot > 0 && dot < clean.length - 1) {
    return clean.slice(dot + 1, dot + 5).toUpperCase();
  }
  return "FILE";
}

function openModal(id: string): void {
  const el = optById(id);
  if (el) el.hidden = false;
}

function closeModal(id: string): void {
  const el = optById(id);
  if (el) el.hidden = true;
  if (id === "previewModal") {
    const body = optById("previewModalBody");
    if (body) body.innerHTML = "";
  }
}

function syncAdminUI(): void {
  const toggleBtn = optById("btnToggleAdmin");
  const toggleText = optById("btnToggleAdminText");
  const visSwitch = optById("panVisSwitch");
  const uploadAdminOpts = optById("uploadAdminOptions");
  const uploadVisWrap = optById("uploadVisToggleWrap");
  const linkVisField = optById("linkVisField");
  const apiLocked = optById("apiKeysLockedState");
  const apiUnlocked = optById("apiKeysUnlockedWrap");

  if (toggleBtn) toggleBtn.classList.toggle("is-unlocked", state.isAdmin);
  if (toggleText) toggleText.textContent = state.isAdmin ? "已解锁 · 锁定" : "私密解锁";
  if (visSwitch) visSwitch.hidden = !state.isAdmin;
  if (uploadAdminOpts) uploadAdminOpts.hidden = !state.isAdmin;
  if (uploadVisWrap) uploadVisWrap.hidden = !state.isAdmin;
  if (linkVisField) linkVisField.hidden = !state.isAdmin;
  if (apiLocked) apiLocked.hidden = state.isAdmin;
  if (apiUnlocked) apiUnlocked.hidden = !state.isAdmin;

  if (!state.isAdmin) {
    state.visibility = "all";
    state.apiKeys = [];
    const uploadPrivateCheck = optById<HTMLInputElement>("uploadPrivateCheck");
    if (uploadPrivateCheck) uploadPrivateCheck.checked = false;
    const uploadStorageSelect = optById<HTMLSelectElement>("uploadStorageSelect");
    if (uploadStorageSelect) uploadStorageSelect.value = "auto";
  }
}

function renderStatsLine(): void {
  const el = optById("panStatsLine");
  if (!el) return;
  const { total, privateCount, totalBytes, cfUsedBytes } = state.stats;
  const parts = [`共 ${total} 个文件`];
  if (state.isAdmin && privateCount > 0) {
    parts.push(`含 ${privateCount} 个私密`);
  }
  parts.push(`总计 ${formatFileSize(totalBytes)}`);
  parts.push(`CF 极速库已用 ${formatFileSize(cfUsedBytes)} / 5 GB`);
  el.textContent = parts.join(" · ");
}

function renderQueue(): void {
  const wrap = optById("panQueue");
  const list = optById("panQueueList");
  const title = optById("panQueueTitle");
  if (!wrap || !list) return;

  if (state.queue.length === 0) {
    wrap.hidden = true;
    return;
  }
  wrap.hidden = false;
  const uploadingCount = state.queue.filter(
    (t) => t.status === "uploading" || t.status === "pending",
  ).length;
  if (title) {
    title.textContent =
      uploadingCount > 0
        ? `正在上传 (${uploadingCount} 项进行中)`
        : `上传队列 (${state.queue.length})`;
  }

  list.innerHTML = state.queue
    .map(
      (task) => `
      <div class="pan-q-item">
        <div class="pan-q-top">
          <span class="pan-q-name">${escapeHtml(task.name)} · ${escapeHtml(task.tierLabel)}</span>
          <span class="pan-q-status ${task.status === "done" ? "is-done" : task.status === "error" ? "is-error" : ""}">
            ${escapeHtml(task.detail)}
          </span>
        </div>
        <div class="pan-q-track">
          <div class="pan-q-fill ${task.status === "done" ? "is-done" : task.status === "error" ? "is-error" : ""}" style="width:${task.progress}%"></div>
        </div>
      </div>
    `,
    )
    .join("");
}

function renderFileList(): void {
  const listEl = optById("panFileList");
  const emptyEl = optById("panEmptyState");
  const emptyTitle = optById("panEmptyTitle");
  const emptySub = optById("panEmptySub");
  if (!listEl || !emptyEl) return;

  const visible = filterAndSortPanFiles(state.files, {
    query: state.query,
    category: state.category,
    visibility: state.visibility,
    sortBy: state.sortBy,
  });

  if (visible.length === 0) {
    listEl.innerHTML = "";
    emptyEl.hidden = false;
    if (emptyTitle) {
      emptyTitle.textContent =
        state.query || state.category !== "all" ? "没有匹配的文件" : "文件库为空";
    }
    if (emptySub) {
      emptySub.textContent =
        state.query || state.category !== "all"
          ? "尝试清空搜索词或切换分类查看全部资源"
          : "拖拽文件到页面任意位置，或点击右上角「上传文件」开始使用";
    }
    return;
  }

  emptyEl.hidden = true;
  listEl.innerHTML = visible
    .map((file) => {
      const previewKind = getPreviewKind(file.name, file.mime_type, file.size, file.storage_tier);
      const downloadUrl = buildFileUrl(file, false);
      const extBadge = getFileExtBadge(file.name);
      const tierTag = PAN_TIER_LABELS[file.storage_tier] || "云端";
      const isPrivate = file.visibility === "private";
      const sizeText = formatFileSize(file.size);
      const timeText = formatRelativeTime(file.created_at);
      const folderBadge = file.folder_path
        ? `<span class="pan-tag is-folder">/${escapeHtml(file.folder_path)}</span>`
        : "";
      const canDirect =
        Boolean(file.asset_url) &&
        (file.storage_tier === "gh_single" || file.storage_tier === "external_link");
      const mirrorUrl = canDirect ? buildGitHubMirrorUrl(file.asset_url) : "";

      return `
        <article class="pan-row" data-file-id="${escapeHtml(file.id)}">
          <div class="pan-row-main">
            <div class="pan-file-badge cat-${escapeHtml(file.category)}">${escapeHtml(extBadge)}</div>
            <div class="pan-row-info">
              <div class="pan-row-title-line">
                <span class="pan-row-name">${escapeHtml(file.name)}</span>
                ${isPrivate ? '<span class="pan-tag is-private">私密</span>' : ""}
                ${folderBadge}
                <span class="pan-tag ${file.storage_tier === "cf_d1" ? "is-cf" : ""}">${escapeHtml(tierTag)}</span>
                <span class="pan-tag">${escapeHtml(PAN_CATEGORY_LABELS[file.category])}</span>
              </div>
              ${file.note ? `<p class="pan-row-note">${escapeHtml(file.note)}</p>` : ""}
              <div class="pan-row-meta">
                <span>${escapeHtml(sizeText)}</span>
                <span>${escapeHtml(timeText)}</span>
                <span>下载 ${file.downloads} 次</span>
              </div>
            </div>
          </div>

          <div class="pan-row-actions">
            ${previewKind !== "none" ? `<button type="button" class="pan-act-btn" data-act="preview" data-id="${escapeHtml(file.id)}">预览</button>` : ""}
            <a class="pan-act-btn primary" href="${escapeHtml(downloadUrl)}" download="${escapeHtml(file.name)}">下载</a>
            ${
              mirrorUrl
                ? `<a class="pan-act-btn" href="${escapeHtml(mirrorUrl)}" target="_blank" rel="noopener noreferrer" title="国内 GitHub 镜像加速直下（免代理绕开 Cloudflare 国际出口限速）">镜像加速</a>`
                : ""
            }
            ${
              canDirect
                ? `<a class="pan-act-btn" href="${escapeHtml(file.asset_url)}" target="_blank" rel="noopener noreferrer" title="直接访问源地址（开代理时可满速下载）">直连</a>`
                : ""
            }
            ${!isPrivate ? `<button type="button" class="pan-act-btn" data-act="copy" data-id="${escapeHtml(file.id)}">复制链接</button>` : ""}
            ${
              state.isAdmin
                ? `
              <button type="button" class="pan-act-btn" data-act="toggle-vis" data-id="${escapeHtml(file.id)}">${isPrivate ? "设为公开" : "设为私密"}</button>
              <button type="button" class="pan-act-btn" data-act="edit" data-id="${escapeHtml(file.id)}">编辑</button>
            `
                : ""
            }
            <button type="button" class="pan-act-btn danger" data-act="delete" data-id="${escapeHtml(file.id)}">删除</button>
          </div>
        </article>
      `;
    })
    .join("");
}

async function fetchPanList(silent = false): Promise<boolean> {
  try {
    const resp = await fetch("/api/pan", {
      headers: getAuthHeaders(),
      cache: "no-store",
    });
    const data = (await resp.json()) as PanListResponse;
    if (!resp.ok || data.status !== "ok") {
      if (!silent) showToast(data.message || "加载文件列表失败");
      return false;
    }

    state.files = data.files || [];
    state.stats = data.stats;
    state.isAdmin = Boolean(data.isAdmin);
    if (!state.isAdmin && state.adminPassword) {
      state.adminPassword = "";
      try {
        window.sessionStorage.removeItem(ADMIN_PWD_SESSION_KEY);
      } catch {
        // ignore
      }
    }
    syncAdminUI();
    renderStatsLine();
    renderFileList();
    return true;
  } catch {
    if (!silent) showToast("网络连接失败，无法读取文件库");
    return false;
  }
}

function requireAdmin(action: () => void): void {
  if (state.isAdmin) {
    action();
    return;
  }
  state.pendingAdminAction = action;
  const pwdInput = optById<HTMLInputElement>("adminPasswordInput");
  if (pwdInput) pwdInput.value = "";
  openModal("adminModal");
  window.setTimeout(() => pwdInput?.focus(), 40);
}

function xhrUpload(
  url: string,
  body: Blob,
  headers: Record<string, string>,
  onProgress: (loaded: number, total: number) => void,
): Promise<{ status: number; text: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url, true);
    for (const [k, v] of Object.entries(headers)) {
      xhr.setRequestHeader(k, v);
    }
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded, e.total);
    };
    xhr.onload = () => resolve({ status: xhr.status, text: xhr.responseText || "" });
    xhr.onerror = () => reject(new Error("网络中断"));
    xhr.send(body);
  });
}

async function uploadSingleFile(file: File): Promise<void> {
  const uploadStorageSelect = optById<HTMLSelectElement>("uploadStorageSelect");
  const rawPreferred = state.isAdmin ? uploadStorageSelect?.value || "auto" : "auto";
  const preferredTier: PanUploadTierPreference =
    rawPreferred === "cf_d1" || rawPreferred === "gh_single" || rawPreferred === "gh_chunked"
      ? rawPreferred
      : "auto";
  const tier = selectUploadTier(file.size, preferredTier);
  const uploadPrivateCheck = optById<HTMLInputElement>("uploadPrivateCheck");
  const visibility: PanVisibility =
    state.isAdmin && uploadPrivateCheck?.checked ? "private" : "public";
  const category = inferPanCategory(file.name, file.type);

  const tierSizeError = validateUploadTierSize(file.size, tier);
  if (tierSizeError) {
    state.queue.unshift({
      id: `q_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: file.name,
      size: file.size,
      tierLabel:
        tier === "cf_d1" ? "CF 极速" : tier === "gh_single" ? "GitHub 直传" : "GitHub 分片",
      progress: 0,
      status: "error",
      detail: tierSizeError,
    });
    renderQueue();
    showToast(`「${file.name}」${tierSizeError}`);
    return;
  }

  const task: QueueTask = {
    id: `q_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    name: file.name,
    size: file.size,
    tierLabel: tier === "cf_d1" ? "CF 极速" : tier === "gh_single" ? "GitHub 直传" : "GitHub 分片",
    progress: 0,
    status: "uploading",
    detail: "准备上传...",
  };
  state.queue.unshift(task);
  renderQueue();

  try {
    if (tier === "cf_d1" || tier === "gh_single") {
      const headers: Record<string, string> = {
        ...getAuthHeaders(),
        "Content-Type": file.type || "application/octet-stream",
        "X-File-Name": encodeURIComponent(file.name),
        "X-Pan-Mime": encodeURIComponent(file.type || "application/octet-stream"),
        "X-Pan-Category": category,
        "X-Pan-Visibility": visibility,
        "X-Pan-Size": String(file.size),
      };
      if (state.isAdmin && preferredTier !== "auto") {
        headers["X-Pan-Storage-Tier"] = tier;
      }

      const res = await xhrUpload("/api/pan?action=upload", file, headers, (loaded, total) => {
        const pct = Math.min(99, Math.round((loaded / Math.max(1, total)) * 100));
        task.progress = pct;
        task.detail =
          pct >= 99
            ? tier === "cf_d1"
              ? "写入边缘索引..."
              : "同步 GitHub Releases..."
            : `${pct}%`;
        renderQueue();
      });

      const parsed = JSON.parse(res.text || "{}") as PanUploadResponse;
      if (res.status >= 200 && res.status < 300 && parsed.status === "ok") {
        task.progress = 100;
        task.status = "done";
        task.detail = "已完成";
        renderQueue();
        await fetchPanList(true);
      } else {
        throw new Error(parsed.error || parsed.message || `上传失败 (${res.status})`);
      }
      return;
    }

    // > 90 MB: 80 MB chunked upload to GitHub Releases
    const totalChunks = Math.ceil(file.size / PAN_GH_CHUNK_SIZE);
    const uploadedChunks: PanChunkMeta[] = [];

    for (let idx = 0; idx < totalChunks; idx++) {
      const start = idx * PAN_GH_CHUNK_SIZE;
      const end = Math.min(file.size, start + PAN_GH_CHUNK_SIZE);
      const blob = file.slice(start, end);

      const res = await xhrUpload(
        `/api/pan?action=chunk&index=${idx}`,
        blob,
        {
          ...getAuthHeaders(),
          "Content-Type": "application/octet-stream",
          "X-File-Name": encodeURIComponent(file.name),
          "X-Pan-Visibility": visibility,
        },
        (loaded, total) => {
          const overall = Math.min(
            98,
            Math.round(((idx + loaded / Math.max(1, total)) / totalChunks) * 100),
          );
          task.progress = overall;
          task.detail = `分片 ${idx + 1}/${totalChunks} · ${overall}%`;
          renderQueue();
        },
      );

      const parsed = JSON.parse(res.text || "{}") as PanChunkUploadResponse;
      if (res.status < 200 || res.status >= 300 || parsed.status !== "ok" || !parsed.chunk) {
        throw new Error(parsed.error || `分片 ${idx + 1} 上传失败 (${res.status})`);
      }
      uploadedChunks.push(parsed.chunk);
    }

    task.detail = "合并分片索引...";
    renderQueue();

    const commitResp = await fetch("/api/pan?action=commit_chunks", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeaders(),
      },
      body: JSON.stringify({
        name: file.name,
        size: file.size,
        mime_type: file.type || "application/octet-stream",
        category,
        visibility,
        chunks: uploadedChunks,
      }),
    });
    const commitData = (await commitResp.json()) as PanUploadResponse;
    if (!commitResp.ok || commitData.status !== "ok") {
      throw new Error(commitData.error || "分片索引保存失败");
    }

    task.progress = 100;
    task.status = "done";
    task.detail = "已完成";
    renderQueue();
    await fetchPanList(true);
  } catch (err) {
    task.status = "error";
    task.detail = err instanceof Error ? err.message : "上传失败";
    renderQueue();
    showToast(`「${file.name}」${task.detail}`);
  }
}

async function handleSelectedFiles(fileList: FileList | File[]): Promise<void> {
  const files = Array.from(fileList);
  if (files.length === 0) return;
  for (const file of files) {
    await uploadSingleFile(file);
  }
}

async function openPreviewModal(file: PanFileItem): Promise<void> {
  const kind = getPreviewKind(file.name, file.mime_type, file.size, file.storage_tier);
  if (kind === "none") return;

  const titleEl = optById("previewModalTitle");
  const subEl = optById("previewModalSub");
  const bodyEl = optById("previewModalBody");
  const rawLink = optById<HTMLAnchorElement>("previewOpenRawLink");
  const dlLink = optById<HTMLAnchorElement>("previewDownloadLink");

  const inlineUrl = buildFileUrl(file, true);
  const downloadUrl = buildFileUrl(file, false);

  if (titleEl) titleEl.textContent = file.name;
  if (subEl) {
    subEl.textContent = `${formatFileSize(file.size)} · ${PAN_TIER_LABELS[file.storage_tier]}`;
  }
  if (rawLink) rawLink.href = inlineUrl;
  if (dlLink) {
    dlLink.href = downloadUrl;
    dlLink.download = file.name;
  }

  openModal("previewModal");
  if (!bodyEl) return;

  if (kind === "image") {
    bodyEl.innerHTML = `<img class="pan-preview-img" src="${escapeHtml(inlineUrl)}" alt="${escapeHtml(file.name)}">`;
  } else if (kind === "pdf") {
    bodyEl.innerHTML = `<iframe class="pan-preview-iframe" src="${escapeHtml(inlineUrl)}" title="${escapeHtml(file.name)}"></iframe>`;
  } else if (kind === "audio") {
    bodyEl.innerHTML = `<audio class="pan-preview-audio" controls autoplay src="${escapeHtml(inlineUrl)}"></audio>`;
  } else if (kind === "video") {
    bodyEl.innerHTML = `<video class="pan-preview-video" controls playsinline src="${escapeHtml(inlineUrl)}"></video>`;
  } else if (kind === "text") {
    bodyEl.innerHTML = '<pre class="pan-preview-pre">正在加载文本内容...</pre>';
    try {
      const resp = await fetch(inlineUrl);
      const text = await resp.text();
      bodyEl.innerHTML = `<pre class="pan-preview-pre">${escapeHtml(text)}</pre>`;
    } catch {
      bodyEl.innerHTML = '<pre class="pan-preview-pre">预览加载失败，请点击下方直接下载。</pre>';
    }
  }
}

async function deleteFileWithAuth(file: PanFileItem): Promise<void> {
  if (!window.confirm(`确定永久删除「${file.name}」吗？此操作不可撤销。`)) return;
  try {
    const resp = await fetch(`/api/pan?id=${encodeURIComponent(file.id)}`, {
      method: "DELETE",
      headers: getAuthHeaders(),
    });
    const data = (await resp.json()) as { status?: string; error?: string };
    if (!resp.ok || data.status !== "ok") {
      showToast(data.error || "删除失败");
      return;
    }
    showToast(`已删除「${file.name}」`);
    await fetchPanList(true);
  } catch {
    showToast("网络错误，删除失败");
  }
}

async function toggleFileVisibility(file: PanFileItem): Promise<void> {
  const nextVis: PanVisibility = file.visibility === "private" ? "public" : "private";
  try {
    const resp = await fetch("/api/pan", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeaders(),
      },
      body: JSON.stringify({ id: file.id, visibility: nextVis }),
    });
    const data = (await resp.json()) as PanUploadResponse;
    if (!resp.ok || data.status !== "ok") {
      showToast(data.error || "切换权限失败");
      return;
    }
    showToast(
      nextVis === "private" ? `已将「${file.name}」设为私密` : `已将「${file.name}」设为公开`,
    );
    await fetchPanList(true);
  } catch {
    showToast("网络错误，切换失败");
  }
}

function openEditModal(file: PanFileItem): void {
  const idEl = optById<HTMLInputElement>("editFileId");
  const nameEl = optById<HTMLInputElement>("editNameInput");
  const catEl = optById<HTMLSelectElement>("editCatSelect");
  const visEl = optById<HTMLSelectElement>("editVisSelect");
  const folderEl = optById<HTMLInputElement>("editFolderInput");
  const noteEl = optById<HTMLInputElement>("editNoteInput");
  if (idEl) idEl.value = file.id;
  if (nameEl) nameEl.value = file.name;
  if (catEl) catEl.value = file.category;
  if (visEl) visEl.value = file.visibility;
  if (folderEl) folderEl.value = file.folder_path || "";
  if (noteEl) noteEl.value = file.note || "";
  openModal("editModal");
}

function renderApiDocs(): void {
  const origin = window.location.origin;
  const davCode = optById("davEndpointCode");
  const uploadCode = optById("uploadSnippetCode");
  const directCode = optById("directLinkSnippetCode");

  if (davCode) {
    davCode.textContent = [
      `挂载地址: ${origin}/dav/`,
      `公开空间: ${origin}/dav/public/`,
      `私密空间: ${origin}/dav/private/`,
      "用户名: cenj (任意)",
      "密码: 填写在「API Key 管理」生成的密钥 (cjp_...)",
    ].join("\n");
  }

  if (uploadCode) {
    uploadCode.textContent = [
      "// 1. 跨站表单上传（公开文件可免密；私密/白名单需携带 Authorization）",
      "const form = new FormData();",
      "form.append('file', fileInput.files[0]);",
      "form.append('folder_path', 'assets/2026'); // 可选目录",
      `const res = await fetch('${origin}/api/pan?action=upload', {`,
      "  method: 'POST',",
      "  // headers: { Authorization: 'Bearer cjp_你的密钥' },",
      "  body: form",
      "});",
      "const { file } = await res.json();",
      `console.log('${origin}' + file.direct_url);`,
    ].join("\n");
  }

  if (directCode) {
    directCode.textContent = [
      `预览 / 媒体直链: ${origin}/api/pan-raw/<id>/<filename>`,
      `强制下载直链:   ${origin}/api/pan-raw/<id>/<filename>?download=1`,
    ].join("\n");
  }
}

function renderApiKeyList(): void {
  const listEl = optById("apiKeyList");
  if (!listEl) return;

  if (state.apiKeys.length === 0) {
    listEl.innerHTML = '<p class="pan-modal-desc">暂无 API Key，请在上方创建第一把接入密钥。</p>';
    return;
  }

  listEl.innerHTML = state.apiKeys
    .map((k) => {
      const perms: string[] = [];
      if (k.can_read) perms.push("读");
      if (k.can_write) perms.push("写");
      if (k.can_delete) perms.push("删");
      if (k.can_private) perms.push("私密");

      const statusText =
        k.status === "revoked" ? "已吊销" : k.status === "expired" ? "已过期" : "生效中";
      const originsText =
        k.allowed_origins.length > 0 ? k.allowed_origins.join(", ") : "允许全部来源 (*)";
      const expireText = k.expires_at
        ? `过期: ${new Date(k.expires_at).toLocaleDateString()}`
        : "永久有效";
      const usedText = k.last_used_at
        ? `调用 ${k.use_count} 次 · 最近 ${formatRelativeTime(k.last_used_at)}`
        : "尚未使用";

      return `
        <div class="pan-key-card" data-key-id="${escapeHtml(k.id)}">
          <div class="pan-key-card-top">
            <div>
              <span class="pan-key-label">${escapeHtml(k.label)}</span>
              <code class="pan-key-prefix">${escapeHtml(k.key_prefix)}...</code>
              <span class="pan-tag ${k.status === "active" ? "is-cf" : "is-private"}">${statusText}</span>
            </div>
            <div class="pan-key-actions">
              <button type="button" class="pan-act-btn" data-key-act="toggle" data-key-id="${escapeHtml(k.id)}">${k.revoked ? "恢复" : "吊销"}</button>
              <button type="button" class="pan-act-btn danger" data-key-act="delete" data-key-id="${escapeHtml(k.id)}">删除</button>
            </div>
          </div>
          <div class="pan-key-meta">
            <span>权限: ${escapeHtml(perms.join(" / ") || "无")}</span>
            <span>CORS: ${escapeHtml(originsText)}</span>
            <span>${escapeHtml(expireText)}</span>
            <span>${escapeHtml(usedText)}</span>
          </div>
        </div>
      `;
    })
    .join("");
}

async function fetchApiKeys(): Promise<void> {
  if (!state.isAdmin) return;
  try {
    const resp = await fetch("/api/pan-keys", {
      headers: getAuthHeaders(),
      cache: "no-store",
    });
    const data = (await resp.json()) as PanApiKeysListResponse;
    if (resp.ok && data.status === "ok") {
      state.apiKeys = data.keys || [];
      renderApiKeyList();
    }
  } catch {
    showToast("加载 API Key 列表失败");
  }
}

function switchApiTab(tab: "docs" | "keys"): void {
  state.apiTab = tab;
  const docsPane = optById("apiDocsPane");
  const keysPane = optById("apiKeysPane");
  if (docsPane) docsPane.hidden = tab !== "docs";
  if (keysPane) keysPane.hidden = tab !== "keys";
  for (const btn of document.querySelectorAll<HTMLButtonElement>("[data-api-tab]")) {
    btn.classList.toggle("active", btn.dataset.apiTab === tab);
  }
  if (tab === "keys" && state.isAdmin) {
    void fetchApiKeys();
  }
}

function bindEvents(): void {
  const fileInput = optById<HTMLInputElement>("panFileInput");
  optById("btnTriggerUpload")?.addEventListener("click", () => fileInput?.click());
  optById("panDropBar")?.addEventListener("click", () => fileInput?.click());
  optById("panDropBar")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      fileInput?.click();
    }
  });

  fileInput?.addEventListener("change", () => {
    if (fileInput.files && fileInput.files.length > 0) {
      void handleSelectedFiles(fileInput.files);
      fileInput.value = "";
    }
  });

  // Full-page drag & drop
  let dragDepth = 0;
  const dragOverlay = optById("panDragOverlay");
  window.addEventListener("dragenter", (e) => {
    if (!e.dataTransfer?.types.includes("Files")) return;
    e.preventDefault();
    dragDepth += 1;
    if (dragOverlay) dragOverlay.hidden = false;
  });
  window.addEventListener("dragover", (e) => {
    if (!e.dataTransfer?.types.includes("Files")) return;
    e.preventDefault();
  });
  window.addEventListener("dragleave", () => {
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0 && dragOverlay) dragOverlay.hidden = true;
  });
  window.addEventListener("drop", (e) => {
    e.preventDefault();
    dragDepth = 0;
    if (dragOverlay) dragOverlay.hidden = true;
    if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
      void handleSelectedFiles(e.dataTransfer.files);
    }
  });

  // Search, category, visibility, sort
  const searchInput = optById<HTMLInputElement>("panSearchInput");
  const searchClear = optById("panSearchClear");
  searchInput?.addEventListener("input", () => {
    state.query = searchInput.value;
    if (searchClear) searchClear.hidden = !state.query;
    renderFileList();
  });
  searchClear?.addEventListener("click", () => {
    state.query = "";
    if (searchInput) searchInput.value = "";
    searchClear.hidden = true;
    renderFileList();
  });

  const catChips = optById("panCatChips");
  catChips?.addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-cat]");
    const cat = btn?.dataset.cat as PanCategoryFilter | undefined;
    if (!cat) return;
    state.category = cat;
    for (const item of catChips.querySelectorAll<HTMLButtonElement>("[data-cat]")) {
      item.classList.toggle("active", item.dataset.cat === cat);
    }
    renderFileList();
  });

  const visSwitch = optById("panVisSwitch");
  visSwitch?.addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-vis]");
    const vis = btn?.dataset.vis as PanVisibilityFilter | undefined;
    if (!vis) return;
    state.visibility = vis;
    for (const item of visSwitch.querySelectorAll<HTMLButtonElement>("[data-vis]")) {
      item.classList.toggle("active", item.dataset.vis === vis);
    }
    renderFileList();
  });

  optById<HTMLSelectElement>("panSortSelect")?.addEventListener("change", (e) => {
    state.sortBy = (e.target as HTMLSelectElement).value as PanSortBy;
    renderFileList();
  });

  optById("btnClearQueue")?.addEventListener("click", () => {
    state.queue = state.queue.filter((t) => t.status === "uploading" || t.status === "pending");
    renderQueue();
  });

  // API / WebDAV Modal
  optById("btnOpenApiModal")?.addEventListener("click", () => {
    renderApiDocs();
    const secretBox = optById("newApiKeyBox");
    if (secretBox) secretBox.hidden = true;
    syncAdminUI();
    switchApiTab(state.apiTab);
    openModal("apiModal");
  });

  for (const tabBtn of document.querySelectorAll<HTMLButtonElement>("[data-api-tab]")) {
    tabBtn.addEventListener("click", () => {
      const tab = tabBtn.dataset.apiTab === "keys" ? "keys" : "docs";
      switchApiTab(tab);
    });
  }

  optById("btnCopyDavUrl")?.addEventListener("click", () => {
    void copyToClipboard(`${window.location.origin}/dav/`).then((ok) => {
      showToast(ok ? "WebDAV 挂载地址已复制" : "复制失败");
    });
  });

  optById("btnCopyUploadSnippet")?.addEventListener("click", () => {
    const code = optById("uploadSnippetCode")?.textContent || "";
    void copyToClipboard(code).then((ok) => {
      showToast(ok ? "跨站上传示例代码已复制" : "复制失败");
    });
  });

  optById("btnUnlockFromApiModal")?.addEventListener("click", () => {
    requireAdmin(() => {
      syncAdminUI();
      void fetchApiKeys();
      showToast("已解锁管理权限，可创建 API Key");
    });
  });

  optById<HTMLFormElement>("apiKeyCreateForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const label = (optById<HTMLInputElement>("apiKeyLabelInput")?.value || "").trim();
    const ttlRaw = optById<HTMLSelectElement>("apiKeyTtlSelect")?.value || "";
    const ttlDays = ttlRaw ? Number.parseInt(ttlRaw, 10) : null;
    const canRead = Boolean(optById<HTMLInputElement>("apiKeyReadCheck")?.checked);
    const canWrite = Boolean(optById<HTMLInputElement>("apiKeyWriteCheck")?.checked);
    const canDelete = Boolean(optById<HTMLInputElement>("apiKeyDeleteCheck")?.checked);
    const canPrivate = Boolean(optById<HTMLInputElement>("apiKeyPrivateCheck")?.checked);
    const allowedOrigins = (optById<HTMLInputElement>("apiKeyOriginsInput")?.value || "").trim();
    const submitBtn = optById<HTMLButtonElement>("apiKeyCreateBtn");

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = "生成中...";
    }

    try {
      const resp = await fetch("/api/pan-keys", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
        body: JSON.stringify({
          label,
          ttlDays,
          can_read: canRead,
          can_write: canWrite,
          can_delete: canDelete,
          can_private: canPrivate,
          allowed_origins: allowedOrigins,
        }),
      });
      const data = (await resp.json()) as PanApiKeyCreateResponse;
      if (!resp.ok || data.status !== "ok" || !data.secret) {
        showToast(data.error || "生成 API Key 失败");
      } else {
        const box = optById("newApiKeyBox");
        const valEl = optById("newApiKeySecretVal");
        if (valEl) valEl.textContent = data.secret;
        if (box) box.hidden = false;
        optById<HTMLFormElement>("apiKeyCreateForm")?.reset();
        const readChk = optById<HTMLInputElement>("apiKeyReadCheck");
        const writeChk = optById<HTMLInputElement>("apiKeyWriteCheck");
        if (readChk) readChk.checked = true;
        if (writeChk) writeChk.checked = true;
        showToast("已生成新 API Key");
        await fetchApiKeys();
      }
    } catch {
      showToast("网络错误，生成失败");
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = "生成 API Key";
      }
    }
  });

  optById("btnCopyNewSecret")?.addEventListener("click", () => {
    const secret = optById("newApiKeySecretVal")?.textContent || "";
    if (!secret) return;
    void copyToClipboard(secret).then((ok) => {
      showToast(ok ? "API Key 已复制到剪贴板" : "复制失败");
    });
  });

  optById("apiKeyList")?.addEventListener("click", async (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-key-act]");
    if (!btn) return;
    const act = btn.dataset.keyAct;
    const keyId = btn.dataset.keyId;
    if (!keyId) return;
    const target = state.apiKeys.find((k) => k.id === keyId);
    if (!target) return;

    if (act === "toggle") {
      try {
        const resp = await fetch("/api/pan-keys", {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            ...getAuthHeaders(),
          },
          body: JSON.stringify({ id: keyId, revoked: !target.revoked }),
        });
        if (resp.ok) {
          showToast(target.revoked ? "已恢复密钥" : "已吊销密钥");
          await fetchApiKeys();
        }
      } catch {
        showToast("操作失败");
      }
    } else if (act === "delete") {
      if (!window.confirm(`确定永久删除密钥「${target.label}」吗？`)) return;
      try {
        const resp = await fetch(`/api/pan-keys?id=${encodeURIComponent(keyId)}`, {
          method: "DELETE",
          headers: getAuthHeaders(),
        });
        if (resp.ok) {
          showToast("已删除密钥");
          await fetchApiKeys();
        }
      } catch {
        showToast("删除失败");
      }
    }
  });

  // Admin unlock / lock
  optById("btnToggleAdmin")?.addEventListener("click", () => {
    if (state.isAdmin) {
      state.isAdmin = false;
      state.adminPassword = "";
      try {
        window.sessionStorage.removeItem(ADMIN_PWD_SESSION_KEY);
      } catch {
        // ignore
      }
      showToast("已锁定私密空间");
      void fetchPanList(true);
      return;
    }
    requireAdmin(() => {
      showToast("管理权限已解锁");
    });
  });

  optById<HTMLFormElement>("adminUnlockForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const pwdInput = optById<HTMLInputElement>("adminPasswordInput");
    const submitBtn = optById<HTMLButtonElement>("adminSubmitBtn");
    const pwd = (pwdInput?.value || "").trim();
    if (!pwd) {
      showToast("请输入管理密码");
      return;
    }
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = "验证中...";
    }

    state.adminPassword = pwd;
    await fetchPanList(true);

    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = "解锁";
    }

    if (state.isAdmin) {
      try {
        window.sessionStorage.setItem(ADMIN_PWD_SESSION_KEY, pwd);
      } catch {
        // ignore
      }
      closeModal("adminModal");
      const pending = state.pendingAdminAction;
      state.pendingAdminAction = null;
      if (pending) pending();
      else showToast("已解锁私密空间与管理权限");
    } else {
      showToast("管理密码错误");
      if (pwdInput) {
        pwdInput.value = "";
        pwdInput.focus();
      }
    }
  });

  // Add external link modal
  optById("btnOpenLinkModal")?.addEventListener("click", () => {
    const form = optById<HTMLFormElement>("linkForm");
    form?.reset();
    openModal("linkModal");
    window.setTimeout(() => optById<HTMLInputElement>("linkNameInput")?.focus(), 40);
  });

  optById<HTMLFormElement>("linkForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = (optById<HTMLInputElement>("linkNameInput")?.value || "").trim();
    const url = (optById<HTMLInputElement>("linkUrlInput")?.value || "").trim();
    const category = (optById<HTMLSelectElement>("linkCatSelect")?.value || "other") as PanCategory;
    const visibility = (
      state.isAdmin ? optById<HTMLSelectElement>("linkVisSelect")?.value || "public" : "public"
    ) as PanVisibility;
    const note = (optById<HTMLInputElement>("linkNoteInput")?.value || "").trim();
    const submitBtn = optById<HTMLButtonElement>("linkSubmitBtn");

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = "保存中...";
    }
    try {
      const resp = await fetch("/api/pan?action=link", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
        body: JSON.stringify({ name, url, category, visibility, note }),
      });
      const data = (await resp.json()) as PanUploadResponse;
      if (!resp.ok || data.status !== "ok") {
        showToast(data.error || "添加外链失败");
      } else {
        closeModal("linkModal");
        showToast(`已添加「${name}」`);
        await fetchPanList(true);
      }
    } catch {
      showToast("网络错误，保存失败");
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = "保存资源";
      }
    }
  });

  // Edit file modal
  optById<HTMLFormElement>("editForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const id = optById<HTMLInputElement>("editFileId")?.value || "";
    const name = (optById<HTMLInputElement>("editNameInput")?.value || "").trim();
    const category = (optById<HTMLSelectElement>("editCatSelect")?.value || "other") as PanCategory;
    const visibility = (optById<HTMLSelectElement>("editVisSelect")?.value ||
      "public") as PanVisibility;
    const folderPath = (optById<HTMLInputElement>("editFolderInput")?.value || "").trim();
    const note = (optById<HTMLInputElement>("editNoteInput")?.value || "").trim();
    const submitBtn = optById<HTMLButtonElement>("editSubmitBtn");

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = "保存中...";
    }
    try {
      const resp = await fetch("/api/pan", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
        body: JSON.stringify({ id, name, category, visibility, folder_path: folderPath, note }),
      });
      const data = (await resp.json()) as PanUploadResponse;
      if (!resp.ok || data.status !== "ok") {
        showToast(data.error || "保存失败");
      } else {
        closeModal("editModal");
        showToast("已保存修改");
        await fetchPanList(true);
      }
    } catch {
      showToast("网络错误，保存失败");
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = "保存修改";
      }
    }
  });

  // File row delegated actions
  optById("panFileList")?.addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-act]");
    if (!btn) return;
    const act = btn.dataset.act;
    const id = btn.dataset.id;
    const file = state.files.find((f) => f.id === id);
    if (!file) return;

    if (act === "preview") {
      void openPreviewModal(file);
    } else if (act === "copy") {
      const fullUrl = `${window.location.origin}${buildFriendlyDirectUrl(file, false)}`;
      void copyToClipboard(fullUrl).then((ok) => {
        showToast(ok ? "友好直链已复制到剪贴板" : "复制失败");
      });
    } else if (act === "toggle-vis") {
      requireAdmin(() => {
        void toggleFileVisibility(file);
      });
    } else if (act === "edit") {
      requireAdmin(() => {
        openEditModal(file);
      });
    } else if (act === "delete") {
      requireAdmin(() => {
        void deleteFileWithAuth(file);
      });
    }
  });

  // Modal close handlers
  for (const closeBtn of document.querySelectorAll<HTMLElement>("[data-close-modal]")) {
    closeBtn.addEventListener("click", () => {
      const targetId = closeBtn.dataset.closeModal;
      if (targetId) closeModal(targetId);
    });
  }
  for (const backdrop of document.querySelectorAll<HTMLElement>(".pan-modal-backdrop")) {
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) closeModal(backdrop.id);
    });
  }
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      for (const id of ["apiModal", "previewModal", "editModal", "linkModal", "adminModal"]) {
        const el = optById(id);
        if (el && !el.hidden) closeModal(id);
      }
    }
  });
}

bindEvents();
void fetchPanList();
