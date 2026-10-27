import type { ScoredTask } from "./task";

/**
 * Priority order shared by Next up and the quadrant lists (plan i2, i14, i29):
 * highest urgency + importance, then higher importance, then older createdAt, then lower id.
 */
export function compareTasks(a: ScoredTask, b: ScoredTask): number {
  return (
    b.urgency + b.importance - (a.urgency + a.importance) ||
    b.importance - a.importance ||
    a.createdAt.localeCompare(b.createdAt) ||
    a.id.localeCompare(b.id)
  );
}
