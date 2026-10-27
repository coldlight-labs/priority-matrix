import { describe, expect, it } from "vitest";
import { dueText, timeLeftText } from "../../src/core/due-text";
import { QUADRANT_NAMES } from "../../src/core/quadrant";

// Tests run in Australia/Sydney (vite.config.ts). Noon on Friday 23 October 2026.
const NOW = new Date(2026, 9, 23, 12, 0);

const dated = (
  date: string | null,
  time: string | null = null,
  followUp = false,
) => ({
  date,
  time,
  followUp,
});

describe("dueText", () => {
  it.each([
    [dated("2026-10-24", "10:30"), "Due Sat 24 Oct 10:30"],
    [dated("2026-10-26", null, true), "Follow up Mon 26 Oct"],
    [dated("2027-01-05"), "Due Tue 5 Jan 2027"],
    [dated(null), "No date"],
  ])("%j reads %j", (task, expected) => {
    expect(dueText(task, NOW)).toBe(expected);
  });
});

describe("timeLeftText", () => {
  it.each([
    [dated("2026-10-23", "18:00"), "today"],
    [dated("2026-10-23"), "today"],
    [dated("2026-10-23", "09:00"), "overdue"],
    [dated("2026-10-24", "08:00"), "tomorrow"],
    [dated("2026-10-26"), "in 3 days"],
    [dated("2026-10-22"), "1 day overdue"],
    [dated("2026-10-21"), "2 days overdue"],
    [dated("2027-01-01"), "in 70 days"],
    [dated(null), "No date"],
  ])("%j is %j", (task, expected) => {
    expect(timeLeftText(task, NOW)).toBe(expected);
  });

  it("counts calendar days across a daylight-saving change", () => {
    // Sydney clocks go back on Sunday 5 April 2026.
    const before = new Date(2026, 3, 4, 12, 0);
    expect(timeLeftText(dated("2026-04-06"), before)).toBe("in 2 days");
  });
});

describe("QUADRANT_NAMES", () => {
  it("names the quadrants without telling you what to do (Q33: a)", () => {
    expect(Object.values(QUADRANT_NAMES).map((q) => q.name)).toEqual([
      "Do now",
      "Make time",
      "Fit in",
      "Someday",
    ]);
  });
});
