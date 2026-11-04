import { it, expect } from "vitest";
import { summarize } from "../src/Analysis";
it("counts distinct questions separately from events and uses completion day/timezone", () => {
  const events = [
    {
      id: "a",
      problemKey: "1",
      kind: "new",
      rating: "Good",
      activeSeconds: 10,
      reviewedAt: "2026-11-03T18:00:00Z",
      fsrsVersion: "test",
    },
    {
      id: "b",
      problemKey: "1",
      kind: "review",
      rating: "Good",
      activeSeconds: 20,
      reviewedAt: "2026-11-03T18:05:00Z",
      fsrsVersion: "test",
    },
  ];
  expect(
    summarize(events, "Asia/Shanghai", new Date("2026-11-04T00:00:00Z")),
  ).toEqual({
    newCount: 1,
    reviewCount: 1,
    learned: 1,
    todaySeconds: 30,
    totalSeconds: 30,
  });
  expect(summarize([], "Asia/Shanghai").learned).toBe(0);
});
