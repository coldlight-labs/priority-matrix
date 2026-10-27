import { compareTasks } from "./order";
import type { ScoredTask } from "./task";

/** Scores at or above this line count as high (plan i1: 50 counts as urgent / important). */
export const QUADRANT_LINE = 50;

/**
 * The four quadrants (plan i13):
 * DO = urgent and important, SCHEDULE = important only,
 * DELEGATE = urgent only, DROP = neither.
 */
export type Quadrant = "DO" | "SCHEDULE" | "DELEGATE" | "DROP";

/**
 * What each quadrant is called on screen and in exports, with its rule (Q33: a).
 * The names suggest, never decide, what to do with a task.
 */
export const QUADRANT_NAMES: Readonly<
  Record<Quadrant, { readonly name: string; readonly rule: string }>
> = {
  DO: { name: "Do now", rule: "Urgent · Important" },
  SCHEDULE: { name: "Make time", rule: "Important · Not urgent" },
  DELEGATE: { name: "Fit in", rule: "Urgent · Less important" },
  DROP: { name: "Someday", rule: "Not urgent · Less important" },
};

/** Display order of the quadrants. */
export const QUADRANTS: readonly Quadrant[] = [
  "DO",
  "SCHEDULE",
  "DELEGATE",
  "DROP",
];

/** Groups tasks by quadrant, each group in priority order (plan i29). Does not filter by status. */
export function groupByQuadrant<T extends ScoredTask>(
  tasks: readonly T[],
): Record<Quadrant, T[]> {
  const groups: Record<Quadrant, T[]> = {
    DO: [],
    SCHEDULE: [],
    DELEGATE: [],
    DROP: [],
  };
  for (const task of tasks) groups[quadrantOf(task)].push(task);
  for (const quadrant of QUADRANTS) groups[quadrant].sort(compareTasks);
  return groups;
}

/** Returns the quadrant for a pair of scores. */
export function quadrantOf(scores: {
  readonly urgency: number;
  readonly importance: number;
}): Quadrant {
  const urgent = scores.urgency >= QUADRANT_LINE;
  const important = scores.importance >= QUADRANT_LINE;
  if (urgent && important) return "DO";
  if (important) return "SCHEDULE";
  if (urgent) return "DELEGATE";
  return "DROP";
}
