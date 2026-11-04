# RecallCode 2.0 仓库审计

审计日期：2026-11-04。验收依据：`docs/RECALLCODE_V2_PLAN.md`（由同目录原始中文实施计划书逐字复制）。

## 开发基线与生产保护

提供的工作目录原为没有 `.git` 的源码副本。经用户确认，从 `https://github.com/userlyly/RecallCode.git` 获取 `origin/main` 历史，以该提交创建 `feature/recallcode-v2-extension`，通过索引建立基线，不覆盖工作文件。工作文件与远端基线一致，原有中文计划书为额外文件。未推送、未合并、未操作 Render。

## 现有架构

- `app/main.py`：FastAPI、SQLAlchemy，支持 SQLite 和 PostgreSQL。实体为 User、AuthSession、Problem、StudyList、ListItem、Progress、Review。
- `app/static/`：原生 JavaScript、HTML、CSS 网站，依赖已登录服务端 API。
- `app/catalog.json`：精选题元数据，不能作为完整 Hot100/150/SQL50。
- `tests/test_multiuser.py`：使用独立随机 SQLite 数据库验证账户隔离、CSRF、题单共享进度、评分、粘贴导入与会话持久化。
- `Dockerfile`、`docker-compose.yml`、`render.yaml`、`deploy/`：v1 部署配置，本次保持不变。

## API 和可复用规则

`/api/auth/*` 和 `/api/me` 提供身份与设置；`/api/dashboard` 调用 `planning()`；`/api/lists`、`/api/problems`、`/api/presets` 管理题单；`/api/import/parse`、`/api/import/url`、`/api/import/commit` 处理导入；`/api/progress/prior` 标记历史做过；`/api/reviews` 保存四档评价；`/api/analytics` 与 `/api/export` 提供统计和备份。

可以复用的业务规则：跨题单按题目 key 共享 progress；删除题单保留其他引用；历史做过不能覆盖真实评分；训练结果由用户确认。旧 `planning()` 有超预算兜底，旧评分为自定义间隔，均不可原样移植为 v2 Planner 或 FSRS。

## 迁移风险

`/api/export` 导出 version=1，含 profile、lists、problems、reviews。lists 仅题单概要，不提供完整题单隶属关系；analytics 仅返回最近 500 条 review。v2 应将题目放入明确的历史导入题单，提示不完整，保留 legacyMetadata，不用旧评分推算 FSRS 状态。应丢弃 profile 的身份资料。重复迁移必须使用确定事件 ID。

## 基线测试

首次执行因全局 SQLAlchemy 过旧无法导入 DeclarativeBase。已在项目 `.venv` 按 requirements.txt 安装依赖；业务断言通过后发现 Windows 文件占用导致测试清理失败，在测试 finally 中增加 engine.dispose()。重跑退出码 0，所有旧版测试 PASS。原站业务和部署文件未修改。

## 阶段状态

- Phase 0：完成。
- Phase 1–5：源码与构建已实现，自动化及真实浏览器结果见 `RECALLCODE_V2_VALIDATION.md`；尚有原生权限弹窗、物理工具栏点击、最低版本 Chrome 等人工验收未完成，不声称计划全量验收通过。
