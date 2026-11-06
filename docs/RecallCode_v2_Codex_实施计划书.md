# RecallCode v2.0｜极简免登录算法学习与间隔复习插件

> **执行级产品需求与技术实施计划（PRD + Technical Design + Acceptance Criteria）**  
> 版本：v2.0 / 2026-11-04  
> 目标执行者：Codex（在现有 GitHub 仓库中开发、测试、交付）  
> 仓库：`userlyly/RecallCode`（原 `main` 为已上线的 FastAPI + PostgreSQL 网站）  
> **原则：不要制作静态 Demo；产物必须是可在 Chrome 桌面浏览器中“加载已解压的扩展程序”并真实使用的 Manifest V3 插件。**

---

## 0. Codex 总执行指令（请先阅读）

你是本项目的实现者，负责从已有 RecallCode 仓库中开发 **免注册、离线优先、力扣中国站可用的 Chrome 扩展**。先完成仓库审计，再依次实现数据模型、FSRS 调度、每日计划、Side Panel、完整管理页、LeetCode 内容脚本、题单导入、测试与安装文档。除非遇到必须由仓库所有者授权的数据接口或浏览器权限，否则自行做合理技术选择并持续推进，不要只给建议或半成品。

**绝对约束：**
1. 先创建开发分支 `feature/recallcode-v2-extension`；**不直接修改或合并生产 `main`，不触发 Render 自动部署**。可在项目根目录增加 `extension/`、`docs/` 与测试，旧 `app/`、`Dockerfile`、`render.yaml` 默认保持不变。
2. 用户 **无需注册和登录**；所有核心功能必须离线可用；学习记录以本机浏览器扩展的数据为准。禁止悄悄把数据上传到自建服务或第三方。
3. 插件并非只能在 `leetcode.cn` 打开：工具栏图标可随时打开 Side Panel；完整管理页为 `chrome-extension://…/dashboard.html`，可在任意网页下访问。
4. **不得伪造实际数据来源。** 不得把 80 道精选题冒充 Hot100，不得把识别 URL 当作成功解析题单，不得把拟实现功能展示为已完成。
5. **公开力扣题单 URL 导入采用“能力尽力支持、结果严格验证”的原则**：不绕过登录、反爬、付费或平台规则，不调用未经授权的私有接口，不声称所有公开 URL 必定可解析。已登录页面内容、页面可见列表、用户主动复制/粘贴等方式仅在平台规则允许且获得用户权限的情况下使用。无法完整确认时显示原因并提供批量粘贴回退。
6. 原网站存在真实用户数据；不能删除旧数据库、覆盖现有数据或停掉线上服务。实现 **v1 JSON 导出 → v2 本地导入** 的数据迁移路径，不使用原有账号作为插件身份。
7. 代码、测试、可加载扩展构建产物、截图、操作手册都是交付内容。每阶段运行测试，完成前必须真实加载扩展并验证关键路径。

---

## 1. 产品定位、目标用户与成功标准

### 1.1 产品一句话

**RecallCode：每天打开，就知道应该学哪些新题、复习哪些旧题；即使中断很久，也能轻松重新开始。**

定位：轻量级、免登录、隐私优先的 **LeetCode 算法学习计划 + 间隔复习助手**。它不是判题平台，也不是复杂的 AI Agent 产品。解题与提交仍在力扣完成。

### 1.2 主要用户
- 正在练习 LeetCode Hot100、面试经典 150 或 SQL 50 的学生、求职者。
- 曾刷过几十道题但缺少系统复习，希望初始化历史进度的用户。
- 习惯使用 `leetcode.cn` 的中文用户，可能连续数日或数周不刷题。

### 1.3 MVP 成功标准（全部需可复现）
1. 安装扩展后 **零账号、零服务器配置**；1 分钟内选择题单和每日时间预算，生成今日任务。
2. 关闭/重启浏览器后，题单、评分、笔记、时长、设置和日历仍存在；浏览器扩展升级后不丢失。
3. 工具栏图标在普通网页上也能打开 Side Panel；能打开完整管理标签页。
4. 预置 100/150/50 题单数据准确、完整；跨题单共享同一道题的学习记录。
5. 今日计划同时支持新题/到期复习/历史待评估；停学 7/30/90 天后重新打开，自动给出可执行、受时间预算约束的恢复计划。
6. 从 `leetcode.cn/problems/.../` 能识别当前题目、开始训练、手动评分并自动创建复习记录；不依赖“自动识别 Accepted”才能工作。
7. 学习分析四个核心指标和实际行为日历数据一致；导入备份可恢复。
8. 不存在虚假“导入成功”、重复题目双重计数、错误跨日期时区、无限计时或丢失复习历史问题。

### 1.4 非目标（MVP 明确不做）
- 后端账号、云端同步、付费订阅、社交/排行榜、AI 聊天、在线判题、移动 Chrome 插件适配。
- 自动破解平台页面权限、直接读取账号私有提交记录、绕开平台限制爬取完整题库。
- 完整的 FSRS 参数个性化训练；首版使用经验证的 FSRS 默认参数即可。

