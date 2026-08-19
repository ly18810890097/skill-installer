// SkillHub Skill Installer - 前端逻辑
const $ = (sel) => document.querySelector(sel);
const els = {
  health: $("#health"),
  q: $("#q"),
  btnSearch: $("#btn-search"),
  searchStatus: $("#search-status"),
  results: $("#results"),
  modal: $("#modal"),
  modalTitle: $("#modal-title"),
  modalDesc: $("#modal-desc"),
  mAgent: $("#m-agent"),
  mProject: $("#m-project"),
  projectInput: $("#project-input"),
  btnInstall: $("#btn-install"),
  btnCancel: $("#btn-cancel"),
  installStatus: $("#install-status"),
  rankingsOverlay: $("#rankings-overlay"),
  rankingsBody: $("#rankings-body"),
  btnRankingsClose: $("#rankings-close"),
  btnBrowseRankings: $("#btn-browse-rankings"),
};

let pendingSkill = null; // 待安装的技能对象
let agentsMap = {};

const PAGE_SIZE = 30; // 每页加载条数
let allResults = []; // 全部已加载结果（最多 100）
let shownCount = 0; // 已渲染条数

// --------------------------------------------------------------------------- //
// 健康检查
// --------------------------------------------------------------------------- //
async function checkHealth() {
  els.health.textContent = "检查 skillhub 中…";
  try {
    const r = await fetch("/api/health");
    const d = await r.json();
    if (d.skillhub_ok) {
      els.health.textContent = `skillhub ${d.skillhub_version}`;
      els.health.classList.add("ok");
    } else {
      els.health.textContent = "skillhub 不可用";
      els.health.classList.add("err");
    }
  } catch (e) {
    els.health.textContent = "后端不可达";
    els.health.classList.add("err");
  }
}

// --------------------------------------------------------------------------- //
// 加载 agent 配置
// --------------------------------------------------------------------------- //
async function loadAgents() {
  const r = await fetch("/api/agents");
  const d = await r.json();
  agentsMap = d;
  els.mAgent.innerHTML = "";
  for (const [key, info] of Object.entries(d)) {
    const opt = document.createElement("option");
    opt.value = key;
    opt.textContent = info.label;
    els.mAgent.appendChild(opt);
  }
}

// --------------------------------------------------------------------------- //
// 搜索
// --------------------------------------------------------------------------- //
async function doSearch() {
  const q = els.q.value.trim();
  if (!q) return;
  els.btnSearch.disabled = true;
  els.searchStatus.innerHTML = '<span class="spinner"></span> 搜索中…';
  els.results.innerHTML = "";
  allResults = [];
  shownCount = 0;
  try {
    const r = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
    const d = await r.json();
    if (d.error) {
      els.searchStatus.textContent = `错误：${d.error}`;
      els.searchStatus.classList.add("error");
      return;
    }
    allResults = sortResultsByRank(d.results || []);
    updateSearchStatus();
    renderNextPage();
  } catch (e) {
    els.searchStatus.textContent = `请求失败：${e.message}`;
    els.searchStatus.classList.add("error");
  } finally {
    els.btnSearch.disabled = false;
  }
}

function updateSearchStatus() {
  const total = allResults.length;
  const ranked = allResults.filter(it => Object.keys(it.ranks || {}).length > 0).length;
  const unranked = total - ranked;
  els.searchStatus.textContent = `共 ${total} 条结果（上榜 ${ranked} 条 + 未上榜 ${unranked} 条，按热度前置），已显示 ${shownCount} 条`;
}

// 上榜的按 score 降序排前面，未上榜的保持原顺序在后
function sortResultsByRank(items) {
  return [...items].sort((a, b) => {
    const aOn = a.ranks && Object.keys(a.ranks).length > 0;
    const bOn = b.ranks && Object.keys(b.ranks).length > 0;
    if (aOn && !bOn) return -1;
    if (!aOn && bOn) return 1;
    if (aOn && bOn) return (b.score || 0) - (a.score || 0);
    return 0;
  });
}

function renderNextPage() {
  // 首次渲染清空容器（含旧的加载更多按钮 / 空提示）
  if (shownCount === 0) els.results.innerHTML = "";

  if (!allResults.length) {
    els.results.innerHTML = '<div class="empty">没有匹配的技能</div>';
    return;
  }

  const end = Math.min(shownCount + PAGE_SIZE, allResults.length);
  for (let i = shownCount; i < end; i++) {
    els.results.appendChild(buildCard(allResults[i]));
  }
  shownCount = end;
  updateSearchStatus();

  // 移除旧的加载更多按钮
  const oldBtn = document.querySelector(".load-more");
  if (oldBtn) oldBtn.remove();

  // 还有剩余则追加按钮
  if (shownCount < allResults.length) {
    const btn = document.createElement("button");
    btn.className = "load-more";
    btn.textContent = `加载更多（剩余 ${allResults.length - shownCount} 条）`;
    btn.addEventListener("click", renderNextPage);
    els.results.appendChild(btn);
  }
}

