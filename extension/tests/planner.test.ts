import { it, expect } from "vitest";
import { planDay, localDate } from "../src/domain/daily-planner";
import { defaults, type Progress, type Review } from "../src/storage/db";
import { presets } from "../src/domain/catalog";
import { schedule, ratings } from "../src/domain/fsrs";
const now = new Date("2026-11-04T00:00:00Z");
it("uses real FSRS four branches, produces future due and roundtrips JSON", async () => {
  const due = [];
  for (const g of ratings) {
    const a = await schedule(undefined, g, now);
    expect(Date.parse(a.card.dueAt)).toBeGreaterThan(now.getTime());
    expect(a.card).toHaveProperty("stability");
    const b = await schedule(
      JSON.parse(JSON.stringify(a.card)),
      g,
      new Date("2026-12-04T00:00:00Z"),
    );
    expect(b.card).toHaveProperty("difficulty");
    due.push(a.card.dueAt);
  }
  expect(new Set(due).size).toBeGreaterThan(1);
});
it("bounds 35 due cards after 7/30/90 days and 15/30/60 minutes, stable on reentry", () => {
  const problems = presets[0].questions.slice(0, 35);
  const lists = [
    {
      id: "a",
      name: "A",
      problemKeys: problems.map((p) => p.key),
      sourceType: "preset",
      createdAt: now.toISOString(),
      enabledForPlanning: true,
    },
  ];
  for (const days of [7, 30, 90])
    for (const minutesPerDay of [15, 30, 60]) {
      const old = new Date(now.getTime() - days * 86400000).toISOString();
      const progress: Progress[] = problems.map((p) => ({
        problemKey: p.key,
        state: "reviewing",
        fsrsCard: { dueAt: old },
      }));
      const events: Review[] = [
        {
          id: "old",
          problemKey: problems[0].key,
          reviewedAt: old,
          kind: "new",
          rating: "Hard",
          activeSeconds: 30,
          fsrsVersion: "test",
        },
      ];
      const input = [
        problems,
        lists,
        progress,
        events,
        { ...defaults, minutesPerDay },
        now,
      ] as const;
      const p = planDay(...input);
      expect(p.recoveryMode).toBe(true);
      expect(p.estimatedMinutes).toBeLessThanOrEqual(minutesPerDay);
      expect(p.tasks.every((t) => t.taskType !== "new")).toBe(true);
      expect(planDay(...input)).toEqual(p);
    }
});
it("handles empty, first learning, prior assessment, completion and timezone/DST", () => {
  const p = presets[0].questions[0];
  const lists = [
    {
      id: "x",
      name: "x",
      problemKeys: [p.key],
      createdAt: "",
      enabledForPlanning: true,
      sourceType: "preset",
    },
  ];
  expect(planDay([p], [], [], [], defaults, now).tasks).toEqual([]);
  expect(planDay([p], lists, [], [], defaults, now).tasks[0].taskType).toBe(
    "new",
  );
  expect(
    planDay(
      [p],
      lists,
      [{ problemKey: p.key, state: "prior_unassessed" }],
      [],
      defaults,
      now,
    ).tasks[0].taskType,
  ).toBe("assess");
  expect(localDate(new Date("2026-11-01T05:30:00Z"), "America/New_York")).toBe(
    "2026-11-01",
  );
  expect(localDate(new Date("2026-11-01T06:30:00Z"), "America/New_York")).toBe(
    "2026-11-01",
  );
  expect(localDate(new Date("2026-11-03T20:00:00Z"), "Asia/Shanghai")).toBe(
    "2026-11-04",
  );
});

it("completed tasks consume their reserved budget and deferred cards keep their due", () => {
  const problems = presets[0].questions.slice(0, 10);
  const lists = [
    {
      id: "x",
      name: "x",
      problemKeys: problems.map((p) => p.key),
      createdAt: "",
      enabledForPlanning: true,
      sourceType: "preset",
    },
  ];
  const event = {
    id: "done",
    problemKey: problems[0].key,
    rating: "Good",
    kind: "new",
    reviewedAt: now.toISOString(),
    activeSeconds: 1,
    estimatedMinutes: 15,
    fsrsVersion: "test",
  };
  expect(
    planDay(
      problems,
      lists,
      [],
      [event],
      { ...defaults, minutesPerDay: 15 },
      now,
    ).tasks,
  ).toEqual([]);
  const progress: Progress[] = [
    {
      problemKey: problems[0].key,
      state: "reviewing",
      fsrsCard: { dueAt: "2026-10-01T00:00:00Z" },
    },
  ];
  const before = JSON.stringify(progress);
  const deferred = planDay(problems, lists, progress, [], defaults, now, [
    problems[0].key,
  ]);
  expect(deferred.tasks.every((t) => t.problem.key !== problems[0].key)).toBe(
    true,
  );
  expect(JSON.stringify(progress)).toBe(before);
});