---

## 2. 产品形态与入口

**首版只维护一个真正的 Chrome 扩展产品，不再开发一套数据不同步的“免登录网站”。**

### 2.1 三个入口，同一份本地数据

| 入口 | 打开方式 | 用途 | 是否需要打开力扣 |
|---|---|---|---|
| **Side Panel（主要入口）** | 点击浏览器工具栏 RecallCode 图标 | 查看今日计划、开始任务、评分、查看进度 | 否 |
| **Dashboard（完整管理页）** | Side Panel 内点击“打开完整页” | 题单管理、导入、学习分析、偏好与备份 | 否 |
| **力扣页面快捷交互** | 进入 `leetcode.cn/problems/<slug>/` 时显示轻量入口 | 当前题识别、开始/暂停计时、手动四档评分 | 是 |

实现细节：Manifest V3；`sidePanel` 权限；默认面板为扩展内部页面，工具栏动作打开 Side Panel；Dashboard 由 `chrome.tabs.create` 打开独立扩展页面。**不要设置会与 action-click 打开 Side Panel 冲突的 `default_popup`。**

### 2.2 极简导航
- Side Panel：**今日**（主视图）/ **题库**（快捷入口）/ **分析**（简版数据）/ **设置图标**。
- Dashboard：**今日学习、算法题库、学习分析** 三个主导航，**偏好设置**通过右上角入口打开。
- 不再单独设置“智能复习”导航；新题与复习融入同一个今日计划。

### 2.3 首次引导（最多 3 步）
1. 选择预置题单：热题 100 / 面试经典 150 / SQL 50（可多选）；也可跳过并导入自定义题单。
2. 选择历史状态：全部未做 / 以前做过一部分（批量勾选）/ 几乎都做过。以前做过的标为 **`prior_unassessed`**，绝不直接判定掌握。
3. 设置每日可投入时间（15 / 30 / 45 / 60 分钟，默认 30）、每日新题上限（默认 2）。完成后直接进入今日计划。

---

## 3. 功能规格与验收

### 3.1 今日学习（P0）

布局：日期 + 今日进度 → `待复习 N / 待评估 N / 新题 N` → **今日建议任务** → **开始今日学习**。同屏显示估计总时长，不强行展示所有逾期题。

行为：
- 每天打开即生成建议，不需要每天后台任务。
- 任务类型：`review`（到期复习）、`assess`（以前做过但尚未初评）、`new`（新题）。每道题标明题号、题名、类别、难度、预估耗时。
- 点击任务在新标签打开 `https://leetcode.cn/problems/<slug>/`；当前题由插件识别，用户可完成评分。
- 用户可调整今天的时间预算；任务重新规划，但已完成记录不消失；刷新不无故打乱尚未完成的任务顺序。
- 完成一次评分后，从今日未完成队列中移除该任务；必要时依据剩余预算补充任务，但不无限“加题”。
- 提供 `暂时跳过今天` / `稍后复习`，不修改 FSRS 的长期记忆状态；单独记录用户计划层的 defer/snooze 信息。
- 未首次选择题单时展示明确空状态 + “添加题单”，不展示虚构学习成果。

**验收：** 关闭面板重开任务一致；完成一题后数量、记录和到期日期正确更新；无新题或无到期题时正常空状态；预算 15/30/60 分钟可用。

### 3.2 专注训练与评分（P0）

最小操作链：`开始 → 打开力扣 → 计时 → 用户主动标记完成 → Again / Hard / Good / Easy → 保存 → 下一题`。

- 在插件侧边栏与力扣页面均能访问本次会话，但同一题同时只能有一份活跃会话；重复点击不产生双会话。
- 允许暂停、继续、结束、不记录、撤销上一条评分（可选做最近一次撤销，需真实回滚记录和调度状态）。
- 四档语义：Again = 独立做不出；Hard = 较多提示或耗时明显偏长；Good = 基本独立完成；Easy = 快速熟练完成。**Accepted 与评分不是同一概念**；未授权/未验证的提交数据不能自动当作成功。
- 评分后立即保存：`review event`、FSRS 状态、耗时、是否用提示、可选个人笔记；页面反馈下一次预计复习时间。
- 不内置大段标准题解，不依赖 AI 推理服务。力扣页面提示浮层要可关闭、位置克制、不覆盖代码编辑器。

**验收：** 页面刷新、切换标签、扩展后台 Worker 休眠后无重复评分或计时异常；断开网络后仍能评分与保存。

### 3.3 算法题库（P0）

**三个完整、准确的预置题单（不是示例题单）：**

| ID | 对外显示名称 | 要求 |
|---|---|---|
| `hot100` | 力扣热题 100 | 实际 100 道有效题目 |
| `interview150` | 面试经典 150 | 实际 150 道有效题目 |
| `sql50` | SQL 50 | 实际 50 道有效题目 |

