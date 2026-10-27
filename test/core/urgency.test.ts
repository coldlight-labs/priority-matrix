import { describe, expect, it } from "vitest";
import {
  dateForUrgency,
  dueMoment,
  isLocalDate,
  isLocalTime,
  localDateOf,
  scoreTasks,
  urgencyAt,
} from "../../src/core/urgency";

// Tests run in Australia/Sydney (vite.config.ts). Local noon on Friday 23 October 2026.
const NOW = new Date(2026, 9, 23, 12, 0);

/** The local date `days` after 23 October 2026. */
function dayAfter(days: number): string {
  return localDateOf(new Date(2026, 9, 23 + days));
}

describe("isLocalDate", () => {
  it.each(["2026-10-24", "2028-02-29", "2026-12-31"])("accepts %s", (d) => {
    expect(isLocalDate(d)).toBe(true);
  });

  it.each([
    "2026-02-30",
    "2026-13-01",
    "2026-1-5",
    "24/10/2026",
    "2026-10-24T10:00",
    "",
    null,
    20261024,
  ])("rejects %j", (d) => {
    expect(isLocalDate(d)).toBe(false);
  });
});

describe("isLocalTime", () => {
  it.each(["00:00", "09:30", "23:59"])("accepts %s", (t) => {
    expect(isLocalTime(t)).toBe(true);
  });

  it.each(["24:00", "9:30", "09:60", "09:30:00", "", null])(
    "rejects %j",
    (t) => {
      expect(isLocalTime(t)).toBe(false);
    },
  );
});

describe("dueMoment", () => {
  it("uses the time on that date", () => {
    expect(dueMoment("2026-10-24", "10:30")).toEqual(
      new Date(2026, 9, 24, 10, 30),
    );
  });

  it("counts a date without a time as the end of that day", () => {
    expect(dueMoment("2026-10-24", null)).toEqual(new Date(2026, 9, 25));
  });
});

describe("urgencyAt", () => {
  // The table approved in Q22: urgency halves every 7 days left.
  it.each([
    [1, 91],
    [2, 82],
    [3, 74],
    [5, 61],
    [7, 50],
    [10, 37],
    [14, 25],
    [21, 13],
    [30, 5],
  ])("%d days left gives %d", (days, expected) => {
    expect(urgencyAt({ date: dayAfter(days), time: "12:00" }, NOW)).toBe(
      expected,
    );
  });

  it("gives 100 when due now or overdue", () => {
    expect(urgencyAt({ date: dayAfter(0), time: "12:00" }, NOW)).toBe(100);
    expect(urgencyAt({ date: dayAfter(-3), time: null }, NOW)).toBe(100);
  });

  it("gives 0 with no date", () => {
    expect(urgencyAt({ date: null, time: null }, NOW)).toBe(0);
  });

  it("counts hours, so a time later today rises as it nears", () => {
    const today = { date: dayAfter(0), time: "18:00" };
    const morning = urgencyAt(today, new Date(2026, 9, 23, 9, 0));
    const afternoon = urgencyAt(today, new Date(2026, 9, 23, 17, 0));
    expect(morning).toBeLessThan(afternoon);
    expect(afternoon).toBe(100);
  });

  it("treats a date without a time as due at the end of the day", () => {
    // Today with no time is 12 hours away at noon.
    expect(urgencyAt({ date: dayAfter(0), time: null }, NOW)).toBe(95);
  });
});

describe("scoreTasks", () => {
  it("adds urgency and keeps every other field", () => {
    const tasks = [
      { id: "a", date: dayAfter(7), time: "12:00" },
      { id: "b", date: null, time: null },
    ];
    expect(scoreTasks(tasks, NOW)).toEqual([
      { id: "a", date: dayAfter(7), time: "12:00", urgency: 50 },
      { id: "b", date: null, time: null, urgency: 0 },
    ]);
  });
});

describe("dateForUrgency", () => {
  it("gives no date for urgency 0", () => {
    expect(dateForUrgency(0, NOW)).toBeNull();
  });

  it("inverts the formula: 50 is 7 days later, 100 is today", () => {
    expect(dateForUrgency(50, NOW)).toBe("2026-10-30");
    expect(dateForUrgency(100, NOW)).toBe("2026-10-23");
  });

  // The four live tasks (#15 plan, i48), counted from their last save.
  it.each([
    [84, "2026-10-23T05:22:08.440Z", "2026-10-24"],
    [79, "2026-10-23T05:15:48.542Z", "2026-10-25"],
    [76, "2026-10-23T05:27:40.633Z", "2026-10-25"],
    [50, "2026-10-23T05:20:13.387Z", "2026-10-30"],
  ])("urgency %d saved at %s becomes %s", (urgency, savedAt, expected) => {
    expect(dateForUrgency(urgency, new Date(savedAt))).toBe(expected);
  });
});
