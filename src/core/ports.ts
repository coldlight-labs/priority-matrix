// Interfaces core owns and adapters implement (dependencies point inward).

import type { Label } from "./label";
import type { Result } from "./result";
import type { Task } from "./task";

/** Items loaded from storage. Invalid stored documents are skipped and counted, never thrown. */
export interface LoadResult<T> {
  readonly items: readonly T[];
  readonly skipped: number;
}

/** Stops a watch. Safe to call more than once. */
export type StopWatching = () => void;

/**
 * Live updates of a whole collection (#28). `onChange` receives every stored item,
 * checked like `list`, soon after watching starts and again whenever anything changes,
 * on this device or another. `onStopped` is called at most once if updates stop for
 * good; after it, `onChange` never fires again. Watch once per page, never per render.
 */
export interface Watchable<T> {
  watch(
    onChange: (result: LoadResult<T>) => void,
    onStopped: (error: StorageError) => void,
  ): StopWatching;
}

/** Stores tasks. `save` creates the task or replaces the one with the same id. */
export interface TaskRepository extends Watchable<Task> {
  list(): Promise<LoadResult<Task>>;
  save(task: Task): Promise<void>;
  /**
   * Saves `updated` only if storage still holds `loaded` unchanged (or no copy of it),
   * checked and written as one step, so two pages saving the task at the same moment
   * cannot both win. Throws StorageError "conflict" when the task changed elsewhere or
   * another page is saving it right now (#20, #34).
   */
  saveIfUnchanged(loaded: Task, updated: Task): Promise<void>;
  /**
   * Deletes the task for good, with the same check as `saveIfUnchanged`: only if
   * storage still holds `loaded` unchanged, so a task revived on another device is
   * never deleted by mistake (#54). A task already gone counts as deleted. Throws
   * StorageError "conflict" when it changed elsewhere or is being saved right now.
   */
  deleteIfUnchanged(loaded: Task): Promise<void>;
}

/** What `saveChecked` did: the rule's result, and the labels it was checked against. */
export interface CheckedLabelSave {
  readonly result: Result<Label>;
  readonly stored: readonly Label[];
}

/** Stores labels. `save` creates the label or replaces the one with the same id. */
export interface LabelRepository extends Watchable<Label> {
  list(): Promise<LoadResult<Label>>;
  save(label: Label): Promise<void>;
  /**
   * For changes that set a name (create, rename, restore): reads the stored labels,
   * runs `build` on them (a core name rule), and saves its label only if it passes,
   * as one step under a shared lease for label names, so two devices cannot both
   * store the same name (#56, i66). Throws StorageError "conflict" while another
   * page holds that lease.
   */
  saveChecked(
    build: (stored: readonly Label[]) => Result<Label>,
  ): Promise<CheckedLabelSave>;
}

/**
 * Why a storage call failed:
 * unavailable = try again later, full = storage limit reached,
 * rejected = the store refused the call (no write access or bad data),
 * conflict = the item changed elsewhere since this page loaded it (#20).
 */
export type StorageErrorKind = "unavailable" | "full" | "rejected" | "conflict";

/** The one error type repositories throw. */
export class StorageError extends Error {
  constructor(
    readonly kind: StorageErrorKind,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "StorageError";
  }
}

/** What happened to a file offered to the viewer. */
export type SaveOutcome = "saved" | "declined" | "unavailable" | "failed";

/** Offers a generated file to the viewer. Never throws; the outcome says what happened. */
export interface FileSaver {
  save(filename: string, data: string): Promise<SaveOutcome>;
}
