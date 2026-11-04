import { useEffect, useState } from "react";
import { liveQuery } from "dexie";
import { db, preferences, type Preferences, type Problem } from "./storage/db";
import { TaskList } from "./study-ui";
import type { Review } from "./storage/db";
import { localDate, planDay, type Task } from "./domain/daily-planner";
import { startTraining } from "./storage/training";

export function Today({ onLibrary }: { onLibrary?: () => void }) {
  const [plan, setPlan] = useState<ReturnType<typeof planDay>>(),
    [message, setMessage] = useState(""),
    [prefs, setPrefs] = useState<Preferences>();
  const [events, setEvents] = useState<Review[]>([]);
  const [hasEnabledList, setHasEnabledList] = useState(false);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [clock, setClock] = useState(Date.now());
  useEffect(() => {
    const refresh = () => setClock(Date.now());
    const timer = setInterval(refresh, 30_000);
    window.addEventListener("focus", refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, []);
  const dayKey = localDate(
    new Date(clock),
    prefs?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
  );
  useEffect(() => {
    let active = true;
    const sub = liveQuery(async () => {
      const prefs = await preferences();
      const now = new Date();
      const events = await db.reviewEvents.toArray();
      const lists = await db.studyLists.toArray();
      const plan = planDay(
        await db.problems.toArray(),
        lists,
        await db.progress.toArray(),
        events,
        prefs,
        now,
      );
      return {
        prefs,
        plan,
        events: events.filter(
          (event) =>
            localDate(new Date(event.reviewedAt), prefs.timezone) === plan.day,
        ),
        hasEnabledList: lists.some(
          (list) => list.enabledForPlanning && list.problemKeys.length > 0,
        ),
      };
    }).subscribe({
      next: (r) => {
        setPrefs(r.prefs);
        const key = "plan:" + r.plan.day;
        void db
          .transaction("rw", db.meta, async () => {
            const previous = (await db.meta.get(key))?.value as
              Task[] | undefined;
            const completed = new Set(
              r.events.map((event) => event.problemKey),
            );
            const pending = new Map(
              r.plan.tasks.map((task) => [task.problem.key, task]),
            );
            const ordered = (previous ?? []).flatMap((task) => {
              const replacement = pending.get(task.problem.key);
              pending.delete(task.problem.key);
              return replacement
                ? [replacement]
                : completed.has(task.problem.key)
                  ? [task]
                  : [];
            });
            const next = [...ordered, ...pending.values()];
            if (JSON.stringify(previous) !== JSON.stringify(next))
              await db.meta.put({ key, value: next });
            return next;
          })
          .then((next) => {
            if (!active) return;
            setTasks(next);
            setEvents(r.events);
            setPlan(r.plan);
            setHasEnabledList(r.hasEnabledList);
          })
          .catch((error) => setMessage(String(error)));
      },
      error: (e) => setMessage(String(e)),
    });
    return () => {
      active = false;
      sub.unsubscribe();
    };
  }, [dayKey]);
  const run = async (fn: () => Promise<unknown>) => {
    try {
      setMessage("");
      await fn();
    } catch (e) {
      setMessage(String(e));
    }
  };
  const start = async (p: Problem) => {
    await startTraining(p.key);
    if (globalThis.chrome?.tabs) await chrome.tabs.create({ url: p.url });
    else window.open(p.url, "_blank", "noopener");
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
          <p>恢复学习 · 今天按复习上限安排到期题，积压会逐日消化。</p>
        </section>
      )}
      <p className="study-kicker">
        {plan.day} · 已完成 {events.length} 次
      </p>
      {!hasEnabledList && <button onClick={onLibrary}>前往题库</button>}
      {([true, false] as const).map((isNew) => {
        const group = tasks.filter(
          (task) => (task.taskType === "new") === isNew,
        );
        const next = plan.tasks.find(
          (task) => (task.taskType === "new") === isNew,
        );
        return (
          <section className="study-card" key={String(isNew)}>
            <div className="study-heading">
              <h2>{isNew ? "新题" : "复习与初评"}</h2>
              <button
                className="study-primary"
                disabled={!next}
                onClick={() => next && void run(() => start(next.problem))}
              >
                {isNew ? "练习新题" : "回顾旧题"}
              </button>
            </div>
            {group.length ? (
              <TaskList
                tasks={group}
                events={events}
                start={(problem) => void run(() => start(problem))}
              />
            ) : (
              <p>今天没有{isNew ? "新题" : "待复习或初评的题目"}。</p>
            )}
          </section>
        );
      })}
      {message && <p role="status">{message}</p>}
    </>
  );
}
