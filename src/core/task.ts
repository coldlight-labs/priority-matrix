import type { Label } from "./label";
import { fail, ok, type Result, type ValidationError } from "./result";
import {
  checkCommonFields,
  isIsoTimestamp,
  isRecord,
  LABEL_SCHEMA_VERSION,
  TASK_SCHEMA_VERSION,
  type CreateMeta,
} from "./schema";
import { dateForUrgency, isLocalDate, isLocalTime } from "./urgency";

/** Longest allowed task text, after trimming. */
export const TASK_TEXT_MAX = 500;
/** Lowest and highest allowed importance score (and urgency, which is calculated). */
export const SCORE_MIN = 0;
export const SCORE_MAX = 100;

/**
 * Open tasks appear in the matrix, quadrants, Next up and Today. Done tasks show under
 * "Show done"; ideas in the Ideas tab; dropped tasks in the Graveyard tab (#42).
 */
export type TaskStatus = "open" | "done" | "idea" | "dropped";

/** Statuses each stored schema version may hold: ideas and dropped tasks arrived in 4. */
const OLD_STATUSES: readonly unknown[] = ["open", "done"];
const STATUSES: readonly unknown[] = ["open", "done", "idea", "dropped"];

/**
 * A captured task (stored shape, schema version 4). Urgency is not stored: it is worked
 * out from `date` and `time` when shown (see urgency.ts and ScoredTask).
 */
export interface Task {
  readonly id: string;
  readonly text: string;
  readonly importance: number;
  readonly labelId: string;
  /** Local date the task is due or needs a follow-up, YYYY-MM-DD, or null for none. */
  readonly date: string | null;
  /** Optional local time on that date, HH:MM. Only set when `date` is set. */
  readonly time: string | null;
  /** True when the date is a follow-up date, not a firm deadline (i42). */
  readonly followUp: boolean;
  readonly status: TaskStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
  /**
   * Local date (YYYY-MM-DD) the task was picked for the Today list, or null. A pick
   * counts only on that date, so picks end at midnight on their own (#38, i69).
   */
  readonly today: string | null;
  readonly schemaVersion: typeof TASK_SCHEMA_VERSION;
}

/** A task with its urgency for a given moment. Quadrants, ordering and views use this. */
export type ScoredTask = Task & { readonly urgency: number };

/** Raw values from the capture and edit forms. Typed unknown because they cross a trust boundary. */
export interface TaskInput {
  readonly text: unknown;
  readonly importance: unknown;
  readonly labelId: unknown;
  /** YYYY-MM-DD; an empty string or null means no date. */
  readonly date: unknown;
  /** HH:MM; an empty string or null means no time. */
  readonly time: unknown;
  readonly followUp: unknown;
}

/** The checked, typed version of TaskInput. */
export interface ValidTaskInput {
  readonly text: string;
  readonly importance: number;
  readonly labelId: string;
  readonly date: string | null;
  readonly time: string | null;
  readonly followUp: boolean;
}

function isScore(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= SCORE_MIN &&
    value <= SCORE_MAX
  );
}

const SCORE_MESSAGE = `Must be a whole number from ${String(SCORE_MIN)} to ${String(SCORE_MAX)}.`;
const TEXT_MESSAGE = `Must be 1 to ${String(TASK_TEXT_MAX)} characters.`;
const DATE_MESSAGE = "Must be a real date.";
const TIME_MESSAGE = "Must be a time such as 09:30.";
const TIME_NEEDS_DATE = "Add a date first.";
const FOLLOW_UP_NEEDS_DATE = "Add a date first.";

/** Empty strings from form inputs mean "not set". */
function blankToNull(value: unknown): unknown {
  return value === "" ? null : value;
}

/**
 * Checks the date fields shared by input and storage: a real date or null, a time
 * only with a date, and a follow-up flag only with a date. Pushes errors to `errors`.
 */
