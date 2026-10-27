import {
  changedSince,
  parseStoredLabel,
  parseStoredTask,
  upgradeLabelColors,
  StorageError,
  type LabelRepository,
  type LoadResult,
  type Result,
  type StopWatching,
  type Task,
  type TaskRepository,
} from "../../core";
import {
  isRuntimeError,
  type ArtifactDb,
  type DbQuerySnapshot,
} from "../runtime";

/** Collection names in the artifact database. */
export const TASKS_COLLECTION = "tasks";
export const LABELS_COLLECTION = "labels";
/** One lease document per task id, holding no task content (#34). */
export const LOCKS_COLLECTION = "locks";
/** The one lease document for changes that set a label name (#56); holds no label content. */
const LABEL_NAMES_LEASE = "label-names";

/**
 * How long a save holds its task's lease: room for one read and one write, with margin.
 * The lease lapses on its own (the runtime has no release), so keep it short.
 */
const LEASE_MS = 10_000;

/** Largest page the runtime allows. Loading warns when a collection reaches it (plan i20). */
export const LOAD_LIMIT = 1000;

/** Upper bound of the random delay before the single retry of an unavailable call. */
const RETRY_DELAY_MAX_MS = 500;

/** Things the adapter needs from its surroundings; replaceable in tests. */
export interface ArtifactDbDeps {
  readonly warn: (message: string) => void;
  readonly sleep: (ms: number) => Promise<void>;
  readonly random: () => number;
  /** Names this page as a lease holder; stable for the page's life. */
  readonly holder: string;
}

const defaultDeps: ArtifactDbDeps = {
  warn: (message) => {
    console.warn(message);
  },
  sleep: (ms) =>
    new Promise((resolve) => {
      setTimeout(resolve, ms);
    }),
  random: Math.random,
  holder: crypto.randomUUID(),
};

/** Task and label repositories backed by the claude.ai artifact database. */
export function createArtifactDbRepositories(
  db: ArtifactDb,
  deps: ArtifactDbDeps = defaultDeps,
): { tasks: TaskRepository; labels: LabelRepository } {
  const tasks = createCollectionRepository(
    db,
    TASKS_COLLECTION,
    parseStoredTask,
    deps,
  );
  /**
   * Takes the task's lease and re-reads it (#34): pages that write a task take its
   * lease first, so only one checks and writes at a time; a busy lease means another
   * page is saving it now. Throws a conflict when it changed since `loaded`; returns
   * whether a copy is stored.
   */
  async function checkUnchanged(loaded: Task): Promise<boolean> {
    const conflict = () =>
      new StorageError(
        "conflict",
        `Task ${loaded.id} changed or is being saved elsewhere.`,
      );
    const lease = await withRetry(
      () =>
        db
          .collection(LOCKS_COLLECTION)
          .doc(loaded.id)
          .acquire({ holder: deps.holder, ttlMs: LEASE_MS }),
      deps,
    );
    if (!lease.acquired) throw conflict();
    const doc = await withRetry(
      () => db.collection(TASKS_COLLECTION).doc(loaded.id).get(),
      deps,
    );
    // An unreadable stored copy counts as missing, as `list` skips it.
    const parsed = doc.exists ? parseStoredTask(doc.data()) : undefined;
    const stored = parsed?.ok === true ? parsed.value : undefined;
    if (changedSince(loaded, stored)) throw conflict();
    return doc.exists;
  }
  // Labels saved before #45 move to the new palette whenever they are read (i82).
  const labels = createCollectionRepository(
    db,
    LABELS_COLLECTION,
    parseStoredLabel,
    deps,
    upgradeLabelColors,
  );
  return {
    tasks: {
      ...tasks,
      async saveIfUnchanged(loaded: Task, updated: Task) {
        await checkUnchanged(loaded);
        await tasks.save(updated);
      },
      async deleteIfUnchanged(loaded: Task) {
        const exists = await checkUnchanged(loaded);
        if (!exists) return;
        await withRetry(
          () => db.collection(TASKS_COLLECTION).doc(loaded.id).delete(),
          deps,
        );
      },
    },
    labels: {
      ...labels,
      async saveChecked(build) {
        // One lease for every name change: names must be unique across labels, so a
        // per-label lease would not stop two new labels taking the same name.
        const lease = await withRetry(
          () =>
            db
              .collection(LOCKS_COLLECTION)
              .doc(LABEL_NAMES_LEASE)
              .acquire({ holder: deps.holder, ttlMs: LEASE_MS }),
          deps,
        );
        if (!lease.acquired) {
          throw new StorageError(
            "conflict",
            "Label names are being changed on another device.",
          );
        }
        const stored = (await labels.list()).items;
        const result = build(stored);
        if (result.ok) await labels.save(result.value);
        return { result, stored };
      },
    },
  };
}

