# RecallCode — 多用户算法复习网站

> 从单文件 UI Demo 升级成可运行的 Web 应用。FastAPI + SQLAlchemy + PostgreSQL（Docker）/SQLite（本地）。无需 Node.js 构建工具。

## 能做什么

- **真实注册 / 登录 / 退出**：Argon2 密码哈希，服务端保存会话（HttpOnly cookie），CSRF 保护。
- **多用户隔离**：每份题单、笔记、评估、复习记录都按登录用户隔离。
- **题单管理**：创建、重命名、删除题单（不会意外清除跨题单共享学习记录）；80 题精选、一组二分题、链表题预置；可粘贴批量题号、题目链接。
- **题目跨题单去重**：同一题出现在多个题单时，全局学习记录只保留一份。
- **两类新用户冷启动**：没有刷过题 → 新题；以前做过的题 → 标记「做过·待评估」而非直接认定掌握。
- **真实复习记录**：Again / Hard / Good / Easy、训练耗时、提示使用、用户确认的是否通过、笔记；服务端持久化。
- **今日推荐与中断恢复**：根据到期情况、历史表现、用户可用时间排任务。
- **学习分析**：分类进度、最近训练历史。个人 JSON 数据导出。
- **响应式界面**：桌面与移动端可用。代码练习跳转 LeetCode，不自建判题执行服务。

## 运行（本地开发，最快）

Python 3.11+，在项目根目录运行：

```bash
python -m venv .venv
# Windows: .venv\Scripts\activate
# Linux/macOS: source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

打开 **http://127.0.0.1:8000**，注册真实账户即可开始使用。

默认使用 `sqlite:///./recallcode.db`，数据库会自动初始化且记录会持久保存。多用户依然严格隔离；但 SQLite 不建议部署成高并发公共服务。

## 运行（Docker + PostgreSQL，建议部署形态）

1. 复制 `.env.example` 为 `.env`，把 `POSTGRES_PASSWORD` 改成长随机密码。
2. 如果只在本机测试，把 `PUBLIC_ORIGIN` 改为 `http://localhost:8000`，`COOKIE_SECURE=false`（仅用于本地 HTTP）。
3. 执行：

```bash
docker compose up -d --build
docker compose logs -f app
```

访问 `http://localhost:8000`。Docker Compose 使用持久化 PostgreSQL 数据卷，App 默认绑定 `127.0.0.1:8000`，不会直接在公网暴露。

部署到自己的公网域名时：

- 配置 DNS；通过 Caddy / Nginx 做 HTTPS 反代到 `127.0.0.1:8000`。
- 把 `PUBLIC_ORIGIN` 设置为 **实际的 HTTPS 域名**（不能带路径）。
- 设置 `COOKIE_SECURE=true`；使用强数据库密码；开启自动数据库备份。
- 参考 `deploy/Caddyfile.example`。
- 启用外部监控和 SMTP 邮箱验证/密码重置等能力之后，再面向不受信任的公众正式发布。

## 关于题单 URL 导入：重要限制

系统具备**真实的 URL 导入接口** `/api/import/url`，并支持可配置的 **授权解析器**：

```env
LIST_RESOLVER_URL=https://your-authorized-resolver.example/api/resolve
LIST_RESOLVER_TOKEN=your-private-token
```

后端只会向部署方预配置的解析器请求，不会根据用户任意输入的网址直接发起外部 HTTP 请求（避免 SSRF）。解析器必须经过合法授权，并返回完整题目列表：

```json
{
  "name": "我的题单",
  "complete": true,
  "questions": [
    {"key":"lc:1","number":1,"title":"两数之和","slug":"two-sum","difficulty":"Easy","topic":"哈希表","minutes":7,"url":"https://leetcode.cn/problems/two-sum/"}
  ]
}
```

