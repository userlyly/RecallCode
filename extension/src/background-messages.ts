import { reviewDate } from "./domain/calendar";
import type { StoredCard } from "./domain/fsrs";
import { db, preferences } from "./storage/db";
import { catalog } from "./domain/catalog";
import {
  startTraining,
  tickSession,
  rateTraining,
  saveTrainingDraft,
} from "./storage/training";
import { ratings, type Grade } from "./domain/fsrs";
import { allowedSender } from "./domain/messages";
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (message?.type !== "recallcode") return;
  void (async () => {
    if (!allowedSender(sender, chrome.runtime.id))
      throw Error("未授权的消息来源");
    if (
      typeof message.slug !== "string" ||
      !/^[a-z0-9-]{1,150}$/.test(message.slug) ||
      new URL(sender.url!).pathname.split("/")[2] !== message.slug
    )
      throw Error("题目参数不匹配");
    if ((await chrome.storage.local.get("inlineDisabled")).inlineDisabled)
      throw Error("页面入口已停用");
    const slug = message.slug as string;
    const origin = new URL(sender.url!).origin;
    const problem = (await db.problems
      .where("titleSlug")
      .equals(slug)
      .first()) ??
      catalog.find((p) => p.titleSlug === slug) ?? {
        key:
          (origin === "https://leetcode.com"
            ? "leetcode:com:slug:"
            : "leetcode:slug:") + slug,
        titleSlug: slug,
        title:
          typeof message.title === "string" && message.title.trim()
            ? message.title.trim().slice(0, 160)
            : slug,
        url: `${origin}/problems/${slug}/`,
        difficulty: "Unknown",
        topics: [],
        source: "page",
      };
    if (message.action === "identify")
      return {
        ...problem,
        session: await db.trainingSessions
          .where("problemKey")
          .equals(problem.key)
          .filter((s) => s.status === "running" || s.status === "paused")
          .first(),
      };
    if (message.action === "start") {
      await db.transaction("rw", db.problems, async () => {
        if (!(await db.problems.get(problem.key)))
          await db.problems.add(problem);
      });
      return startTraining(problem.key);
    }
    if (typeof message.sessionId !== "string" || message.sessionId.length > 100)
      throw Error("会话参数无效");
    const s = await db.trainingSessions.get(message.sessionId);
    if (!s || s.problemKey !== problem.key) throw Error("会话与题目不符");
    if (message.action === "draft") {
      if (typeof message.note === "string" && message.note.length <= 20000)
        return saveTrainingDraft(s.id, { note: message.note });
      if (typeof message.usedHint === "boolean")
        return saveTrainingDraft(s.id, { usedHint: message.usedHint });
      throw Error("笔记参数无效");
    }
    if (
      ["heartbeat", "pause", "resume", "activity", "cancel"].includes(
        message.action,
      )
    )
      return tickSession(s.id, message.action);
    if (message.action === "rate" && ratings.includes(message.rating)) {
      const event = await rateTraining(s.id, message.rating as Grade);
      const dueCard = (await db.progress.get(s.problemKey))?.fsrsCard as
        StoredCard | undefined;
      return {
        ...event,
        nextDueDate: dueCard
          ? reviewDate(dueCard, (await preferences()).timezone)
          : undefined,
      };
    }
    throw Error("不支持的消息操作");
  })()
    .then((value) => respond({ ok: true, value }))
    .catch((e) => respond({ ok: false, error: String(e) }));
  return true;
});
