"""业务逻辑层：skillhub CLI 调用、agents 配置、榜单缓存、安装实现。

本模块不依赖 Flask，可被任意路由层或脚本复用。
"""
from __future__ import annotations

import json
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
AGENTS_FILE = BASE_DIR / "agents.json"


# --------------------------------------------------------------------------- #
# skillhub CLI 封装
# --------------------------------------------------------------------------- #
def resolve_skillhub_cmd() -> str:
    """定位 skillhub 可执行命令。Windows 上是 skillhub.cmd，其它平台为 skillhub。"""
    if sys.platform == "win32":
        candidate = Path.home() / ".local" / "bin" / "skillhub.cmd"
        if candidate.exists():
            return str(candidate)
    return "skillhub"


def run_skillhub(args: list[str], timeout: int = 60) -> tuple[int, str, str]:
    """执行 skillhub 子进程，返回 (returncode, stdout, stderr)。"""
    cmd = [resolve_skillhub_cmd()] + args
    proc = subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        timeout=timeout,
        shell=(sys.platform == "win32"),
        encoding="utf-8",
        errors="replace",
    )
    return proc.returncode, proc.stdout, proc.stderr


def safe_segment(name: str) -> str:
    """slug -> 安全文件/文件夹名段（去 @namespace/ 前缀，过滤非法字符）。"""
    if not name:
        return "unnamed"
    if "/" in name:
        name = name.rsplit("/", 1)[-1]
    name = name.strip().strip(".")
    for ch in '<>:"\\|?*':
        name = name.replace(ch, "_")
    return name or "unnamed"


# --------------------------------------------------------------------------- #
# agents 配置
# --------------------------------------------------------------------------- #
def load_agents() -> dict:
    """读取 agents.json 配置。"""
    with AGENTS_FILE.open(encoding="utf-8") as f:
        return json.load(f)["agents"]


# --------------------------------------------------------------------------- #
# 榜单缓存 + 热度 lookup
# --------------------------------------------------------------------------- #
_RANKINGS_TTL = 600  # 10 分钟
_rankings_cache: dict = {"lookup": None, "raw": None, "ts": 0.0}


def fetch_rankings() -> tuple[dict, dict]:
    """拉取 skillhub 全部榜单，返回 (lookup, raw)。

    lookup: slug -> {downloads, installs, stars, score, ranks: {board: rank}}
    raw:    原始榜单结构 {board: {section, skills: [...]}} 供前端跳转用
    """
    now = time.time()
    if (
        _rankings_cache["lookup"] is not None
        and now - _rankings_cache["ts"] < _RANKINGS_TTL
    ):
        return _rankings_cache["lookup"], _rankings_cache["raw"]

    code, out, _ = run_skillhub(
        ["skill", "rankings", "--type", "all", "--timeout", "15"], timeout=30
    )
    if code != 0:
        return {}, {}

    try:
        data = json.loads(out)
    except json.JSONDecodeError:
        return {}, {}

    raw = data.get("rankings", {}) or {}
    lookup: dict[str, dict] = {}
    for board, board_data in raw.items():
        skills = board_data.get("skills", []) or []
        for i, s in enumerate(skills):
            slug = (s.get("slug") or "").strip()
            if not slug:
                continue
            if slug not in lookup:
                lookup[slug] = {
                    "downloads": s.get("downloads", 0),
                    "installs": s.get("installs", 0),
                    "stars": s.get("stars", 0),
                    "score": s.get("score", 0),
                    "ranks": {},
                }
            lookup[slug]["ranks"][board] = i + 1

    _rankings_cache["lookup"] = lookup
    _rankings_cache["raw"] = raw
    _rankings_cache["ts"] = now
    return lookup, raw


def merge_popularity(public_slug: str) -> dict:
    """查榜单热度，返回热度字段（未上榜则空字典）。"""
    lookup, _ = fetch_rankings()
    info = lookup.get(public_slug) or {}
    return {
        "downloads": info.get("downloads"),
        "installs": info.get("installs"),
        "stars": info.get("stars"),
        "score": info.get("score"),
        "ranks": info.get("ranks") or {},
    }


