"""SkillHub Skill Installer - Flask Web 应用入口

启动后浏览器访问 http://127.0.0.1:5000/
功能：搜索 SkillHub 商店技能，选择目标 agent 和作用域后安装到对应目录。

代码结构：
  app.py   - 入口：创建 Flask app、注册蓝图、启动服务
  api.py   - 路由层：Flask Blueprint，HTTP 端点
  core.py  - 业务层：skillhub CLI 调用、agents 配置、榜单缓存、安装实现
"""
from pathlib import Path

from flask import Flask

import api

BASE_DIR = Path(__file__).resolve().parent


def create_app() -> Flask:
    app = Flask(
        __name__,
        static_folder=str(BASE_DIR / "static"),
        template_folder=str(BASE_DIR / "templates"),
    )
    app.register_blueprint(api.bp)
    return app


app = create_app()


if __name__ == "__main__":
    # 仅本机访问；如需局域网开放，把 host 改 0.0.0.0
    app.run(host="127.0.0.1", port=5000, debug=False)
