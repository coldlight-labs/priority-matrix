import { describe, expect, it } from "vitest";
import { nextUp } from "../../src/core/next-up";
import type { ScoredTask } from "../../src/core/task";

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

describe("nextUp", () => {
  it("returns undefined when there are no tasks", () => {
    expect(nextUp<ScoredTask>([])).toBeUndefined();
  });

  it("returns undefined when the DO quadrant is empty", () => {
    const tasks = [
      task({ id: "schedule", urgency: 10, importance: 99 }),
      task({ id: "delegate", urgency: 99, importance: 10 }),
      task({ id: "drop", urgency: 49, importance: 49 }),
    ];
    expect(nextUp(tasks)).toBeUndefined();
  });

  it("ignores done tasks", () => {
    expect(
      nextUp([task({ status: "done", urgency: 100, importance: 100 })]),
    ).toBeUndefined();
  });

  it("picks the highest urgency + importance", () => {
    const tasks = [
      task({ id: "a", urgency: 60, importance: 60 }),
      task({ id: "b", urgency: 90, importance: 80 }),
      task({ id: "c", urgency: 50, importance: 50 }),
    ];
    expect(nextUp(tasks)?.id).toBe("b");
  });

  it("beats a higher-scoring task outside DO with any DO task", () => {
    const tasks = [
      task({ id: "schedule", urgency: 49, importance: 100 }),
      task({ id: "do", urgency: 50, importance: 50 }),
    ];
    expect(nextUp(tasks)?.id).toBe("do");
  });

  it("breaks a sum tie with higher importance", () => {
    const tasks = [
      task({ id: "urgent", urgency: 90, importance: 60 }),
      task({ id: "important", urgency: 60, importance: 90 }),
    ];
    expect(nextUp(tasks)?.id).toBe("important");
  });

  it("breaks a full score tie with the older task", () => {
    const tasks = [
      task({ id: "a", createdAt: "2026-10-23T10:00:00.000Z" }),
      task({ id: "b", createdAt: "2026-10-22T10:00:00.000Z" }),
    ];
    expect(nextUp(tasks)?.id).toBe("b");
  });

  it("breaks a tie on everything else with the lower id", () => {
    expect(nextUp([task({ id: "b" }), task({ id: "a" })])?.id).toBe("a");
  });

  it("does not reorder the input list", () => {
    const tasks = [task({ id: "b" }), task({ id: "a" })];
    nextUp(tasks);
    expect(tasks.map((t) => t.id)).toEqual(["b", "a"]);
  });
});