function checkDateFields(
  date: unknown,
  time: unknown,
  followUp: unknown,
  errors: ValidationError[],
): { date: string | null; time: string | null; followUp: boolean } | null {
  const before = errors.length;
  if (date !== null && !isLocalDate(date)) {
    errors.push({ field: "date", message: DATE_MESSAGE });
  }
  if (time !== null && !isLocalTime(time)) {
    errors.push({ field: "time", message: TIME_MESSAGE });
  } else if (time !== null && date === null) {
    errors.push({ field: "time", message: TIME_NEEDS_DATE });
  }
  if (typeof followUp !== "boolean") {
    errors.push({ field: "followUp", message: "Must be true or false." });
  } else if (followUp && date === null) {
    errors.push({ field: "followUp", message: FOLLOW_UP_NEEDS_DATE });
  }
  if (errors.length > before) return null;
  // Checked above: date and time are valid strings or null, followUp is a boolean.
  return {
    date: date as string | null,
    time: time as string | null,
    followUp: followUp as boolean,
  };
}

/**
 * Checks form input: text 1 to 500 characters after trimming, importance a whole
 * number 0 to 100, an active label, and optional date fields (see checkDateFields).
 */
export function validateTaskInput(
  input: TaskInput,
  labels: readonly Label[],
): Result<ValidTaskInput> {
  const errors: ValidationError[] = [];
  const text = typeof input.text === "string" ? input.text.trim() : "";
  if (text.length === 0 || text.length > TASK_TEXT_MAX) {
    errors.push({ field: "text", message: TEXT_MESSAGE });
  }
  if (!isScore(input.importance)) {
    errors.push({ field: "importance", message: SCORE_MESSAGE });
  }
  const label = labels.find((l) => l.id === input.labelId);
  if (label === undefined || label.archived) {
    errors.push({ field: "labelId", message: "Must be an active label." });
  }
  const dates = checkDateFields(
    blankToNull(input.date),
    blankToNull(input.time),
    input.followUp,
    errors,
  );
  if (
    errors.length > 0 ||
    label === undefined ||
    dates === null ||
    !isScore(input.importance)
  ) {
    return fail(errors);
  }
  return ok({
    text,
    importance: input.importance,
    labelId: label.id,
    ...dates,
  });
}

/** Creates an open task, or an idea (#42), after checking the form input. */
export function createTask(
  input: TaskInput,
  labels: readonly Label[],
  meta: CreateMeta,
  status: "open" | "idea" = "open",
): Result<Task> {
  const checked = validateTaskInput(input, labels);
  if (!checked.ok) return checked;
  const now = meta.now.toISOString();
  return ok({
    id: meta.id,
    ...checked.value,
    status,
    createdAt: now,
    updatedAt: now,
    today: null,
    schemaVersion: TASK_SCHEMA_VERSION,
  });
}

/**
 * Edits a task's text, importance, label and date fields with the same checks as
 * capture. A task may keep its current label even if that label was archived since;
 * a different label must be active. Returns the task unchanged when nothing changed
 * (idempotent).
 */
export function editTask(
  task: Task,
  input: TaskInput,
  labels: readonly Label[],
  now: Date,
): Result<Task> {
  const keepingLabel = input.labelId === task.labelId;
  // Treat the task's own label as pickable, so editing the text never forces a relabel.
  const pickable: readonly Label[] = keepingLabel
    ? [
        ...labels.filter((l) => l.id !== task.labelId),
        {
          id: task.labelId,
          name: "",
          archived: false,
          color: "",
          createdAt: task.createdAt,
          updatedAt: task.updatedAt,
          schemaVersion: LABEL_SCHEMA_VERSION,
        },
      ]
    : labels;
  const checked = validateTaskInput(input, pickable);
  if (!checked.ok) return checked;
  const v = checked.value;
  if (
    v.text === task.text &&
    v.importance === task.importance &&
    v.labelId === task.labelId &&
    v.date === task.date &&
    v.time === task.time &&
    v.followUp === task.followUp
  ) {
    return ok(task);
  }
  return ok(storedFields({ ...task, ...v, updatedAt: now.toISOString() }));
}

/**
 * Copies only the stored fields of a task. Views hold ScoredTasks, so edits made from
 * them must not carry the calculated urgency into storage. Used by every core change.
 */
