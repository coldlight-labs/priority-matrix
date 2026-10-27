import { describe, expect, it } from "vitest";
import type { Label } from "../../src/core/label";
import {
  createTask,
  parseStoredTask,
  setTaskStatus,
  editTask,
  changedSince,
  TASK_TEXT_MAX,
  validateTaskInput,
  type Task,
  type TaskInput,
} from "../../src/core/task";

const NOW = new Date("2026-10-23T09:00:00.000Z");

const ACTIVE: Label = {
  id: "l1",
  name: "Jobs",
  archived: false,
  color: "teal",
  createdAt: NOW.toISOString(),
  updatedAt: NOW.toISOString(),
  schemaVersion: 2,
};
const ARCHIVED: Label = { ...ACTIVE, id: "l2", name: "Old", archived: true };
const LABELS = [ACTIVE, ARCHIVED];

function input(overrides: Partial<TaskInput> = {}): TaskInput {
  return {
    text: "Send invoice",
    importance: 60,
    labelId: "l1",
    date: "2026-10-30",
    time: "",
    followUp: false,
    ...overrides,
  };
}

function storedTask(overrides: Record<string, unknown> = {}): unknown {
  return {
    id: "t1",
    text: "Send invoice",
    importance: 60,
    labelId: "l1",
    date: "2026-10-30",
    time: null,
    followUp: false,
    status: "open",
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
    today: null,
    schemaVersion: 4,
    ...overrides,
  };
}

function errorFields(result: {
  ok: boolean;
  errors?: readonly { field: string }[];
}): string[] {
  return result.ok ? [] : (result.errors ?? []).map((e) => e.field).sort();
}

describe("validateTaskInput: text", () => {
  it("trims the text", () => {
    const result = validateTaskInput(
      input({ text: "  Send invoice  " }),
      LABELS,
    );
    expect(result.ok && result.value.text).toBe("Send invoice");
  });

  it("accepts exactly 500 characters", () => {
    expect(
      validateTaskInput(input({ text: "x".repeat(TASK_TEXT_MAX) }), LABELS).ok,
    ).toBe(true);
  });

  it.each([
    ["empty", ""],
    ["spaces only", "   "],
    ["501 characters", "x".repeat(TASK_TEXT_MAX + 1)],
    ["not text", 42],
  ])("rejects %s", (_name, text) => {
    expect(errorFields(validateTaskInput(input({ text }), LABELS))).toEqual([
      "text",
    ]);
  });
});

describe("validateTaskInput: importance", () => {
  it.each([0, 49, 50, 51, 100])("accepts %d", (score) => {
    expect(validateTaskInput(input({ importance: score }), LABELS).ok).toBe(
      true,
    );
  });

  it.each([-1, 101, 50.5, Number.NaN, Number.POSITIVE_INFINITY, "50", null])(
    "rejects %j",
    (score) => {
      expect(
        errorFields(validateTaskInput(input({ importance: score }), LABELS)),
      ).toEqual(["importance"]);
    },
  );
});

describe("validateTaskInput: date, time and follow-up", () => {
  it("accepts a date with a time and a follow-up flag", () => {
    const result = validateTaskInput(
      input({ time: "10:30", followUp: true }),
      LABELS,
    );
    expect(result.ok && result.value).toMatchObject({
      date: "2026-10-30",
      time: "10:30",
      followUp: true,
    });
  });

  it("treats empty strings as not set", () => {
    const result = validateTaskInput(input({ date: "", time: "" }), LABELS);
    expect(result.ok && [result.value.date, result.value.time]).toEqual([
      null,
      null,
    ]);
  });

  it("accepts a date in the past (overdue)", () => {
    expect(validateTaskInput(input({ date: "2020-01-01" }), LABELS).ok).toBe(
      true,
    );
  });

  it.each(["2026-02-30", "30/10/2026", 42, undefined])(
    "rejects the date %j",
    (date) => {
      expect(errorFields(validateTaskInput(input({ date }), LABELS))).toEqual([
        "date",
      ]);
    },
  );

  it.each(["24:00", "9:30", 930])("rejects the time %j", (time) => {
    expect(errorFields(validateTaskInput(input({ time }), LABELS))).toEqual([
      "time",
    ]);
  });

  it("refuses a time or a follow-up without a date", () => {
    expect(
      errorFields(
        validateTaskInput(
          input({ date: "", time: "10:30", followUp: true }),
          LABELS,
        ),
      ),
    ).toEqual(["followUp", "time"]);
  });

  it("rejects a follow-up flag that is not true or false", () => {
    expect(
      errorFields(validateTaskInput(input({ followUp: "yes" }), LABELS)),
    ).toEqual(["followUp"]);
  });
});

