import {
  changedSince,
  StorageError,
  type Label,
  type LabelRepository,
  type LoadResult,
  type StopWatching,
  type Task,
  type TaskRepository,
} from "../../core";

/**
 * In-memory repositories for local development and tests (ADR 0001: the artifact
 * runtime is not available locally). Data lasts until the page reloads.
 * Items are copied on the way in and out, so callers can never change stored data by reference.
 * `watch` reports every save, as the artifact database reports changes from any device.
 */
export function createMemoryRepositories(): {
  tasks: TaskRepository;
  labels: LabelRepository;
} {
  const tasks = createMemoryRepository<Task>();
  const labelStore = createMemoryRepository<Label>();
  return {
    tasks: {
      list: () => tasks.list(),
      save: (task) => tasks.save(task),
      watch: (onChange, onStopped) => tasks.watch(onChange, onStopped),
      // One page, no awaits between check and write, so this is already one step.
      saveIfUnchanged(loaded, updated) {
        if (changedSince(loaded, tasks.peek(loaded.id))) {
          return Promise.reject(
            new StorageError(
              "conflict",
              `Task ${loaded.id} changed elsewhere.`,
            ),
          );
        }
        return tasks.save(updated);
      },
      deleteIfUnchanged(loaded) {
        if (changedSince(loaded, tasks.peek(loaded.id))) {
          return Promise.reject(
            new StorageError(
              "conflict",
              `Task ${loaded.id} changed elsewhere.`,
            ),
          );
        }
        return tasks.remove(loaded.id);
      },
    },
    labels: {
      list: () => labelStore.list(),
      save: (label) => labelStore.save(label),
      watch: (onChange, onStopped) => labelStore.watch(onChange, onStopped),
      // One page, no awaits between read, check and write, so this is already one step.
      async saveChecked(build) {
        const stored = labelStore.all();
        const result = build(stored);
        if (result.ok) await labelStore.save(result.value);
        return { result, stored };
      },
    },
  };
}

function createMemoryRepository<T extends { readonly id: string }>(): {
  list(): Promise<LoadResult<T>>;
  save(item: T): Promise<void>;
  /** Removes the item with this id, if there is one. */
  remove(id: string): Promise<void>;
  /** Copies of every stored item, read at once (no await). */
  all(): T[];
  /** The stored item with this id, read without copying; never change it. */
  peek(id: string): T | undefined;
  watch(
    onChange: (result: LoadResult<T>) => void,
    onStopped: (error: StorageError) => void,
  ): StopWatching;
} {
  const store = new Map<string, T>();
  const watchers = new Set<(result: LoadResult<T>) => void>();
  const snapshot = (): LoadResult<T> => ({
    items: [...store.values()].map((item) => structuredClone(item)),
    skipped: 0,
  });
  /** Tells watchers after the current task, as a real store delivers changes later. */
  const notify = () => {
    queueMicrotask(() => {
      for (const watcher of watchers) watcher(snapshot());
    });
  };
  return {
    list() {
      return Promise.resolve(snapshot());
    },
    all() {
      return [...snapshot().items];
    },
    peek(id) {
      return store.get(id);
    },
    save(item) {
      store.set(item.id, structuredClone(item));
      notify();
      return Promise.resolve();
    },
    remove(id) {
      if (store.delete(id)) notify();
      return Promise.resolve();
    },
    watch(onChange) {
      // In-memory storage never stops, so onStopped is never called.
      const watcher = (result: LoadResult<T>) => {
        onChange(result);
      };
      watchers.add(watcher);
      queueMicrotask(() => {
        if (watchers.has(watcher)) watcher(snapshot());
      });
      return () => {
        watchers.delete(watcher);
      };
    },
  };
}
