import { describe, expect, it, vi } from "vitest";
import {
  createServerRepositories,
  type ServerStorageDeps,
} from "../../../src/adapters/storage/server";
import {
  createLabel,
  StorageError,
  type Label,
  type LoadResult,
  type Task,
} from "../../../src/core";
import {
  createAccount,
  emptyAccounts,
  hashKey,
  newAccountId,
  newKey,
  revokeAccount,
  type AccountsFile,
} from "../../../server/accounts";
import { createHandler } from "../../../server/handler";
import { createRateLimiter } from "../../../server/limits";
import { createStore, type Files } from "../../../server/store";

const NOW = new Date("2026-10-27T09:00:00.000Z");
const T0 = "2026-10-27T08:00:00.000Z";
const T1 = "2026-10-27T08:30:00.000Z";

function task(id: string, overrides: Partial<Task> = {}): Task {
  return {
    id,
    text: "Send invoice",
    importance: 60,
    labelId: "l1",
    date: null,
    time: null,
    followUp: false,
    status: "open",
    createdAt: T0,
    updatedAt: T0,
    today: null,
    schemaVersion: 4,
    ...overrides,
  };
}

function memoryFiles(): Files {
  const data = new Map<string, string>();
  return {
    read: (path) => Promise.resolve(data.get(path) ?? null),
    writeWhole: (path, text) => {
      data.set(path, text);
      return Promise.resolve();
    },
  };
}

/**
 * The adapter against the real request handler from step 1, through a fake fetch.
 * `pages` gives one adapter per open page; `polls` holds scheduled poll callbacks.
 */
async function setup() {
  let accounts: AccountsFile = emptyAccounts();
  const key = newKey();
  const made = createAccount(accounts, {
    name: "owner",
    id: newAccountId(),
    keyHash: await hashKey(key),
    now: NOW,
  });
  if (!made.ok) throw new Error("setup");
  accounts = made.value;
  const handle = createHandler({
    loadAccounts: () => Promise.resolve(accounts),
    store: createStore(memoryFiles(), "/data"),
    limits: {
      request: createRateLimiter({
        limit: 1000,
        windowMs: 60_000,
        now: () => NOW,
      }),
      failedKey: createRateLimiter({
        limit: 1000,
        windowMs: 60_000,
        now: () => NOW,
      }),
    },
    now: () => NOW,
    log: () => undefined,
  });
  const calls: string[] = [];
  let offline = false;
  const fetch: ServerStorageDeps["fetch"] = async (url, init) => {
    if (offline) throw new TypeError("Failed to fetch");
    const parsed = new URL(url, "https://matrix.example.com");
    calls.push(`${init.method ?? "GET"} ${parsed.pathname}${parsed.search}`);
    const headers = new Headers(init.headers);
    const res = await handle({
      method: init.method ?? "GET",
      path: parsed.pathname,
      search: parsed.search,
      authorization: headers.get("authorization") ?? undefined,
      body: typeof init.body === "string" ? init.body : "",
      ip: "203.0.113.5",
    });
    return new Response(
      res.json === undefined ? null : JSON.stringify(res.json),
      {
        status: res.status,
      },
    );
  };
  const polls: (() => void)[] = [];
  let visible = true;
  const onVisible: (() => void)[] = [];
  let unauthorized = 0;
  const page = (pageKey = key) =>
    createServerRepositories({
      key: pageKey,
      fetch,
      page: {
        visible: () => visible,
        onVisible: (cb) => onVisible.push(cb),
      },
      schedule: (cb) => polls.push(cb),
      onUnauthorized: () => (unauthorized += 1),
    });
  return {
    page,
    calls,
    polls,
    /** Runs the next scheduled poll and waits for it. */
    poll: async () => {
      const next = polls.shift();
      if (next === undefined) throw new Error("No poll scheduled");
      next();
      await new Promise((r) => setTimeout(r, 0));
      await new Promise((r) => setTimeout(r, 0));
    },
    setVisible: (v: boolean) => {
      visible = v;
      if (v) for (const cb of onVisible) cb();
    },
    setOffline: (v: boolean) => {
      offline = v;
    },
    revoke: () => {
      const r = revokeAccount(accounts, "owner", NOW);
      if (!r.ok) throw new Error("revoke");
      accounts = r.value;
    },
    unauthorized: () => unauthorized,
  };
}

describe("server storage: tasks (#64)", () => {
  it("saves and lists tasks", async () => {
    const { page } = await setup();
    const { tasks } = page();
    await tasks.save(task("t1"));
    expect(await tasks.list()).toEqual({ items: [task("t1")], skipped: 0 });
  });

  it("refuses a stale checked save as a conflict", async () => {
    const { page } = await setup();
    const { tasks } = page();
    await tasks.save(task("t1", { updatedAt: T1 }));
    await expect(
      tasks.saveIfUnchanged(task("t1"), task("t1", { text: "Stale" })),
    ).rejects.toMatchObject({ kind: "conflict" });
  });

  it("deletes a task that is unchanged", async () => {
    const { page } = await setup();
    const { tasks } = page();
    await tasks.save(task("t1"));
    await tasks.deleteIfUnchanged(task("t1"));
    expect((await tasks.list()).items).toEqual([]);
  });
});