describe("validateTaskInput: label", () => {
  it.each([
    ["unknown", "nope"],
    ["archived", "l2"],
    ["missing", undefined],
  ])("rejects an %s label", (_name, labelId) => {
    expect(errorFields(validateTaskInput(input({ labelId }), LABELS))).toEqual([
      "labelId",
    ]);
  });
});

describe("validateTaskInput: several problems", () => {
  it("reports every bad field at once", () => {
    const result = validateTaskInput(
      {
        text: "",
        importance: -1,
        labelId: "l2",
        date: "soon",
        time: "",
        followUp: false,
      },
      LABELS,
    );
    expect(errorFields(result)).toEqual([
      "date",
      "importance",
      "labelId",
      "text",
    ]);
  });
});

describe("createTask", () => {
  it("creates an open task with the given id and time", () => {
    expect(createTask(input(), LABELS, { id: "t1", now: NOW })).toEqual({
      ok: true,
      value: storedTask() as Task,
    });
  });

  it("creates an idea when asked (#42)", () => {
    const result = createTask(input(), LABELS, { id: "t1", now: NOW }, "idea");
    expect(result.ok && result.value.status).toBe("idea");
  });

  it("returns errors for invalid input", () => {
    expect(
      createTask(input({ importance: 101 }), LABELS, { id: "t1", now: NOW }).ok,
    ).toBe(false);
  });
});

describe("parseStoredTask", () => {
  it("accepts a valid stored task, including a done one", () => {
    expect(parseStoredTask(storedTask()).ok).toBe(true);
    expect(parseStoredTask(storedTask({ status: "done" })).ok).toBe(true);
  });

  it("accepts a task whose label no longer exists", () => {
    expect(parseStoredTask(storedTask({ labelId: "deleted-label" })).ok).toBe(
      true,
    );
  });

  it.each([null, "task", [], 42])("rejects a non-object: %j", (doc) => {
    expect(parseStoredTask(doc).ok).toBe(false);
  });

  it("rejects an unknown schema version", () => {
    expect(
      errorFields(parseStoredTask(storedTask({ schemaVersion: 5 }))),
    ).toEqual(["schemaVersion"]);
  });

  it("drops fields that are not part of the task", () => {
    const result = parseStoredTask(storedTask({ urgency: 70, extra: "x" }));
    expect(result.ok && Object.keys(result.value)).not.toContain("urgency");
    expect(result.ok && Object.keys(result.value)).not.toContain("extra");
  });

  it("accepts a day picked for today, and rejects a bad one (#38)", () => {
    const picked = parseStoredTask(storedTask({ today: "2026-10-25" }));
    expect(picked.ok && picked.value.today).toBe("2026-10-25");
    expect(
      errorFields(parseStoredTask(storedTask({ today: "today" }))),
    ).toEqual(["today"]);
    expect(
      errorFields(parseStoredTask(storedTask({ today: undefined }))),
    ).toEqual(["today"]);
  });

  it("accepts ideas and dropped tasks from version 4 only (#42)", () => {
    for (const status of ["idea", "dropped"]) {
      expect(parseStoredTask(storedTask({ status })).ok).toBe(true);
      expect(
        errorFields(parseStoredTask(storedTask({ status, schemaVersion: 3 }))),
      ).toEqual(["status"]);
    }
  });

  it("upgrades a version 3 task unchanged (#42)", () => {
    expect(
      parseStoredTask(storedTask({ today: "2026-10-25", schemaVersion: 3 })),
    ).toEqual({ ok: true, value: storedTask({ today: "2026-10-25" }) as Task });
  });

  it("upgrades a version 2 task with no pick for today (#38)", () => {
    expect(
      parseStoredTask(storedTask({ today: undefined, schemaVersion: 2 })),
    ).toEqual({ ok: true, value: storedTask() as Task });
  });

  it("rejects bad date fields", () => {
    expect(
      errorFields(
        parseStoredTask(
          storedTask({ date: null, time: "25:00", followUp: true }),
        ),
      ),
    ).toEqual(["followUp", "time"]);
    expect(errorFields(parseStoredTask(storedTask({ date: "" })))).toEqual([
      "date",
    ]);
  });
});