export function storedFields(task: Task): Task {
  return {
    id: task.id,
    text: task.text,
    importance: task.importance,
    labelId: task.labelId,
    date: task.date,
    time: task.time,
    followUp: task.followUp,
    status: task.status,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    today: task.today,
    schemaVersion: TASK_SCHEMA_VERSION,
  };
}

/**
 * True when `stored` (the task as storage holds it now) was saved after `loaded` (the
 * copy this page has), so saving `loaded` would undo a change made elsewhere (#20).
 * A task missing from storage has not changed: saving it puts it back.
 */
export function changedSince(loaded: Task, stored: Task | undefined): boolean {
  return stored !== undefined && stored.updatedAt !== loaded.updatedAt;
}

/**
 * Moves a task to `status`: done, open again (reopen, revive, or an idea made a task),
 * an idea or dropped. Leaving the board as an idea or dropped also clears the pick for
 * today (i74). Setting the status it already has returns it unchanged (idempotent).
 */
export function setTaskStatus(task: Task, status: TaskStatus, now: Date): Task {
  if (task.status === status) return task;
  const offBoard = status === "idea" || status === "dropped";
  return storedFields({
    ...task,
    status,
    today: offBoard ? null : task.today,
    updatedAt: now.toISOString(),
  });
}

/**
 * Checks a document loaded from storage and returns it in the current shape. Never
 * throws; invalid documents return errors. The label is not required to exist,
 * because archiving a label keeps its tasks.
 *
 * Version 1 documents (stored urgency score) are upgraded on read (Q28: a): the date
 * is the inverse of the urgency formula counted from the task's last save, so every
 * load gives the same date. Versions 1 and 2 have no pick for today (#38); versions 1
 * to 3 hold only open and done tasks (#42). The task is
 * stored as the current version the next time it is saved.
 */
export function parseStoredTask(doc: unknown): Result<Task> {
  if (!isRecord(doc)) {
    return fail([{ field: "document", message: "Must be an object." }]);
  }
  const errors = checkCommonFields(doc, [1, 2, 3, TASK_SCHEMA_VERSION]);
  const text = doc.text;
  if (
    typeof text !== "string" ||
    text.trim() !== text ||
    text.length === 0 ||
    text.length > TASK_TEXT_MAX
  ) {
    errors.push({ field: "text", message: TEXT_MESSAGE });
  }
  if (!isScore(doc.importance)) {
    errors.push({ field: "importance", message: SCORE_MESSAGE });
  }
  if (typeof doc.labelId !== "string" || doc.labelId === "") {
    errors.push({ field: "labelId", message: "Must be a non-empty string." });
  }
  const statuses =
    doc.schemaVersion === TASK_SCHEMA_VERSION ? STATUSES : OLD_STATUSES;
  if (!statuses.includes(doc.status)) {
    errors.push({
      field: "status",
      message: `Must be one of: ${statuses.join(", ")}.`,
    });
  }
  let dates: {
    date: string | null;
    time: string | null;
    followUp: boolean;
  } | null = null;
  if (doc.schemaVersion === 1) {
    if (!isScore(doc.urgency)) {
      errors.push({ field: "urgency", message: SCORE_MESSAGE });
    } else if (isIsoTimestamp(doc.updatedAt)) {
      const date = dateForUrgency(doc.urgency, new Date(doc.updatedAt));
      dates = { date, time: null, followUp: false };
    }
  } else {
    dates = checkDateFields(doc.date, doc.time, doc.followUp, errors);
  }
  const today =
    doc.schemaVersion === 3 || doc.schemaVersion === TASK_SCHEMA_VERSION
      ? doc.today
      : null;
  if (today !== null && !isLocalDate(today)) {
    errors.push({ field: "today", message: DATE_MESSAGE });
  }
  if (errors.length > 0 || dates === null) return fail(errors);
  // Every field was checked above. Built field by field so no other stored field
  // (such as a version 1 urgency) is carried into the app.
  return ok({
    id: doc.id as string,
    text: text as string,
    importance: doc.importance as number,
    labelId: doc.labelId as string,
    ...dates,
    status: doc.status as TaskStatus,
    createdAt: doc.createdAt as string,
    updatedAt: doc.updatedAt as string,
    today: today as string | null,
    schemaVersion: TASK_SCHEMA_VERSION,
  });
}
