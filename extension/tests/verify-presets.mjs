// Reads only metadata already embedded in the publicly accessible official page.
import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
const browser = await chromium.launch({ channel: "chromium", headless: true });
await mkdir("src/data", { recursive: true });
try {
  for (const [id, slug, name, count] of [
    ["hot100", "top-100-liked", "力扣热题 100", 100],
    ["interview150", "top-interview-150", "面试经典 150", 150],
    ["sql50", "sql-free-50", "SQL 50", 50],
  ]) {
    const sourceUrl = `https://leetcode.cn/studyplan/${slug}/`;
    const page = await browser.newPage();
    await page.goto(sourceUrl, {
      waitUntil: "domcontentloaded",
      timeout: 45000,
    });
    const embedded = await page.locator("#__NEXT_DATA__").textContent();
    const raw = JSON.parse(embedded);
    const query = raw.props.pageProps.dehydratedState.queries.find(
      (q) => q.state.data?.studyPlanV2Detail,
    );
    const detail = query?.state.data.studyPlanV2Detail;
    if (!detail) throw Error("No public plan metadata: " + id);
    const questions = detail.planSubGroups
      .flatMap((g) =>
        g.questions.map((q) => ({
          key: `leetcode:cn:${q.questionFrontendId}`,
          questionId: q.id,
          frontendId: q.questionFrontendId,
          title: q.translatedTitle || q.title,
          titleSlug: q.titleSlug,
          url: `https://leetcode.cn/problems/${q.titleSlug}/`,
          difficulty:
            { EASY: "Easy", MEDIUM: "Medium", HARD: "Hard" }[q.difficulty] ??
            "Unknown",
          topics: q.topicTags.map((t) => t.nameTranslated || t.name),
          topic: g.name ?? "unknown",
          source: "preset",
        })),
      )
      .map((q, i) => ({ ...q, ordinal: i + 1 }));
    if (
      questions.length !== count ||
      new Set(questions.map((q) => q.key)).size !== count ||
      questions.some(
        (q) =>
          !q.frontendId ||
          !q.title ||
          !q.questionId ||
          !/^https:\/\/leetcode.cn\/problems\/[a-z0-9-]+\/$/.test(q.url),
      )
    )
      throw Error("Incomplete official data: " + id + " " + questions.length);
    const output = {
      id,
      name,
      version: 1,
      sourceUrl,
      verifiedAt: new Date().toISOString(),
      verification:
        "Official publicly embedded __NEXT_DATA__; exact count and unique IDs; no private endpoint or problem statements",
      questions,
    };
    await writeFile(`src/data/${id}.json`, JSON.stringify(output, null, 2));
    console.log(`${id}: ${questions.length} unique verified metadata records`);
    await page.close();
  }
} finally {
  await browser.close();
}
