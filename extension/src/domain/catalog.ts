import hot100 from "../data/hot100.json";
import interview150 from "../data/interview150.json";
import sql50 from "../data/sql50.json";
import { db, type Problem, type StudyList } from "../storage/db";
export const presets = [hot100, interview150, sql50];
export const catalog: Problem[] = [
  ...new Map(
    presets.flatMap((p) => p.questions).map((p) => [p.key, p]),
  ).values(),
];
export function canonicalUrl(value: string, preserveOrigin = false) {
  const u = new URL(value);
  if (
    !["leetcode.cn", "leetcode.com"].includes(u.hostname) ||
    u.protocol !== "https:" ||
    u.username ||
    u.password ||
    u.port
  )
    throw Error("仅支持 HTTPS 力扣题目链接");
  const m = u.pathname.match(
    /^\/problems\/([a-z0-9-]+)(?:\/(?:description\/?)?)?$/,
  );
  if (!m) throw Error("无效题目路径");
  return {
    slug: m[1],
    url: `${preserveOrigin ? u.origin : "https://leetcode.cn"}/problems/${m[1]}/`,
  };
}
export function parsePaste(text: string) {
  const tokens =
    text.match(/https?:\/\/[^\s)\]>，,]+|\b\d+\b|[^\s,，;；]+/g) ?? [];
  const found = new Map<string, Problem>();
  let duplicates = 0;
  const errors: string[] = [];
  for (let token of tokens) {
    token = token.replace(/^\[|\]$/g, "");
    let p: Problem | undefined;
    try {
      if (/^\d+$/.test(token)) {
        p = catalog.find((p) => p.frontendId === String(Number(token)));
        if (!p) {
          errors.push(`${token}：编号尚未核验，请提供题目链接`);
          continue;
        }
      } else if (token.startsWith("http")) {
        const u = canonicalUrl(token, true);
        p = catalog.find((p) => p.titleSlug === u.slug) ?? {
          key:
            (new URL(u.url).hostname === "leetcode.com"
              ? "leetcode:com:slug:"
              : "leetcode:slug:") + u.slug,
          title: "待补全标题",
          titleSlug: u.slug,
          url: u.url,
          difficulty: "Unknown",
          topics: [],
          source: "paste",
        };
      } else {
        if (token.length > 1) errors.push(`${token}：无法识别`);
        continue;
      }
      if (found.has(p.key)) duplicates++;
      else found.set(p.key, p);
    } catch (e) {
      errors.push(`${token}：${String(e)}`);
    }
  }
  return { problems: [...found.values()], duplicates, errors };
}
export async function addList(
  name: string,
  problems: Problem[],
  merge = false,
  id: string = crypto.randomUUID(),
  sourceType = "paste",
  sourceUrl?: string,
) {
  name = name.trim();
  if (!name || name.length > 100 || !problems.length)
    throw Error("请输入题单名称及至少一道题目");
  return db.transaction(
    "rw",
    db.problems,
    db.studyLists,
    db.progress,
    async () => {
      const existing = (await db.studyLists.toArray()).find(
        (l) => l.name === name,
      );
      if (existing && !merge)
        throw Error("同名题单已存在，请选择合并或另存新名");
      const list: StudyList = existing ?? {
        id,
        name,
        problemKeys: [],
        sourceType,
        sourceUrl,
        createdAt: new Date().toISOString(),
        enabledForPlanning: true,
      };
      for (const p of problems) {
        if (!(await db.problems.get(p.key))) await db.problems.add(p);
        if (!(await db.progress.get(p.key)))
          await db.progress.add({ problemKey: p.key, state: "unseen" });
      }
      const previousCount = list.problemKeys.length;
      list.problemKeys = [
        ...new Set([...list.problemKeys, ...problems.map((p) => p.key)]),
      ];
      await db.studyLists.put(list);
      return {
        id: list.id,
        added: list.problemKeys.length - previousCount,
        duplicates: problems.length - (list.problemKeys.length - previousCount),
      };
    },
  );
}
export async function renameList(id: string, name: string) {
  name = name.trim();
  if (!name || name.length > 100) throw Error("名称长度应为 1–100");
  await db.transaction("rw", db.studyLists, async () => {
    if (
      (await db.studyLists.toArray()).some(
        (l) => l.id !== id && l.name === name,
      )
    )
      throw Error("名称已存在");
    await db.studyLists.update(id, { name });
  });
}
export async function markPrior(keys: string[]) {
  await db.transaction("rw", db.progress, async () => {
    for (const problemKey of keys) {
      const p = await db.progress.get(problemKey);
      if (!p || p.state === "unseen")
        await db.progress.put({ problemKey, state: "prior_unassessed" });
    }
  });
}