- 每个预置题单是**版本化的静态元数据清单**，包含来源 URL、抓取/核验日期、`questionId / frontendId / title / titleSlug / url / topic / difficulty / ordinal`（无法确认的字段允许 `unknown`，不得编造）。只保存题目标题、编号、分类、链接等必要元数据，不复制完整题面、题解或受限内容。
- 提交前校验题量恰好为 100/150/50；所有题目必须能规范化为唯一题目 key；题单内不得重复。
- 支持多个自定义题单，添加、重命名、删除；展示进度、已学数、未学数、待复习数，支持从题单进入开始学习。
- 同一道题跨题单只保存 **一份共享进度与复习历史**。删除题单不应删除其他题单引用的题目状态。默认保留孤儿题目历史以防误删，提供显式清理流程。
- 支持搜索、按状态/难度/分类筛选；初期不做复杂高级题库管理。

**题目唯一键**：优先 `leetcode:<站点规范化标识>:<frontendQuestionId>` 或稳定的官方 `questionId`，若站点标识一致且编号不冲突可跨中英文站共用；不能仅用显示题名判重。URL slug 作为跳转与兜底，遇到未知题号不得凭标题猜测已存在。定义明确的 key 迁移/别名规则并做测试。

**验收：** 三个预置题单精确题数、无重复与错误 URL；同一道题进入两张题单，评分后两边进度同步；改名不影响历史；删除不误伤其他列表。

### 3.4 自定义题单导入（P0：可用兜底；P1：尽力自动化）

入口只保留 **「预置题单 / 公开题单链接 / 批量粘贴」**，不做 CSV/TSV 导入。

**A. 批量粘贴（必须可用）**
- 可粘贴题目编号（每行一个、逗号分隔）、完整 `leetcode.cn/problems/<slug>/` URL、部分列表复制文本或 Markdown 链接。
- 尽可能解析编号与 URL；未知题目可以留存 `待补全标题` 并提供编辑，不得捏造官方数据；对无法识别的行列出原因。
- 预览 `识别 N / 重复 K / 未识别 M`，用户确认后入库；同名列表冲突时明确「合并/另存新名」，不静默覆盖。

**B. 公开题单 URL（分级兼容）**
- 接受官方 `leetcode.cn/studyplan/...` 和用户公开 `leetcode.cn/problem-list/...` 等经验证的 URL 类型；预留 `leetcode.com` 适配层，首版重点中国站。
- 用户粘贴 URL 后，扩展可在用户操作下打开该题单标签页，并申请仅对应力扣域名所需的站点权限（不申请 `<all_urls>`）。
- Content Script / 适配器只能处理用户当前页面中依法可用、确实可读取的数据；不绕过登录验证、反爬、付费壁垒，不调用未经授权私有接口。
- 如果列表由懒加载、分页或折叠区块组成，要检测当前解析的数量与页面可验证总量；无法确认完整性时**禁止标记为完整导入**，显示 `已识别 N 道 / 完整性未确认`，并提示用户滚动或复制题单文本进行补齐；导入部分结果必须明确告知并让用户主动确认。
- 只在明确读到实际题目元数据后允许进入确认页；**仅识别 URL 中的 slug 不算导入成功**。
- 解析器按网站与页面类型分层封装，DOM 选择器变化时局部修复；异常详细记录但不可上传私有页面内容。
- 为 `URL 无权限 / 无数据 / 分页不完整 / 私有题单 / 格式变化 / 网络错误` 提供明确错误态。
- **产品愿景是支持任何公开题单，但不得作为保证能够解析所有 URL 的验收承诺。** Codex 要交付至少 1 个官方公开学习计划和 1 个用户公开题单的现场合法验证报告（若无法取得符合权限的公开数据，则如实记录限制和可操作的粘贴回退方案），不能用静态 mock 宣称通用 URL 导入完成。

**验收：** 粘贴 10 个题号可保存、同一题不重复；未知链接正确报错；无法完整解析的 URL 不显示虚假成功；已授权可读取页面真实题目能成功进入预览。

### 3.5 学习分析（P0）

只展示核心数据，减少面板复杂度：

1. **今日学习与复习**：今天完成的 `new` 次数与 `review/assess` 次数，分开展示，不混为同一个“已学题数”。
2. **累计学习**：至少完成一次有效首次学习/初评/复习记录的 **不同题目数**，跨题单去重。
3. **今日学习总时长**：按用户本地时区归档、真实已记录的有效训练秒数累加。
4. **累计总时长**：全部有效训练会话秒数求和。
5. **学习日历**：默认展示最近 12 周，完整管理页可查看最近一年。日历按“有真实训练记录的本地日期”着色；点击日期展示当天题目和时长；未学习日为空，不因为推荐了任务而染色。
6. **简单分类进度**（可折叠）：哈希、双指针、二分、DP、树、图、SQL 等已学/待复习统计。

**口径要求：** 当天同题复习两次 = 两条复习事件，但累计不同题目数仍为 1；同题属于三张题单仍只算一次；过滤取消的训练会话，统计不因刷新重复计数。默认时间按用户本地日期，存储 UTC ISO 时间戳；跨天会话按实际有效时间段分摊或明确规定归属并实现一致，测试夏令时/跨时区。

