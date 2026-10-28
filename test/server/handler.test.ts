import { describe, expect, it } from "vitest";
import type { Label, Task } from "../../src/core";
import {
  createAccount,
  createReadOnlyKey,
  emptyAccounts,
  hashKey,
  newAccountId,
  newKey,
  newReadOnlyKeyId,
  revokeReadOnlyKey,
  revokeAccount,
  type AccountsFile,
} from "../../server/accounts";
import {
  createHandler,
  MAX_BODY_BYTES,
  MAX_LABELS,
  type ApiRequest,
} from "../../server/handler";
import { createRateLimiter } from "../../server/limits";
import { createStore, type Files } from "../../server/store";

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

function label(
  id: string,
  name: string,
  overrides: Partial<Label> = {},
): Label {
  return {
    id,
    name,
    archived: false,
    color: "green",
    createdAt: T0,
    updatedAt: T0,
    schemaVersion: 2,
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

/** A handler with two accounts (owner, tester) and generous limits unless given. */
async function setup(limit = 1000) {
  let accounts: AccountsFile = emptyAccounts();
  const keys: Record<string, string> = {};
  for (const name of ["owner", "tester"]) {
    const key = newKey();
    keys[name] = key;
    const made = createAccount(accounts, {
      name,
      id: newAccountId(),
      keyHash: await hashKey(key),
      now: NOW,
    });
    if (!made.ok) throw new Error("setup");
    accounts = made.value;
  }
  const logs: Record<string, unknown>[] = [];
  const handle = createHandler({
    loadAccounts: () => Promise.resolve(accounts),
    store: createStore(memoryFiles(), "/data"),
    limits: {
      request: createRateLimiter({ limit, windowMs: 60_000, now: () => NOW }),
      failedKey: createRateLimiter({
        limit: 3,
        windowMs: 60_000,
        now: () => NOW,
      }),
    },
    now: () => NOW,
    log: (entry) => logs.push(entry),
  });
  const call = (
    who: string | null,
    method: string,
    path: string,
    body?: unknown,
    ip = "203.0.113.5",
  ) => {
    const [pathOnly = "", query] = path.split("?");
    const request: ApiRequest = {
      method,
      path: pathOnly,
      search: query === undefined ? "" : `?${query}`,
      authorization: who === null ? undefined : `Bearer ${keys[who] ?? who}`,
      body: body === undefined ? "" : JSON.stringify(body),
      ip,
    };
    return handle(request);
  };
  const addReadOnlyKey = async (name: string) => {
    const key = newKey();
    const id = newReadOnlyKeyId();
    const added = createReadOnlyKey(accounts, {
      name,
      id,
      keyHash: await hashKey(key),
      now: NOW,
    });
    if (!added.ok) throw new Error("add read-only key");
    accounts = added.value;
    keys[`read-only-${name}`] = key;
    return id;
  };
  const revokeReadOnly = (name: string, id: string) => {
    const revoked = revokeReadOnlyKey(accounts, name, id, NOW);
    if (!revoked.ok) throw new Error("revoke read-only key");
    accounts = revoked.value;
  };
  return {
    call,
    logs,
    addReadOnlyKey,
    revokeReadOnly,
    revoke: (name: string) => {
      const r = revokeAccount(accounts, name, NOW);
      if (!r.ok) throw new Error("revoke");
      accounts = r.value;
    },
  };
}

describe("keys (#62)", () => {
  it("refuses a request with no key or an unknown key, saying nothing more", async () => {
    const { call } = await setup();
    for (const who of [null, "not-a-real-key"]) {
      const res = await call(who, "GET", "/api/data");
      expect(res.status).toBe(401);
      expect(res.json).toEqual({ error: "unauthorized" });
    }
  });

  it("refuses a revoked key at once", async () => {
    const { call, revoke } = await setup();
    expect((await call("tester", "GET", "/api/data")).status).toBe(200);
    revoke("tester");
    expect((await call("tester", "GET", "/api/data")).status).toBe(401);
  });

  it("slows down an address that keeps sending wrong keys", async () => {
    const { call } = await setup();
    for (let i = 0; i < 3; i += 1) await call("wrong", "GET", "/api/data");
    expect((await call("wrong", "GET", "/api/data")).status).toBe(429);
    // A correct key from another address still works.
    expect(
      (await call("owner", "GET", "/api/data", undefined, "198.51.100.7"))
        .status,
    ).toBe(200);
  });

  it("logs the route and status, never a key or task text", async () => {
    const { call, logs } = await setup();
    await call(
      "owner",
      "PUT",
      "/api/tasks/t1",
      task("t1", { text: "Secret plan" }),
    );
    await call("wrong-key-value", "GET", "/api/data");
    const text = JSON.stringify(logs);
    expect(text).not.toContain("Secret plan");
    expect(text).not.toContain("wrong-key-value");
    expect(logs[0]).toMatchObject({ route: "PUT /api/tasks/:id", status: 200 });
  });
});

describe("read-only keys (#7)", () => {
  it("reads the account data and refuses every task or label mutation", async () => {
    const { call, addReadOnlyKey } = await setup();
    await addReadOnlyKey("owner");
    await call("owner", "PUT", "/api/tasks/t1", task("t1"));
    const before = await call("read-only-owner", "GET", "/api/data");
    expect(before.status).toBe(200);
    expect(before.json).toMatchObject({ tasks: [{ id: "t1" }] });

    const writes: [string, string, unknown][] = [
      ["PUT", "/api/tasks/t1", task("t1", { text: "Changed" })],
      [
        "POST",
        "/api/tasks/t1/save-if-unchanged",
        { loaded: task("t1"), updated: task("t1", { text: "Changed" }) },
      ],
      ["POST", "/api/tasks/t1/delete-if-unchanged", { loaded: task("t1") }],
      ["PUT", "/api/labels/l1", label("l1", "Work")],
      [
        "POST",
        "/api/labels/l1/save-if-name-free",
        { label: label("l1", "Work") },
      ],
    ];
    for (const [method, path, body] of writes) {
      expect((await call("read-only-owner", method, path, body)).status).toBe(
        403,
      );
    }
    expect((await call("owner", "GET", "/api/data")).json).toEqual(before.json);
  });

  it("stops accepting a read-only key immediately after revocation", async () => {
    const { call, addReadOnlyKey, revokeReadOnly } = await setup();
    const keyId = await addReadOnlyKey("owner");
    expect((await call("read-only-owner", "GET", "/api/data")).status).toBe(
      200,
    );
    revokeReadOnly("owner", keyId);
    expect((await call("read-only-owner", "GET", "/api/data")).status).toBe(
      401,
    );
  });
});

describe("separate accounts (#62)", () => {
  it("never shows one account's tasks to another", async () => {
    const { call } = await setup();
    await call("owner", "PUT", "/api/tasks/t1", task("t1"));
    const tester = await call("tester", "GET", "/api/data");
    expect(tester.json).toMatchObject({ tasks: [], labels: [] });
    const owner = await call("owner", "GET", "/api/data");
    expect(owner.json).toMatchObject({ tasks: [task("t1")] });
  });
});

describe("reading (#62)", () => {
  it("returns tasks, labels and the revision", async () => {
    const { call } = await setup();
    await call("owner", "PUT", "/api/labels/l1", label("l1", "Home"));
    const res = await call("owner", "GET", "/api/data");
    expect(res.json).toEqual({
      revision: 1,
      tasks: [],
      labels: [label("l1", "Home")],
      skipped: 0,
    });
  });

  it("says nothing changed when asked since the current revision", async () => {
    const { call } = await setup();
    await call("owner", "PUT", "/api/tasks/t1", task("t1"));
    expect((await call("owner", "GET", "/api/data?since=1")).json).toEqual({
      revision: 1,
      changed: false,
    });
    expect(
      (await call("owner", "GET", "/api/data?since=0")).json,
    ).toMatchObject({
      revision: 1,
      tasks: [task("t1")],
    });
  });
});

describe("saving (#62)", () => {
  it("refuses a document core's rules reject, or whose id is not the path's", async () => {
    const { call } = await setup();
    expect(
      (
        await call("owner", "PUT", "/api/tasks/t1", {
          ...task("t1"),
          importance: 900,
        })
      ).status,
    ).toBe(400);
    expect(
      (await call("owner", "PUT", "/api/tasks/t2", task("t1"))).status,
    ).toBe(400);
    expect((await call("owner", "PUT", "/api/tasks/t1", "nope")).status).toBe(
      400,
    );
  });

  it("refuses a body over the size limit", async () => {
    const { call } = await setup();
    const big = { ...task("t1"), text: "x".repeat(MAX_BODY_BYTES) };
    expect((await call("owner", "PUT", "/api/tasks/t1", big)).status).toBe(413);
  });

  it("refuses a new label past the per-account limit, but still updates one", async () => {
    const { call } = await setup();
    for (let i = 0; i < MAX_LABELS; i += 1) {
      await call(
        "owner",
        "PUT",
        `/api/labels/l${String(i)}`,
        label(`l${String(i)}`, `N${String(i)}`),
      );
    }
    expect(
      (await call("owner", "PUT", "/api/labels/extra", label("extra", "Extra")))
        .status,
    ).toBe(413);
    expect(
      (await call("owner", "PUT", "/api/labels/l0", label("l0", "Renamed")))
        .status,
    ).toBe(200);
  });
});

describe("checked task saves (#62)", () => {
  it("saves only when the stored task is the one loaded", async () => {
    const { call } = await setup();
    await call("owner", "PUT", "/api/tasks/t1", task("t1"));
    const edited = task("t1", { text: "Edited", updatedAt: T1 });
    const ok = await call("owner", "POST", "/api/tasks/t1/save-if-unchanged", {
      loaded: task("t1"),
      updated: edited,
    });
    expect(ok.status).toBe(200);
    const stale = await call(
      "owner",
      "POST",
      "/api/tasks/t1/save-if-unchanged",
      {
        loaded: task("t1"),
        updated: task("t1", { text: "Stale", updatedAt: T1 }),
      },
    );
    expect(stale.status).toBe(409);
    expect(stale.json).toEqual({ error: "conflict" });
  });

  it("deletes only when unchanged, and treats a missing task as deleted", async () => {
    const { call } = await setup();
    await call("owner", "PUT", "/api/tasks/t1", task("t1", { updatedAt: T1 }));
    const refused = await call(
      "owner",
      "POST",
      "/api/tasks/t1/delete-if-unchanged",
      {
        loaded: task("t1"),
      },
    );
    expect(refused.status).toBe(409);
    const ok = await call(
      "owner",
      "POST",
      "/api/tasks/t1/delete-if-unchanged",
      {
        loaded: task("t1", { updatedAt: T1 }),
      },
    );
    expect(ok.status).toBe(200);
    expect((await call("owner", "GET", "/api/data")).json).toMatchObject({
      tasks: [],
    });
    const again = await call(
      "owner",
      "POST",
      "/api/tasks/t1/delete-if-unchanged",
      {
        loaded: task("t1", { updatedAt: T1 }),
      },
    );
    expect(again.status).toBe(200);
  });
});

describe("label names (#62)", () => {
  it("saves a label whose name is free, returning the labels it was checked against", async () => {
    const { call } = await setup();
    await call("owner", "PUT", "/api/labels/l1", label("l1", "Home"));
    const res = await call(
      "owner",
      "POST",
      "/api/labels/l2/save-if-name-free",
      {
        label: label("l2", "Family"),
      },
    );
    expect(res.status).toBe(200);
    expect(res.json).toMatchObject({ ok: true, labels: [label("l1", "Home")] });
  });

  it("refuses a name an active label has, saving nothing", async () => {
    const { call } = await setup();
    await call("owner", "PUT", "/api/labels/l1", label("l1", "Home"));
    const res = await call(
      "owner",
      "POST",
      "/api/labels/l2/save-if-name-free",
      {
        label: label("l2", "home"),
      },
    );
    expect(res.json).toMatchObject({ ok: false });
    const data = await call("owner", "GET", "/api/data");
    expect((data.json as { labels: unknown[] }).labels).toHaveLength(1);
  });

  it("does not count another account's label names", async () => {
    const { call } = await setup();
    await call("tester", "PUT", "/api/labels/l1", label("l1", "Home"));
    const res = await call(
      "owner",
      "POST",
      "/api/labels/l9/save-if-name-free",
      {
        label: label("l9", "Home"),
      },
    );
    expect(res.json).toMatchObject({ ok: true });
  });
});

describe("other requests (#62)", () => {
  it("answers unknown paths with 404 and wrong methods with 405", async () => {
    const { call } = await setup();
    expect((await call("owner", "GET", "/api/nothing")).status).toBe(404);
    expect((await call("owner", "DELETE", "/api/data")).status).toBe(405);
  });

  it("limits requests per account", async () => {
    const { call } = await setup(2);
    await call("owner", "GET", "/api/data");
    await call("owner", "GET", "/api/data");
    expect((await call("owner", "GET", "/api/data")).status).toBe(429);
  });

  it("refuses ids other than letters, digits and dashes (no __proto__ tricks)", async () => {
    const { call } = await setup();
    const res = await call(
      "owner",
      "PUT",
      "/api/tasks/__proto__",
      task("__proto__"),
    );
    expect(res.status).toBe(404);
    expect(({} as Record<string, unknown>).text).toBeUndefined();
  });
});
