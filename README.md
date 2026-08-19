# 🛠️ SkillHub Installer

> 一站式搜索、浏览、安装 SkillHub 商店技能到本地 AI Agent（Trae / Reasonix / OpenCode / Qoder）。

在浏览器里搜索 8 万+ AI 技能，查看热度榜单，一键安装到你常用的 AI Agent 目录，省去手敲 CLI 和翻路径的麻烦。

---

## ✨ 功能特性

- 🔍 **快速搜索**：关键词搜索 SkillHub 商店技能，单次拉满 100 条结果
- 📊 **热度指标**：每个技能显示下载量、星标数、榜单排名（热门/精选/最新/推荐/趋势）
- 🏆 **榜单浏览**：5 个榜单 Tab 切换查看，点击搜索结果的榜单标签直接跳转高亮
- 🎯 **智能排序**：搜索结果自动把上榜的技能按 score 降序前置，冷门技能在后
- 📦 **多 Agent 支持**：Trae / Reasonix / OpenCode / Qoder / Claude Code / Codex / CodeBuddy，零代码扩展
- 🌐 **作用域可选**：全局安装（所有项目可用）或项目级安装（仅当前项目）
- 🚀 **国内加速**：数据源走 skillhub CLI（api.skillhub.cn + 腾讯云 COS），国内访问快
- 🧩 **极简依赖**：仅 Flask 一个第三方包，无 Node/DB/构建工具
- 🪟 **跨平台**：Windows / macOS / Linux 都能跑

---

## 📸 截图

> 主界面：搜索框 + 结果列表（卡片显示热度标签）
> 
> ![主界面](docs/screenshot-main.png)

> 榜单视图：5 个 Tab 切换，点击搜索结果热度标签可跳转高亮
> 
> ![榜单](docs/screenshot-rankings.png)

> 安装弹窗：选 Agent 和作用域
> 
> ![安装](docs/screenshot-install.png)

---

## 🚀 快速开始

### 前置依赖

| 依赖 | 版本 | 说明 |
|------|------|------|
| Python | 3.9+ | 推荐 3.10–3.13 |
| Flask | >= 3.0 | `pip install Flask` |
| skillhub CLI | 2026.8.5+ | 数据源，[安装脚本](https://skillhub.cn/install/skillhub.md) |

### 3 步启动

```bash
# 1. 克隆
git clone https://github.com/ly18810890097/skill-installer.git
cd skill-installer

# 2. 装依赖（推荐用虚拟环境）
pip install -r requirements.txt

# 3. 启动
python app.py
```

浏览器打开 **http://127.0.0.1:5000/** 即可使用。

---

## 📁 项目结构

```
skill-installer/
├── app.py              # 入口：创建 Flask app + 注册蓝图（35 行）
├── api.py              # 路由层：Flask Blueprint，5 个 HTTP 端点（110 行）
├── core.py             # 业务层：skillhub CLI / agents / 榜单 / 安装（175 行）
├── agents.json         # Agent 目录规则配置（可自由增删）
├── requirements.txt    # 仅 Flask>=3.0
├── README.md           # 本文档
├── static/
│   ├── app.js          # 前端：搜索 / 分页 / 榜单 overlay / 安装弹窗
│   └── style.css       # 卡片式 UI + 榜单样式
└── templates/
    └── index.html      # 单页入口
```

### 三层架构

| 层 | 文件 | 职责 |
|----|------|------|
| 入口 | `app.py` | Flask 工厂 + 注册蓝图 + 启动 |
| 路由 | `api.py` | 参数解析 + 调业务 + 异常转 HTTP 状态码 |
| 业务 | `core.py` | skillhub CLI 调用 / agents 配置 / 榜单缓存 / 安装实现 |

业务层不依赖 Flask，可被 CLI 脚本或其它入口复用。

---

## 🎯 支持的 Agent

| Agent | 全局目录 | 项目目录 | 布局 |
|-------|----------|----------|------|
| Trae | `~/.trae-cn/skills` | `.trae/skills` | 文件夹 |
| Reasonix | `~/.reasonix/skills` | `.reasonix/skills` | 单 .md 文件 |
| OpenCode | `~/.config/opencode/skills` | `.opencode/skills` | 文件夹 |
| Qoder (CN) | `~/.qoder-cn/skills` | `.qoder/skills` | 文件夹 |
| Claude Code | `~/.claude/skills` | `.claude/skills` | 文件夹 |
| Codex (OpenAI) | `~/.agents/skills` | `.agents/skills` | 文件夹 |
| CodeBuddy Code | `~/.codebuddy/skills` | `.codebuddy/skills` | 文件夹 |

### 新增 Agent

编辑 `agents.json`，加一条配置即可，无需改代码：

```json
"cursor": {
  "label": "Cursor",
  "global_dir": "~/.cursor/skills",
  "project_dir": ".cursor/skills",
  "layout": "folder",
  "doc": "全局：~/.cursor/skills/<slug>/SKILL.md"
}
```

---

## 📡 API 文档

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/health` | GET | 健康检查 + skillhub 版本 |
| `/api/agents` | GET | 返回所有 Agent 配置 |
| `/api/search?q=<关键词>` | GET | 搜索技能（最多 100 条，合并热度数据） |
| `/api/rankings?board=<hot\|featured\|newest\|recommended\|trending>` | GET | 榜单数据 |
| `/api/install` | POST | 安装技能到指定 Agent 目录 |

### 安装请求示例

```bash
curl -X POST http://127.0.0.1:5000/api/install \
  -H "Content-Type: application/json" \
  -d '{
    "slug": "@clawhub_wpank/code-review",
    "public_slug": "code-review",
    "agent": "trae",
    "scope": "global"
  }'