function createCollectionRepository<T extends { readonly id: string }>(
  db: ArtifactDb,
  path: string,
  parse: (doc: unknown) => Result<T>,
  deps: ArtifactDbDeps,
  /** A last step over all checked items of a read, such as the label color move. */
  finish: (items: readonly T[]) => T[] = (items) => [...items],
): {
  list(): Promise<LoadResult<T>>;
  save(item: T): Promise<void>;
  watch(
    onChange: (result: LoadResult<T>) => void,
    onStopped: (error: StorageError) => void,
  ): StopWatching;
} {
  /** Checks every document in a snapshot; invalid ones are skipped and logged. */
  const read = (snapshot: DbQuerySnapshot): LoadResult<T> => {
    const items: T[] = [];
    let skipped = 0;
    for (const doc of snapshot.docs) {
      if (!doc.exists) continue;
      const parsed = parse(doc.data());
      if (parsed.ok) {
        items.push(parsed.value);
      } else {
        skipped += 1;
        // Log the id and field names only, never document content (no personal data in logs).
        const fields = parsed.errors.map((e) => e.field).join(", ");
        deps.warn(`Skipped invalid ${path} document ${doc.id}: bad ${fields}.`);
      }
    }
    if (snapshot.size >= LOAD_LIMIT) {
      deps.warn(
        `Loaded the maximum of ${String(LOAD_LIMIT)} ${path} documents; some may be missing.`,
      );
    }
    return { items: finish(items), skipped };
  };

  return {
    async list() {
      const snapshot = await withRetry(
        () => db.collection(path).limit(LOAD_LIMIT).get(),
        deps,
      );
      return read(snapshot);
    },

    async save(item) {
      const body: Record<string, unknown> = { ...item };
      await withRetry(() => db.collection(path).doc(item.id).set(body), deps);
    },

    watch(onChange, onStopped) {
      // The runtime retries transient failures itself; an error here is terminal.
      return db
        .collection(path)
        .limit(LOAD_LIMIT)
        .onSnapshot(
          (snapshot) => {
            // A cached view may be empty or partial; keep what the page shows
            // until the server confirms (#30).
            if (snapshot.metadata.fromCache) return;
            onChange(read(snapshot));
          },
          (error) => {
            onStopped(toStorageError(error));
          },
        );
    },
  };
}

/**
 * Runs a db call, retrying once after a short random delay when the runtime
 * reports a transient "unavailable" (as its contract advises), and turns every
 * failure into a StorageError.
 */
async function withRetry<R>(
  call: () => Promise<R>,
  deps: ArtifactDbDeps,
): Promise<R> {
  try {
    return await call();
  } catch (error: unknown) {
    if (!isRuntimeError(error) || error.code !== "unavailable") {
      throw toStorageError(error);
    }
  }
  await deps.sleep(Math.round(deps.random() * RETRY_DELAY_MAX_MS));
  try {
    return await call();
  } catch (error: unknown) {
    throw toStorageError(error);
  }
}

function toStorageError(error: unknown): StorageError {
  const code = isRuntimeError(error) ? error.code : "unknown";
  switch (code) {
    case "quota_exceeded":
      return new StorageError("full", "Storage is full.", { cause: error });
    case "invalid_argument":
    case "transform_error":
      return new StorageError("rejected", "Storage refused the change.", {
        cause: error,
      });
    default:
      // unavailable, resource_exhausted, revoked, lifecycle codes and unknown codes.
      return new StorageError(
        "unavailable",
        "Storage is unavailable right now.",
        { cause: error },
      );
  }
}
