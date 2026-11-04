import { useEffect, useState } from "react";
import { liveQuery } from "dexie";
import { db, preferences, type Preferences, type Problem } from "./storage/db";
import { planDay } from "./domain/daily-planner";
import {
  startTraining,
  tickSession,
  rateTraining,
  type ActiveSession,
} from "./storage/training";
import { ratings, type Grade, type StoredCard } from "./domain/fsrs";
export function Today() {
  const [plan, setPlan] = useState<ReturnType<typeof planDay>>(),
    [session, setSession] = useState<ActiveSession>(),
    [problem, setProblem] = useState<Problem>(),
    [message, setMessage] = useState(""),
    [note, setNote] = useState(""),
    [hint, setHint] = useState(false),
    [prefs, setPrefs] = useState<Preferences>();
  useEffect(() => {
    const sub = liveQuery(async () => {
      const prefs = await preferences();
      const day = new Intl.DateTimeFormat("sv-SE", {
        timeZone: prefs.timezone,
      }).format(new Date());
      const deferrals = ((await db.meta.get("defer:" + day))?.value ??
        []) as string[];
      return {
        prefs,
        plan: planDay(
          await db.problems.toArray(),
          await db.studyLists.toArray(),
          await db.progress.toArray(),
          await db.reviewEvents.toArray(),
          prefs,
          new Date(),
          deferrals,
        ),
        sessions: await db.trainingSessions.toArray(),
        problems: await db.problems.toArray(),
      };
    }).subscribe({
      next: (r) => {
        setPrefs(r.prefs);
        setPlan(r.plan);
        const active = r.sessions.find(
          (s) => s.status === "running" || s.status === "paused",
        ) as ActiveSession | undefined;
        setSession(active);
        setProblem(r.problems.find((p) => p.key === active?.problemKey));
      },
      error: (e) => setMessage(String(e)),
    });
    return () => sub.unsubscribe();
  }, []);
  useEffect(() => {
    if (!session || session.status !== "running") return;
    const id = setInterval(() => {
      if (document.visibilityState === "visible")
        void tickSession(session.id, "heartbeat").catch((e) =>
          setMessage(String(e)),
        );
    }, 5000);
    return () => clearInterval(id);
  }, [session?.id, session?.status]);
  useEffect(() => {
    if (session)
      void db.progress
        .get(session.problemKey)
        .then((p) => setNote(p?.note ?? ""));
    setHint(false);
  }, [session?.id]);
  useEffect(() => {
    if (!session) return;
    let last = 0;
    const activity = () => {
      if (Date.now() - last > 5000) {
        last = Date.now();
        void tickSession(session.id, "activity").catch((e) =>
          setMessage(String(e)),
        );
      }
    };
    document.addEventListener("keydown", activity);
    document.addEventListener("pointerdown", activity);
    return () => {
      document.removeEventListener("keydown", activity);
      document.removeEventListener("pointerdown", activity);
    };
  }, [session?.id]);
  const run = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
    } catch (e) {
      setMessage(String(e));
    }
  };
  const start = async (p: Problem) => {
    await startTraining(p.key);
    setNote((await db.progress.get(p.key))?.note ?? "");
    setHint(false);
    if (globalThis.chrome?.tabs) await chrome.tabs.create({ url: p.url });
    else window.open(p.url, "_blank", "noopener");
  };
  const rate = async (g: Grade) => {
    if (!session) return;
    await rateTraining(session.id, g, note, hint);
    const p = await db.progress.get(session.problemKey);
    setMessage(
      `已保存 ${g}，下次复习：${new Date((p?.fsrsCard as StoredCard).dueAt).toLocaleString()}`,
    );
  };
  if (!plan)
    return (
      <section>
        <p role="status">正在生成今日计划…</p>
        {message && <p>{message}</p>}
      </section>
    );
  return (
    <>
      {plan?.recoveryMode && (
        <section>
          <h2>欢迎回来，今天先完成 {plan.tasks.length} 道</h2>
          <p>恢复学习 · 今天按时间预算安排少量复习，积压会逐日消化。</p>
        </section>
      )}
      {session && problem && (
        <section>
          <h2>正在训练 · {problem.title}</h2>
          <p>
            {session.status === "running" ? "计时中" : "已暂停"} ·{" "}
            {Math.floor(session.activeSeconds / 60)} 分{" "}
            {Math.round(session.activeSeconds % 60)} 秒
          </p>
          <p>
            页面可见时每 5 秒确认有效时间；离开过久或 5
            分钟无操作自动暂停，单次最多 2 小时。
          </p>
          <button
            onClick={() =>
              run(() =>
                tickSession(
                  session.id,
                  session.status === "running" ? "pause" : "resume",
                ),
              )
            }
          >
            {session.status === "running" ? "暂停" : "继续"}
          </button>
          <button onClick={() => run(() => tickSession(session.id, "cancel"))}>
            结束且不记录
          </button>
          <label>
            个人笔记
            <textarea value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
          <label>
            <input
              type="checkbox"
              checked={hint}
              onChange={(e) => setHint(e.target.checked)}
            />
            使用了提示
          </label>
          <p>完成后主动评价：独立做不出 / 较多提示 / 基本独立 / 快速熟练。</p>
          <div className="actions">
            {ratings.map((g) => (
              <button key={g} onClick={() => run(() => rate(g))}>
                {g}
              </button>
            ))}
          </div>
        </section>
      )}
      <section>
        <h2>今天做一点，保持手感。</h2>
        <p>
          {plan?.day} · 预算 {prefs?.minutesPerDay ?? 30} 分钟 · 已完成{" "}
          {plan?.completed ?? 0} 次 · 建议 {plan?.estimatedMinutes ?? 0} 分钟
        </p>
        <p>
          待复习{" "}
          {plan?.tasks.filter((t) => t.taskType === "review").length ?? 0} /
          待评估{" "}
          {plan?.tasks.filter((t) => t.taskType === "assess").length ?? 0} /
          新题 {plan?.tasks.filter((t) => t.taskType === "new").length ?? 0}
        </p>
        {!plan?.tasks.length && (
          <p>当前没有预算内待办。可在题库添加题单，或调整时间预算。</p>
        )}
        {plan?.tasks.map((t) => (
          <div className="problem" key={t.problem.key}>
            <strong>
              {t.problem.frontendId} · {t.problem.title}
            </strong>
            <p>
              {t.taskType === "new"
                ? "新题"
                : t.taskType === "assess"
                  ? "初评"
                  : "复习"}{" "}
              · {t.problem.difficulty} · 约 {t.estimatedMinutes} 分钟
              <br />
              {t.reason}
            </p>
            <button onClick={() => run(() => start(t.problem))}>开始</button>
            <button
              onClick={() =>
                run(async () => {
                  const key = "defer:" + plan.day;
                  await db.transaction("rw", db.meta, async () => {
                    const previous = ((await db.meta.get(key))?.value ??
                      []) as string[];
                    await db.meta.put({
                      key,
                      value: [...new Set([...previous, t.problem.key])],
                    });
                  });
                })
              }
            >
              暂缓今天
            </button>
          </div>
        ))}
        {plan?.tasks[0] && !session && (
          <button onClick={() => run(() => start(plan.tasks[0].problem))}>
            开始今日学习
          </button>
        )}
      </section>
      {message && <p role="status">{message}</p>}
    </>
  );
}