```

---

## ❓ 常见问题

<details>
<summary><b>右上角显示「skillhub 不可用」</b></summary>

- 终端执行 `skillhub -v` 验证 CLI 是否在 PATH 中
- Windows：确认 `~/.local/bin/skillhub.cmd` 存在且 PATH 已包含该目录
</details>

<details>
<summary><b>搜索结果只有 100 条</b></summary>

skillhub 服务端单次搜索硬上限 100 条，CLI 也未提供分页参数。前端已做客户端分批渲染（每页 30 条 + 加载更多）。
</details>

<details>
<summary><b>部分技能没有热度指标</b></summary>

只有上榜的技能才有 downloads/stars/score 数据。未上榜的显示「未上榜（新技能或冷门）」。
</details>

<details>
<summary><b>端口被占用</b></summary>

编辑 `app.py` 最后一行改端口，或设环境变量 `FLASK_RUN_PORT=5001`。
</details>

<details>
<summary><b>项目级安装报「project dir not found」</b></summary>

必须填绝对路径（如 `D:\my-project`），不能是相对路径，且目录需已存在。
</details>

<details>
<summary><b>Reasonix 安装后 IDE 没识别</b></summary>

Reasonix 要求文件名小写、frontmatter 必须含 `description`。重启 Reasonix 让它重新扫描。
</details>

---

## 🔒 安全说明

- 服务仅监听 `127.0.0.1`，不对外暴露，适合本机工具场景
- `safe_segment()` 会过滤路径非法字符，避免路径注入
- 不存储任何 API token 或账号信息

---

## 🛠️ 技术栈

| 层 | 技术 |
|----|------|
| 后端 | Python + Flask 3.x（Blueprint 三层架构） |
| 前端 | 原生 HTML5 + Vanilla JS + CSS3 |
| 数据源 | skillhub CLI（subprocess 调用） |
| 依赖 | 仅 Flask 一个第三方包 |

---

## 📝 开发

### 后台启动

**Windows PowerShell：**
```powershell
Start-Process -WindowStyle Hidden -FilePath "python.exe" -ArgumentList "app.py"
```

**macOS / Linux：**
```bash
nohup python app.py > skill-installer.log 2>&1 &
```

### 添加新功能

- 新增 API 端点：在 `api.py` 加路由函数
- 改业务逻辑：动 `core.py`，路由层无需改
- 加 Agent：改 `agents.json`，代码不用动
- 改 UI：动 `static/` 下的 js/css

---

## 📄 License

MIT

---

## 🙏 致谢

- [SkillHub](https://skillhub.cn/) — 腾讯出品的 AI Skills 社区平台，提供技能数据和 CLI
- 所有技能的作者和贡献者

---

<p align="center">
  觉得有用？欢迎 ⭐ Star 支持！
</p>
