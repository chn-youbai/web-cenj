import { getStorageItem, setStorageItem } from "@/core/storage";
import type { UploadAssetResponse } from "@shared/types";

const TOKEN_STORAGE_KEY = "cenj_upload_gh_token";

const dropZone = document.getElementById("dropZone");
const fileInput = document.getElementById("videoFileInput") as HTMLInputElement | null;
const previewBox = document.getElementById("previewBox");
const previewVideo = document.getElementById("previewVideo") as HTMLVideoElement | null;
const metaName = document.getElementById("metaName");
const metaSize = document.getElementById("metaSize");
const metaDuration = document.getElementById("metaDuration");
const titleInput = document.getElementById("videoTitleInput") as HTMLInputElement | null;
const tokenInput = document.getElementById("ghTokenInput") as HTMLInputElement | null;
const uploadBtn = document.getElementById("uploadSubmitBtn") as HTMLButtonElement | null;
const progressWrap = document.getElementById("progressWrap");
const progressFill = document.getElementById("progressFill");
const progressLabel = document.getElementById("progressLabel");
const progressPct = document.getElementById("progressPct");
const resultCard = document.getElementById("resultCard");
const resultTitle = document.getElementById("resultTitle");
const resultDesc = document.getElementById("resultDesc");
const resultGalleryLink = document.getElementById("resultGalleryLink") as HTMLAnchorElement | null;

let selectedFile: File | null = null;
let detectedDuration = 0;
let previewObjectUrl = "";

function formatBytes(bytes: number): string {
  if (!bytes) return "0 MB";
  const mb = bytes / (1024 * 1024);
  if (mb >= 1000) return `${(mb / 1024).toFixed(2)} GB`;
  return `${mb.toFixed(1)} MB`;
}

function formatDuration(sec: number): string {
  const sTotal = Math.round(sec || 0);
  const m = Math.floor(sTotal / 60);
  const s = sTotal % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function showResult(ok: boolean, title: string, desc: string): void {
  if (!resultCard || !resultTitle || !resultDesc) return;
  resultCard.classList.add("active");
  resultCard.classList.toggle("error", !ok);
  resultTitle.textContent = title;
  resultDesc.textContent = desc;
  if (resultGalleryLink) {
    resultGalleryLink.style.display = ok ? "inline-flex" : "none";
  }
}

function handleFileSelect(file: File): void {
  selectedFile = file;
  detectedDuration = 0;
  resultCard?.classList.remove("active");

  if (titleInput && !titleInput.value.trim()) {
    titleInput.value = file.name.replace(/\.[^/.]+$/, "");
  }

  if (metaName) metaName.textContent = file.name;
  if (metaSize) metaSize.textContent = formatBytes(file.size);
  if (metaDuration) metaDuration.textContent = "解析时长中...";

  if (previewObjectUrl) {
    URL.revokeObjectURL(previewObjectUrl);
  }
  previewObjectUrl = URL.createObjectURL(file);

  if (previewVideo && previewBox) {
    previewVideo.src = previewObjectUrl;
    previewBox.classList.add("active");
    previewVideo.onloadedmetadata = () => {
      detectedDuration = Math.round(previewVideo.duration || 0);
      if (metaDuration) metaDuration.textContent = formatDuration(detectedDuration);
    };
  }

  if (uploadBtn) uploadBtn.disabled = false;
}

if (tokenInput) {
  const savedToken = getStorageItem(TOKEN_STORAGE_KEY);
  if (savedToken) tokenInput.value = savedToken;
}

fileInput?.addEventListener("change", () => {
  const file = fileInput.files?.[0];
  if (file) handleFileSelect(file);
});

dropZone?.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropZone.classList.add("dragover");
});

dropZone?.addEventListener("dragleave", () => {
  dropZone.classList.remove("dragover");
});

dropZone?.addEventListener("drop", (e) => {
  e.preventDefault();
  dropZone.classList.remove("dragover");
  const file = e.dataTransfer?.files?.[0];
  if (file) handleFileSelect(file);
});

uploadBtn?.addEventListener("click", () => {
  if (!selectedFile) return;

  const title = titleInput?.value.trim() || selectedFile.name.replace(/\.[^/.]+$/, "");
  const token = tokenInput?.value.trim() || "";
  if (token) {
    setStorageItem(TOKEN_STORAGE_KEY, token);
  }

  if (uploadBtn) {
    uploadBtn.disabled = true;
    uploadBtn.textContent = "上传中，请勿关闭页面...";
  }
  progressWrap?.classList.add("active");
  resultCard?.classList.remove("active");

  const xhr = new XMLHttpRequest();
  xhr.open("POST", "/api/upload-asset", true);
  xhr.setRequestHeader("Content-Type", selectedFile.type || "video/mp4");
  xhr.setRequestHeader("X-File-Name", selectedFile.name.replace(/[^a-zA-Z0-9._-]/g, "_"));
  xhr.setRequestHeader("X-Title", encodeURIComponent(title));
  xhr.setRequestHeader("X-Duration", String(detectedDuration));
  if (token) {
    xhr.setRequestHeader("X-GitHub-Token", token);
  }

  xhr.upload.onprogress = (e) => {
    if (!e.lengthComputable) return;
    const pct = Math.min(99, Math.round((e.loaded / e.total) * 100));
    if (progressFill) progressFill.style.width = `${pct}%`;
    if (progressPct) progressPct.textContent = `${pct}%`;
    if (progressLabel) {
      progressLabel.textContent =
        pct >= 98 ? "正在转推至 GitHub Releases 并写入 D1..." : "正在上传至 Cloudflare 边缘节点...";
    }
  };

  xhr.onload = () => {
    let data: UploadAssetResponse = {};
    try {
      data = JSON.parse(xhr.responseText || "{}") as UploadAssetResponse;
    } catch {
      // ignore invalid json
    }

    if (xhr.status >= 200 && xhr.status < 300 && data.status === "ok") {
      if (progressFill) progressFill.style.width = "100%";
      if (progressPct) progressPct.textContent = "100%";
      if (progressLabel) progressLabel.textContent = "上传完成";
      showResult(
        true,
        "✅ 视频已成功上架画廊！",
        `标题「${data.title || title}」已保存至 D1，现在即可在图库视频专区原画播放与下载。`,
      );
    } else {
      showResult(
        false,
        "❌ 上传失败",
        data.error || data.message || `服务器返回状态码 ${xhr.status}`,
      );
    }

    if (uploadBtn) {
      uploadBtn.disabled = false;
      uploadBtn.textContent = "🚀 开始直传上架";
    }
  };

  xhr.onerror = () => {
    showResult(false, "❌ 网络中断", "请检查网络连接后重试。");
    if (uploadBtn) {
      uploadBtn.disabled = false;
      uploadBtn.textContent = "🚀 开始直传上架";
    }
  };

  xhr.send(selectedFile);
});
