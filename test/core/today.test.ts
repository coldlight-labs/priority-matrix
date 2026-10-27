import { describe, expect, it } from "vitest";
import type { ScoredTask } from "../../src/core/task";
import {
  isPickedToday,
  pickForToday,
  TODAY_LIMIT,
  todayList,
  unpickForToday,
} from "../../src/core/today";

/** Noon on Sunday 25 October 2026 in Sydney, the test time zone. */
const NOW = new Date(2026, 9, 25, 12, 0);
const TODAY = "2026-10-25";
const LATER = new Date(2026, 9, 25, 13, 0);

function task(overrides: Partial<ScoredTask>): ScoredTask {
  return {
    id: "t",
    text: "A task",
    urgency: 60,
    importance: 60,
    labelId: "l1",
    status: "open",
    createdAt: "2026-10-23T09:00:00.000Z",
    updatedAt: "2026-10-23T09:00:00.000Z",
    date: null,
    time: null,
    followUp: false,
    today: null,
    schemaVersion: 4,
    ...overrides,
  };
}

describe("pickForToday (i68)", () => {
  it("picks an open task for today's local date and updates updatedAt", () => {
    const result = pickForToday(task({ id: "a" }), [], NOW);
    expect(result.ok && result.value).toMatchObject({
      today: TODAY,
      updatedAt: NOW.toISOString(),
    });
    expect(result.ok && "urgency" in result.value).toBe(false);
  });

  it("returns the task unchanged when it is already picked", () => {
    const picked = task({ id: "a", today: TODAY });
    const result = pickForToday(picked, [picked], NOW);
    expect(result.ok && result.value).toBe(picked);
  });

  it(`refuses a pick past ${String(TODAY_LIMIT)} open picks`, () => {
    const others = Array.from({ length: TODAY_LIMIT }, (_, i) =>
      task({ id: `p${String(i)}`, today: TODAY }),
    );
    const result = pickForToday(task({ id: "a" }), others, NOW);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.errors).toEqual([
      {
        field: "today",
        message: `Today is full (${String(TODAY_LIMIT)}). Finish or unpick one first.`,
      },
    ]);
  });

  it("counts only today's open picks toward the limit", () => {
    const others = [
      ...Array.from({ length: TODAY_LIMIT - 1 }, (_, i) =>
        task({ id: `p${String(i)}`, today: TODAY }),
      ),
      task({ id: "done", today: TODAY, status: "done" }),
      task({ id: "yesterday", today: "2026-10-24" }),
    ];
    expect(pickForToday(task({ id: "a" }), others, NOW).ok).toBe(true);
  });

  it("refuses a done task", () => {
    expect(pickForToday(task({ status: "done" }), [], NOW).ok).toBe(false);
  });
});

describe("unpickForToday", () => {
  it("clears the pick and updates updatedAt", () => {
    expect(unpickForToday(task({ today: TODAY }), LATER)).toMatchObject({
      today: null,
      updatedAt: LATER.toISOString(),
    });
  });

  it("returns the task unchanged when it is not picked", () => {
    const t = task({});
    expect(unpickForToday(t, LATER)).toBe(t);
  });
});

describe("isPickedToday (i69)", () => {
  it("is true only for today's local date", () => {
    expect(isPickedToday(task({ today: TODAY }), NOW)).toBe(true);
    expect(isPickedToday(task({ today: "2026-10-24" }), NOW)).toBe(false);
    expect(isPickedToday(task({}), NOW)).toBe(false);
  });

  it("ends at local midnight", () => {
    const picked = task({ today: TODAY });
    expect(isPickedToday(picked, new Date(2026, 9, 25, 23, 59))).toBe(true);
    expect(isPickedToday(picked, new Date(2026, 9, 26, 0, 0))).toBe(false);
  });
});

describe("todayList (i70)", () => {
  it("splits today's picks into open (priority order) and done", () => {
    const list = todayList(
      [
        task({ id: "low", today: TODAY, urgency: 10, importance: 10 }),
        task({ id: "high", today: TODAY, urgency: 90, importance: 90 }),
        task({ id: "finished", today: TODAY, status: "done" }),
        task({ id: "old", today: "2026-10-24" }),
        task({ id: "unpicked" }),
      ],
      NOW,
    );
    expect(list.open.map((t) => t.id)).toEqual(["high", "low"]);
    expect(list.done.map((t) => t.id)).toEqual(["finished"]);
  });
});
