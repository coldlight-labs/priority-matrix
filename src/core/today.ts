import { compareTasks } from "./order";
import { fail, ok, type Result } from "./result";
import { storedFields, type ScoredTask, type Task } from "./task";
import { localDateOf } from "./urgency";

/** Most open tasks that can be picked for one day (#38, i68). */
export const TODAY_LIMIT = 5;

/** True when the task was picked for the local date of `now`. Picks end at midnight (i69). */
export function isPickedToday(task: Task, now: Date): boolean {
  return task.today === localDateOf(now);
}

/**
 * Picks an open task for today. Refused when `tasks` already hold TODAY_LIMIT open picks
 * for today; done picks do not count, so finishing one frees a place. Returns the task
 * unchanged when it is already picked (idempotent).
 */
export function pickForToday(
  task: Task,
  tasks: readonly Task[],
  now: Date,
): Result<Task> {
  if (isPickedToday(task, now)) return ok(task);
  if (task.status !== "open") {
    return fail([
      { field: "today", message: "Only open tasks can be picked." },
    ]);
  }
  const openPicks = tasks.filter(
    (t) => t.id !== task.id && t.status === "open" && isPickedToday(t, now),
  ).length;
  if (openPicks >= TODAY_LIMIT) {
    return fail([
      {
        field: "today",
        message: `Today is full (${String(TODAY_LIMIT)}). Finish or unpick one first.`,
      },
    ]);
  }
  return ok(
    storedFields({
      ...task,
      today: localDateOf(now),
      updatedAt: now.toISOString(),
    }),
  );
}

/** Removes a task's pick. Returns the task unchanged when it has none (idempotent). */
export function unpickForToday(task: Task, now: Date): Task {
  if (task.today === null) return task;
  return storedFields({ ...task, today: null, updatedAt: now.toISOString() });
}

/**
 * Today's picks: open ones in priority order, and done ones, which stay on the list for
 * the rest of the day (i70).
 */
export function todayList<T extends ScoredTask>(
  tasks: readonly T[],
  now: Date,
): { open: T[]; done: T[] } {
  const picked = tasks.filter((t) => isPickedToday(t, now));
  return {
    open: picked.filter((t) => t.status === "open").sort(compareTasks),
    done: picked.filter((t) => t.status === "done"),
  };
}