### 3.6 设置与备份（P0）
- 每日时间预算（默认 30 分钟）；每日新题上限（默认 2）；新题/复习偏好（均衡、偏复习、偏新题）；是否在高积压时自动减新题；目标记忆保持率（可高级折叠，默认 0.9）。
- 是否启用 LeetCode 页面内快捷交互；可选简易通知开关（通知属于 P1，MVP 不要求）。
- **JSON 备份导出 / 导入恢复**：可见 `schemaVersion`、`exportedAt`、`sourceApp`；包含题单、题目、进度、复习事件、训练会话、设置；导出不包含 Cookie、令牌、密码。
- JSON 导入前展示校验结果与冲突策略（默认合并而非覆盖、去重键为 stable id），导入过程事务化，失败不得留下半写入数据；必要时提供“先导出现有数据”提醒。
- 单独支持从现有 RecallCode v1 账户导出的 JSON 文件迁移；在旧网站用户自行登录后导出，再在 v2 插件导入。不可直接访问旧服务账户资料。
- 支持显式“清空本地全部数据”并二次确认；明确卸载扩展/清理扩展数据可能丢失数据；考虑提示定期备份。

---

## 4. 调度方案：FSRS + 每日计划器（核心算法）

**原则：FSRS 解决每道题“什么时候复习”；Daily Planner 解决“今天有限时间做哪些题”。不要将两层逻辑混在一起。**

### 4.1 FSRS 层
- 优先使用维护中的 TypeScript `ts-fsrs` 官方仓库版本，**锁定具体版本**；根据实际安装版本与 README 选择 API。当前 v6 文档采用 `DefaultScheduler()` 异步初始化，Node.js 需要 >=24；不可把 v5 的 `fsrs()/createEmptyCard()` API 与 v6 直接混用。
- 每题独立持久化 FSRS 卡片状态（difficulty/stability/due/lastReview 等，以实际库序列化结构为准）+ 原始评分日志，未来允许版本迁移和重算。
- 默认目标保持率 `0.90`；Again/Hard/Good/Easy 对应 FSRS 评分，不私自把“是否 Accepted”代替记忆评分。
- 初次没有记录的题保持未学；以前做过但未知评分为 `prior_unassessed`；**没有真实历史评分的数据不能伪造 FSRS 历史卡片**，需要首次正式评价后初始化。
- 复习截止日期是计划推荐依据，用户几周未打开不需要“每天结算”；实际复习时用真实时间进行状态演进。
- FSRS 更新必须与新增 `ReviewEvent` 在一个事务内落盘；取消或重复点击不可产生重复记录。

### 4.2 Daily Planner 层

**输入**：候选题目、FSRS 到期时间、历史评分、此前做过未评估标识、所属已启用题单、预估时长、用户每日预算与新题上限、今天本地日期、今日已完成记录。  
**输出**：稳定、有限、解释得清楚的今日任务列表。每个任务包含 `taskType`、`estimatedMinutes`、`reason`、`priority`。

推荐原则：
1. 到期/逾期题优先，但不能强制用户当天清空所有积压；禁止因为逾期几十道而输出一整页待办。
2. 在“默认均衡”且预算允许时，适当混合新题与复习；优先遵循用户的新题上限与偏好。
3. 历史 `prior_unassessed` 适量穿插，避免一次性大量初评。
4. 预估耗时：优先参考用户该题/相似难度历史会话时长；不足时按 Easy/Medium/Hard/SQL 的保守默认值；避免 15 分钟预算推荐出一堆 25 分钟题。
5. 同一天反复打开、没有新事件时结果稳定；已完成的今天任务不要重新推荐（如 FSRS 在同一天安排短时再次复习，必须有明确的短间隔提醒逻辑而不是消失）。
6. 用户“暂缓今天”只更新计划层 postpone 状态，不暗改 FSRS due、评分与记忆难度；次日再次评估。

**长期中断恢复策略**（要可测，阈值设为参数而非硬编码 UI）：
- `inactiveDays >= 7` **或** 到期积压 `backlog >= 10` 时进入 `recoveryMode`。
- 恢复模式默认 **70%—100% 时间用于到期/薄弱题**，把每日新题上限降至 0 或 1（用户可手动选择继续新题）；每天只推荐预算内可完成的少量任务；不一次性重新给 35 道题设相同 due。
- 优先级综合：逾期程度（截断避免极端值主导）、最近评估表现、到期 FSRS 状态、题型偏好与预计耗时。使用可解释分数，输出 `reason`（如“已逾期 12 天，且上次 Hard”）。
- 长期中断 7 / 30 / 90 天，在预算 15 / 30 / 60 分钟下，都能生成合理计划；全部到期题超过预算时不会无限新增任务。
- 系统可以显示“积压 35 道”，但首页重点展示“今天建议完成 3 道”，避免制造压力。