# --------------------------------------------------------------------------- #
# 搜索 / 安装 业务实现
# --------------------------------------------------------------------------- #
def search_skills(q: str) -> tuple[list[dict], list[str]]:
    """搜索技能，返回 (items, warnings)。失败抛 RuntimeError。"""
    code, out, err = run_skillhub(
        ["search", q, "--search-limit", "100", "--json"], timeout=30
    )
    if code != 0:
        raise RuntimeError(f"skillhub exit {code}: {err}")

    try:
        data = json.loads(out)
    except json.JSONDecodeError:
        raise RuntimeError("invalid JSON from skillhub")

    items = []
    for it in data.get("results", []):
        public_slug = it.get("publicSlug") or ""
        pop = merge_popularity(public_slug)
        items.append(
            {
                "slug": it.get("slug") or it.get("publicSlug") or "",
                "public_slug": public_slug,
                "name": it.get("name") or "",
                "description": it.get("description") or "",
                "version": it.get("version") or "",
                "source": it.get("source") or "",
                "namespace": (it.get("namespace") or {}).get("displayName") or "",
                **pop,
            }
        )
    return items, data.get("warnings", [])


def install_skill(
    slug: str,
    public_slug: str,
    agent_key: str,
    scope: str,
    project_dir: str = "",
) -> str:
    """安装技能到指定 agent 目录，返回目标 SKILL.md 路径。

    失败抛 ValueError（参数错误）或 RuntimeError（skillhub/文件错误）。
    """
    if not slug or not agent_key:
        raise ValueError("slug and agent are required")

    agents = load_agents()
    if agent_key not in agents:
        raise ValueError(f"unknown agent: {agent_key}")

    agent = agents[agent_key]
    layout = agent.get("layout", "folder")

    # 解析目标根目录
    if scope == "project":
        if not project_dir:
            raise ValueError("project_dir required for project scope")
        project_root = Path(project_dir).expanduser().resolve()
        if not project_root.is_dir():
            raise FileNotFoundError(f"project dir not found: {project_root}")
        target_root = project_root / agent["project_dir"]
    else:
        target_root = Path(agent["global_dir"]).expanduser().resolve()

    safe_name = safe_segment(public_slug or slug)

    with tempfile.TemporaryDirectory(prefix="sh-install-") as tmp:
        tmp_path = Path(tmp)
        code, out, err = run_skillhub(
            ["install", slug, "--dir", str(tmp_path), "--force", "--json"],
            timeout=120,
        )
        if code != 0:
            raise RuntimeError(
                f"skillhub install failed (exit {code}): {err}"
            )

        downloaded_dir = _find_skill_dir(tmp_path, safe_name, slug)
        if downloaded_dir is None or not (downloaded_dir / "SKILL.md").exists():
            raise RuntimeError("SKILL.md not found in downloaded package")

        skill_md = downloaded_dir / "SKILL.md"
        target_root.mkdir(parents=True, exist_ok=True)

        if layout == "single_md":
            target_file = target_root / f"{safe_name}.md"
            shutil.copy2(skill_md, target_file)
            return str(target_file)

        # folder 布局：整文件夹复制（覆盖同名）
        target_dir = target_root / safe_name
        if target_dir.exists():
            shutil.rmtree(target_dir)
        shutil.copytree(downloaded_dir, target_dir)
        return str(target_dir / "SKILL.md")


def _find_skill_dir(tmp_path: Path, safe_name: str, slug: str) -> Path | None:
    """在临时目录中定位含 SKILL.md 的技能目录。"""
    for cand in (tmp_path / safe_name, tmp_path / slug):
        if cand.is_dir():
            return cand
    # 兜底：取 tmp 下第一个含 SKILL.md 的子目录
    for sub in tmp_path.iterdir():
        if sub.is_dir() and (sub / "SKILL.md").exists():
            return sub
    return None
