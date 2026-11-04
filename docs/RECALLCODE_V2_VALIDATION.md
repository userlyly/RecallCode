# RecallCode 2.0 验证记录

日期：2026-11-04（Asia/Shanghai）。分支：`feature/recallcode-v2-extension`。验收依据：`RECALLCODE_V2_PLAN.md`。

| 阶段 | 实际结果 |
| --- | --- |
| 0 | 审计、归档、独立分支；v1 回归 PASS。仅修复测试收尾的 Windows SQLite 连接释放，原站业务和部署配置未修改。 |
| 1 | MV3、侧栏、完整页、IndexedDB/Chrome Storage、三步引导、备份预览/事务恢复、v1 迁移。浏览器重启和干净配置恢复通过。 |
| 2 | 官方元数据 100/150/50、唯一 key/URL 校验；共享进度、搜索筛选、改名删除、粘贴预览、历史批量标记。 |
| 3 | ts-fsrs 6.0.0 / FSRS-6；独立预算 Planner、恢复模式、暂缓、原子评分和计时。固定时钟恢复矩阵通过。 |
| 4 | 按需中国站权限、来源校验；真实算法/SQL 页面识别，页面 Good 评分通过；官方 URL 预览通过，用户题单失败后诚实回退。 |
| 5 | 统计、实际行为日历、历史、设置、文档及截图；原生授权弹窗、物理工具栏点击和最低 Chrome 版本仍待人工复核。380px 侧栏打开完整页及浏览器模拟 +30 天恢复界面已实际通过。 |

## 自动化

- v1：`PYTHONPATH=. .venv/Scripts/python tests/test_multiuser.py`，PASS，退出码 0。
- 扩展：真实执行 `npm ci`、`npm run test`、`npm run build`；20 项测试通过，8 个文件。
- `npm audit`：0 个已知漏洞（本次检查时）。
- 浏览器：Chrome for Testing 156.0.8078.4；原始机器结果见 `extension/test-results/e2e/report.json`，归档副本和截图见本目录 `recallcode-v2-evidence/`。
- 覆盖规范化/恶意 URL、精确题量、跨题单共享/改名/删除、真实 FSRS 四档及序列化、7/30/90 天 × 15/30/60 分钟恢复、新题/初评预算、同日稳定、完成/暂缓、时区/DST、统计、损坏备份、事务回滚、重复恢复、v1 隐私/缺失关系/幂等、并发评分、心跳限额、无操作暂停、来源拒绝、显式孤立清理。

## 真实浏览器链路

首次引导 → Hot100 100 题 → 面试150 → 共享题目 key → 官方 URL 真实预览 → 中国站 SQL 识别 → 真实算法题计时/Good 评分 → 统计/日历 → 断网评分 → 导出 → 浏览器重启 → 干净配置恢复 → 重复恢复不双计数。

没有 mock 力扣或业务 API。仅在测试副本 Manifest 预授予相同中国站域名，以测试原生授权之后的链路。正式 dist 保留可选权限。早期原始 Manifest 加载也验证了后台、380px 侧栏页面、设置重启保留和 `openPanelOnActionClick=true`，但这不等于物理工具栏点击。

## 题单来源与 URL 实验

| 数据 | 官方公开来源 | 结果 |
| --- | --- | --- |
| Hot100 | https://leetcode.cn/studyplan/top-100-liked/ | 100 个唯一题号/slug |
| 面试150 | https://leetcode.cn/studyplan/top-interview-150/ | 150 个唯一题号/slug |
| SQL50 | https://leetcode.cn/studyplan/sql-free-50/ | 50 个唯一题号/slug |
| 用户题单 | https://leetcode.cn/problem-list/q3iOID0B/ | 匿名页面未读取到真实题目；失败并回退粘贴，没有标记成功或完整 |

读取实际公开页面内嵌 `__NEXT_DATA__`，只保存最小元数据，不调用私有接口，不保存题面/题解。JSON 含来源、独立核验时间和方式。用户题单样本来自公开讨论 https://leetcode.cn/discuss/post/793lKv/ 的引用。

## 剩余验收和限制

1. 需人工验证桌面 Chrome 工具栏点击及按需授权原生弹窗；侧栏打开完整页已通过自动化。自动化确认了页面与 API 配置，未声称完成这些物理交互。
2. 构建目标 Chrome 114，实际运行测试为 156；未直接测试 114。
3. 通用公开题单可能受页面格式、私有状态、分页、站点限制影响；无法完整确认就拒绝声称完整。批量粘贴为可操作回退。
4. v1 题单关系缺失和最近 500 条历史上限是源数据限制，不会补造。
5. 可选的撤销上一评分、通知未实现；不提供云同步。
6. 未在用户日常 Chrome 配置中安装或修改扩展。训练测试在独立浏览器完成，没有提交力扣代码。

安装及复现见 `extension/README.md`。PR 保持草稿；剩余人工验收完成前不可自动合并 main。