### 4.3 日期与计时准确性
- 所有事件存储 UTC 时间，展示时通过用户当前时区（默认系统时区，可设置）计算日历天。
- 不依赖 Service Worker 常驻运行。训练会话记录 `startedAt`、当前状态、累计活跃秒数、最近心跳/更新时间；实现暂停/恢复、离开后恢复、浏览器关闭重启后纠错。
- 对长期离开电脑、挂起标签页、异常长会话做限额和合理处理；不可直接用无限增长的墙上时间冒充有效学习时间。
- 页面快捷交互和 Side Panel 同时操作时，需防止同一次评价双重提交；使用唯一 `eventId` / 幂等保存。

---

## 5. 技术架构（首选推荐）

### 5.1 技术栈

| 层 | 首选 |
|---|---|
| 扩展标准 | Chrome Extension Manifest V3；目标 Chrome 桌面版 114+ |
| UI | React + TypeScript + Vite（若现有 UI 复用收益高可适配 CSS，不强制引入 UI 框架） |
| 扩展界面 | Side Panel + 独立 Dashboard Tab + LeetCode Content Script |
| 存储 | IndexedDB（推荐 Dexie）保存题目、题单、进度、复习日志、会话；`chrome.storage.local` 保存轻量设置/初始化状态 |
| 调度 | `ts-fsrs`（锁定版本） + 纯 TypeScript Daily Planner |
| 扩展通信 | `chrome.runtime.sendMessage`、必要时 `chrome.storage.onChanged` / 页面刷新订阅；统一业务服务层 |
| 测试 | Vitest（核心逻辑）+ Playwright（Dashboard/Side Panel）+ Chrome 扩展集成测试 |
| 部署 | `npm run build` → `dist/` 加载为已解压扩展；后续可选发布 Chrome Web Store |

**优先本地化、不依赖 Python 服务**。原 `app/main.py` 里的 `planning()`、四档评分、题单去重与首次引导可作业务参考，但不能在插件中直接依赖 FastAPI API。要把核心逻辑迁移成浏览器端模块。

### 5.2 推荐代码组织（允许 Codex 依据仓库调整）

```text
RecallCode/
├── app/                              # v1 线上 FastAPI，保持不变
├── extension/
│   ├── manifest.config.ts            # 或 manifest.json
│   ├── package.json
│   ├── src/
│   │   ├── background/               # MV3 service worker，注册事件/消息
│   │   ├── sidepanel/                # 高频每日学习
│   │   ├── dashboard/                # 今日、题库、分析、设置
│   │   ├── content/                  # leetcode.cn 题目与题单页面适配
│   │   ├── components/               # UI 复用组件
│   │   ├── domain/
│   │   │   ├── types.ts
│   │   │   ├── canonicalize.ts        # 题目 key 与 URL 规范化
│   │   │   ├── fsrs.ts                # FSRS 封装
│   │   │   ├── daily-planner.ts       # 时间预算与恢复模式
│   │   │   ├── analytics.ts
│   │   │   └── import/               # 粘贴/URL/页面解析器
│   │   ├── storage/
│   │   │   ├── db.ts                  # Dexie schema + versioned migrations
│   │   │   ├── repositories.ts       # IndexedDB 读写封装
│   │   │   └── backup.ts             # JSON 备份/合并/v1 迁移
│   │   └── data/
│   │       ├── hot100.json
│   │       ├── interview150.json
│   │       └── sql50.json
│   ├── tests/                         # 单测/集成/端到端
│   └── README.md                      # 构建、安装、权限解释、备份
├── docs/
│   └── RECALLCODE_V2_PLAN.md
└── ...                                # 原项目文件
```

### 5.3 数据模型（明确数据不属于任何云端账号）

最低实体：

```ts
// 仅作领域模型规范，字段可根据 ts-fsrs 真实序列化格式调整
interface Problem {
  key: string;                   // 稳定主键（优先官方 ID）
  frontendId?: string;
  title: string;
  titleSlug?: string;
  difficulty?: 'Easy'|'Medium'|'Hard'|'Unknown';
  topics: string[];
  url: string;
  source: 'preset'|'page'|'paste';
}
interface StudyList {
  id: string;
  name: string;
  problemKeys: string[];
  sourceUrl?: string;
  sourceType: 'preset'|'url'|'paste';
  createdAt: string;
  enabledForPlanning: boolean;
}
interface ProblemProgress {
  problemKey: string;
  state: 'unseen'|'prior_unassessed'|'learning'|'reviewing';
  fsrsCard?: unknown;             // 经版本化序列化的真实 fsrs card
  lastReviewedAt?: string;
  note?: string;
}
interface ReviewEvent {
  id: string;                     // UUID，支持幂等
  problemKey: string;
  rating: 'Again'|'Hard'|'Good'|'Easy';
  kind: 'new'|'assess'|'review';
  reviewedAt: string;             // UTC
  activeSeconds: number;
  usedHint?: boolean;
  passed?: boolean|null;
  fsrsVersion: string;
}
interface TrainingSession {
  id: string;
  problemKey: string;
  startedAt: string;
  status: 'running'|'paused'|'finished'|'cancelled';
  activeSeconds: number;
  lastResumedAt?: string;
}
interface Preferences {
  minutesPerDay: number;
  newPerDay: number;
  focus: 'balanced'|'review'|'new';
  retention: number;
  timezone: string;
  enableLeetcodeInline: boolean;
}
```

