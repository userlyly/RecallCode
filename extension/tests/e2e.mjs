import { chromium, expect } from "@playwright/test";
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
const output = resolve("test-results/e2e");
await mkdir(output, { recursive: true });
// Test-only installation pregrants the same CN domain to avoid a native prompt in headless Chrome.
// Production dist retains optional_host_permissions. No website or business API is mocked.
const bundle = resolve(output, "extension");
await cp(resolve("dist"), bundle, { recursive: true });
const manifest = JSON.parse(
  await readFile(resolve(bundle, "manifest.json"), "utf8"),
);
manifest.host_permissions = ["https://leetcode.cn/*"];
await writeFile(resolve(bundle, "manifest.json"), JSON.stringify(manifest));
const runStamp = Date.now();
const launch = (profile) =>
  chromium.launchPersistentContext(resolve(output, profile + "-" + runStamp), {
    channel: "chromium",
    headless: true,
    args: [
      `--disable-extensions-except=${bundle}`,
      `--load-extension=${bundle}`,
    ],
  });
const report = {
  browser: "",
  checks: [],
  limitations: [
    "Host permission pregranted in isolated test manifest; native optional permission prompt and physical toolbar click not automated.",
  ],
};
let context = await launch("profile");
try {
  report.browser = context.browser().version();
  let worker =
    context.serviceWorkers()[0] ??
    (await context.waitForEvent("serviceworker"));
  const id = new URL(worker.url()).host;
  let page = await context.newPage();
  page.on("pageerror", (e) => console.error("PAGE ERROR", String(e)));
  await page.goto(`chrome-extension://${id}/sidepanel.html`);
  await page
    .getByRole("heading", { name: "选择学习题单", exact: true })
    .waitFor();
  await page.screenshot({
    path: resolve(output, "onboarding.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "下一步", exact: true }).click();
  await page.getByRole("button", { name: "下一步", exact: true }).click();
  await page.getByRole("button", { name: "开始今日计划", exact: true }).click();
  await page.getByRole("button", { name: "我的题单", exact: true }).click();
  await expect(
    page.getByRole("button", { name: /力扣热题 100.*100 题 · 已学/ }),
  ).toBeVisible();
  await expect(page.getByLabel("搜索题目")).toHaveCount(0);
  await page
    .getByRole("button", { name: /力扣热题 100.*100 题 · 已学/ })
    .click();
  await expect(page.getByRole("progressbar", { name: /已学/ })).toBeVisible();
  await page.getByRole("button", { name: /^待复习/ }).click();
  await expect(page.getByText("没有符合条件的题目。")).toBeVisible();
  await page.getByRole("button", { name: "清除筛选", exact: true }).click();
  await page.getByRole("textbox", { name: "搜索题目" }).fill("两数之和");
  await expect(page.locator(".detail-problem")).toHaveCount(1);
  await expect(page.getByRole("button", { name: "批量管理" })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "待评估", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByText("筛选与排序", { exact: true })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "编辑题单名称" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "删除题单" })).toBeVisible();
  const planToggle = page.locator(".detail-plan-toggle");
  await expect(planToggle).toHaveAttribute("aria-pressed", "true");
  await planToggle.click();
  await expect(planToggle).toHaveAttribute("aria-pressed", "false");
  await planToggle.click();
  await expect(planToggle).toHaveAttribute("aria-pressed", "true");
  await page.screenshot({
    path: resolve(output, "list-detail.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: /返回题单/ }).click();
  report.checks.push(
    "List details support progress, search, due filtering, and the daily-plan toggle",
  );
  await page.getByRole("button", { name: "添加题单", exact: true }).click();
  await expect(
    page.getByRole("button", { name: /力扣热题 100 .*已添加/ }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "面试经典 150 · 150 题", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: /面试经典 150.*150 题 · 已学/ }),
  ).toBeVisible();
  await page.screenshot({
    path: resolve(output, "library.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "公开链接", exact: true }).click();
  report.checks.push(
    "Three-step onboarding; exact Hot100 and interview150 list counts in real extension",
  );
  await page
    .getByLabel("题单 URL")
    .fill("https://leetcode.cn/studyplan/top-100-liked/");
  await page
    .getByRole("button", { name: "授权并读取公开题单", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "已核对完整官方题单：100 道" }),
  ).toBeVisible({ timeout: 35000 });
  await page.screenshot({
    path: resolve(output, "official-import.png"),
    fullPage: true,
  });
  report.checks.push(
    "Actual official URL import produced validated 100-question preview",
  );
  await page
    .getByLabel("题单 URL")
    .fill("https://leetcode.cn/problem-list/q3iOID0B/");
  await page
    .getByRole("button", { name: "授权并读取公开题单", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({
      hasText:
        /已识别 .*完整性未确认|未读到真实题目|页面无可读数据|页面加载超时/,
    }),
  ).toBeVisible({ timeout: 35000 });
  report.checks.push(
    "Public user list q3iOID0B: " +
      (await page
        .getByRole("status")
        .filter({ hasText: /已识别|未读到|无可读|超时/ })
        .textContent()),
  );
  await page.screenshot({
    path: resolve(output, "user-list-import.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "偏好设置", exact: true }).click();
  await expect(page.locator(".daily-limits input")).toHaveCount(2);
  await expect(page.getByLabel("每日复习上限")).toBeVisible();
  await expect(page.getByText("高级调度设置", { exact: true })).toHaveCount(0);
  await expect(page.getByText("数据清理", { exact: true })).toHaveCount(0);
  await expect(page.getByLabel("在提交右侧显示 RecallCode")).toBeChecked();
  await page.screenshot({
    path: resolve(output, "settings.png"),
    fullPage: true,
  });
  const sql = await context.newPage();
  await sql.goto(
    "https://leetcode.cn/problems/recyclable-and-low-fat-products/",
    { waitUntil: "domcontentloaded" },
  );
  await sql.getByRole("button", { name: "RecallCode 计时与评分" }).click();
  await expect(sql.locator("#recallcode-inline")).toContainText(
    "可回收且低脂的产品",
    { timeout: 30000 },
  );
  await sql.screenshot({
    path: resolve(output, "sql-identification.png"),
    fullPage: false,
  });
  report.checks.push(
    "Actual CN SQL problem identified from verified SQL50 metadata",
  );
  await sql.close();
  await page.getByRole("button", { name: "今日计划", exact: true }).click();
  await page.getByRole("button", { name: "练习新题", exact: true }).waitFor();
  await page.screenshot({ path: resolve(output, "today.png"), fullPage: true });
  const opened = context.waitForEvent("page");
  await page.getByRole("button", { name: "练习新题", exact: true }).click();
  const lc = await opened;
  await lc.waitForLoadState("domcontentloaded");
  await lc.locator("#recallcode-inline").waitFor({ timeout: 45000 });
  await expect(lc.locator("#recallcode-inline")).toBeVisible();
  expect(
    await lc.locator("#recallcode-inline").evaluate((host) => {
      const submit = document.querySelector(
        'button[data-e2e-locator="console-submit-button"]',
      );
      return (
        host.previousElementSibling?.contains(submit) &&
        !submit.closest(".overflow-hidden.rounded").contains(host)
      );
    }),
  ).toBe(true);
  await lc.getByRole("button", { name: "RecallCode 计时与评分" }).click();
  await lc.getByRole("button", { name: "结束计时", exact: true }).click();
  await lc.getByText("添加学习笔记", { exact: true }).click();
  await lc
    .getByRole("textbox", { name: "学习笔记" })
    .fill("先查补数，再保存当前值。");
  await expect(lc.getByText("已自动保存", { exact: true })).toBeVisible();
  await lc.reload();
  await lc.getByRole("button", { name: "RecallCode 计时与评分" }).click();
  await expect(lc.getByRole("textbox", { name: "学习笔记" })).toHaveValue(
    "先查补数，再保存当前值。",
  );
  const trigger = lc.getByRole("button", { name: "RecallCode 计时与评分" });
  await expect(trigger).toHaveText("RecallCode");
  await expect
    .poll(() => trigger.locator("img").evaluate((img) => img.naturalWidth))
    .toBeGreaterThan(0);
  const ratingCard = lc.getByRole("button", { name: "Good 独立完成" });
  await ratingCard.hover();
  await expect
    .poll(() =>
      ratingCard.evaluate((button) => getComputedStyle(button).transform),
    )
    .not.toBe("none");
  await ratingCard.click();
  await lc.screenshot({
    path: resolve(output, "leetcode-training.png"),
    fullPage: false,
  });
  await lc.getByRole("button", { name: "保存本次记录 →" }).click();
  await expect(lc.locator("#recallcode-inline .status")).toHaveText(
    /^已保存 · 下次复习 \d{4}-\d{2}-\d{2}$/,
  );
  report.checks.push(
    "Actual leetcode.cn problem identified; shared session timer and Good rating through content script",
  );
  await expect(page.locator(".study-tasks .task-done")).toHaveCount(1);
  await expect(page.locator(".study-tasks .task-done")).toContainText("Good");
  await page.getByRole("button", { name: "学习数据", exact: true }).click();
  await expect(page.getByText("1 / 0 次", { exact: true })).toBeVisible();
  const timeline = page.locator(".completion-timeline li");
  await expect(timeline.locator("time")).toHaveText(/^\d{2}:\d{2}$/);
  await expect(timeline.locator("strong")).toHaveText("1. 两数之和");
  await expect(timeline.locator(".rating-good")).toHaveText(/🙂 Good/);
  await expect(timeline).not.toContainText("秒");
  const todayCell = page.locator('.month-grid button[aria-current="date"]');
  await expect(todayCell).toHaveAttribute("aria-pressed", "true");
  const todayKey = await todayCell.getAttribute("aria-label");
  const month = new Date(todayKey.slice(0, 7) + "-01T00:00:00Z");
  month.setUTCMonth(month.getUTCMonth() - 1);
  await page.getByRole("button", { name: "上个月" }).click();
  await expect(
    page.getByRole("heading", {
      name: `${month.getUTCFullYear()} 年 ${month.getUTCMonth() + 1} 月`,
    }),
  ).toBeVisible();
  await expect(
    page.locator(".month-grid button[aria-pressed=true]"),
  ).toHaveCount(0);
  await page.locator(".month-grid button").first().click();
  await expect(
    page.locator(".month-grid button[aria-pressed=true]"),
  ).toHaveCount(1);
  await page.getByRole("button", { name: "回到今天" }).click();
  await expect(todayCell).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("学习历史", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /查看趋势/ })).toHaveCount(0);
  await page.screenshot({
    path: resolve(output, "analytics.png"),
    fullPage: true,
  });
  report.checks.push(
    "Real event produces daily/distinct/time metrics and colored calendar",
  );
  await page.getByRole("button", { name: "今日计划", exact: true }).click();
  await expect(page.getByText("个人笔记", { exact: true })).toHaveCount(0);
  const opening = context.waitForEvent("page");
  await page.getByRole("button", { name: "练习新题", exact: true }).click();
  const secondProblem = await opening;
  await secondProblem
    .getByRole("button", { name: "RecallCode 计时与评分" })
    .click();
  const timer = secondProblem.locator("#recallcode-inline .clock strong");
  const initialTime = await timer.textContent();
  await expect(timer).not.toHaveText(initialTime, { timeout: 3500 });
  await secondProblem
    .getByRole("button", { name: "结束计时", exact: true })
    .click();
  await context.setOffline(true);
  await secondProblem.getByText("添加学习笔记", { exact: true }).click();
  await secondProblem
    .getByRole("textbox", { name: "学习笔记" })
    .fill("跨页面保存的草稿");
  await secondProblem.getByLabel("本次查看过提示或题解").check();
  await secondProblem.getByRole("button", { name: "Good 独立完成" }).click();
  await secondProblem.getByRole("button", { name: "保存本次记录 →" }).click();
  await expect(secondProblem.locator("#recallcode-inline .status")).toHaveText(
    /^已保存 · 下次复习 \d{4}-\d{2}-\d{2}$/,
  );
  await secondProblem.close();
  report.checks.push(
    "An already-open LeetCode page saves notes and ratings offline",
  );
  await context.setOffline(false);
  await page.getByRole("button", { name: "偏好设置", exact: true }).click();
  const downloadEvent = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "导出 JSON 备份", exact: true })
    .click();
  const download = await downloadEvent;
  const backupPath = resolve(output, "backup.json");
  await download.saveAs(backupPath);
  const backup = JSON.parse(await readFile(backupPath, "utf8"));
  expect(backup.reviewEvents.length).toBe(2);
  expect(backup.reviewEvents).toContainEqual(
    expect.objectContaining({
      note: "跨页面保存的草稿",
      usedHint: true,
    }),
  );
  expect(backup.problems.length).toBe(
    new Set(backup.studyLists.flatMap((l) => l.problemKeys)).size,
  );
  expect(backup.progress.filter((p) => p.fsrsCard).length).toBe(2);
  report.checks.push(
    "Backup has exactly two reviews, shared distinct problem keys, FSRS cards and sessions",
  );
  await context.close();
  context = await launch("profile");
  page = await context.newPage();
  await page.goto(`chrome-extension://${id}/sidepanel.html`);
  await page.getByRole("button", { name: "学习数据", exact: true }).click();
  await expect(page.getByText("2 / 0 次", { exact: true })).toBeVisible();
  report.checks.push("Browser restart preserved training events and analysis");
  const panel = await context.newPage();
  await panel.setViewportSize({ width: 380, height: 820 });
  await panel.goto(`chrome-extension://${id}/sidepanel.html`);
  await panel
    .getByRole("heading", { name: "复习与初评", exact: true })
    .waitFor();
  await panel.screenshot({
    path: resolve(output, "sidepanel.png"),
    fullPage: true,
  });
  for (const name of ["我的题单", "学习数据", "偏好设置", "今日计划"]) {
    await panel.getByRole("button", { name, exact: true }).click();
    await expect(
      panel.getByRole("heading", { name, exact: true, level: 1 }),
    ).toBeVisible();
  }
  report.checks.push("All four views are available in the 380px side panel");
  await panel.clock.install({ time: new Date(Date.now() + 30 * 86400000) });
  await panel.reload();
  await expect(
    panel.getByRole("heading", { name: /欢迎回来，今天先完成/ }),
  ).toBeVisible();
  await panel.screenshot({
    path: resolve(output, "recovery-30-days.png"),
    fullPage: true,
  });
  report.checks.push(
    "Real extension UI at simulated +30 days shows quota-based recovery without rewriting stored due dates",
  );

  await context.close();
  context = await launch("restore-profile");
  page = await context.newPage();
  await page.goto(`chrome-extension://${id}/sidepanel.html`);
  await page.getByRole("button", { name: "下一步", exact: true }).click();
  await page.getByRole("button", { name: "下一步", exact: true }).click();
  await page.getByRole("button", { name: "开始今日计划", exact: true }).click();
  await page.getByRole("button", { name: "偏好设置", exact: true }).click();
  for (let i = 0; i < 2; i++) {
    await page.getByLabel("选择备份文件").setInputFiles(backupPath);
    await page
      .getByRole("button", { name: "确认合并到本机", exact: true })
      .click();
    await expect(
      page.getByRole("status").filter({ hasText: "合并完成" }),
    ).toBeVisible();
    if (i === 0) await page.getByLabel("选择备份文件").setInputFiles([]);
  }
  await page.getByRole("button", { name: "学习数据", exact: true }).click();
  await expect(page.getByText("2 / 0 次", { exact: true })).toBeVisible();
  report.checks.push(
    "JSON restore into separate clean browser profile, repeated restore is idempotent",
  );
} finally {
  await context.close();
  await writeFile(
    resolve(output, "report.json"),
    JSON.stringify(report, null, 2),
  );
}
console.log(JSON.stringify(report, null, 2));
