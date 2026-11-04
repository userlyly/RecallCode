import { useEffect, useState } from "react";
import { liveQuery } from "dexie";
import { db, preferences, type Review, type Problem } from "./storage/db";
import { localDate } from "./domain/daily-planner";
export function summarize(
  events: Review[],
  timezone: string,
  now = new Date(),
) {
  const valid = events.filter(
    (e) => Number.isFinite(e.activeSeconds) && e.activeSeconds >= 0,
  );
  const today = valid.filter(
    (e) =>
      localDate(new Date(e.reviewedAt), timezone) === localDate(now, timezone),
  );
  return {
    newCount: today.filter((e) => e.kind === "new").length,
    reviewCount: today.filter((e) => e.kind !== "new").length,
    learned: new Set(valid.map((e) => e.problemKey)).size,
    todaySeconds: today.reduce((s, e) => s + e.activeSeconds, 0),
    totalSeconds: valid.reduce((s, e) => s + e.activeSeconds, 0),
  };
}
export function Analysis() {
  const [events, setEvents] = useState<Review[]>([]),
    [problems, setProblems] = useState<Problem[]>([]),
    [timezone, setTimezone] = useState(
      Intl.DateTimeFormat().resolvedOptions().timeZone,
    ),
    [days, setDays] = useState(84),
    [selected, setSelected] = useState("");
  useEffect(() => {
    const sub = liveQuery(async () => ({
      events: await db.reviewEvents.toArray(),
      problems: await db.problems.toArray(),
      prefs: await preferences(),
    })).subscribe((r) => {
      setEvents(r.events);
      setProblems(r.problems);
      setTimezone(r.prefs.timezone);
    });
    return () => sub.unsubscribe();
  }, []);
  const stats = summarize(events, timezone);
  const byDay = new Map<string, Review[]>();
  for (const e of events) {
    const day = localDate(new Date(e.reviewedAt), timezone);
    byDay.set(day, [...(byDay.get(day) ?? []), e]);
  }
  const now = new Date();
  const dates = Array.from({ length: days }, (_, i) => {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - days + 1 + i);
    return localDate(d, timezone);
  });
  const titles = new Map(problems.map((p) => [p.key, p.title]));
  return (
    <>
      <div className="metrics">
        {[
          ["今日学习 / 复习", `${stats.newCount} / ${stats.reviewCount} 次`],
          ["累计学习", `${stats.learned} 题`],
          ["今日有效时长", `${Math.round(stats.todaySeconds)} 秒`],
          ["累计有效时长", `${Math.round(stats.totalSeconds)} 秒`],
        ].map(([title, value]) => (
          <section key={title}>
            <p>{title}</p>
            <strong>{value}</strong>
          </section>
        ))}
      </div>
      <section>
        <h2>学习日历</h2>
        <button onClick={() => setDays(days === 84 ? 365 : 84)}>
          {days === 84 ? "查看最近一年" : "查看最近 12 周"}
        </button>
        <p>时区：{timezone}。跨天训练统一归属评价完成日期；取消训练不计入。</p>
        <div className="calendar">
          {dates.map((day) => (
            <button
              title={`${day} · ${byDay.get(day)?.length ?? 0} 次`}
              aria-label={`${day} 学习详情`}
              key={day}
              className={byDay.has(day) ? "learned" : ""}
              onClick={() => setSelected(day)}
            >
              {day.slice(8)}
            </button>
          ))}
        </div>
        {selected && (
          <>
            <h3>{selected}</h3>
            {!byDay.has(selected) && <p>当天没有学习记录。</p>}
            {byDay.get(selected)?.map((e) => (
              <p key={e.id}>
                {titles.get(e.problemKey) ?? e.problemKey} · {e.kind} ·{" "}
                {e.rating} · {e.activeSeconds} 秒
              </p>
            ))}
          </>
        )}
      </section>
      <section>
        <h2>学习历史</h2>
        {!events.length && <p>暂无真实训练记录。</p>}
        {[...events]
          .sort((a, b) => b.reviewedAt.localeCompare(a.reviewedAt))
          .slice(0, 100)
          .map((e) => (
            <p key={e.id}>
              {new Date(e.reviewedAt).toLocaleString("zh-CN", {
                timeZone: timezone,
              })}{" "}
              · {titles.get(e.problemKey) ?? e.problemKey} · {e.rating} ·{" "}
              {e.activeSeconds} 秒
            </p>
          ))}
        <details>
          <summary>分类学习进度</summary>
          {[...new Set(problems.flatMap((p) => p.topics))].map((t) => (
            <p key={t}>
              {t}：已学{" "}
              {
                problems.filter(
                  (p) =>
                    p.topics.includes(t) &&
                    events.some((e) => e.problemKey === p.key),
                ).length
              }{" "}
              / {problems.filter((p) => p.topics.includes(t)).length}
            </p>
          ))}
        </details>
      </section>
    </>
  );
}