必要的 IndexedDB 表/索引：`problems.key`、`studyLists.id`、`listItems[listId+problemKey]`、`progress.problemKey`、`reviewEvents.id`（索引 `reviewedAt`、`problemKey`）、`trainingSessions.id`、`dayDeferrals[date+problemKey]`、`meta.schemaVersion`。**多题单不复制同一题的 progress**；备份包含 schemaVersion 和转换函数。注重跨窗口数据一致性与事务原子性。

### 5.4 MV3 安全权限原则
- 必需权限尽可能少：`sidePanel`、`storage`、根据实现所需的 `scripting` / `activeTab`；`tabs` 仅在实际 API 需要时申请。不要直接使用 `<all_urls>`。
- `leetcode.cn` 的内容脚本权限应限定到特定域名；若采用按需注入，使用 `optional_host_permissions` 并在点击“启用力扣集成/导入当前题单”后解释授权。
- 不读取/存储力扣 Cookie、认证 Token、输入中的代码、完整私人页面内容；不发送学习数据到外部网络。
- 扩展静态资源均随包发布，遵循 Manifest V3 的 CSP；不加载远程可执行 JavaScript，不用 `eval`，DOM 输出防 XSS。
- 任何由页面传来的消息校验域名、消息类型、参数；外链仅允许验证过的 `https://leetcode.cn/problems/…` / 相应白名单。
- 首版 UI 应在中国站页面改版时安全降级，不阻断原站使用。

---

## 6. 原 v1 网站与数据迁移策略

**当前真实仓库：** `app/main.py`（FastAPI + SQLAlchemy）、`app/static/index.html`、`app/static/app.js`、`app/static/styles.css`、`app/catalog.json`、`tests/test_multiuser.py`、`Dockerfile`、`render.yaml`。现有 Render `main` 自动部署，开发新插件时务必隔离分支。

**旧数据 JSON 结构（来自当前 `/api/export`）：**

```json
{
  "version": 1,
  "exported_at": "...",
  "profile": { "email": "...", "name": "..." },
  "lists": [ { "id": "...", "name": "...", "source_url": "...", "total": 10 } ],
  "problems": [ { "key": "lc:1", "number": 1, "title": "...", "state": "rated", "rating": "good", "next_due": "...", "note": "..." } ],
  "reviews": [ { "problem_key": "lc:1", "rating": "good", "kind": "new", "seconds": 300, "date": "..." } ]
}
```

迁移要求：
1. 新版能够识别 v1 JSON 与 v2 本地 JSON 两种结构；导入界面清楚区分。
2. **现有 v1 导出仅包含题单元数据，不一定包含完整的每个题单→题目隶属关系，且历史 reviews 最多只导出最近 500 条。** 必须明确提示“迁移可能不完整”；不得暗中把所有题目分配到所有题单或伪造旧历史。对缺失关系可创建“历史导入题目”统一题单供用户重新归类。
3. 旧 `rating/next_due/last_review` 保留为 `legacyMetadata`（供显示/优先级过渡参考）；没有真实完整 FSRS 状态时将其标为 **待 FSRS 初评**，用户第一次真正评分后创建 FSRS 卡片。**不得凭旧 rating 反推出虚构的 FSRS stability/difficulty。**
4. v1 备份可能有用户邮箱等个人信息，只为迁移解析；不得在新插件中继续保留旧登录凭据或把邮箱当成身份。
5. 历史 JSON 导入默认合并、按稳定 ID 去重、事件导入生成可复现幂等键；不重复叠加训练时长。
6. **先导出旧版数据备份再导入新插件**。任何操作不得触发线上旧数据库清理；上线旧站如何退役由产品所有者另行决定。

---

## 7. 分阶段开发顺序（Codex 必须按此推进）

> 所有阶段的实际产物必须可运行且经测试；上一阶段有 blocker 时要明确报告，不得通过硬编码假数据跳过。

### Phase 0｜仓库审计与保护生产环境
- [ ] 列出现有文件、关键 API、DB 模型、可复用领域逻辑和风险。
- [ ] 创建 `feature/recallcode-v2-extension` 开发分支，不改 `main`。
- [ ] 在 `docs/RECALLCODE_V2_PLAN.md` 保存本计划，并写 `extension/README.md`。
- [ ] 保证 v1 测试不被破坏。

**DoD：** 有仓库审计说明；旧服务文件与部署配置未经破坏性改动。

### Phase 1｜扩展脚手架与本地数据层
- [ ] 建立 MV3 + TS + Vite + React（或合理等价方案）工程、Manifest、Side Panel、Dashboard 页面。
- [ ] `chrome.storage.local` + IndexedDB（版本迁移、CRUD、事务、可靠刷新）。
- [ ] 首次引导、JSON 导出/导入、数据恢复和 v1 迁移基础功能。
- [ ] 图标点击任意网站均能打开插件；Side Panel 跳转完整管理页。

