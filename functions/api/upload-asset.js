// Cloudflare Pages Function: /api/upload-asset
// 作用：解决国内手机直连 uploads.github.com 被阻断 (网络连接中断) 与 CORS 跨域问题
// 手机将视频流发往本边缘接口，由 Cloudflare 海外节点中继转推至 GitHub Releases

const GH_REPO = "chn-youbai/web-cenj";
const DEFAULT_TAG = "v_media";

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-GitHub-Token, X-File-Name",
    "Access-Control-Max-Age": "86400"
  };
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

export async function onRequestPost(context) {
  const url = new URL(context.request.url);
  const token = context.request.headers.get("X-GitHub-Token") || url.searchParams.get("token");
  const fileName = context.request.headers.get("X-File-Name") || url.searchParams.get("name") || ("video_" + Date.now() + ".mp4");
  const contentType = context.request.headers.get("Content-Type") || "video/mp4";

  if (!token) {
    return new Response(JSON.stringify({ error: "Missing GitHub Token" }), {
      status: 400,
      headers: { ...corsHeaders(), "Content-Type": "application/json" }
    });
  }

  try {
    // 1. 查询或创建 Release 容器
    let releaseResp = await fetch(`https://api.github.com/repos/${GH_REPO}/releases/tags/${DEFAULT_TAG}`, {
      headers: {
        "Authorization": `token ${token}`,
        "Accept": "application/vnd.github.v3+json",
        "User-Agent": "Cenj-Pages-Proxy"
      }
    });

    let uploadUrl = "";
    if (releaseResp.status === 404) {
      const createResp = await fetch(`https://api.github.com/repos/${GH_REPO}/releases`, {
        method: "POST",
        headers: {
          "Authorization": `token ${token}`,
          "Content-Type": "application/json",
          "Accept": "application/vnd.github.v3+json",
          "User-Agent": "Cenj-Pages-Proxy"
        },
        body: JSON.stringify({
          tag_name: DEFAULT_TAG,
          name: "Cenj Video Assets",
          body: "Personal video storage assets",
          draft: false,
          prerelease: false
        })
      });
      const createData = await createResp.json();
      if (!createResp.ok || !createData.upload_url) {
        return new Response(JSON.stringify({ error: "Failed to create release: " + (createData.message || createResp.statusText) }), {
          status: 500,
          headers: { ...corsHeaders(), "Content-Type": "application/json" }
        });
      }
      uploadUrl = createData.upload_url;
    } else if (releaseResp.ok) {
      const relData = await releaseResp.json();
      uploadUrl = relData.upload_url;
    } else {
      const err = await releaseResp.json().catch(() => ({}));
      return new Response(JSON.stringify({ error: "GitHub Auth Failed: " + (err.message || releaseResp.statusText) }), {
        status: releaseResp.status,
        headers: { ...corsHeaders(), "Content-Type": "application/json" }
      });
    }

    // 2. 清理文件名并构建直传端点
    const cleanName = Date.now().toString(36) + "_" + fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const targetUploadEndpoint = uploadUrl.replace("{?name,label}", `?name=${encodeURIComponent(cleanName)}`);

    // 3. 将手机上传的二进制数据流式转发给 GitHub uploads
    const ghUploadResp = await fetch(targetUploadEndpoint, {
      method: "POST",
      headers: {
        "Authorization": `token ${token}`,
        "Content-Type": contentType,
        "User-Agent": "Cenj-Pages-Proxy"
      },
      body: context.request.body
    });

    const ghRespData = await ghUploadResp.json().catch(() => ({}));

    if (ghUploadResp.ok) {
      return new Response(JSON.stringify({
        status: "ok",
        browser_download_url: ghRespData.browser_download_url,
        asset_id: ghRespData.id,
        size: ghRespData.size
      }), {
        status: 200,
        headers: { ...corsHeaders(), "Content-Type": "application/json" }
      });
    } else {
      return new Response(JSON.stringify({
        error: "GitHub Upload Error: " + (ghRespData.message || ghUploadResp.statusText)
      }), {
        status: ghUploadResp.status,
        headers: { ...corsHeaders(), "Content-Type": "application/json" }
      });
    }

  } catch (err) {
    return new Response(JSON.stringify({ error: "Internal Proxy Error: " + err.message }), {
      status: 500,
      headers: { ...corsHeaders(), "Content-Type": "application/json" }
    });
  }
}
