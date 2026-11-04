import "fake-indexeddb/auto";
import { beforeEach, it, expect } from "vitest";
import { db, defaults, savePreferences, preferences } from "../src/storage/db";
import {
  exportBackup,
  restoreBackup,
  validateBackup,
} from "../src/storage/backup";
beforeEach(async () => {
  await db.delete();
  await db.open();
});
it("settings survive database reopening", async () => {
  await savePreferences({ ...defaults, minutesPerDay: 45 });
  db.close();
  await db.open();
  expect((await preferences()).minutesPerDay).toBe(45);
});
it("backup restores idempotently and rejects damaged input before writing", async () => {
  const p = {
    key: "leetcode:cn:1",
    title: "两数之和",
    url: "https://leetcode.cn/problems/two-sum/",
    difficulty: "Easy",
    topics: ["哈希表"],
    source: "preset",
  };
  await db.problems.add(p);
  const b = await exportBackup();
  await db.problems.clear();
  await restoreBackup(b);
  await restoreBackup(b);
  expect(await db.problems.count()).toBe(1);
  const damaged = {
    ...b,
    progress: [{ problemKey: "missing", state: "unseen" }],
  };
  await expect(restoreBackup(damaged)).rejects.toThrow();
  expect(await db.problems.count()).toBe(1);
});
it("rejects unsupported versions and unsafe problem URLs", async () => {
  expect(() => validateBackup({ schemaVersion: 99 })).toThrow();
  const b = await exportBackup();
  b.problems = [
    {
      key: "x",
      title: "bad",
      url: "https://evil.test/problems/a/",
      difficulty: "Unknown",
      topics: [],
      source: "paste",
    },
  ];
  expect(() => validateBackup(b)).toThrow();
});

it("rolls back all writes when an IndexedDB write fails during restore", async () => {
  const b = await exportBackup();
  b.problems = [
    {
      key: "leetcode:cn:1",
      title: "两数之和",
      url: "https://leetcode.cn/problems/two-sum/",
      difficulty: "Easy",
      topics: [],
      source: "preset",
    },
  ];
  b.reviewEvents = [
    {
      id: "e",
      problemKey: "leetcode:cn:1",
      rating: "Good",
      kind: "new",
      reviewedAt: new Date().toISOString(),
      activeSeconds: 1,
      fsrsVersion: "test",
    },
  ];
  const fail = () => {
    throw Error("simulated storage failure");
  };
  db.reviewEvents.hook("creating", fail);
  try {
    await expect(restoreBackup(b)).rejects.toThrow("simulated storage failure");
    expect(await db.problems.count()).toBe(0);
  } finally {
    db.reviewEvents.hook("creating").unsubscribe(fail);
  }
});

it("restores settings and deferrals, pauses imported active sessions, merges list references", async () => {
  const b = await exportBackup();
  const p = {
    key: "leetcode:cn:1",
    title: "两数之和",
    url: "https://leetcode.cn/problems/two-sum/",
    difficulty: "Easy",
    topics: [],
    source: "preset",
  };
  b.problems = [p];
  b.preferences.minutesPerDay = 60;
  b.planDeferrals = [{ key: "defer:2026-11-04", value: [p.key] }];
  b.trainingSessions = [
    {
      id: "s",
      problemKey: p.key,
      status: "running",
      activeSeconds: 5,
      startedAt: new Date().toISOString(),
    },
  ];
  await restoreBackup(b);
  expect((await preferences()).minutesPerDay).toBe(60);
  expect((await db.trainingSessions.get("s"))?.status).toBe("paused");
  expect((await db.meta.get("defer:2026-11-04"))?.value).toEqual([p.key]);
});
