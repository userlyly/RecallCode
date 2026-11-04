import "fake-indexeddb/auto";
import { it, expect } from "vitest";
import { migrateV1 } from "../src/storage/migrate-v1";
import { db } from "../src/storage/db";
import { restoreBackup } from "../src/storage/backup";
it("migrates actual v1 shape without inventing FSRS or list membership; repeats are idempotent", async () => {
  const old = {
    version: 1,
    exported_at: "2026-11-04T00:00:00Z",
    profile: { email: "private@example.com" },
    lists: [{ id: "old", name: "旧题单" }],
    problems: [
      {
        key: "lc:1",
        title: "两数之和",
        url: "https://leetcode.cn/problems/two-sum/",
        state: "rated",
        rating: "good",
        note: "笔记",
        next_due: "2026-11-05",
      },
    ],
    reviews: [
      {
        problem_key: "lc:1",
        rating: "good",
        kind: "new",
        seconds: 90,
        date: "2026-11-03T00:00:00",
      },
    ],
  };
  const a = await migrateV1(old),
    b = await migrateV1(old);
  expect(a.reviewEvents[0].id).toBe(b.reviewEvents[0].id);
  expect(a.reviewEvents[0].reviewedAt).toBe("2026-11-03T00:00:00.000Z");
  expect(a.progress[0].state).toBe("prior_unassessed");
  expect(a.progress[0].fsrsCard).toBeUndefined();
  expect(a.studyLists).toHaveLength(1);
  expect(a.studyLists[0].id).toBe("legacy-v1-import");
  expect(JSON.stringify(a)).not.toContain("private@example.com");
  await db.delete();
  await db.open();
  await restoreBackup(a);
  await restoreBackup(b);
  expect(await db.reviewEvents.count()).toBe(1);
});
it("rejects corrupt v1 events instead of inventing missing dates or problems", async () => {
  await expect(
    migrateV1({
      version: 1,
      lists: [],
      problems: [],
      reviews: [{ problem_key: "lc:99" }],
    }),
  ).rejects.toThrow();
});
