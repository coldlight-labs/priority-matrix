import {
  StorageError,
  type LabelRepository,
  type TaskRepository,
} from "../../core";

/**
 * Repositories for a page inside claude.ai whose database cannot be reached
 * (review #12). They load nothing and refuse every save, so nothing looks saved
 * when it is not. Using in-memory storage there would lose tasks on reload.
 */
export function createUnavailableRepositories(): {
  tasks: TaskRepository;
  labels: LabelRepository;
} {
  const refuse = () =>
    Promise.reject(
      new StorageError("unavailable", "Storage is not available on this page."),
    );
  const empty = () => Promise.resolve({ items: [], skipped: 0 });
  // Nothing is stored here, so nothing ever changes: watching does nothing.
  const watch = () => () => undefined;
  return {
    tasks: {
      list: empty,
      save: refuse,
      saveIfUnchanged: refuse,
      deleteIfUnchanged: refuse,
      watch,
    },
    labels: { list: empty, save: refuse, saveChecked: refuse, watch },
  };
}
