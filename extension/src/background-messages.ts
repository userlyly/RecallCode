import { db } from "./storage/db";
import { catalog } from "./domain/catalog";
import { startTraining, tickSession, rateTraining } from "./storage/training";
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
    const prefs = (await db.meta.get("preferences"))?.value as
      { enableLeetcodeInline?: boolean } | undefined;
    if (!prefs?.enableLeetcodeInline) throw Error("请先在设置启用力扣集成");
    const problem =
      (await db.problems.where("titleSlug").equals(message.slug).first()) ??
      catalog.find((p) => p.titleSlug === message.slug);
    if (!problem) throw Error("当前题目未在本地核验，请先粘贴链接导入");
    if (message.action === "identify")
      return {
        ...problem,
        sessionId: (
          await db.trainingSessions
            .where("problemKey")
            .equals(problem.key)
            .filter((s) => s.status === "running" || s.status === "paused")
            .first()
        )?.id,
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
    if (
      ["heartbeat", "pause", "resume", "activity", "cancel"].includes(
        message.action,
      )
    )
      return tickSession(s.id, message.action);
    if (message.action === "rate" && ratings.includes(message.rating)) {
      const event = await rateTraining(s.id, message.rating as Grade);
      return {
        ...event,
        nextDue: (
          (await db.progress.get(s.problemKey))?.fsrsCard as { dueAt?: string }
        )?.dueAt,
      };
    }
    throw Error("不支持的消息操作");
  })()
    .then((value) => respond({ ok: true, value }))
    .catch((e) => respond({ ok: false, error: String(e) }));
  return true;
});