**DoD：** 扩展可被 Chrome 加载；无需登录；浏览器重启后数据仍保留。

### Phase 2｜题库和预置题单
- [ ] 建立三份已核验题单 100/150/50，并用数据质量脚本检查题量、去重、题目 URL。
- [ ] 多题单、搜索、筛选、重命名/删除；全局学习状态去重。
- [ ] 批量粘贴导入、预览、错误展示、冲突处理。
- [ ] 实现初始化“历史做过·待评估”的批量选择。

**DoD：** 三个预置题单的数据**来自合法且可核验的来源**，校验实际数量；不能验证的条目标为阻塞而不是补造。

### Phase 3｜FSRS + 每日推荐
- [ ] 集成锁定版本的 `ts-fsrs`，正确序列化 FSRS 卡片并记录原始事件。
- [ ] Daily Planner：今日预算、混合新/旧/初评、恢复模式、任务稳定性、跳过/暂缓。
- [ ] 评分更新与事件写入使用事务；支持长期中断与时区边界。

**DoD：** 输入构造数据，固定时钟回放 7/30/90 天缺席场景，能输出可解释、预算内的合理任务；未登录也能离线工作。

### Phase 4｜LeetCode 中国站集成
- [ ] Content Script 识别 `leetcode.cn/problems/<slug>/` 当前题目并规范化 key。
- [ ] 用户点击题目打开新标签，Side Panel 和页面快捷面板可开始/暂停/评分。
- [ ] 保护原网站编辑器，不依赖 Accepted 自动解析；权限按需申请。
- [ ] 官方学习计划/用户公开题单的真实页面导入实验：解析器、完整性检测、预览、明确失败/回退。

**DoD：** 在真实 `leetcode.cn` 页面完成至少一个端到端评分流程；导入报告说明何种 URL 确认可用、哪些受限制。不得用 mock 截图替代真实集成。

### Phase 5｜学习分析、体验完善与测试
- [ ] 四项指标、热力图、按天详情、简单算法分类；所有数据来自真实事件。
- [ ] Side Panel 适配窄宽度、Dashboard 桌面布局；清晰的空状态、加载态、错误态。
- [ ] 自动化测试（见第 8 节）、手工 Chrome 验收、截图和中文安装说明。
- [ ] `npm run build` 产生包含 Manifest 的可加载 `extension/dist`；完成后提交 PR，**不要自动合并到 main**。

**DoD：** 完整关键链路通过，提供真实浏览器截图与安装说明。

---

## 8. 必做自动化测试与真实验收用例

**领域层 Vitest 单元测试：**
1. `canonicalize`：相同题在 Hot100 / 150 去重；不同题不可误合并；错误或恶意 URL 拒绝；`leetcode.cn` URL 正确归一化。
2. FSRS：Again/Hard/Good/Easy 分支、首评状态、未来 due、序列化/反序列化一致；无真实历史不伪造卡片。
3. Daily Planner：没有题单、没有逾期、只有新题、全做过待评估；预算 15/30/60；到期 35 道积压；用户中断 7/30/90 天；同日重复进入稳定；完成后任务移除；跨日/跨时区/夏令时。
4. 题单：导入 100/150/50 数据完整、内部无重复；多列表同题共享进度；重命名/删除不误伤；重复导入幂等。
5. 统计：今日新题/复习次数不同；累计学习按 distinct key；实际秒数准确，未完成/取消训练不计；0 学习日为空；跨天记录符合定义。
6. 备份：JSON 结构校验、损坏文件拒绝且无部分写入、重复导入不双计数、v1 数据缺失关系的迁移提示、版本升级。
7. 扩展消息：未授权/非法消息拒绝；重复评分事件幂等；无网络可正常训练与导出。

**浏览器真实验收：**
- 在 `chrome://extensions` 开启开发者模式，加载 `extension/dist/`。
- 普通 GitHub/空白标签页：点击扩展图标可打开 Side Panel，查看今日计划。
- Side Panel 打开 Dashboard，并导入热题 100；确认整整 100 道。
- 再导入面试经典 150，检查两张题单重叠题目只有一份 progress。
- 浏览器重启/扩展更新后记录仍在；导出 JSON → 删除测试数据 → 导入恢复完整一致。
- 打开真实 `https://leetcode.cn/problems/two-sum/`，插件识别题目、开始/停止计时、选择 Good，返回侧栏看到正确进度和下次复习日。
- 把系统测试时钟模拟到 30 天后，今日计划只输出预算内任务且说明“恢复学习”。
- 查看当日学习次数、时长和日历准确；在中国站 SQL 题目页面（若可公开访问）检查 SQL 题链接/识别。
- 自定义题单链接能读取时展示真实预览；读取失败时明确错误并能使用粘贴功能。

**发布阻断项：** 任一功能是假数据、会丢失历史、用户未完成被算完成、权限过大、误称 80 题为 Hot100、无法离线、没有源码构建运行指引，均不能标记完成。

