import { defaults, type Problem, type Progress, type Review } from "./db";
import { type Backup, validateBackup } from "./backup";
// v1 SQLite drops the timezone marker from UTC server timestamps.
const legacyDate = (value: string) =>
  new Date(/(?:Z|[+-]\d{2}:\d{2})$/i.test(value) ? value : value + "Z");
export const migrationWarning =
  "v1 导出不含完整题单隶属关系，且最多包含最近 500 条复习历史。题目统一归入“历史导入题目”；旧评分仅作参考，需重新进行 FSRS 初评。不会保留旧账户身份资料。";
async function stableId(value: string) {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return (
    "v1:" +
    Array.from(new Uint8Array(bytes), (x) =>
      x.toString(16).padStart(2, "0"),
    ).join("")
  );
}
export async function migrateV1(raw: unknown): Promise<Backup> {
  if (
    !raw ||
    typeof raw !== "object" ||
    !("version" in raw) ||
    raw.version !== 1
  )
    throw Error("不是 v1 备份");
  const r = raw as Record<string, unknown>;
  if (
    !Array.isArray(r.problems) ||
    !Array.isArray(r.reviews) ||
    !Array.isArray(r.lists)
  )
    throw Error("v1 备份结构损坏");
  const problems: Problem[] = [],
    progress: Progress[] = [],
    reviewEvents: Review[] = [];
  const aliases = new Map<string, string>();
  for (const p of r.problems) {
    if (
      !p ||
      typeof p !== "object" ||
      typeof p.key !== "string" ||
      !/^lc:\d+$/.test(p.key) ||
      typeof p.title !== "string" ||
      typeof p.url !== "string"
    )
      throw Error("v1 题目字段不完整");
    const number = p.key.slice(3);
    const key = "leetcode:cn:" + number;
    aliases.set(p.key, key);
    problems.push({
      key,
      frontendId: number,
      title: p.title,
      titleSlug: p.slug,
      difficulty: p.difficulty ?? "Unknown",
      topics: typeof p.topic === "string" ? [p.topic] : [],
      url: p.url,
      source: "v1",
    });
    progress.push({
      problemKey: key,
      state:
        p.state === "rated" || p.state === "prior" || p.rating
          ? "prior_unassessed"
          : "unseen",
      note: typeof p.note === "string" ? p.note : "",
      legacyMetadata: {
        rating: p.rating ?? null,
        next_due: p.next_due ?? null,
        last_review: p.last_review ?? null,
      },
    });
  }
  const occurrence = new Map<string, number>();
  for (const e of r.reviews) {
    if (
      !e ||
      typeof e !== "object" ||
      typeof e.problem_key !== "string" ||
      !aliases.has(e.problem_key)
    )
      throw Error("v1 历史引用缺失");
    const rating = String(e.rating).toLowerCase();
    const mapped = (
      { again: "Again", hard: "Hard", good: "Good", easy: "Easy" } as Record<
        string,
        string
      >
    )[rating];
    if (
      !mapped ||
      !["new", "assess", "review"].includes(e.kind) ||
      typeof e.date !== "string" ||
      !Number.isFinite(Date.parse(e.date)) ||
      !Number.isFinite(e.seconds) ||
      e.seconds < 0
    )
      throw Error("v1 历史格式损坏");
    const base = JSON.stringify([
      e.problem_key,
      mapped,
      e.kind,
      legacyDate(e.date).toISOString(),
      e.seconds,
    ]);
    const n = occurrence.get(base) ?? 0;
    occurrence.set(base, n + 1);
    reviewEvents.push({
      id: await stableId(base + ":" + n),
      problemKey: aliases.get(e.problem_key)!,
      rating: mapped,
      kind: e.kind,
      reviewedAt: legacyDate(e.date).toISOString(),
      activeSeconds: e.seconds,
      fsrsVersion: "legacy-v1-no-fsrs",
    });
  }
  return validateBackup({
    schemaVersion: 1,
    sourceApp: "RecallCode-v2",
    exportedAt: new Date().toISOString(),
    problems,
    progress,
    reviewEvents,
    trainingSessions: [],
    studyLists: [
      {
        id: "legacy-v1-import",
        name: "历史导入题目",
        problemKeys: problems.map((p) => p.key),
        sourceType: "v1",
        createdAt:
          typeof r.exported_at === "string"
            ? r.exported_at
            : new Date().toISOString(),
        enabledForPlanning: true,
      },
    ],
    preferences: { ...defaults },
  });
}
