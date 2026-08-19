"""路由层：Flask Blueprint，所有 HTTP 端点。

只负责参数解析和响应封装，业务逻辑委托给 core 模块。
"""
from __future__ import annotations

from flask import Blueprint, jsonify, render_template, request

import core

bp = Blueprint("api", __name__)


# --------------------------------------------------------------------------- #
# 页面 / 元数据
# --------------------------------------------------------------------------- #
@bp.route("/")
def index():
    return render_template("index.html")


@bp.route("/api/agents")
def api_agents():
    return jsonify(core.load_agents())


@bp.route("/api/health")
def api_health():
    """健康检查 + skillhub 可用性。"""
    code, out, _ = core.run_skillhub(["-v"], timeout=10)
    return jsonify(
        {
            "skillhub_ok": code == 0,
            "skillhub_version": (out or "").strip(),
            "skillhub_path": core.resolve_skillhub_cmd(),
        }
    )


# --------------------------------------------------------------------------- #
# 搜索
# --------------------------------------------------------------------------- #
@bp.route("/api/search")
def api_search():
    """搜索技能。参数 q：关键词。"""
    q = (request.args.get("q") or "").strip()
    if not q:
        return jsonify({"results": [], "warnings": ["empty query"]})

    try:
        items, warnings = core.search_skills(q)
    except RuntimeError as e:
        return jsonify({"error": str(e)}), 502

    return jsonify({"results": items, "warnings": warnings})


# --------------------------------------------------------------------------- #
# 安装
# --------------------------------------------------------------------------- #
@bp.route("/api/install", methods=["POST"])
def api_install():
    """安装技能到指定 agent 目录。

    Body JSON:
      {
        "slug": "<skillhub slug>",        # 用于 skillhub install
        "public_slug": "<短名>",          # 用于目标文件夹/文件名
        "agent": "trae|reasonix|opencode|qoder",
        "scope": "global|project",
        "project_dir": "<可选项目绝对路径，仅 project scope>"
      }
    """
    body = request.get_json(silent=True) or {}
    slug = (body.get("slug") or "").strip()
    public_slug = (body.get("public_slug") or slug).strip()
    agent_key = (body.get("agent") or "").strip()
    scope = (body.get("scope") or "global").strip()
    project_dir = (body.get("project_dir") or "").strip()

    try:
        target_path = core.install_skill(
            slug=slug,
            public_slug=public_slug,
            agent_key=agent_key,
            scope=scope,
            project_dir=project_dir,
        )
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except FileNotFoundError as e:
        return jsonify({"error": str(e)}), 404
    except RuntimeError as e:
        return jsonify({"error": str(e)}), 502

    return jsonify(
        {
            "ok": True,
            "agent": agent_key,
            "scope": scope,
            "target": target_path,
            "slug": slug,
            "public_slug": public_slug,
        }
    )


# --------------------------------------------------------------------------- #
# 榜单
# --------------------------------------------------------------------------- #
@bp.route("/api/rankings")
def api_rankings():
    """返回榜单数据。可选 ?board=hot 仅返回单个榜单。"""
    _, raw = core.fetch_rankings()
    if not raw:
        return jsonify({"error": "rankings unavailable"}), 502

    board = (request.args.get("board") or "").strip()
    if not board:
        return jsonify({"rankings": raw})

    if board not in raw:
        return jsonify({"error": f"unknown board: {board}"}), 404
    return jsonify({"board": board, "skills": raw[board].get("skills", [])})