function buildCard(it) {
  const card = document.createElement("div");
  card.className = "card";
  const ranks = it.ranks || {};
  const hasRank = Object.keys(ranks).length > 0;

  // 热度指标区域
  let statsHtml = "";
  if (hasRank) {
    const chips = Object.entries(ranks)
      .map(([board, rank]) => {
        const label = BOARD_LABELS[board] || board;
        const icon = BOARD_ICONS[board] || "📋";
        return `<button class="stat-chip" data-board="${escapeHtml(board)}" data-slug="${escapeHtml(it.public_slug)}">${icon} ${escapeHtml(label)} #${rank}</button>`;
      })
      .join("");
    const nums = [];
    if (it.downloads != null) nums.push(`⬇ ${formatNum(it.downloads)}`);
    if (it.stars != null) nums.push(`★ ${formatNum(it.stars)}`);
    statsHtml = `<div class="card-stats">${chips}<span class="stat-num">${nums.join(" · ")}</span></div>`;
  } else {
    statsHtml = `<div class="card-stats"><span class="stat-none">未上榜（新技能或冷门）</span></div>`;
  }

  card.innerHTML = `
    <div class="card-head">
      <div class="card-name">${escapeHtml(it.name || it.public_slug)}</div>
      <div class="card-version">v${escapeHtml(it.version || "?")}</div>
    </div>
    <div class="card-desc">${escapeHtml(it.description || "无描述")}</div>
    <div class="card-meta">
      <span>📦 ${escapeHtml(it.public_slug || it.slug)}</span>
      ${it.namespace ? `<span>👤 ${escapeHtml(it.namespace)}</span>` : ""}
      <span>🌐 ${escapeHtml(it.source || "?")}</span>
    </div>
    ${statsHtml}
    <div class="card-actions">
      <button class="btn-install">安装到…</button>
    </div>
  `;
  card.querySelector(".btn-install").addEventListener("click", () => openInstallModal(it));
  // 热度标签点击 → 跳转榜单对应位置
  card.querySelectorAll(".stat-chip").forEach(chip => {
    chip.addEventListener("click", () => openRankingsOverlay(chip.dataset.board, chip.dataset.slug));
  });
  return card;
}

const BOARD_LABELS = {
  hot: "热门", featured: "精选", newest: "最新",
  recommended: "推荐", trending: "趋势", paid: "付费",
};
const BOARD_ICONS = {
  hot: "🔥", featured: "⭐", newest: "🆕",
  recommended: "👍", trending: "📈", paid: "💰",
};

function formatNum(n) {
  if (n == null) return "?";
  if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, "") + "K";
  return String(n);
}

// --------------------------------------------------------------------------- //
// 榜单视图（点击热度指标跳转对应榜单位置）
// --------------------------------------------------------------------------- //
let currentBoard = "hot";

async function openRankingsOverlay(board, targetSlug) {
  els.rankingsOverlay.classList.remove("hidden");
  currentBoard = board || "hot";
  document.querySelectorAll(".board-tab").forEach(t => {
    t.classList.toggle("active", t.dataset.board === currentBoard);
  });
  await loadBoard(currentBoard, targetSlug);
}

function closeRankings() {
  els.rankingsOverlay.classList.add("hidden");
}

async function loadBoard(board, targetSlug) {
  currentBoard = board;
  document.querySelectorAll(".board-tab").forEach(t => {
    t.classList.toggle("active", t.dataset.board === board);
  });
  els.rankingsBody.innerHTML = '<div class="empty"><span class="spinner"></span> 加载中…</div>';
  try {
    const r = await fetch(`/api/rankings?board=${encodeURIComponent(board)}`);
    const d = await r.json();
    if (d.error) {
      els.rankingsBody.innerHTML = `<div class="empty">${escapeHtml(d.error)}</div>`;
      return;
    }
    renderBoard(d.skills || [], board, targetSlug);
  } catch (e) {
    els.rankingsBody.innerHTML = `<div class="empty">加载失败：${escapeHtml(e.message)}</div>`;
  }
}

