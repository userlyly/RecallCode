import Dexie from "dexie";
import { db, preferences, type Session, type Review } from "./db";
import {
  schedule,
  fsrsVersion,
  type Grade,
  type StoredCard,
} from "../domain/fsrs";
export type ActiveSession = Session & {
  updatedAt: string;
  estimatedMinutes?: number;
  lastActivityAt?: string;
  usedHint?: boolean;
  note?: string;
};
export async function startTraining(problemKey: string, now = new Date()) {
  return db.transaction("rw", db.trainingSessions, db.problems, async () => {
    const problem = await db.problems.get(problemKey);
    if (!problem) throw Error("题目不在本地题库");
    const existing = await db.trainingSessions
      .where("problemKey")
      .equals(problemKey)
      .filter((s) => s.status === "running" || s.status === "paused")
      .first();
    if (existing) {
      if (existing.status === "paused") {
        const resumed = {
          ...existing,
          status: "running",
          updatedAt: now.toISOString(),
          lastActivityAt: now.toISOString(),
        };
        await db.trainingSessions.put(resumed);
        return resumed as ActiveSession;
      }
      return existing as ActiveSession;
    }
    const session: ActiveSession = {
      id: crypto.randomUUID(),
      problemKey,
      startedAt: now.toISOString(),
      status: "running",
      activeSeconds: 0,
      estimatedMinutes:
        problem.difficulty === "Easy"
          ? 7
          : problem.difficulty === "Hard"
            ? 25
            : 15,
      updatedAt: now.toISOString(),
      lastActivityAt: now.toISOString(),
    };
    await db.trainingSessions.add(session);
    return session;
  });
}
export async function tickSession(
  id: string,
  action: "heartbeat" | "pause" | "resume" | "cancel" | "activity",
  now = new Date(),
) {
  return db.transaction("rw", db.trainingSessions, async () => {
    const s = (await db.trainingSessions.get(id)) as ActiveSession | undefined;
    if (!s || !["running", "paused"].includes(s.status)) return;
    const elapsed = Math.max(
      0,
      (now.getTime() - Date.parse(s.updatedAt)) / 1000,
    );
    if (s.status === "running") {
      if (
        elapsed <= 20 &&
        now.getTime() - Date.parse(s.lastActivityAt ?? s.startedAt) <= 300000
      )
        s.activeSeconds = Math.min(
          7200,
          s.activeSeconds + Math.min(15, elapsed),
        );
      else s.status = "paused";
    }
    if (action === "pause") s.status = "paused";
    if (action === "resume") s.status = "running";
    if (action === "resume" || action === "activity")
      s.lastActivityAt = now.toISOString();
    if (action === "cancel") s.status = "cancelled";
    if (s.activeSeconds >= 7200) s.status = "paused";
    s.updatedAt = now.toISOString();
    await db.trainingSessions.put(s);
    return s;
  });
}
export async function rateTraining(
  id: string,
  rating: Grade,
  note: string | undefined = undefined,
  usedHint = false,
  now = new Date(),
) {
  const prefs = await preferences();
  await tickSession(id, "pause", now);
  return db.transaction(
    "rw",
    db.trainingSessions,
    db.progress,
    db.reviewEvents,
    async () => {
      const eventId = "session:" + id;
      const existing = await db.reviewEvents.get(eventId);
      if (existing) return existing;
      const session = (await db.trainingSessions.get(id)) as
        ActiveSession | undefined;
      if (!session || session.status !== "paused")
        throw Error("无可保存训练会话");
      const p = await db.progress.get(session.problemKey);
      const result = await Dexie.waitFor(
        schedule(
          p?.fsrsCard as StoredCard | undefined,
          rating,
          now,
          prefs.retention,
        ),
      );
      const kind = p?.fsrsCard
        ? "review"
        : p?.state === "prior_unassessed"
          ? "assess"
          : "new";
      const event: Review & {
        note: string;
        usedHint: boolean;
        fsrsLog: unknown;
        estimatedMinutes: number;
      } = {
        id: eventId,
        problemKey: session.problemKey,
        rating,
        kind,
        reviewedAt: now.toISOString(),
        activeSeconds: Math.round(session.activeSeconds),
        fsrsVersion,
        estimatedMinutes: session.estimatedMinutes ?? 15,
        note: note ?? p?.note ?? "",
        usedHint,
        fsrsLog: result.revlog,
      };
      await db.reviewEvents.add(event);
      await db.progress.put({
        ...p,
        problemKey: session.problemKey,
        state: "reviewing",
        note: note ?? p?.note ?? "",
        fsrsCard: result.card,
      });
      await db.trainingSessions.put({ ...session, status: "finished" });
      return event;
    },
  );
}
