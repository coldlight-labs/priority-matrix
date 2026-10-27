import { compareTasks } from "./order";
import { quadrantOf } from "./quadrant";
import type { ScoredTask } from "./task";

/**
 * Returns the task to work on now: the best open task in the DO quadrant,
 * or undefined when the DO quadrant has no open tasks.
 */
export function nextUp<T extends ScoredTask>(
  tasks: readonly T[],
): T | undefined {
  const candidates = tasks.filter(
    (t) => t.status === "open" && quadrantOf(t) === "DO",
  );
  return candidates.sort(compareTasks)[0];
}
