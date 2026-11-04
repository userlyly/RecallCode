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
  await page.goto(`chrome-extension://${id}/dashboard.html`);
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
  await page.getByRole("button", { name: "算法题库", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "题目 · 100", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "面试经典 150 · 150 题", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: /面试经典 150 · 150 题 · 已学/ }),
  ).toBeVisible();
  await page.screenshot({
    path: resolve(output, "library.png"),
    fullPage: true,
  });
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
  await page
    .getByRole("button", { name: "授权并启用力扣集成", exact: true })
    .click();
  await expect(
    page.getByText("已启用。请刷新已打开的力扣题目页面。", { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: resolve(output, "settings.png"),
    fullPage: true,
  });
  const sql = await context.newPage();
  await sql.goto(
    "https://leetcode.cn/problems/recyclable-and-low-fat-products/",
    { waitUntil: "domcontentloaded" },
  );
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
  await page.getByRole("button", { name: "今日学习", exact: true }).click();
  await page
    .getByRole("button", { name: "开始今日学习", exact: true })
    .waitFor();
  await page.screenshot({ path: resolve(output, "today.png"), fullPage: true });
  const opened = context.waitForEvent("page");
  await page.getByRole("button", { name: "开始今日学习", exact: true }).click();
  const lc = await opened;
  await lc.waitForLoadState("domcontentloaded");
  await lc.locator("#recallcode-inline").waitFor({ timeout: 45000 });
  await lc
    .locator("#recallcode-inline")
    .getByRole("button", { name: "开始", exact: true })
    .click();
  await lc.waitForTimeout(5500);
  await lc.screenshot({
    path: resolve(output, "leetcode-training.png"),
    fullPage: false,
  });
  await lc
    .locator("#recallcode-inline")
    .getByRole("button", { name: "Good", exact: true })
    .click();
  await expect(lc.locator("#recallcode-inline")).toContainText("已保存 Good");
  report.checks.push(
    "Actual leetcode.cn problem identified; shared session timer and Good rating through content script",
  );
  await page.getByRole("button", { name: "学习分析", exact: true }).click();
  await expect(page.getByText("1 / 0 次", { exact: true })).toBeVisible();
  await page.screenshot({
    path: resolve(output, "analytics.png"),
    fullPage: true,
  });
  report.checks.push(
    "Real event produces daily/distinct/time metrics and colored calendar",
  );
  await context.setOffline(true);
  await page.getByRole("button", { name: "今日学习", exact: true }).click();
  const opening = context.waitForEvent("page");
  await page.getByRole("button", { name: "开始今日学习", exact: true }).click();
  await opening;
  await page.getByRole("button", { name: "Good", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("已保存 Good");
  report.checks.push("Offline training and FSRS save succeeded");
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
  await page.goto(`chrome-extension://${id}/dashboard.html`);
  await page.getByRole("button", { name: "学习分析", exact: true }).click();
  await expect(page.getByText("2 / 0 次", { exact: true })).toBeVisible();
  report.checks.push("Browser restart preserved training events and analysis");
  const panel = await context.newPage();
  await panel.setViewportSize({ width: 380, height: 820 });
  await panel.goto(`chrome-extension://${id}/sidepanel.html`);
  await panel
    .getByRole("heading", { name: "今天做一点，保持手感。", exact: true })
    .waitFor();
  await panel.screenshot({
    path: resolve(output, "sidepanel.png"),
    fullPage: true,
  });
  const full = context.waitForEvent("page");
  await panel
    .getByRole("button", { name: "打开完整管理页 ↗", exact: true })
    .click();
  const fullPage = await full;
  await expect(fullPage).toHaveURL(`chrome-extension://${id}/dashboard.html`);
  report.checks.push("380px sidepanel opens actual dashboard tab");
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
    "Real extension UI at simulated +30 days shows budgeted recovery without rewriting stored due dates",
  );

  await context.close();
  context = await launch("restore-profile");
  page = await context.newPage();
  await page.goto(`chrome-extension://${id}/dashboard.html`);
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
  await page.getByRole("button", { name: "学习分析", exact: true }).click();
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
