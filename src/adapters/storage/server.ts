// Storage on the self-hosted server (ADR 0003, #64): the task and label repositories over
// the server's HTTP API (server/handler.ts). Every call sends the account key as a
// bearer token. Server answers are checked with core's parsers like any stored data.
// Changes from other devices arrive by polling while the page is visible.

import {
  parseStoredLabel,
  parseStoredTask,
  StorageError,
  type Label,
  type LabelRepository,
  type LoadResult,
  type Result,
  type Task,
  type TaskRepository,
} from "../../core";

/** What the adapter needs from the app. */
export interface ServerStorageDeps {
  /** The account key from the person's link (src/app/key.ts). */
  readonly key: string;
  readonly fetch: (url: string, init: RequestInit) => Promise<Response>;
  /** Whether the page is on screen, and a way to hear when it comes back. */
  readonly page: {
    visible(): boolean;
    onVisible(callback: () => void): void;
  };
  /** Runs `callback` once after `ms` (setTimeout, or a fake in tests). */
  readonly schedule: (callback: () => void, ms: number) => void;
  /** Called when the server refuses the key (revoked or wrong link). */
  readonly onUnauthorized: () => void;
  readonly pollMs?: number;
  readonly timeoutMs?: number;
}

/** How often an open page asks for changes, and how long a call may take. */
const POLL_MS = 5000;
const TIMEOUT_MS = 15_000;

/** The account's data as the server sent it, checked. */
interface Snapshot {
  readonly revision: number;
  readonly tasks: LoadResult<Task>;
  readonly labels: LoadResult<Label>;
}

