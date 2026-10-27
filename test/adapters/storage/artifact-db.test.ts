import { describe, expect, it } from "vitest";
import {
  createArtifactDbRepositories,
  LOAD_LIMIT,
  type ArtifactDbDeps,
} from "../../../src/adapters/storage/artifact-db";
import type {
  ArtifactDb,
  DbError,
  DbQuerySnapshot,
} from "../../../src/adapters/runtime";
import {
  createLabel,
  StorageError,
  type Label,
  type Task,
} from "../../../src/core";

const NOW = "2026-10-23T09:00:00.000Z";
const LATER = "2026-10-23T09:30:00.000Z";

function task(id: string, text = "Send invoice"): Task {
  return {
    id,
    text,
    importance: 60,
    labelId: "l1",
    date: "2026-10-30",
    time: null,
    followUp: false,
    status: "open",
    createdAt: NOW,
    updatedAt: NOW,
    today: null,
    schemaVersion: 4,
  };
}

/**
 * Stand-in for the runtime's db namespace, following its contract 0.2.89 types.
 * `failures` queues errors for the next calls, in order. The runtime rejects with
 * a `{code, message}` object; the fake uses an Error carrying `code`, which has
 * the same shape and keeps rejections as Errors.
 */
function fakeDb(initial: Record<string, Record<string, unknown>[]> = {}) {
  const collections = new Map<string, Map<string, Record<string, unknown>>>();
  for (const [path, docs] of Object.entries(initial)) {
    collections.set(
      path,
      new Map(
        docs.map((d, i) => [
          typeof d.id === "string" ? d.id : `doc${String(i)}`,
          d,
        ]),
      ),
    );
  }
  const failures: DbError[] = [];
  const calls: string[] = [];
  /** Lease holder by document path ("locks/t1"), so a test can make one busy. */
  const leases = new Map<string, string>();
  let lastLimit = 0;
  /** Live subscriptions, so a test can deliver snapshots and terminal errors. */
  const subscribers: {
    path: string;
    next: (snapshot: DbQuerySnapshot) => void;
    error: (e: DbError) => void;
    stopped: boolean;
  }[] = [];
  const snapshotOf = (
    docs: Map<string, Record<string, unknown>>,
    fromCache = false,
  ) => ({
    size: docs.size,
    metadata: { fromCache, hasPendingWrites: false },
    docs: [...docs.entries()].map(([id, body]) => ({
      id,
      exists: true,
      data: () => body,
    })),
  });

  const failIfQueued = () => {
    const next = failures.shift();
    if (next !== undefined) {
      return Promise.reject(
        Object.assign(new Error(next.message), { code: next.code }),
      );
    }
    return undefined;
  };

  const db: ArtifactDb = {
    collection(path) {
      const docs =
        collections.get(path) ?? new Map<string, Record<string, unknown>>();
      collections.set(path, docs);
      const query = {
        limit(n: number) {
          lastLimit = n;
          return query;
        },
        get() {
          calls.push(`get ${path}`);
          return failIfQueued() ?? Promise.resolve(snapshotOf(docs));
        },
        onSnapshot(
          next: (snapshot: DbQuerySnapshot) => void,
          error: (e: DbError) => void,
        ) {
          calls.push(`subscribe ${path}`);
          const sub = { path, next, error, stopped: false };
          subscribers.push(sub);
          return () => {
            sub.stopped = true;
          };
        },
      };
      return {
        ...query,
        doc(id: string) {
          return {
            get() {
              calls.push(`get ${path}/${id}`);
              const body = docs.get(id);
              return (
                failIfQueued() ??
                Promise.resolve({
                  id,
                  exists: body !== undefined,
                  data: () => body,
                })
              );
            },
            acquire(options: { holder: string; ttlMs?: number }) {
              calls.push(`acquire ${path}/${id}`);
              const failed = failIfQueued();
              if (failed) return failed;
              const held = leases.get(`${path}/${id}`);
              if (held !== undefined && held !== options.holder) {
                return Promise.resolve({ acquired: false });
              }
              leases.set(`${path}/${id}`, options.holder);
              return Promise.resolve({ acquired: true });
            },
            set(data: Record<string, unknown>) {
              calls.push(`set ${path}/${id}`);
              const failed = failIfQueued();
              if (failed) return failed;
              docs.set(id, data);
              return Promise.resolve();
            },
            delete() {
              calls.push(`delete ${path}/${id}`);
              const failed = failIfQueued();
              if (failed) return failed;
              docs.delete(id);
              return Promise.resolve();
            },
          };
        },
      };
    },
  };
  /** Delivers the current contents of `path` to its live subscribers. */
  const push = (path: string, fromCache = false) => {
    const docs =
      collections.get(path) ?? new Map<string, Record<string, unknown>>();
    for (const sub of subscribers) {
      if (sub.path === path && !sub.stopped)
        sub.next(snapshotOf(docs, fromCache));
    }
  };
  return {
    db,
    collections,
    failures,
    calls,
    leases,
    subscribers,
    push,
    lastLimit: () => lastLimit,
  };
}

