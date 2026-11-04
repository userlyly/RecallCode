import {
  type Problem,
  type StudyList,
  type Progress,
  type Review,
  type Preferences,
} from "../storage/db";
import { type StoredCard } from "./fsrs";
export function localDate(date: Date, timezone: string) {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}
export interface Task {
  problem: Problem;
  taskType: "new" | "review" | "assess";
  estimatedMinutes: number;
  reason: string;
  priority: number;
}
export function planDay(
  problems: Problem[],
  lists: StudyList[],
  progress: Progress[],
  events: Review[],
  prefs: Preferences,
  now = new Date(),
  deferred: string[] = [],
  thresholds = { inactiveDays: 7, backlog: 10 },
) {
  const day = localDate(now, prefs.timezone);
  const today = events.filter(
    (e) => localDate(new Date(e.reviewedAt), prefs.timezone) === day,
  );
  const done = new Set(today.map((e) => e.problemKey));
  const enabled = new Set(
    lists.filter((l) => l.enabledForPlanning).flatMap((l) => l.problemKeys),
  );
  const states = new Map(progress.map((p) => [p.problemKey, p]));
  const last = events.reduce(
    (n, e) => Math.max(n, Date.parse(e.reviewedAt)),
    0,
  );
  const inactive = last ? Math.floor((now.getTime() - last) / 86400000) : 0;
  const due = problems.filter(
    (p) =>
      enabled.has(p.key) &&
      !!states.get(p.key)?.fsrsCard &&
      Date.parse((states.get(p.key)!.fsrsCard as StoredCard).dueAt) <=
        now.getTime(),
  );
  const recoveryMode =
    inactive >= thresholds.inactiveDays || due.length >= thresholds.backlog;
  let budget = Math.max(
    0,
    prefs.minutesPerDay -
      today.reduce(
        (sum, e) =>
          sum +
          Math.max(
            e.activeSeconds / 60,
            (e as Review & { estimatedMinutes?: number }).estimatedMinutes ?? 0,
          ),
        0,
      ),
  );
  let newLeft = Math.max(
    0,
    Math.min(
      prefs.newPerDay,
      recoveryMode
        ? prefs.autoReduceNew === false
          ? prefs.newPerDay
          : prefs.focus === "new"
            ? 1
            : 0
        : prefs.newPerDay,
    ) - today.filter((e) => e.kind === "new").length,
  );
  const candidates: Task[] = problems
    .filter(
      (p) =>
        enabled.has(p.key) && !done.has(p.key) && !deferred.includes(p.key),
    )
    .flatMap((p) => {
      const s = states.get(p.key);
      const card = s?.fsrsCard as StoredCard | undefined;
      const taskType = card
        ? "review"
        : s?.state === "prior_unassessed"
          ? "assess"
          : "new";
      if (card && Date.parse(card.dueAt) > now.getTime()) return [];
      const history = events.filter(
        (e) => e.problemKey === p.key && e.activeSeconds > 0,
      );
      const average = history.length
        ? history.reduce((s, e) => s + e.activeSeconds, 0) / history.length / 60
        : undefined;
      const estimatedMinutes = Math.min(
        60,
        Math.max(
          3,
          Math.ceil(
            average ??
              (p.topics.some((t) => /sql|数据库/i.test(t))
                ? 8
                : p.difficulty === "Easy"
                  ? 7
                  : p.difficulty === "Hard"
                    ? 25
                    : 15),
          ),
        ),
      );
      const overdue = card
        ? Math.max(
            0,
            Math.floor((now.getTime() - Date.parse(card.dueAt)) / 86400000),
          )
        : 0;
      const lastRating = events
        .filter((e) => e.problemKey === p.key)
        .sort((a, b) => a.reviewedAt.localeCompare(b.reviewedAt))
        .at(-1)?.rating;
      const weak = lastRating === "Again" ? 20 : lastRating === "Hard" ? 10 : 0;
      const priority =
        taskType === "review"
          ? 100 + Math.min(30, overdue) + weak
          : taskType === "assess"
            ? 65
            : prefs.focus === "new"
              ? 90
              : 30;
      return [
        {
          problem: p,
          taskType,
          estimatedMinutes,
          priority,
          reason:
            taskType === "review"
              ? `已到期${overdue ? ` ${overdue} 天` : ""}${lastRating ? `，上次 ${lastRating}` : ""}`
              : taskType === "assess"
                ? "以前做过，需首次 FSRS 评价"
                : "尚未学习",
        },
      ];
    });
  candidates.sort(
    (a, b) =>
      b.priority - a.priority ||
      a.problem.key.localeCompare(b.problem.key, undefined, { numeric: true }),
  );
  const tasks: Task[] = [];
  const add = (t: Task) => {
    if (
      tasks.some((a) => a.problem.key === t.problem.key) ||
      t.estimatedMinutes > budget ||
      (t.taskType === "new" &&
        (newLeft <= 0 ||
          (recoveryMode && t.estimatedMinutes > prefs.minutesPerDay * 0.3)))
    )
      return;
    tasks.push(t);
    budget -= t.estimatedMinutes;
    if (t.taskType === "new") newLeft--;
  };
  // Balanced mode reserves room for one affordable new task, without relaxing budget.
  const newTask =
    (prefs.focus === "balanced" ||
      prefs.focus === "new" ||
      prefs.autoReduceNew === false) &&
    newLeft > 0
      ? candidates.find(
          (t) =>
            t.taskType === "new" &&
            (!recoveryMode || t.estimatedMinutes <= prefs.minutesPerDay * 0.3),
        )
      : undefined;
  const reserve =
    newTask &&
    candidates.some(
      (t) =>
        t.taskType !== "new" &&
        t.estimatedMinutes + newTask.estimatedMinutes <= budget,
    )
      ? newTask
      : undefined;
  for (const t of candidates) {
    if (
      reserve &&
      t.taskType !== "new" &&
      t.estimatedMinutes > budget - reserve.estimatedMinutes
    )
      continue;
    add(t);
  }
  if (reserve) add(reserve);
  return {
    day,
    tasks,
    recoveryMode,
    backlog: due.length,
    estimatedMinutes: tasks.reduce((s, t) => s + t.estimatedMinutes, 0),
    completed: today.length,
  };
}