---

## 9. UI / 交互要求（Codex 实现时的设计基线）

设计原则：**轻量、清晰、低干扰、中文优先、浅色为主、保留 RecallCode 现有绿色/薄荷绿的视觉识别，不要变成复杂 SaaS 后台。**

Side Panel（宽度 320–420 px）首屏：

```text
┌──────────────────────────────────────┐
│ RecallCode                         ⚙ │
│ 周三 · 今日 30 分钟                   │
│ 今天做一点，保持手感。               │
│                                      │
│ 待复习 3       待评估 1      新题 2  │
│ 今日计划                        0/4 │
│ ▰▱▱▱▱                                │
│ ① 复习  两数之和        约 7m [开始] │
│ ② 复习  二分查找        约 7m [开始] │
│ ③ 初评  最长递增子序列 约 10m[开始] │
│ ④ 新题  搜索插入位置   约 6m [开始] │
│                                      │
│     [开始今日学习]                   │
│ [今日]  [题库]  [分析] [完整管理页]  │
└──────────────────────────────────────┘
```

Dashboard：顶部三个主导航；学习分析四张简洁 KPI 卡 + 热力日历；题库展示列表卡片 + 导入/重命名按钮；设置放独立轻页或抽屉。尽量沿用现有 UI 语言、字号和交互，不加无关装饰、广告或多余弹窗。

空白用户：醒目的“选择题单开始”，不出现示例学习进度。中断用户：显示“欢迎回来，今天先完成 3 道”，不要用巨大的积压数字制造焦虑。

---

## 10. Codex 最终交付清单与汇报模板

Codex 最终必须给出：
- [ ] 开发分支/PR 地址、变更文件清单和架构说明。
- [ ] 完整扩展源代码、`extension/package.json`、锁文件及 MV3 Manifest。
- [ ] `npm ci`、`npm run dev`（若适用）、`npm run test`、`npm run build` 的真实运行结果。
- [ ] 可在 Chrome 加载的 `extension/dist/`（可打包 ZIP，但不要只提供概念 Demo）。
- [ ] 预置 100/150/50 的元数据来源、核验方式和验证报告。
- [ ] 中国站内容脚本兼容情况、公开题单导入验证报告与限制。
- [ ] FSRS 卡片、调度器、迁移规则及长期中断测试结果。
- [ ] 首次引导、今日学习、题单管理、学习分析、设置、页面内评分的真实截图。
- [ ] README：如何本地运行、Chrome 加载扩展、权限说明、数据备份、v1 迁移与已知限制。
- [ ] 当前尚未实现/受权限阻塞的内容清单，不可作虚假完成声明。

**最终汇报格式：**「已完成 → 关键设计 → 自动化测试 → Chrome 真实验收 → 已知限制 → 如何安装」，并报告 PR，不直接改动 Render 生产网站。

---

## 11. 参考文档（Codex 开发时核实）

- Chrome Side Panel 官方文档：<https://developer.chrome.com/docs/extensions/reference/api/sidePanel>
- Chrome Extension 权限模型：<https://developer.chrome.com/docs/extensions/develop/concepts/declare-permissions>
- Chrome 扩展 Storage API：<https://developer.chrome.com/docs/extensions/reference/api/storage>
- Chrome 扩展 Service Worker 生命周期：<https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle>
- Chrome 内容脚本：<https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts>
- FSRS TypeScript（版本兼容需以安装包为准）：<https://github.com/open-spaced-repetition/ts-fsrs>
- 官方力扣学习计划导航：<https://leetcode.cn/studyplan/>
- 力扣中国站服务条款：<https://leetcode.cn/terms/>

---

## 12. 给 Codex 的最终执行提示词（复制下面一段即可）

> 我准备将现有 GitHub 仓库 `userlyly/RecallCode` 从多用户 FastAPI 网站扩展为 **RecallCode v2 极简免登录 Chrome 插件**。请先阅读仓库中的 `docs/RECALLCODE_V2_PLAN.md`（如果尚未在仓库，先将我提供的《RecallCode_v2_Codex_实施计划书.md》放到这个路径），以本计划书为 **唯一功能验收基线**，然后**直接实现，不要只生成设计稿或静态 Demo**。先审计现有仓库并创建 `feature/recallcode-v2-extension`，保留旧网站及 Render 生产分支；在 `extension/` 下完成 MV3 Side Panel、Dashboard、力扣中国站页面交互、免登录 IndexedDB 数据层、完整 Hot100/面试150/SQL50、自定义题单导入、FSRS + 每日计划、长期中断恢复、计时评分、学习统计日历、偏好设置、JSON 备份及旧版迁移；根据计划补齐真实测试、安装文档和可加载 dist。数据不允许伪造；公开题单 URL 不可完整读取时必须明确失败并提供批量粘贴回退，不能使用未经授权的数据抓取。按 Phase 0–5 顺序开发，每阶段运行测试；最终提供分支/PR、构建步骤、真实截图、测试结果和未解决事项，未经我确认不要合并 `main`。
