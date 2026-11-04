import "fake-indexeddb/auto";
import { it, expect } from "vitest";
import { db } from "../src/storage/db";
import { presets, addList } from "../src/domain/catalog";
import {
  startTraining,
  tickSession,
  rateTraining,
} from "../src/storage/training";
it("auto-pauses after five minutes without user activity despite regular heartbeat", async () => {
  await db.delete();
  await db.open();
  const p = presets[0].questions[0];
  await addList("idle", [p]);
  const start = new Date("2026-11-04T00:00:00Z");
  const s = await startTraining(p.key, start);
  for (let elapsed = 5; elapsed <= 310; elapsed += 5)
    await tickSession(s.id, "heartbeat", new Date(+start + elapsed * 1000));
  const paused = await db.trainingSessions.get(s.id);
  expect(paused?.status).toBe("paused");
  expect(paused?.activeSeconds).toBeLessThanOrEqual(300);
});
it("single active session, capped heartbeat, transactional idempotent ratings and cancellation", async () => {
  await db.delete();
  await db.open();
  const p = presets[0].questions[0];
  await addList("x", [p]);
  const now = new Date("2026-11-04T00:00:00Z");
  const [a, b] = await Promise.all([
    startTraining(p.key, now),
    startTraining(p.key, now),
  ]);
  expect(a.id).toBe(b.id);
  await tickSession(a.id, "heartbeat", new Date(+now + 5000));
  await tickSession(a.id, "heartbeat", new Date(+now + 86400000));
  const s = await db.trainingSessions.get(a.id);
  expect(s?.status).toBe("paused");
  expect(s?.activeSeconds).toBe(5);
  const [e, f] = await Promise.all([
    rateTraining(a.id, "Good", "note", true, new Date(+now + 86400001)),
    rateTraining(a.id, "Good", "note", true, new Date(+now + 86400001)),
  ]);
  expect(e.id).toBe(f.id);
  expect(await db.reviewEvents.count()).toBe(1);
  expect((await db.progress.get(p.key))?.fsrsCard).toBeDefined();
  const c = await startTraining(p.key);
  await tickSession(c.id, "cancel");
  await expect(rateTraining(c.id, "Good")).rejects.toThrow();
  expect(await db.reviewEvents.count()).toBe(1);
});