it("new-only and prior-only queues respect 15/30/60 minute budgets and new limits", () => {
  const problems = presets[0].questions;
  const lists = [
    {
      id: "a",
      name: "A",
      problemKeys: problems.map((p) => p.key),
      sourceType: "preset",
      createdAt: "",
      enabledForPlanning: true,
    },
  ];
  for (const minutesPerDay of [15, 30, 60])
    for (const prior of [false, true]) {
      const progress: Progress[] = prior
        ? problems.map((p) => ({
            problemKey: p.key,
            state: "prior_unassessed",
          }))
        : [];
      const plan = planDay(
        problems,
        lists,
        progress,
        [],
        { ...defaults, minutesPerDay },
        now,
      );
      expect(plan.estimatedMinutes).toBeLessThanOrEqual(minutesPerDay);
      expect(
        plan.tasks.filter((t) => t.taskType === "new").length,
      ).toBeLessThanOrEqual(2);
      expect(new Set(plan.tasks.map((t) => t.problem.key)).size).toBe(
        plan.tasks.length,
      );
      expect(
        plan.tasks.every((t) => t.taskType === (prior ? "assess" : "new")),
      ).toBe(true);
    }
});

it("uses separate question quotas and ignores the legacy time budget in the sidebar", () => {
  const problems = presets[0].questions.slice(0, 8);
  const lists = [
    {
      id: "plan",
      name: "Plan",
      problemKeys: problems.map((p) => p.key),
      sourceType: "preset",
      enabledForPlanning: true,
      createdAt: now.toISOString(),
    },
  ];
  const progress: Progress[] = problems.slice(0, 4).map((p) => ({
    problemKey: p.key,
    state: "reviewing",
    fsrsCard: { dueAt: "2026-11-03T00:00:00Z" },
  }));
  const plan = planDay(
    problems,
    lists,
    progress,
    [],
    { ...defaults, minutesPerDay: 1, newPerDay: 2, reviewPerDay: 1 },
    now,
  );
  expect(plan.tasks.map((task) => task.taskType)).toEqual([
    "review",
    "new",
    "new",
  ]);
});

it("makes a one-day review due at local midnight, including existing cards and quota limits", async () => {
  const problem = presets[0].questions[0];
  const lists = [
    {
      id: "calendar",
      name: "Calendar",
      problemKeys: [problem.key],
      sourceType: "preset",
      enabledForPlanning: true,
      createdAt: "",
    },
  ];
  const reviewedAt = new Date("2026-11-04T13:00:00Z"); // Shanghai 21:00
  const { card } = await schedule(undefined, "Again", reviewedAt);
  const prefs = { ...defaults, timezone: "Asia/Shanghai", reviewPerDay: 10 };
  for (const stored of [card, { dueAt: "2026-11-05T13:00:00Z" }]) {
    const progress: Progress[] = [
      { problemKey: problem.key, state: "reviewing", fsrsCard: stored },
    ];
    expect(
      planDay(
        [problem],
        lists,
        progress,
        [],
        prefs,
        new Date("2026-11-04T15:59:59Z"),
      ).tasks,
    ).toHaveLength(0);
    const morning = new Date("2026-11-04T16:00:00Z");
    expect(
      planDay([problem], lists, progress, [], prefs, morning).tasks[0].taskType,
    ).toBe("review");
    expect(
      planDay(
        [problem],
        lists,
        progress,
        [],
        prefs,
        new Date("2026-11-04T17:00:00Z"),
      ).tasks,
    ).toHaveLength(1);
    expect(
      planDay(
        [problem],
        lists,
        progress,
        [],
        { ...prefs, reviewPerDay: 0 },
        morning,
      ).tasks,
    ).toHaveLength(0);
    expect(
      planDay(
        [problem],
        [{ ...lists[0], enabledForPlanning: false }],
        progress,
        [],
        prefs,
        morning,
      ).tasks,
    ).toHaveLength(0);
    const event: Review = {
      id: "done",
      problemKey: problem.key,
      reviewedAt: morning.toISOString(),
      kind: "review",
      rating: "Good",
      activeSeconds: 10,
      fsrsVersion: "test",
    };
    expect(
      planDay([problem], lists, progress, [event], prefs, morning).tasks,
    ).toHaveLength(0);
  }
});