describe("parseStoredTask: version 1 upgrade (Q28: a)", () => {
  const v1 = (overrides: Record<string, unknown> = {}) =>
    storedTask({
      date: undefined,
      time: undefined,
      followUp: undefined,
      urgency: 50,
      schemaVersion: 1,
      ...overrides,
    });

  it("turns the urgency into a date counted from the last save", () => {
    // NOW is 20:00 in Sydney; urgency 50 is 7 days later, nearest day end 30 October.
    expect(parseStoredTask(v1())).toEqual({
      ok: true,
      value: {
        ...(storedTask() as Task),
        date: "2026-10-30",
        time: null,
        followUp: false,
      },
    });
  });

  it("gives urgency 0 no date", () => {
    const result = parseStoredTask(v1({ urgency: 0 }));
    expect(result.ok && result.value.date).toBeNull();
  });

  it("gives the same date on every load", () => {
    expect(parseStoredTask(v1())).toEqual(parseStoredTask(v1()));
  });

  it("rejects a version 1 task with a bad urgency", () => {
    expect(errorFields(parseStoredTask(v1({ urgency: 500 })))).toEqual([
      "urgency",
    ]);
  });

  it("reports every bad field without throwing", () => {
    const result = parseStoredTask({
      id: 1,
      text: " padded ",
      importance: "high",
      labelId: "",
      status: "archived",
      date: "tomorrow",
      time: 9,
      followUp: "no",
    });
    expect(errorFields(result)).toEqual([
      "createdAt",
      "date",
      "followUp",
      "id",
      "importance",
      "labelId",
      "schemaVersion",
      "status",
      "text",
      "time",
      "updatedAt",
    ]);
  });
});

describe("setTaskStatus", () => {
  const LATER = new Date("2026-10-23T10:00:00.000Z");

  it("marks a task done and updates updatedAt", () => {
    const task = storedTask() as Task;
    expect(setTaskStatus(task, "done", LATER)).toEqual({
      ...task,
      status: "done",
      updatedAt: LATER.toISOString(),
    });
  });

  it("drops a task and clears its pick for today (#42, i74)", () => {
    const task = storedTask({ today: "2026-10-23" }) as Task;
    expect(setTaskStatus(task, "dropped", LATER)).toMatchObject({
      status: "dropped",
      today: null,
      updatedAt: LATER.toISOString(),
    });
  });

  it("turns an idea into an open task, and revives a dropped one (#42)", () => {
    const idea = storedTask({ status: "idea" }) as Task;
    expect(setTaskStatus(idea, "open", LATER).status).toBe("open");
    const dropped = storedTask({ status: "dropped" }) as Task;
    expect(setTaskStatus(dropped, "open", LATER).status).toBe("open");
  });

  it("reopens a done task", () => {
    const task = storedTask({ status: "done" }) as Task;
    expect(setTaskStatus(task, "open", LATER).status).toBe("open");
  });

  it("is idempotent", () => {
    const task = storedTask() as Task;
    expect(setTaskStatus(task, "open", LATER)).toBe(task);
  });
});

