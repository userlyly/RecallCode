import {
  db,
  defaults,
  validatePreferences,
  type Preferences,
  type Problem,
  type StudyList,
  type Progress,
  type Review,
  type Session,
} from "./db";
export interface Backup {
  schemaVersion: 1;
  sourceApp: "RecallCode-v2";
  exportedAt: string;
  problems: Problem[];
  studyLists: StudyList[];
  progress: Progress[];
  reviewEvents: Review[];
  trainingSessions: Session[];
  preferences: Preferences;
  planDeferrals?: { key: string; value: string[] }[];
}
export async function exportBackup(): Promise<Backup> {
  return db.transaction("r", db.tables, async () => ({
    schemaVersion: 1,
    sourceApp: "RecallCode-v2",
    exportedAt: new Date().toISOString(),
    problems: await db.problems.toArray(),
    studyLists: await db.studyLists.toArray(),
    progress: await db.progress.toArray(),
    reviewEvents: await db.reviewEvents.toArray(),
    trainingSessions: await db.trainingSessions.toArray(),
    planDeferrals: (await db.meta.toArray()).filter((m) =>
      m.key.startsWith("defer:"),
    ) as { key: string; value: string[] }[],
    preferences: {
      ...defaults,
      ...(((await db.meta.get("preferences"))?.value as Partial<Preferences>) ??
        {}),
    },
  }));
}
const object = (x: unknown): x is Record<string, unknown> =>
  !!x && typeof x === "object" && !Array.isArray(x);
export function validateBackup(raw: unknown): Backup {
  if (
    !object(raw) ||
    raw.schemaVersion !== 1 ||
    raw.sourceApp !== "RecallCode-v2"
  )
    throw Error("不支持的备份格式或版本");
  for (const [table, key] of [
    ["problems", "key"],
    ["studyLists", "id"],
    ["progress", "problemKey"],
    ["reviewEvents", "id"],
    ["trainingSessions", "id"],
  ] as const) {
    const rows = raw[table];
    if (
      !Array.isArray(rows) ||
      rows.some((x) => !object(x) || typeof x[key] !== "string" || !x[key])
    )
      throw Error("备份表损坏：" + table);
    if (new Set(rows.map((x) => x[key])).size !== rows.length)
      throw Error("备份含重复主键：" + table);
  }
  const b = raw as unknown as Backup;
  const keys = new Set(b.problems.map((p) => p.key));
  for (const p of b.problems) {
    const u = new URL(p.url);
    if (
      u.origin !== "https://leetcode.cn" ||
      !/^\/problems\/[a-z0-9-]+\/$/.test(u.pathname) ||
      u.search ||
      u.hash ||
      typeof p.title !== "string" ||
      !Array.isArray(p.topics)
    )
      throw Error("题目元数据无效");
  }
  for (const l of b.studyLists)
    if (
      typeof l.name !== "string" ||
      !Array.isArray(l.problemKeys) ||
      l.problemKeys.some((k) => !keys.has(k))
    )
      throw Error("题单引用损坏");
  for (const p of b.progress)
    if (
      !keys.has(p.problemKey) ||
      !["unseen", "prior_unassessed", "learning", "reviewing"].includes(p.state)
    )
      throw Error("学习状态损坏");
  for (const e of b.reviewEvents)
    if (
      !keys.has(e.problemKey) ||
      !["Again", "Hard", "Good", "Easy"].includes(e.rating) ||
      !["new", "assess", "review"].includes(e.kind) ||
      !Number.isFinite(Date.parse(e.reviewedAt)) ||
      !Number.isFinite(e.activeSeconds) ||
      e.activeSeconds < 0
    )
      throw Error("学习事件损坏");
  for (const s of b.trainingSessions)
    if (
      !keys.has(s.problemKey) ||
      !["running", "paused", "finished", "cancelled"].includes(s.status) ||
      !Number.isFinite(s.activeSeconds) ||
      s.activeSeconds < 0 ||
      !Number.isFinite(Date.parse(s.startedAt))
    )
      throw Error("训练会话损坏");
  for (const p of b.progress)
    if (p.fsrsCard) {
      const c = p.fsrsCard as Record<string, unknown>;
      if (
        typeof c.dueAt !== "string" ||
        !Number.isFinite(Date.parse(c.dueAt)) ||
        typeof c.stability !== "number" ||
        !Number.isFinite(c.stability) ||
        typeof c.difficulty !== "number" ||
        !Number.isFinite(c.difficulty)
      )
        throw Error("FSRS 卡片损坏");
    }
  if (
    b.planDeferrals !== undefined &&
    (!Array.isArray(b.planDeferrals) ||
      b.planDeferrals.some(
        (d) =>
          !object(d) ||
          !/^defer:\d{4}-\d{2}-\d{2}$/.test(d.key) ||
          !Array.isArray(d.value) ||
          d.value.some((k) => typeof k !== "string"),
      ))
  )
    throw Error("暂缓记录损坏");
  validatePreferences(b.preferences);
  return b;
}
export async function restoreBackup(raw: unknown) {
  const b = validateBackup(raw);
  await db.transaction("rw", db.tables, async () => {
    for (const row of b.problems)
      if (!(await db.problems.get(row.key))) await db.problems.add(row);
    for (const row of b.studyLists) {
      const old = await db.studyLists.get(row.id);
      await db.studyLists.put(
        old
          ? {
              ...old,
              problemKeys: [
                ...new Set([...old.problemKeys, ...row.problemKeys]),
              ],
            }
          : row,
      );
    }
    for (const row of b.progress)
      if (!(await db.progress.get(row.problemKey))) await db.progress.add(row);
    for (const row of b.reviewEvents)
      if (!(await db.reviewEvents.get(row.id))) await db.reviewEvents.add(row);
    for (const row of b.trainingSessions)
      if (!(await db.trainingSessions.get(row.id)))
        await db.trainingSessions.add({
          ...row,
          status: row.status === "running" ? "paused" : row.status,
          updatedAt: new Date().toISOString(),
        } as Session);
    for (const row of b.planDeferrals ?? []) {
      const old = (await db.meta.get(row.key))?.value as string[] | undefined;
      await db.meta.put({
        key: row.key,
        value: [...new Set([...(old ?? []), ...row.value])],
      });
    }
    await db.meta.put({ key: "preferences", value: b.preferences });
    await db.meta.put({ key: "onboarding", value: true });
  });
}