describe("server storage: label names (#64)", () => {
  const create = (name: string, id: string) => (stored: readonly Label[]) =>
    createLabel(name, stored, { id, now: NOW });

  it("saves a label whose name is free, returning what it was checked against", async () => {
    const { page } = await setup();
    const { labels } = page();
    await labels.saveChecked(create("Home", "l1"));
    const outcome = await labels.saveChecked(create("Family", "l2"));
    expect(outcome.result.ok).toBe(true);
    expect(outcome.stored.map((l) => l.name)).toEqual(["Home"]);
    expect((await labels.list()).items).toHaveLength(2);
  });

  it("refuses a taken name without saving", async () => {
    const { page } = await setup();
    const { labels } = page();
    await labels.saveChecked(create("Home", "l1"));
    const outcome = await labels.saveChecked(create("home", "l2"));
    expect(outcome.result.ok).toBe(false);
    expect((await labels.list()).items).toHaveLength(1);
  });
});

describe("server storage: errors (#64)", () => {
  it("turns a revoked key into a refused call and tells the app", async () => {
    const { page, revoke, unauthorized } = await setup();
    const { tasks } = page();
    revoke();
    await expect(tasks.list()).rejects.toMatchObject({ kind: "rejected" });
    expect(unauthorized()).toBe(1);
  });

  it("turns a network failure into 'unavailable'", async () => {
    const { page, setOffline } = await setup();
    setOffline(true);
    const error: unknown = await page()
      .tasks.list()
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(StorageError);
    expect(error).toMatchObject({ kind: "unavailable" });
  });

  it("turns a full account into 'full'", async () => {
    const { page } = await setup();
    const { labels } = page();
    for (let i = 0; i < 200; i += 1) {
      await labels.save({
        id: `l${String(i)}`,
        name: `N${String(i)}`,
        archived: false,
        color: "green",
        createdAt: T0,
        updatedAt: T0,
        schemaVersion: 2,
      });
    }
    await expect(
      labels.save({
        id: "extra",
        name: "Extra",
        archived: false,
        color: "green",
        createdAt: T0,
        updatedAt: T0,
        schemaVersion: 2,
      }),
    ).rejects.toMatchObject({ kind: "full" });
  });
});

describe("server storage: polling for changes (#64)", () => {
  it("delivers changes saved on another device at the next poll", async () => {
    const env = await setup();
    const phone = env.page();
    const laptop = env.page();
    await phone.tasks.list();
    const seen: LoadResult<Task>[] = [];
    phone.tasks.watch(
      (r) => seen.push(r),
      () => undefined,
    );
    await laptop.tasks.save(task("t9"));
    await env.poll();
    await vi.waitFor(() => {
      expect(seen.at(-1)?.items).toEqual([task("t9")]);
    });
  });

  it("asks only for what changed since the last revision", async () => {
    const env = await setup();
    const { tasks } = env.page();
    await tasks.list();
    tasks.watch(
      () => undefined,
      () => undefined,
    );
    await env.poll();
    await vi.waitFor(() => {
      expect(env.calls.at(-1)).toBe("GET /api/data?since=0");
    });
  });

  it("does not poll while the page is hidden, and polls at once when shown", async () => {
    const env = await setup();
    const { tasks } = env.page();
    tasks.watch(
      () => undefined,
      () => undefined,
    );
    env.setVisible(false);
    const before = env.calls.length;
    await env.poll();
    expect(env.calls.length).toBe(before);
    env.setVisible(true);
    await vi.waitFor(() => {
      expect(env.calls.length).toBe(before + 1);
    });
  });

  it("stops for good when the key is revoked", async () => {
    const env = await setup();
    const { tasks } = env.page();
    const stopped: StorageError[] = [];
    tasks.watch(
      () => undefined,
      (e) => stopped.push(e),
    );
    env.revoke();
    await env.poll();
    await vi.waitFor(() => {
      expect(stopped).toHaveLength(1);
    });
    expect(env.polls).toHaveLength(0);
  });

  it("keeps polling through a network failure", async () => {
    const env = await setup();
    const { tasks } = env.page();
    const stopped: StorageError[] = [];
    tasks.watch(
      () => undefined,
      (e) => stopped.push(e),
    );
    env.setOffline(true);
    await env.poll();
    await vi.waitFor(() => {
      expect(env.polls).toHaveLength(1);
    });
    expect(stopped).toEqual([]);
  });
});