describe("editTask", () => {
  const LATER = new Date("2026-10-23T10:00:00.000Z");
  const base = () => storedTask() as Task;
  const edit = (
    overrides: Partial<TaskInput>,
    labels = LABELS,
    task = base(),
  ) =>
    editTask(
      task,
      {
        text: task.text,
        importance: task.importance,
        labelId: task.labelId,
        date: task.date ?? "",
        time: task.time ?? "",
        followUp: task.followUp,
        ...overrides,
      },
      labels,
      LATER,
    );

  it("keeps the task's pick for today, and so does a status change (#38)", () => {
    const picked = storedTask({ today: "2026-10-23" }) as Task;
    const result = edit({ text: "Renamed" }, LABELS, picked);
    expect(result.ok && result.value.today).toBe("2026-10-23");
    expect(setTaskStatus(picked, "done", LATER).today).toBe("2026-10-23");
  });

  it("changes text, importance, label and dates and updates updatedAt", () => {
    const other: Label = { ...ACTIVE, id: "l3", name: "Admin" };
    const result = edit(
      {
        text: "  Send revised invoice ",
        importance: 90,
        labelId: "l3",
        date: "2026-11-02",
        time: "09:00",
        followUp: true,
      },
      [...LABELS, other],
    );
    expect(result).toEqual({
      ok: true,
      value: {
        ...base(),
        text: "Send revised invoice",
        importance: 90,
        labelId: "l3",
        date: "2026-11-02",
        time: "09:00",
        followUp: true,
        updatedAt: LATER.toISOString(),
      },
    });
  });

  it("clears the date", () => {
    const result = edit({ date: "", time: "" });
    expect(result.ok && result.value.date).toBeNull();
  });

  it("keeps createdAt, status and id", () => {
    const result = edit(
      { text: "New text" },
      LABELS,
      storedTask({ status: "done" }) as Task,
    );
    expect(
      result.ok && [
        result.value.id,
        result.value.status,
        result.value.createdAt,
      ],
    ).toEqual(["t1", "done", NOW.toISOString()]);
  });

  it("refuses moving to an archived or unknown label", () => {
    expect(errorFields(edit({ labelId: "l2" }))).toEqual(["labelId"]);
    expect(errorFields(edit({ labelId: "nope" }))).toEqual(["labelId"]);
  });

  it("lets a task keep a label that was archived since", () => {
    const onArchived = storedTask({ labelId: "l2" }) as Task;
    const result = edit({ text: "Still here" }, LABELS, onArchived);
    expect(result.ok && result.value.labelId).toBe("l2");
  });

  it("applies the capture checks", () => {
    expect(errorFields(edit({ text: " ", importance: 101 }))).toEqual([
      "importance",
      "text",
    ]);
  });

  it("is idempotent when nothing changed", () => {
    const task = base();
    const result = edit({}, LABELS, task);
    expect(result.ok && result.value).toBe(task);
  });

  it("never stores the calculated urgency of a scored task", () => {
    const scored = { ...base(), urgency: 50 };
    const edited = edit({ text: "Changed" }, LABELS, scored);
    expect(edited.ok && Object.keys(edited.value)).not.toContain("urgency");
    expect(Object.keys(setTaskStatus(scored, "done", LATER))).not.toContain(
      "urgency",
    );
  });
});

describe("changedSince", () => {
  const loaded = storedTask() as Task;

  it("is false when storage holds the same version", () => {
    expect(changedSince(loaded, { ...loaded })).toBe(false);
  });

  it("is true when storage holds a later save", () => {
    const later = {
      ...loaded,
      status: "done" as const,
      updatedAt: "2026-10-23T11:00:00.000Z",
    };
    expect(changedSince(loaded, later)).toBe(true);
  });

  it("is false when the task is missing from storage", () => {
    expect(changedSince(loaded, undefined)).toBe(false);
  });
});
