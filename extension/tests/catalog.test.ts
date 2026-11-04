import "fake-indexeddb/auto";
import { it, expect } from "vitest";
import {
  presets,
  canonicalUrl,
  parsePaste,
  addList,
  renameList,
  markPrior,
} from "../src/domain/catalog";
import { db } from "../src/storage/db";
it("official presets contain exactly 100/150/50 unique canonical records", () => {
  expect(presets.map((p) => p.questions.length)).toEqual([100, 150, 50]);
  for (const p of presets) {
    expect(new Set(p.questions.map((q) => q.key)).size).toBe(
      p.questions.length,
    );
    for (const q of p.questions)
      expect(canonicalUrl(q.url).slug).toBe(q.titleSlug);
  }
});
it("canonicalizes CN/COM and rejects malicious URLs without guessing identities", () => {
  expect(canonicalUrl("https://leetcode.com/problems/two-sum/?x=1").url).toBe(
    "https://leetcode.cn/problems/two-sum/",
  );
  for (const u of [
    "javascript:alert(1)",
    "https://leetcode.cn.evil.test/problems/a/",
    "https://evil@leetcode.cn/problems/a/",
    "https://leetcode.cn/problems/a/solutions/",
  ])
    expect(() => canonicalUrl(u)).toThrow();
  expect(parsePaste("1,1,2,3").duplicates).toBe(1);
});
it("shares progress across lists and preserves history on delete and rename", async () => {
  await db.delete();
  await db.open();
  const p = presets[0].questions[0];
  await addList("A", [p]);
  await addList("B", [p]);
  await markPrior([p.key]);
  const a = (await db.studyLists.toArray()).find((l) => l.name === "A")!;
  await renameList(a.id, "C");
  await db.studyLists.delete(a.id);
  expect(await db.progress.count()).toBe(1);
  expect((await db.progress.get(p.key))?.state).toBe("prior_unassessed");
  await expect(addList("B", [p])).rejects.toThrow();
  await addList("B", [p], true);
  expect((await db.studyLists.toArray())[0].problemKeys).toEqual([p.key]);
});
