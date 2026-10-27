// Public interface of core. Other modules import from here, never from core's inner files.
// It lists only what other modules use, plus the types those functions take or return
// (review 2026-10-24, #21). Helpers used only inside core stay unexported here.

export type { ValidationError, Result } from "./result";
export type { CreateMeta } from "./schema";
export { LABEL_SCHEMA_VERSION, TASK_SCHEMA_VERSION } from "./schema";
export type { Label } from "./label";
export {
  LABEL_NAME_MAX,
  createLabel,
  renameLabel,
  archiveLabel,
  setLabelColor,
  restoreLabel,
  parseStoredLabel,
  upgradeLabelColors,
  validateLabelName,
} from "./label";
export type { Task, ScoredTask, TaskStatus, TaskInput } from "./task";
export {
  TASK_TEXT_MAX,
  SCORE_MIN,
  SCORE_MAX,
  createTask,
  setTaskStatus,
  editTask,
  parseStoredTask,
  changedSince,
} from "./task";
export type { Dated } from "./urgency";
export { scoreTasks } from "./urgency";
export { dueText, timeLeftText } from "./due-text";
export type { Quadrant } from "./quadrant";
export {
  QUADRANT_LINE,
  QUADRANT_NAMES,
  QUADRANTS,
  quadrantOf,
  groupByQuadrant,
} from "./quadrant";
export { nextUp } from "./next-up";
export { compareTasks } from "./order";
export {
  TODAY_LIMIT,
  isPickedToday,
  pickForToday,
  unpickForToday,
  todayList,
} from "./today";
export type {
  LoadResult,
  TaskRepository,
  LabelRepository,
  CheckedLabelSave,
  StopWatching,
  StorageErrorKind,
  SaveOutcome,
  FileSaver,
} from "./ports";
export { StorageError } from "./ports";
export { seedLabelsIfEmpty, starterLabels } from "./seed";
export type { MarkShape, Swatch } from "./palette";
export { PALETTE, swatchOf } from "./palette";