/** Builds the two repositories, sharing one connection and one poller. */
export function createServerRepositories(deps: ServerStorageDeps): {
  tasks: TaskRepository;
  labels: LabelRepository;
} {
  const pollMs = deps.pollMs ?? POLL_MS;
  const timeoutMs = deps.timeoutMs ?? TIMEOUT_MS;
  /** The last revision this page has seen, or null before the first read. */
  let revision: number | null = null;

  /** One API call: JSON in and out; any failure becomes a StorageError. */
  async function call(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<unknown> {
    let response: Response;
    try {
      response = await deps.fetch(path, {
        method,
        headers: {
          authorization: `Bearer ${deps.key}`,
          ...(body === undefined ? {} : { "content-type": "application/json" }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error: unknown) {
      throw new StorageError("unavailable", "Could not reach the server.", {
        cause: error,
      });
    }
    if (response.status === 401) {
      deps.onUnauthorized();
      throw new StorageError("rejected", "This link no longer works.");
    }
    if (!response.ok) throw failure(response.status);
    try {
      return (await response.json()) as unknown;
    } catch (error: unknown) {
      throw new StorageError("unavailable", "The server sent a bad answer.", {
        cause: error,
      });
    }
  }

  /** Reads the account's data, or null when nothing changed since `since`. */
  async function read(since: number | null): Promise<Snapshot | null> {
    const query = since === null ? "" : `?since=${String(since)}`;
    const doc = await call("GET", `/api/data${query}`);
    if (!isRecord(doc) || typeof doc.revision !== "number") {
      throw new StorageError("unavailable", "The server sent a bad answer.");
    }
    if (doc.changed === false) return null;
    const snapshot: Snapshot = {
      revision: doc.revision,
      tasks: checked(doc.tasks, parseStoredTask),
      labels: checked(doc.labels, parseStoredLabel),
    };
    revision = snapshot.revision;
    return snapshot;
  }

  async function snapshot(): Promise<Snapshot> {
    const data = await read(null);
    if (data === null) throw new StorageError("unavailable", "No data.");
    return data;
  }

  // Polling: one loop for both repositories, started by the first watch.
  const taskWatchers: ((result: LoadResult<Task>) => void)[] = [];
  const labelWatchers: ((result: LoadResult<Label>) => void)[] = [];
  const stopWatchers: ((error: StorageError) => void)[] = [];
  let polling = false;
  let stopped = false;

  /** Asks once for changes and hands them on. False when polling must stop. */
  async function pollOnce(): Promise<boolean> {
    try {
      const data = await read(revision);
      if (data !== null) {
        for (const w of taskWatchers) w(data.tasks);
        for (const w of labelWatchers) w(data.labels);
      }
      return true;
    } catch (error: unknown) {
      if (error instanceof StorageError && error.kind === "rejected") {
        stopped = true;
        for (const w of stopWatchers) w(error);
        return false;
      }
      // Offline or a slow server: try again at the next tick.
      return true;
    }
  }

  function tick(): void {
    if (stopped) return;
    if (!deps.page.visible()) {
      deps.schedule(tick, pollMs);
      return;
    }
    void pollOnce().then((goOn) => {
      if (goOn) deps.schedule(tick, pollMs);
    });
  }

  function startPolling(): void {
    if (polling) return;
    polling = true;
    deps.schedule(tick, pollMs);
    // Phones pause pages in the background; catch up as soon as it is back.
    deps.page.onVisible(() => {
      if (!stopped) void pollOnce();
    });
  }

  const tasks: TaskRepository = {
    async list() {
      return (await snapshot()).tasks;
    },
    async save(task) {
      await call("PUT", `/api/tasks/${encodeURIComponent(task.id)}`, task);
    },
    async saveIfUnchanged(loaded, updated) {
      await call(
        "POST",
        `/api/tasks/${encodeURIComponent(loaded.id)}/save-if-unchanged`,
        { loaded, updated },
      );
    },
    async deleteIfUnchanged(loaded) {
      await call(
        "POST",
        `/api/tasks/${encodeURIComponent(loaded.id)}/delete-if-unchanged`,
        { loaded },
      );
    },
    watch(onChange, onStopped) {
      taskWatchers.push(onChange);
      stopWatchers.push(onStopped);
      startPolling();
      return () => {
        remove(taskWatchers, onChange);
        remove(stopWatchers, onStopped);
      };
    },
  };

  const labels: LabelRepository = {
    async list() {
      return (await snapshot()).labels;
    },
    async save(label) {
      await call("PUT", `/api/labels/${encodeURIComponent(label.id)}`, label);
    },
    async saveChecked(build) {
      // The rule runs here for the app's messages; the server runs it again as the
      // one step that counts, against its own copy (#56).
      const stored = (await snapshot()).labels.items;
      const result = build(stored);
      if (!result.ok) return { result, stored };
      const answer = await call(
        "POST",
        `/api/labels/${encodeURIComponent(result.value.id)}/save-if-name-free`,
        { label: result.value },
      );
      if (!isRecord(answer)) {
        throw new StorageError("unavailable", "The server sent a bad answer.");
      }
      const checkedAgainst = checked(answer.labels, parseStoredLabel).items;
      if (answer.ok === true) return { result, stored: checkedAgainst };
      const refused: Result<Label> = {
        ok: false,
        errors: Array.isArray(answer.errors)
          ? answer.errors.filter(isValidationError)
          : [],
      };
      return { result: refused, stored: checkedAgainst };
    },
    watch(onChange, onStopped) {
      labelWatchers.push(onChange);
      stopWatchers.push(onStopped);
      startPolling();
      return () => {
        remove(labelWatchers, onChange);
        remove(stopWatchers, onStopped);
      };
    },
  };

  return { tasks, labels };
}

/** The StorageError for a refused call (401 is handled before this). */
function failure(status: number): StorageError {
  if (status === 409) {
    return new StorageError("conflict", "Changed or being saved elsewhere.");
  }
  if (status === 413)
    return new StorageError("full", "Account storage is full.");
  if (status === 400 || status === 404 || status === 405) {
    return new StorageError(
      "rejected",
      `The server refused the call (${String(status)}).`,
    );
  }
  // 429 and 5xx: try again later.
  return new StorageError(
    "unavailable",
    `The server is busy (${String(status)}).`,
  );
}

/** Items from the server that core accepts; others are skipped and counted. */
function checked<T>(
  items: unknown,
  parse: (doc: unknown) => Result<T>,
): LoadResult<T> {
  if (!Array.isArray(items)) return { items: [], skipped: 0 };
  const ok: T[] = [];
  let skipped = 0;
  for (const doc of items) {
    const parsed = parse(doc);
    if (parsed.ok) ok.push(parsed.value);
    else skipped += 1;
  }
  return { items: ok, skipped };
}

function isValidationError(
  value: unknown,
): value is { field: string; message: string } {
  return (
    isRecord(value) &&
    typeof value.field === "string" &&
    typeof value.message === "string"
  );
}

function remove<T>(list: T[], item: T): void {
  const at = list.indexOf(item);
  if (at !== -1) list.splice(at, 1);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
