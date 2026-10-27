// Words for a task's date, shared by the list rows and the matrix caption (#22, i56):
// "Due Sat 24 Oct 10:30", "Follow up Mon 26 Oct", and time left such as "tomorrow".
// Dates are local wall-clock values (ADR 0002).

import type { Task } from "./task";
import { dueMoment } from "./urgency";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const DAY_FORMAT = new Intl.DateTimeFormat("en-AU", {
  weekday: "short",
  day: "numeric",
  month: "short",
});
const DAY_FORMAT_WITH_YEAR = new Intl.DateTimeFormat("en-AU", {
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
});

type DateFields = Pick<Task, "date" | "time" | "followUp">;

/** Splits YYYY-MM-DD into numbers. Expects a value already checked with isLocalDate. */
function parts(date: string): [number, number, number] {
  const [y = 0, m = 1, d = 1] = date.split("-").map(Number);
  return [y, m, d];
}

/**
 * The date line: "Due Fri 24 Oct 10:30", "Follow up Fri 24 Oct", or "No date".
 * The year shows only when it is not the year of `now`.
 */
export function dueText(task: DateFields, now: Date): string {
  if (task.date === null) return "No date";
  const [y, m, d] = parts(task.date);
  const day = new Date(y, m - 1, d);
  const format =
    day.getFullYear() === now.getFullYear() ? DAY_FORMAT : DAY_FORMAT_WITH_YEAR;
  const words = format.format(day).replace(/,/g, "");
  const time = task.time === null ? "" : ` ${task.time}`;
  return `${task.followUp ? "Follow up" : "Due"} ${words}${time}`;
}

/**
 * Time left in calendar days: "today", "tomorrow", "in 3 days", "2 days overdue",
 * "1 day overdue", or "overdue" for a time earlier today. "No date" without a date.
 */
export function timeLeftText(task: DateFields, now: Date): string {
  if (task.date === null) return "No date";
  const [y, m, d] = parts(task.date);
  // Count whole calendar days in UTC so daylight-saving changes cannot shift the count.
  const days = Math.round(
    (Date.UTC(y, m - 1, d) -
      Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())) /
      MS_PER_DAY,
  );
  if (days < 0) {
    const n = -days;
    return `${String(n)} ${n === 1 ? "day" : "days"} overdue`;
  }
  if (days === 0) {
    return dueMoment(task.date, task.time) <= now ? "overdue" : "today";
  }
  if (days === 1) return "tomorrow";
  return `in ${String(days)} days`;
}
