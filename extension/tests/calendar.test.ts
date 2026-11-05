import { it, expect } from "vitest";
import { calendarDaysBetween, reviewDate } from "../src/domain/calendar";

it("adds calendar days across DST, and supports dueAt-only legacy backups", () => {
  expect(
    reviewDate(
      {
        dueAt: "2026-11-02T03:30:00Z",
        lastReviewAt: "2026-11-01T03:30:00Z",
        scheduledDays: 1,
      },
      "America/New_York",
    ),
  ).toBe("2026-11-01");
  expect(
    reviewDate(
      {
        dueAt: "2026-03-09T04:30:00Z",
        lastReviewAt: "2026-03-08T04:30:00Z",
        scheduledDays: 1,
      },
      "America/New_York",
    ),
  ).toBe("2026-03-08");
  expect(
    reviewDate(
      { dueAt: "2026-11-04T18:00:00Z", lastReviewAt: null },
      "Asia/Shanghai",
    ),
  ).toBe("2026-11-05");
  expect(calendarDaysBetween("2026-10-31", "2026-11-02")).toBe(2);
});
