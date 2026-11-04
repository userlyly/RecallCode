import "fake-indexeddb/auto";
import { it, expect } from "vitest";
import { db } from "../src/storage/db";
import { pruneOrphans } from "../src/storage/cleanup";
import { addList, presets } from "../src/domain/catalog";
it("only explicit orphan cleanup removes unreferenced progress", async () => {
  await db.delete();
  await db.open();
  const [a, b] = presets[0].questions;
  await addList("A", [a]);
  await addList("B", [b]);
  const list = (await db.studyLists.toArray()).find((l) => l.name === "B")!;
  await db.studyLists.delete(list.id);
  expect(await db.progress.count()).toBe(2);
  expect(await pruneOrphans()).toBe(1);
  expect(await db.problems.get(a.key)).toBeDefined();
  expect(await db.progress.get(a.key)).toBeDefined();
  expect(await db.problems.get(b.key)).toBeUndefined();
});
