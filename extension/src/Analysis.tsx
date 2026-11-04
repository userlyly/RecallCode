import { duration, RatingBadge } from "./study-ui";
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
    [offset, setOffset] = useState(0),
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
  const today = localDate(new Date(), timezone);
  const chosen = selected || (offset === 0 ? today : "");
  const anchor = new Date(today.slice(0, 7) + "-01T12:00:00Z");
  anchor.setUTCMonth(anchor.getUTCMonth() + offset);
  const nextMonth = new Date(anchor);
  nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
  nextMonth.setUTCDate(0);
  const leading = (anchor.getUTCDay() + 6) % 7;
  const shift = (direction: number) => {
    setOffset((current) => current + direction);
    setSelected("");
  };
  const cellCount = Math.ceil((leading + nextMonth.getUTCDate()) / 7) * 7;
  const dates = Array.from({ length: cellCount }, (_, index) => {
    const day = index - leading + 1;
    if (day < 1 || day > nextMonth.getUTCDate()) return "";
    return (
      anchor.toISOString().slice(0, 7) + "-" + String(day).padStart(2, "0")
    );
  });
  const problemsByKey = new Map(
    problems.map((problem) => [problem.key, problem]),
  );
  const dayEvents = [...(byDay.get(chosen) ?? [])].sort(
    (a, b) => Date.parse(b.reviewedAt) - Date.parse(a.reviewedAt),
  );
  const timeFormat = new Intl.DateTimeFormat("zh-CN", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  return (
    <>
      <section>
        <div className="study-heading">
          <h2>概览</h2>
        </div>
        <div className="metric-grid">
          {[
            [
              "📙",
              "今日学习 / 复习",
              `${stats.newCount} / ${stats.reviewCount} 次`,
            ],
            ["📚", "累计学习", `${stats.learned} 题`],
            ["⏳", "今日有效时长", duration(stats.todaySeconds)],
            ["⌛", "累计有效时长", duration(stats.totalSeconds)],
          ].map(([icon, title, value]) => (
            <div className="metric-tile" key={title}>
              <span className="metric-icon" aria-hidden="true">
                {icon}
              </span>
              <span>{title}</span>
              <strong>{value}</strong>
            </div>
          ))}
        </div>
      </section>
      <section>
        <div className="study-heading">
          <p className="study-kicker">
            <span aria-hidden="true">📆</span> 学习日历
          </p>
          <button
            onClick={() => {
              setOffset(0);
              setSelected("");
            }}
          >
            回到今天
          </button>
        </div>
        <div className="calendar-controls">
          <button aria-label="上个月" onClick={() => shift(-1)}>
            ‹
          </button>
          <h2 aria-live="polite">
            {anchor.getUTCFullYear()} 年 {anchor.getUTCMonth() + 1} 月
          </h2>
          <button aria-label="下个月" onClick={() => shift(1)}>
            ›
          </button>
        </div>
        <div className="month-grid">
          {["一", "二", "三", "四", "五", "六", "日"].map((day) => (
            <span key={day}>周{day}</span>
          ))}
          {dates.map((day, index) =>
            day ? (
              <button
                key={day}
                type="button"
                aria-label={day}
                aria-description={byDay.has(day) ? "有学习记录" : undefined}
                aria-pressed={day === chosen}
                aria-current={day === today ? "date" : undefined}
                className={byDay.has(day) ? "learned" : ""}
                onClick={() => setSelected(day)}
              >
                {Number(day.slice(8))}
                {byDay.has(day) && <i />}
              </button>
            ) : (
              <span key={index} aria-hidden="true" />
            ),
          )}
        </div>
        <div className="calendar-detail">
          {!chosen ? (
            <p>选择日期查看当天的学习记录。</p>
          ) : (
            <>
              <h3>
                {chosen === today ? "今天 · " : ""}
                {chosen}
              </h3>
              <h4>完成情况 · {byDay.get(chosen)?.length ?? 0} 次</h4>
              {!byDay.has(chosen) && <p>当天暂无学习记录。</p>}
              {dayEvents.length > 0 && (
                <ol className="completion-timeline">
                  {dayEvents.map((event) => {
                    const problem = problemsByKey.get(event.problemKey);
                    return (
                      <li key={event.id}>
                        <time dateTime={event.reviewedAt}>
                          {timeFormat.format(new Date(event.reviewedAt))}
                        </time>
                        <strong>
                          {problem?.frontendId ? problem.frontendId + ". " : ""}
                          {problem?.title ?? event.problemKey}
                        </strong>
                        <RatingBadge rating={event.rating} />
                      </li>
                    );
                  })}
                </ol>
              )}
            </>
          )}
        </div>
      </section>
    </>
  );
}
