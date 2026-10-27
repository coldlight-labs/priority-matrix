// Urgency from a task's date (#15, ADR 0002). Urgency is never stored: it is worked
// out from the date each time tasks are shown, so dots move right as dates near.
// Dates and times are local wall-clock values ("2026-10-24", "10:30"), read in the
// viewer's time zone (i38).

/** Urgency halves with every this many days left, so 7 days left is exactly 50 (i36). */
export const URGENCY_HALF_LIFE_DAYS = 7;
/** Urgency of an overdue task, or one due right now. */
export const URGENCY_MAX = 100;
/** Urgency of a task with no date. */
export const URGENCY_NONE = 0;

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const LOCAL_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const LOCAL_TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** The date fields urgency is worked out from. */
export interface Dated {
  readonly date: string | null;
  readonly time: string | null;
}

/** True for a real calendar date written YYYY-MM-DD, such as 2026-10-24. */
export function isLocalDate(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = LOCAL_DATE.exec(value);
  if (match === null) return false;
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  // Round-trip through Date to reject dates such as 2026-02-30.
  const date = new Date(y, m - 1, d);
  return (
    date.getFullYear() === y &&
    date.getMonth() === m - 1 &&
    date.getDate() === d
  );
}

/** True for a 24-hour time written HH:MM, such as 09:30. */
export function isLocalTime(value: unknown): value is string {
  return typeof value === "string" && LOCAL_TIME.test(value);
}

/** The local calendar date of `moment`, as YYYY-MM-DD. */
export function localDateOf(moment: Date): string {
  return [
    String(moment.getFullYear()).padStart(4, "0"),
    String(moment.getMonth() + 1).padStart(2, "0"),
    String(moment.getDate()).padStart(2, "0"),
  ].join("-");
}

/**
 * The moment a date (and optional time) falls due, in local time. A date without a
 * time counts as the end of that day, i.e. midnight at the start of the next day.
 * Expects values already checked with isLocalDate and isLocalTime.
 */
export function dueMoment(date: string, time: string | null): Date {
  const [y = 0, m = 1, d = 1] = date.split("-").map(Number);
  if (time === null) return new Date(y, m - 1, d + 1);
  const [h = 0, min = 0] = time.split(":").map(Number);
  return new Date(y, m - 1, d, h, min);
}

/**
 * Urgency 0 to 100 at `now`: 100 x 2^(-days_left / 7), rounded to a whole number.
 * Overdue gives 100 and no date gives 0. Days left count hours / 24, so a time
 * later today is less urgent in the morning than in the afternoon (i36).
 */
export function urgencyAt(task: Dated, now: Date): number {
  if (task.date === null) return URGENCY_NONE;
  const daysLeft =
    (dueMoment(task.date, task.time).getTime() - now.getTime()) / MS_PER_DAY;
  if (daysLeft <= 0) return URGENCY_MAX;
  return Math.round(URGENCY_MAX * 2 ** (-daysLeft / URGENCY_HALF_LIFE_DAYS));
}

/** Adds each task's urgency at `now`. Call once per render so every view agrees. */
export function scoreTasks<T extends Dated>(
  tasks: readonly T[],
  now: Date,
): (T & { readonly urgency: number })[] {
  return tasks.map((t) => ({ ...t, urgency: urgencyAt(t, now) }));
}

/**
 * The inverse of the formula, for upgrading tasks stored with an urgency score (i48):
 * the local date whose end (when a date without a time falls due) is nearest to the
 * moment `urgency` is reached, counting from `from`. This keeps an upgraded dot as
 * close as possible to where it was. Urgency 0 means no date.
 */
export function dateForUrgency(urgency: number, from: Date): string | null {
  if (urgency <= URGENCY_NONE) return null;
  const daysLeft =
    -URGENCY_HALF_LIFE_DAYS *
    Math.log2(Math.min(urgency, URGENCY_MAX) / URGENCY_MAX);
  // A day ends at the next midnight, so the nearest end is the date 12 hours earlier.
  const due = from.getTime() + daysLeft * MS_PER_DAY - MS_PER_DAY / 2;
  return localDateOf(new Date(due));
}
