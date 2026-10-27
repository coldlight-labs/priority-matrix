// App state helpers and user-facing messages. Pure, so they are unit tested.

import { StorageError, type Label, type Task } from "../core";

/** Everything the page shows. */
export interface AppState {
  readonly tasks: readonly Task[];
  readonly labels: readonly Label[];
}

/** Returns the list with `item` added, or replacing the item with the same id. */
export function upsert<T extends { readonly id: string }>(
  list: readonly T[],
  item: T,
): T[] {
  const index = list.findIndex((x) => x.id === item.id);
  if (index === -1) return [...list, item];
  return list.map((x, i) => (i === index ? item : x));
}

/** A short, plain message for a failed storage call. */
export function storageMessage(error: unknown): string {
  if (error instanceof StorageError) {
    switch (error.kind) {
      case "full":
        return "Couldn't save: storage is full.";
      case "rejected":
        return "Couldn't save: storage refused the change. Check that you can edit this page.";
      case "unavailable":
        return "Couldn't reach storage. Try again in a moment.";
      case "conflict":
        return "This task changed on another device. The page now shows the latest version; make your change again.";
    }
  }
  return "Something went wrong. Try again.";
}

/** Shown instead of the app when the page has no account key (#64). */
export const NO_KEY_MESSAGE =
  "Open your personal link to use this page. If you don't have one, ask the person who runs this site for one.";

/** Shown instead of the app when the server refuses the key (#64). */
export const REVOKED_KEY_MESSAGE =
  "This link no longer works. Ask the person who runs this site for a new one.";

/** Shown when live updates from other devices stop for good (#28). */
export const LIVE_STOPPED_MESSAGE =
  "Live updates stopped. Reload to see changes from other devices.";

/** Message shown when stored items could not be read, or null when all were fine. */
export function skippedMessage(skipped: number): string | null {
  if (skipped === 0) return null;
  const items =
    skipped === 1 ? "1 saved item" : `${String(skipped)} saved items`;
  return `${items} could not be read and ${skipped === 1 ? "was" : "were"} skipped.`;
}

/** Where the page keeps its data. */
export type StorageMode = "artifact" | "server" | "memory" | "unavailable";

/**
 * Picks the storage: the self-hosted server in the site build (ADR 0003, #64), the artifact
 * database inside claude.ai, in-memory storage in local preview, and "unavailable"
 * inside claude.ai when the database cannot be reached, so the page never pretends
 * to save (review #12).
 */
export function chooseStorage(
  insideClaude: boolean,
  dbAvailable: boolean,
  siteBuild = false,
): StorageMode {
  if (siteBuild) return "server";
  if (!insideClaude) return "memory";
  return dbAvailable ? "artifact" : "unavailable";
}

/** The line under the page title that says where data is kept. */
export function storageModeText(mode: StorageMode): string {
  switch (mode) {
    case "artifact":
      return "Saved to this page's storage.";
    case "server":
      return "Saved to your account.";
    case "memory":
      return "Local preview: data resets when you reload.";
    case "unavailable":
      return "Storage isn't available, so nothing can be saved. Reload the page.";
  }
}
