import { escapeHtml } from "@/core/dom";
import type {
  ClashCommandRecord,
  ClashHeartbeat,
  ClashNodesData,
  ClashProfilesData,
  ClashSpeedData,
} from "@shared/types";

export function formatTime(isoStr: string | null | undefined): string {
  if (!isoStr) return "";
  const d = new Date(isoStr);
  if (Number.isNaN(d.getTime())) return isoStr;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function renderHeartbeat(hb: ClashHeartbeat | null | undefined): void {
  const pcHbEl = document.getElementById("pcHbBar");
  if (!pcHbEl) return;

  if (!hb) {
    pcHbEl.innerHTML = '💻 电脑状态：<span style="color:#94a3b8;">暂无心跳记录</span>';
    return;
  }

  if (hb.status === "online") {
    const cleanInfo = escapeHtml(String(hb.result || "").replace("在线 | ", ""));
    pcHbEl.innerHTML = `<span>💻 电脑状态：<strong style="color:#10b981;">● 在线</strong> (${cleanInfo})</span> <span style="font-size:0.75rem; color:#94a3b8;">${hb.diff_sec}秒前活跃</span>`;
    return;
  }

  const diffText =
    hb.diff_sec < 60
      ? `${hb.diff_sec}秒前`
      : hb.diff_sec < 3600
        ? `${Math.round(hb.diff_sec / 60)}分钟前`
        : `${Math.round(hb.diff_sec / 3600)}小时前`;
  pcHbEl.innerHTML = `<span>💻 电脑状态：<strong style="color:#ef4444;">○ 离线 / 已关机</strong></span> <span style="font-size:0.75rem; color:#94a3b8;">(最后活跃于 ${diffText})</span>`;
}

export function renderCommandFeedback(
  cmd: ClashCommandRecord | null | undefined,
  isOnline: boolean,
): void {
  const feedbackEl = document.getElementById("latestFeedback");
  if (!cmd || !feedbackEl) return;

  const isDone = cmd.status === "done";
  const isPending = cmd.status === "pending";
  let badge = '<span style="color:#ef4444;">❌ 失败</span>';
  if (isDone) {
    badge = '<span style="color:#10b981;">✅ 完成</span>';
  } else if (isPending) {
    badge = isOnline
      ? '<span style="color:#f59e0b;">⏳ 电脑高速执行中</span>'
      : '<span style="color:#ef4444;">⏸️ 电脑离线等待中</span>';
  }

  const dispatchText = cmd.dispatched_at ? formatTime(cmd.dispatched_at) : cmd.updated_at || "刚刚";
  let responseText = "";
  let durationText = "";

  if (cmd.responded_at) {
    responseText = formatTime(cmd.responded_at);
    if (cmd.dispatched_at) {
      const dur = Math.max(
        0,
        Math.round(
          (new Date(cmd.responded_at).getTime() - new Date(cmd.dispatched_at).getTime()) / 1000,
        ),
      );
      durationText = ` <span style="color:#60a5fa;">(耗时 ${dur}秒)</span>`;
    }
  } else if (isPending) {
    if (cmd.dispatched_at) {
      const wait = Math.max(
        0,
        Math.round((Date.now() - new Date(cmd.dispatched_at).getTime()) / 1000),
      );
      responseText = isOnline
        ? `<span style="color:#fbbf24;">执行中... (已等 ${wait}秒)</span>`
        : `<span style="color:#ef4444;">电脑离线，待电脑开机后自动执行 (已等 ${wait}秒)</span>`;
    } else {
      responseText = isOnline
        ? '<span style="color:#fbbf24;">等待响应...</span>'
        : '<span style="color:#ef4444;">电脑离线中...</span>';
    }
  } else {
    responseText = escapeHtml(cmd.updated_at || "-");
  }

  feedbackEl.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.35rem;">
      <span style="font-weight:700; color:#fff;">最近指令: [${escapeHtml(cmd.command)}]</span>
      <span style="font-weight:700; font-size:0.82rem;">${badge}</span>
    </div>
    <div style="font-size:0.76rem; color:#94a3b8; display:flex; flex-wrap:wrap; gap:0.9rem; margin-bottom:0.35rem; background:rgba(0,0,0,0.3); padding:0.35rem 0.6rem; border-radius:6px;">
      <span>📤 下发时间: <strong style="color:#e2e8f0;">${escapeHtml(dispatchText)}</strong></span>
      <span>📥 电脑回应: <strong style="color:#10b981;">${responseText}</strong>${durationText}</span>
    </div>
    <div style="color:#93c5fd; font-size:0.8rem; line-height:1.4;">${escapeHtml(cmd.result || "")}</div>
  `;
}

export function renderSpeed(speedData: ClashSpeedData | null | undefined): void {
  const container = document.getElementById("speedListContainer");
  if (!container) return;

  const summary = speedData?.regions_summary;
  if (!summary || summary.length === 0) {
    container.innerHTML =
      '<div style="color:var(--text-muted); font-size:0.85rem; padding:2rem 0; text-align:center; grid-column:span 2;">暂无常用测速数据，请点击右上角【⚡ 测速刷新】获取...</div>';
    return;
  }

  let html = "";
  for (const reg of summary) {
    const delayStr = String(reg.best_delay ?? "-");
    const isBestValid = delayStr !== "" && delayStr !== "超时" && delayStr !== "-";
    const delayNum = Number.parseInt(delayStr, 10);
    const delayColor = isBestValid ? (delayNum < 100 ? "#10b981" : "#38bdf8") : "#ef4444";
    const label = escapeHtml(reg.label || reg.region || "未知地区");
    const nodeCount = reg.node_count ?? reg.total_nodes ?? 0;
    const bestNode = reg.best_node || "";

    html += `
      <div class="speed-card ${reg.active ? "active-region" : ""}">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.5rem;">
          <span style="font-size:1rem; font-weight:800; color:#fff;">${label} <small style="font-size:0.75rem; color:#94a3b8; font-weight:normal;">(${nodeCount}节点)</small></span>
          <span class="speed-badge" style="color:${delayColor}; border:1px solid ${delayColor}44;">${escapeHtml(delayStr)}</span>
        </div>
        <div style="font-size:0.78rem; color:#94a3b8; margin-bottom:0.6rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
          最快: <span style="color:#cbd5e1;">${escapeHtml(bestNode || "暂无")}</span>
        </div>
        ${
          bestNode
            ? `<button type="button" data-action="switch-node" data-payload="${escapeHtml(bestNode)}" class="btn" style="width:100%; padding:0.4rem; font-size:0.78rem;">一键切此最快</button>`
            : ""
        }
      </div>
    `;
  }
  container.innerHTML = html;
}

export function renderSubs(profilesData: ClashProfilesData | null | undefined): void {
  const container = document.getElementById("subsListContainer");
  if (!container) return;

  const items = profilesData?.items || profilesData?.profiles;
  if (!items || items.length === 0) {
    container.innerHTML =
      '<div style="color:var(--text-muted); font-size:0.85rem; padding:2rem 0; text-align:center;">暂无订阅数据，正在获取...</div>';
    return;
  }

  let html = "";
  for (const p of items) {
    const isActive = Boolean(p.is_active ?? p.selected);
    const uid = p.uid || p.name;
    const activeBadge = isActive
      ? '<span style="background:#0284c7; color:#fff; font-size:0.75rem; padding:0.25rem 0.6rem; border-radius:6px; font-weight:700;">🟢 当前生效中</span>'
      : `<button type="button" data-action="switch-profile" data-payload="${escapeHtml(uid)}" class="btn" style="padding:0.3rem 0.75rem; font-size:0.75rem; background:#3b82f6;">⚡ 切换到此订阅</button>`;

    const totalVal = p.total_gb || 0;
    const usedVal = p.used_gb || 0;
    const pct = totalVal > 0 ? Math.min(100, Math.round((usedVal / totalVal) * 100)) : 0;

    html += `
      <div class="item-card ${isActive ? "active" : ""}" style="margin-bottom:0.75rem;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.5rem;">
          <span style="font-weight:700; font-size:1rem; color:#fff;">${escapeHtml(p.name || uid)}</span>
          ${activeBadge}
        </div>
        <div style="font-size:0.82rem; color:var(--text-muted); line-height:1.6;">
          <div style="display:flex; justify-content:space-between; margin-bottom:0.2rem; flex-wrap:wrap; gap:0.4rem;">
            <span>流量：<strong style="color:var(--accent);">${usedVal} GB</strong> / ${totalVal > 0 ? `${totalVal} GB` : "不限"}</span>
            <span>到期：<strong style="color:#e2e8f0;">${escapeHtml(p.expire || "-")}</strong></span>
          </div>
          ${
            totalVal > 0
              ? `
            <div style="width:100%; height:6px; background:#334155; border-radius:3px; overflow:hidden; margin:0.4rem 0;">
              <div style="width:${pct}%; height:100%; background:${pct > 85 ? "#ef4444" : pct > 60 ? "#f59e0b" : "#10b981"};"></div>
            </div>
          `
              : ""
          }
          <div style="word-break:break-all; font-size:0.72rem; color:#64748b; margin-top:0.25rem;">${escapeHtml(p.url || "")}</div>
        </div>
      </div>
    `;
  }
  container.innerHTML = html;
}

export function renderNodes(nodesData: ClashNodesData | null | undefined): void {
  const container = document.getElementById("nodesListContainer");
  if (!container) return;

  const regionsMap = nodesData?.regions || nodesData?.groups;
  if (!nodesData || !regionsMap) {
    container.innerHTML =
      '<div style="color:var(--text-muted); font-size:0.85rem; padding:2rem 0; text-align:center;">暂无节点数据，正在获取...</div>';
    return;
  }

  let html = "";
  const nowNode = nodesData.now || nodesData.current || "";

  for (const [region, nodes] of Object.entries(regionsMap)) {
    if (!nodes || nodes.length === 0) continue;
    const containsActive = nodes.some((n) => n.name === nowNode);

    html += `
      <details ${containsActive ? "open" : ""} style="background:#1e293b; border-radius:10px; margin-bottom:0.7rem; border:1px solid #334155; overflow:hidden;">
        <summary style="padding:0.7rem 0.9rem; font-size:0.9rem; font-weight:700; color:#cbd5e1; cursor:pointer; background:#182234; display:flex; justify-content:space-between; align-items:center; list-style:none;">
          <span>${escapeHtml(region)} (${nodes.length})</span>
          ${
            containsActive
              ? '<span style="color:var(--accent); font-size:0.75rem; font-weight:normal;">● 正在使用此区域</span>'
              : '<span style="color:#64748b; font-size:0.75rem;">展开 ▼</span>'
          }
        </summary>
        <div style="padding:0.6rem; max-height:260px; overflow-y:auto;">
    `;

    for (const n of nodes) {
      const isCurrent = n.name === nowNode;
      const delayNum = n.delay_num ?? Number.parseInt(String(n.delay), 10);
      const delayColor =
        !Number.isNaN(delayNum) && delayNum < 100
          ? "#10b981"
          : !Number.isNaN(delayNum) && delayNum < 250
            ? "#38bdf8"
            : "#94a3b8";

      html += `
        <div data-action="switch-node" data-payload="${escapeHtml(n.name)}" style="display:flex; justify-content:space-between; align-items:center; padding:0.5rem 0.7rem; margin-bottom:0.4rem; border-radius:6px; cursor:pointer; background:${isCurrent ? "rgba(2, 132, 199, 0.25)" : "#0f172a"}; border:${isCurrent ? "1px solid var(--primary)" : "1px solid rgba(255,255,255,0.05)"};">
          <span style="font-size:0.85rem; color:${isCurrent ? "var(--accent)" : "#e2e8f0"}; font-weight:${isCurrent ? "700" : "400"}; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:70%;">
            ${isCurrent ? "✔ " : ""}${escapeHtml(n.name)}
          </span>
          <span style="font-size:0.78rem; color:${delayColor}; font-weight:700;">
            ${escapeHtml(String(n.delay))}
          </span>
        </div>
      `;
    }

    html += "</div></details>";
  }

  container.innerHTML = html;
}
