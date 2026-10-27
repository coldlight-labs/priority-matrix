import { describe, expect, it } from "vitest";
import { createStore, type Files } from "../../server/store";

const ID = "0123456789abcdef0123456789abcdef";

/** In-memory files; `writes` lists every whole-file write, in order. */
function memoryFiles(): Files & {
  data: Map<string, string>;
  writes: string[];
} {
  const data = new Map<string, string>();
  const writes: string[] = [];
  return {
    data,
    writes,
    read: (path) => Promise.resolve(data.get(path) ?? null),
    writeWhole: (path, text) => {
      writes.push(path);
      data.set(path, text);
      return Promise.resolve();
    },
  };
}

describe("account store (#62)", () => {
  it("starts an account empty, at revision 0", async () => {
    const store = createStore(memoryFiles(), "/data");
    expect(await store.read(ID)).toEqual({
      revision: 0,
      tasks: {},
      labels: {},
    });
  });

  it("writes one file per account and raises the revision on each change", async () => {
    const files = memoryFiles();
    const store = createStore(files, "/data");
    await store.update(ID, (data) => {
      data.tasks.t1 = { id: "t1" };
      return { changed: true, value: undefined };
    });
    expect(files.writes).toEqual([`/data/accounts/${ID}.json`]);
    expect((await store.read(ID)).revision).toBe(1);
  });

  it("writes nothing when an update changes nothing", async () => {
    const files = memoryFiles();
    const store = createStore(files, "/data");
    await store.update(ID, () => ({ changed: false, value: undefined }));
    expect(files.writes).toEqual([]);
  });

  it("runs updates for one account one at a time", async () => {
    const store = createStore(memoryFiles(), "/data");
    const seen: number[] = [];
    await Promise.all(
      [1, 2, 3].map((n) =>
        store.update(ID, (data) => {
          seen.push(data.revision);
          data.tasks[`t${String(n)}`] = { id: `t${String(n)}` };
          return { changed: true, value: undefined };
        }),
      ),
    );
    expect(seen).toEqual([0, 1, 2]);
    expect(Object.keys((await store.read(ID)).tasks)).toHaveLength(3);
  });

  it("keeps going after an update throws", async () => {
    const store = createStore(memoryFiles(), "/data");
    await expect(
      store.update(ID, () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    await store.update(ID, (data) => {
      data.labels.l1 = { id: "l1" };
      return { changed: true, value: undefined };
    });
    expect((await store.read(ID)).revision).toBe(1);
  });

  it("refuses an account id that is not a server id (no path tricks)", async () => {
    const store = createStore(memoryFiles(), "/data");
    await expect(store.read("../accounts")).rejects.toThrow();
    await expect(
      store.update("ABC", () => ({ changed: false, value: undefined })),
    ).rejects.toThrow();
  });

  it("refuses a corrupt data file rather than starting empty", async () => {
    const files = memoryFiles();
    files.data.set(`/data/accounts/${ID}.json`, "{not json");
    const store = createStore(files, "/data");
    await expect(store.read(ID)).rejects.toThrow();
  });

  it("keeps a stored __proto__ key as plain data", async () => {
    const files = memoryFiles();
    files.data.set(
      `/data/accounts/${ID}.json`,
      '{"revision":1,"tasks":{"__proto__":{"polluted":true}},"labels":{}}',
    );
    const store = createStore(files, "/data");
    const data = await store.read(ID);
    expect(Object.keys(data.tasks)).toEqual(["__proto__"]);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(data.tasks.polluted).toBeUndefined();
  });
});