function testDeps() {
  const warnings: string[] = [];
  const sleeps: number[] = [];
  const deps: ArtifactDbDeps = {
    warn: (m) => warnings.push(m),
    sleep: (ms) => {
      sleeps.push(ms);
      return Promise.resolve();
    },
    random: () => 0.5,
    holder: "page-1",
  };
  return { deps, warnings, sleeps };
}

describe("artifact-db repositories", () => {
  it("saves tasks under tasks/<id> and labels under labels/<id>", async () => {
    const fake = fakeDb();
    const { tasks, labels } = createArtifactDbRepositories(
      fake.db,
      testDeps().deps,
    );
    await tasks.save(task("t1"));
    await labels.save({
      id: "l1",
      name: "Jobs",
      archived: false,
      color: "teal",
      createdAt: NOW,
      updatedAt: NOW,
      schemaVersion: 2,
    });
    expect(fake.calls).toEqual(["set tasks/t1", "set labels/l1"]);
    expect(fake.collections.get("tasks")?.get("t1")).toEqual(task("t1"));
  });

  it("loads what it saved, with an explicit limit of 1000", async () => {
    const fake = fakeDb();
    const { tasks } = createArtifactDbRepositories(fake.db, testDeps().deps);
    await tasks.save(task("t1"));
    expect(await tasks.list()).toEqual({ items: [task("t1")], skipped: 0 });
    expect(fake.lastLimit()).toBe(LOAD_LIMIT);
  });

  it("skips invalid documents and logs id and fields, never the text", async () => {
    const fake = fakeDb({
      tasks: [
        { ...task("good") },
        { ...task("bad", "secret client name"), date: "someday" },
      ],
    });
    const { deps, warnings } = testDeps();
    const { tasks } = createArtifactDbRepositories(fake.db, deps);
    expect(await tasks.list()).toEqual({ items: [task("good")], skipped: 1 });
    expect(warnings).toEqual(["Skipped invalid tasks document bad: bad date."]);
    expect(warnings.join()).not.toContain("secret");
  });

  it("warns when a collection reaches the load limit", async () => {
    const docs = Array.from({ length: LOAD_LIMIT }, (_, i) => ({
      ...task(`t${String(i)}`),
    }));
    const { deps, warnings } = testDeps();
    const { tasks } = createArtifactDbRepositories(
      fakeDb({ tasks: docs }).db,
      deps,
    );
    expect((await tasks.list()).items).toHaveLength(LOAD_LIMIT);
    expect(warnings).toEqual([
      "Loaded the maximum of 1000 tasks documents; some may be missing.",
    ]);
  });

  it("retries once after a short delay when the store is unavailable", async () => {
    const fake = fakeDb();
    fake.failures.push({ code: "unavailable", message: "blip" });
    const { deps, sleeps } = testDeps();
    const { tasks } = createArtifactDbRepositories(fake.db, deps);
    await tasks.save(task("t1"));
    expect(fake.calls).toEqual(["set tasks/t1", "set tasks/t1"]);
    expect(sleeps).toEqual([250]);
    expect(fake.collections.get("tasks")?.has("t1")).toBe(true);
  });

  it("gives up after one retry", async () => {
    const fake = fakeDb();
    fake.failures.push(
      { code: "unavailable", message: "blip" },
      { code: "unavailable", message: "still down" },
    );
    const { tasks } = createArtifactDbRepositories(fake.db, testDeps().deps);
    await expect(tasks.list()).rejects.toMatchObject({
      name: "StorageError",
      kind: "unavailable",
    });
    expect(fake.calls).toEqual(["get tasks", "get tasks"]);
  });

  it.each([
    ["quota_exceeded", "full"],
    ["invalid_argument", "rejected"],
    ["transform_error", "rejected"],
    ["revoked", "unavailable"],
    ["resource_exhausted", "unavailable"],
    ["something_new", "unavailable"],
  ])("maps %s to a %s StorageError without retrying", async (code, kind) => {
    const fake = fakeDb();
    fake.failures.push({ code, message: "no" });
    const { tasks } = createArtifactDbRepositories(fake.db, testDeps().deps);
    const error: unknown = await tasks
      .save(task("t1"))
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(StorageError);
    expect((error as StorageError).kind).toBe(kind);
    expect(fake.calls).toEqual(["set tasks/t1"]);
  });

  it("treats a non-runtime error as unavailable", async () => {
    const db: ArtifactDb = {
      collection: () => {
        throw new Error("boom");
      },
    };
    const { tasks } = createArtifactDbRepositories(db, testDeps().deps);
    await expect(tasks.list()).rejects.toMatchObject({ kind: "unavailable" });
  });

  describe("labels from before #45", () => {
    const oldLabel = (id: string, color: string, createdAt: string) => ({
      id,
      name: id,
      archived: false,
      color,
      createdAt,
      updatedAt: createdAt,
      schemaVersion: 1,
    });

    it("move to distinct new colors when loaded and watched", async () => {
      const fake = fakeDb({
        labels: [
          oldLabel("family", "green-1", "2026-10-22T09:00:00.000Z"),
          oldLabel("home", "green-1", "2026-10-24T09:00:00.000Z"),
        ],
      });
      const { labels } = createArtifactDbRepositories(fake.db, testDeps().deps);
      const colors = (items: readonly { id: string; color: string }[]) =>
        Object.fromEntries(items.map((l) => [l.id, l.color]));
      expect(colors((await labels.list()).items)).toEqual({
        family: "green",
        home: "red",
      });
      const seen: Record<string, string>[] = [];
      labels.watch(
        (result) => seen.push(colors(result.items)),
        () => undefined,
      );
      fake.push("labels");
      expect(seen).toEqual([{ family: "green", home: "red" }]);
      // Nothing is written: the move happens on read (i82).
      expect(fake.calls.filter((c) => c.startsWith("set"))).toEqual([]);
    });
  });

  describe("watch (#28)", () => {
    it("subscribes once with the load limit and delivers checked items", () => {
      const fake = fakeDb({ tasks: [{ ...task("t1") }] });
      const { deps, warnings } = testDeps();
      const { tasks } = createArtifactDbRepositories(fake.db, deps);
      const seen: unknown[] = [];
      tasks.watch(
        (result) => seen.push(result),
        () => undefined,
      );
      expect(fake.calls).toEqual(["subscribe tasks"]);
      expect(fake.lastLimit()).toBe(LOAD_LIMIT);
      fake.collections.get("tasks")?.set("bad", {
        ...task("bad", "secret client name"),
        date: "someday",
      });
      fake.push("tasks");
      expect(seen).toEqual([{ items: [task("t1")], skipped: 1 }]);
      expect(warnings).toEqual([
        "Skipped invalid tasks document bad: bad date.",
      ]);
      expect(warnings.join()).not.toContain("secret");
    });

    it("reports a terminal error once as a StorageError", () => {
      const fake = fakeDb();
      const { labels } = createArtifactDbRepositories(fake.db, testDeps().deps);
      const stopped: StorageError[] = [];
      labels.watch(
        () => undefined,
        (e) => stopped.push(e),
      );
      fake.subscribers[0]?.error({ code: "revoked", message: "gone" });
      expect(stopped).toHaveLength(1);
      expect(stopped[0]?.kind).toBe("unavailable");
    });

    it("stops delivering after the returned stop is called", () => {
      const fake = fakeDb({ tasks: [{ ...task("t1") }] });
      const { tasks } = createArtifactDbRepositories(fake.db, testDeps().deps);
      let count = 0;
      const stop = tasks.watch(
        () => {
          count += 1;
        },
        () => undefined,
      );
      fake.push("tasks");
      stop();
      fake.push("tasks");
      expect(count).toBe(1);
    });
  });

  describe("watch skips unconfirmed deliveries (#30)", () => {
    it("keeps cached deliveries from replacing the shown list", () => {
      const fake = fakeDb({ tasks: [{ ...task("t1") }] });
      const { tasks } = createArtifactDbRepositories(fake.db, testDeps().deps);
      const seen: unknown[] = [];
      tasks.watch(
        (result) => seen.push(result),
        () => undefined,
      );
      // A cached first delivery can be empty or partial.
      fake.collections.get("tasks")?.clear();
      fake.push("tasks", true);
      expect(seen).toEqual([]);
      fake.collections.get("tasks")?.set("t1", { ...task("t1") });
      fake.push("tasks");
      expect(seen).toEqual([{ items: [task("t1")], skipped: 0 }]);
    });
  });

  describe("saveIfUnchanged (#34)", () => {
    const edited = { ...task("t1", "Edited"), updatedAt: LATER };

    it("takes the task's lease, re-reads it, then saves", async () => {
      const fake = fakeDb({ tasks: [{ ...task("t1") }] });
      const { tasks } = createArtifactDbRepositories(fake.db, testDeps().deps);
      await tasks.saveIfUnchanged(task("t1"), edited);
      expect(fake.calls).toEqual([
        "acquire locks/t1",
        "get tasks/t1",
        "set tasks/t1",
      ]);
      expect(fake.leases.get("locks/t1")).toBe("page-1");
      expect(fake.collections.get("tasks")?.get("t1")).toMatchObject({
        text: "Edited",
      });
    });

    it("refuses as a conflict while another page holds the lease", async () => {
      const fake = fakeDb({ tasks: [{ ...task("t1") }] });
      fake.leases.set("locks/t1", "other-device");
      const { tasks } = createArtifactDbRepositories(fake.db, testDeps().deps);
      await expect(
        tasks.saveIfUnchanged(task("t1"), edited),
      ).rejects.toMatchObject({ kind: "conflict" });
      expect(fake.calls).toEqual(["acquire locks/t1"]);
    });

    it("refuses as a conflict when the stored task changed", async () => {
      const fake = fakeDb({
        tasks: [{ ...task("t1", "Renamed on phone"), updatedAt: LATER }],
      });
      const { tasks } = createArtifactDbRepositories(fake.db, testDeps().deps);
      await expect(
        tasks.saveIfUnchanged(task("t1"), edited),
      ).rejects.toMatchObject({ kind: "conflict" });
      expect(fake.calls).not.toContain("set tasks/t1");
    });

    it("saves a task missing from storage, putting it back", async () => {
      const fake = fakeDb();
      const { tasks } = createArtifactDbRepositories(fake.db, testDeps().deps);
      await tasks.saveIfUnchanged(task("t1"), edited);
      expect(fake.calls).toContain("set tasks/t1");
    });

    it("turns a failed lease call into a StorageError and saves nothing", async () => {
      const fake = fakeDb({ tasks: [{ ...task("t1") }] });
      fake.failures.push({ code: "invalid_argument", message: "bad" });
      const { tasks } = createArtifactDbRepositories(fake.db, testDeps().deps);
      await expect(
        tasks.saveIfUnchanged(task("t1"), edited),
      ).rejects.toBeInstanceOf(StorageError);
      expect(fake.calls).not.toContain("set tasks/t1");
    });
  });

  describe("deleteIfUnchanged (#54)", () => {
    it("takes the task's lease, re-reads it, then deletes it", async () => {
      const fake = fakeDb({ tasks: [{ ...task("t1") }] });
      const { tasks } = createArtifactDbRepositories(fake.db, testDeps().deps);
      await tasks.deleteIfUnchanged(task("t1"));
      expect(fake.calls).toEqual([
        "acquire locks/t1",
        "get tasks/t1",
        "delete tasks/t1",
      ]);
      expect(fake.collections.get("tasks")?.has("t1")).toBe(false);
    });

    it("refuses as a conflict when the task changed elsewhere (revived)", async () => {
      const fake = fakeDb({
        tasks: [{ ...task("t1", "Revived on phone"), updatedAt: LATER }],
      });
      const { tasks } = createArtifactDbRepositories(fake.db, testDeps().deps);
      await expect(tasks.deleteIfUnchanged(task("t1"))).rejects.toMatchObject({
        kind: "conflict",
      });
      expect(fake.calls).not.toContain("delete tasks/t1");
    });

    it("refuses as a conflict while another page holds the lease", async () => {
      const fake = fakeDb({ tasks: [{ ...task("t1") }] });
      fake.leases.set("locks/t1", "other-device");
      const { tasks } = createArtifactDbRepositories(fake.db, testDeps().deps);
      await expect(tasks.deleteIfUnchanged(task("t1"))).rejects.toMatchObject({
        kind: "conflict",
      });
      expect(fake.calls).toEqual(["acquire locks/t1"]);
    });

    it("does nothing for a task already gone", async () => {
      const fake = fakeDb();
      const { tasks } = createArtifactDbRepositories(fake.db, testDeps().deps);
      await tasks.deleteIfUnchanged(task("t1"));
      expect(fake.calls).not.toContain("delete tasks/t1");
    });

    it("turns a failed lease call into a StorageError and deletes nothing", async () => {
      const fake = fakeDb({ tasks: [{ ...task("t1") }] });
      fake.failures.push({ code: "invalid_argument", message: "bad" });
      const { tasks } = createArtifactDbRepositories(fake.db, testDeps().deps);
      await expect(tasks.deleteIfUnchanged(task("t1"))).rejects.toBeInstanceOf(
        StorageError,
      );
      expect(fake.collections.get("tasks")?.has("t1")).toBe(true);
    });
  });

  describe("saveChecked for label names (#56)", () => {
    const stored: Label = {
      id: "l1",
      name: "Home",
      archived: false,
      color: "green",
      createdAt: NOW,
      updatedAt: NOW,
      schemaVersion: 2,
    };
    const create = (name: string) => (labels: readonly Label[]) =>
      createLabel(name, labels, { id: "l2", now: new Date(LATER) });

    it("takes the label-names lease, reads labels, checks, then saves", async () => {
      const fake = fakeDb({ labels: [{ ...stored }] });
      const { labels } = createArtifactDbRepositories(fake.db, testDeps().deps);
      const outcome = await labels.saveChecked(create("Family"));
      expect(outcome.result.ok).toBe(true);
      expect(outcome.stored.map((l) => l.name)).toEqual(["Home"]);
      expect(fake.calls).toEqual([
        "acquire locks/label-names",
        "get labels",
        "set labels/l2",
      ]);
    });

    it("saves nothing when the rule refuses, and returns why", async () => {
      const fake = fakeDb({ labels: [{ ...stored }] });
      const { labels } = createArtifactDbRepositories(fake.db, testDeps().deps);
      const outcome = await labels.saveChecked(create("home"));
      expect(outcome.result.ok).toBe(false);
      expect(fake.calls).not.toContain("set labels/l2");
    });

    it("refuses a second page while the first holds the lease", async () => {
      const fake = fakeDb({ labels: [{ ...stored }] });
      const first = createArtifactDbRepositories(fake.db, testDeps().deps);
      const second = createArtifactDbRepositories(fake.db, {
        ...testDeps().deps,
        holder: "page-2",
      });
      await first.labels.saveChecked(create("Family"));
      await expect(
        second.labels.saveChecked(create("family")),
      ).rejects.toMatchObject({ kind: "conflict" });
      expect(fake.collections.get("labels")?.size).toBe(2);
    });

    it("lets the same page change names again at once", async () => {
      const fake = fakeDb({ labels: [{ ...stored }] });
      const { labels } = createArtifactDbRepositories(fake.db, testDeps().deps);
      await labels.saveChecked(create("Family"));
      const again = await labels.saveChecked((all) =>
        createLabel("Admin", all, { id: "l3", now: new Date(LATER) }),
      );
      expect(again.result.ok).toBe(true);
      expect(again.stored.map((l) => l.name).sort()).toEqual([
        "Family",
        "Home",
      ]);
    });
  });
});
