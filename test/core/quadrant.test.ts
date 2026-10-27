import { describe, expect, it } from "vitest";
import {
  groupByQuadrant,
  QUADRANTS,
  quadrantOf,
  type Quadrant,
} from "../../src/core/quadrant";
import type { ScoredTask } from "../../src/core/task";

describe("quadrantOf", () => {
  it.each([
    [49, 49, "DROP"],
    [49, 50, "SCHEDULE"],
    [49, 51, "SCHEDULE"],
    [50, 49, "DELEGATE"],
    [50, 50, "DO"],
    [50, 51, "DO"],
    [51, 49, "DELEGATE"],
    [51, 50, "DO"],
    [51, 51, "DO"],
    [0, 0, "DROP"],
    [100, 100, "DO"],
    [100, 0, "DELEGATE"],
    [0, 100, "SCHEDULE"],
  ] as const)(
    "urgency %d, importance %d is %s",
    (urgency, importance, expected) => {
      expect(quadrantOf({ urgency, importance })).toBe(expected);
    },
  );
});

describe("groupByQuadrant", () => {
  const base: ScoredTask = {
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
  };

  it("puts every task in its quadrant, each group in priority order", () => {
    const tasks: ScoredTask[] = [
      { ...base, id: "do-low", urgency: 50, importance: 50 },
      { ...base, id: "drop", urgency: 10, importance: 10 },
      { ...base, id: "do-high", urgency: 90, importance: 90 },
      { ...base, id: "schedule", urgency: 10, importance: 90 },
      { ...base, id: "delegate", urgency: 90, importance: 10 },
    ];
    const groups = groupByQuadrant(tasks);
    const ids = (q: Quadrant) => groups[q].map((t) => t.id);
    expect(ids("DO")).toEqual(["do-high", "do-low"]);
    expect(ids("SCHEDULE")).toEqual(["schedule"]);
    expect(ids("DELEGATE")).toEqual(["delegate"]);
    expect(ids("DROP")).toEqual(["drop"]);
  });

  it("returns four empty groups for no tasks", () => {
    expect(groupByQuadrant([])).toEqual({
      DO: [],
      SCHEDULE: [],
      DELEGATE: [],
      DROP: [],
    });
  });

  it("lists the quadrants in display order", () => {
    expect(QUADRANTS).toEqual(["DO", "SCHEDULE", "DELEGATE", "DROP"]);
  });
});