**默认没有预装力扣自动抓取器**。力扣服务条款限制未经授权的数据复制、垂直搜索等使用方式；公开可见不代表有自动批量读取授权。未配置解析器时输入题单 URL 会返回真实错误，而不是用示例数据伪装成导入成功。现在可直接使用 **批量粘贴题号或题目链接** 导入自己的列表；不使用 CSV / TSV。

引用平台条款： https://leetcode.cn/terms/

另外，内置 80 道题明确标为「热门算法精选（80题）」，**不是**完整官方 Hot100。题名/编号/链接为手工整理的元数据，不包含完整受版权保护题面。未知题号会如实显示「待补充标题」。

## 数据设计

- `users` / `auth_sessions`：账户、可注销会话。
- `problems`：通用题目元数据。
- `study_lists` / `list_items`：每个用户的题单和题目关系。
- `progress`：`(user_id, problem_key)` 复合主键，全局掌握状态和个人笔记。
- `reviews`：单次学习/复习记录，永久留存（除非后续提供删除账户功能）。

进入训练时会跳转 LeetCode 的编程环境；题目执行结果由用户自己确认；目前网站不会读取或代替 LeetCode 的判题系统。

## 测试

```bash
# API：真正两个账户间数据隔离、首评、复习、CSRF、登录持久化、URL校验
PYTHONPATH=. python tests/test_multiuser.py
# JavaScript 静态语法检查（需 Node.js）
node --check app/static/app.js
```

首次渲染与主要交互已使用 Chromium 测试：用户注册 → 引导 → 批量标记 → 评分 → 题单导入 → 重命名 → Analytics。

## 当前实现与上线前还缺什么

这个仓库已经是**可部署、真实保存多用户数据的运行应用**，不是一个模拟账户的静态 Demo。但它仍属于 **可运营试用版 / production-oriented MVP**，不是已完成合规与安全验收的公共商业服务：

- **尚未包含**：注册邮箱验证、忘记密码邮件、MFA、验证码、Redis 分布式限流、管理后台与滥用处理、完整账户删除/数据恢复流程。
- **尚未包含**：数据库版本迁移（当前自动建表，仅适用于首次初始化）；正式升级应加 Alembic。
- **尚未包含**：部署方授权的任意公开力扣题单解析器、数据源持续同步；自动抓取平台非公开接口不是默认能力。
- **尚未包含**：FSRS 的学习数据校准、AI 真正语义解题提示、浏览器插件自动判断 Accepted。
- **生产注意**：`login_attempts` 仅内存节流，分布式部署需要网关 / Redis 限流；在反向代理正确配置来源 IP 和 HTTPS；设置操作日志、备份、数据保留政策和告警。

## API

开发模式下： http://localhost:8000/api/docs

- `POST /api/auth/register`, `/api/auth/login`, `/api/auth/logout`, `GET /api/me`
- `GET /api/dashboard`, `GET /api/lists`, `GET /api/problems`, `GET /api/analytics`
- `POST /api/import/parse`, `/api/import/url`, `/api/import/commit`
- `PATCH /api/lists/{id}`, `DELETE /api/lists/{id}`
- `POST /api/progress/prior`, `POST /api/reviews`, `PATCH /api/progress/{key}/note`
- `GET /api/export`, `GET /api/health`

License: 本交付代码可作为你自己的原型和后续开发基础；LeetCode 及其商标、题库内容不属于本项目。

## Render 免费公网部署（新增）

仓库根目录提供 `render.yaml`（Free Web Service + 外部 PostgreSQL），启动命令会使用 Render 提供的 `PORT`，并从 `RENDER_EXTERNAL_URL` 获取正式网站来源地址。生产模式拒绝使用易丢失的本地 SQLite；健康检查还会验证数据库连接。

**完整操作步骤：** `deploy/RENDER_DEPLOY_CN.md`。首次部署需要创建 GitHub 仓库、配置长期可用的 PostgreSQL 连接、在 Render 控制台授权并创建服务。文件准备好不代表网站已经部署上线。