function renderBoard(skills, board, targetSlug) {
  els.rankingsBody.innerHTML = "";
  if (!skills.length) {
    els.rankingsBody.innerHTML = '<div class="empty">该榜单暂无数据</div>';
    return;
  }
  skills.forEach((s, i) => {
    const rank = i + 1;
    const item = document.createElement("div");
    item.className = "board-item";
    if (s.slug === targetSlug) item.classList.add("highlight");
    const desc = s.description_zh || s.description || "无描述";
    item.innerHTML = `
      <div class="board-rank">#${rank}</div>
      <div class="board-info">
        <div class="board-name">${escapeHtml(s.name || s.slug)}</div>
        <div class="board-desc">${escapeHtml(desc)}</div>
      </div>
      <div class="board-stats">
        <span title="下载量">⬇ ${formatNum(s.downloads)}</span>
        <span title="星标数">★ ${formatNum(s.stars)}</span>
      </div>
      <button class="btn-install-small">安装到…</button>
    `;
    item.querySelector(".btn-install-small").addEventListener("click", () => {
      const ns = s.namespace || {};
      openInstallModal({
        slug: ns.canonicalName || s.slug,
        public_slug: s.slug,
        name: s.name,
        description: desc,
        version: s.version || "?",
        source: s.source || "?",
        namespace: ns.displayName || s.ownerName || "",
      });
    });
    els.rankingsBody.appendChild(item);
  });
  // 滚动到目标位置并高亮
  if (targetSlug) {
    const target = els.rankingsBody.querySelector(".board-item.highlight");
    if (target) {
      setTimeout(() => target.scrollIntoView({ behavior: "smooth", block: "center" }), 100);
    }
  }
}

// --------------------------------------------------------------------------- //
// 安装弹窗
// --------------------------------------------------------------------------- //
function openInstallModal(skill) {
  pendingSkill = skill;
  els.modalTitle.textContent = `安装：${skill.name || skill.public_slug}`;
  els.modalDesc.textContent = skill.description || "";
  els.mAgent.value = "trae";
  document.querySelector('input[name="scope"][value="global"]').checked = true;
  toggleProjectInput();
  els.installStatus.textContent = "";
  els.installStatus.className = "status";
  els.modal.classList.remove("hidden");
}

function closeModal() {
  els.modal.classList.add("hidden");
  pendingSkill = null;
}

function toggleProjectInput() {
  const scope = document.querySelector('input[name="scope"]:checked').value;
  els.projectInput.classList.toggle("hidden", scope !== "project");
}

async function doInstall() {
  if (!pendingSkill) return;
  const scope = document.querySelector('input[name="scope"]:checked').value;
  const body = {
    slug: pendingSkill.slug,
    public_slug: pendingSkill.public_slug,
    agent: els.mAgent.value,
    scope,
    project_dir: els.mProject.value.trim(),
  };
  els.btnInstall.disabled = true;
  els.installStatus.innerHTML = '<span class="spinner"></span> 安装中…';
  try {
    const r = await fetch("/api/install", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const d = await r.json();
    if (!r.ok || d.error) {
      els.installStatus.textContent = `失败：${d.error || r.statusText}`;
      els.installStatus.classList.add("error");
    } else {
      els.installStatus.textContent = `已安装到：${d.target}`;
      els.installStatus.classList.add("success");
      setTimeout(closeModal, 1500);
    }
  } catch (e) {
    els.installStatus.textContent = `请求失败：${e.message}`;
    els.installStatus.classList.add("error");
  } finally {
    els.btnInstall.disabled = false;
  }
}

// --------------------------------------------------------------------------- //
// 工具
// --------------------------------------------------------------------------- //
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// --------------------------------------------------------------------------- //
// 事件绑定
// --------------------------------------------------------------------------- //
els.btnSearch.addEventListener("click", doSearch);
els.q.addEventListener("keydown", (e) => { if (e.key === "Enter") doSearch(); });
els.btnCancel.addEventListener("click", closeModal);
els.btnInstall.addEventListener("click", doInstall);
document.querySelectorAll('input[name="scope"]').forEach(r =>
  r.addEventListener("change", toggleProjectInput));
els.modal.addEventListener("click", (e) => { if (e.target === els.modal) closeModal(); });

// 榜单 overlay 事件
els.btnRankingsClose.addEventListener("click", closeRankings);
els.btnBrowseRankings.addEventListener("click", () => openRankingsOverlay("hot", null));
els.rankingsOverlay.addEventListener("click", (e) => {
  if (e.target === els.rankingsOverlay) closeRankings();
});
document.querySelectorAll(".board-tab").forEach(t => {
  t.addEventListener("click", () => loadBoard(t.dataset.board, null));
});

// 启动
checkHealth();
loadAgents();
