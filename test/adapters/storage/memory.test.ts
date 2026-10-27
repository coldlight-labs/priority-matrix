import { describe, expect, it } from "vitest";
import { createMemoryRepositories } from "../../../src/adapters/storage/memory";
import {
  archiveLabel,
  createLabel,
  createTask,
  type Label,
  type Task,
} from "../../../src/core";

const NOW = new Date("2026-10-23T09:00:00.000Z");
const LATER = new Date("2026-10-23T10:00:00.000Z");

function aLabel(): Label {
  const result = createLabel("Jobs", [], { id: "l1", now: NOW });
  if (!result.ok) throw new Error("test setup");
  return result.value;
}

function aTask(label: Label): Task {
  const result = createTask(
    {
      text: "Send invoice",
      importance: 60,
      labelId: label.id,
      date: "2026-10-30",
      time: "",
      followUp: false,
    },
    [label],
    { id: "t1", now: NOW },
  );
  if (!result.ok) throw new Error("test setup");
  return result.value;
}

describe("memory repositories", () => {
  it("starts empty", async () => {
    const { tasks, labels } = createMemoryRepositories();
    expect(await tasks.list()).toEqual({ items: [], skipped: 0 });
    expect(await labels.list()).toEqual({ items: [], skipped: 0 });
  });

  it("saves and loads a task and a label", async () => {
    const { tasks, labels } = createMemoryRepositories();
    const label = aLabel();
    const task = aTask(label);
    await labels.save(label);
    await tasks.save(task);
    expect((await labels.list()).items).toEqual([label]);
    expect((await tasks.list()).items).toEqual([task]);
  });

  it("replaces an item saved again with the same id", async () => {
    const { tasks } = createMemoryRepositories();
    const task = aTask(aLabel());
    await tasks.save(task);
    await tasks.save({ ...task, status: "done" });
    expect((await tasks.list()).items).toEqual([{ ...task, status: "done" }]);
  });

  it("keeps an archived label and its tasks", async () => {
    const { tasks, labels } = createMemoryRepositories();
    const label = aLabel();
    const task = aTask(label);
    await labels.save(label);
    await tasks.save(task);
    await labels.save(archiveLabel(label, LATER));
    expect((await labels.list()).items).toEqual([
      { ...label, archived: true, updatedAt: LATER.toISOString() },
    ]);
    expect((await tasks.list()).items).toEqual([task]);
  });

  it("returns copies, so changing a loaded item does not change storage", async () => {
    const { labels } = createMemoryRepositories();
    await labels.save(aLabel());
    const [loaded] = (await labels.list()).items;
    (loaded as { name: string }).name = "Changed";
    expect((await labels.list()).items[0]?.name).toBe("Jobs");
  });

  it("tells watchers about every save, and stops when asked (#28)", async () => {
    const { labels } = createMemoryRepositories();
    const seen: string[][] = [];
    const stop = labels.watch(
      (result) => seen.push(result.items.map((l) => l.name)),
      () => undefined,
    );
    await Promise.resolve();
    expect(seen).toEqual([[]]);
    await labels.save(aLabel());
    await Promise.resolve();
    expect(seen).toEqual([[], ["Jobs"]]);
    stop();
    await labels.save({ ...aLabel(), name: "Renamed" });
    await Promise.resolve();
    expect(seen).toHaveLength(2);
  });

  it("saves only when the stored task is the one loaded (#34)", async () => {
    const { tasks } = createMemoryRepositories();
    const loaded = aTask(aLabel());
    await tasks.save(loaded);
    const edited = {
      ...loaded,
      text: "Edited",
      updatedAt: LATER.toISOString(),
    };
    await tasks.saveIfUnchanged(loaded, edited);
    expect((await tasks.list()).items[0]?.text).toBe("Edited");
    await expect(
      tasks.saveIfUnchanged(loaded, { ...loaded, text: "Stale" }),
    ).rejects.toMatchObject({ kind: "conflict" });
    expect((await tasks.list()).items[0]?.text).toBe("Edited");
  });

  it("deletes only when the stored task is the one loaded (#54)", async () => {
    const { tasks } = createMemoryRepositories();
    const loaded = aTask(aLabel());
    await tasks.save(loaded);
    const revived = {
      ...loaded,
      text: "Revived",
      updatedAt: LATER.toISOString(),
    };
    await tasks.save(revived);
    await expect(tasks.deleteIfUnchanged(loaded)).rejects.toMatchObject({
      kind: "conflict",
    });
    expect((await tasks.list()).items).toHaveLength(1);
    await tasks.deleteIfUnchanged(revived);
    expect((await tasks.list()).items).toEqual([]);
  });

  it("tells watchers about a delete (#54)", async () => {
    const { tasks } = createMemoryRepositories();
    const loaded = aTask(aLabel());
    await tasks.save(loaded);
    const seen: number[] = [];
    tasks.watch(
      (r) => seen.push(r.items.length),
      () => undefined,
    );
    await Promise.resolve();
    await tasks.deleteIfUnchanged(loaded);
    await Promise.resolve();
    expect(seen.at(-1)).toBe(0);
  });

  it("saves a label only when the name rule passes on the stored labels (#56)", async () => {
    const { labels } = createMemoryRepositories();
    await labels.save(aLabel());
    const refused = await labels.saveChecked((all) =>
      createLabel("jobs", all, { id: "l2", now: NOW }),
    );
    expect(refused.result.ok).toBe(false);
    expect(refused.stored.map((l) => l.name)).toEqual(["Jobs"]);
    const saved = await labels.saveChecked((all) =>
      createLabel("Home", all, { id: "l2", now: NOW }),
    );
    expect(saved.result.ok).toBe(true);
    expect((await labels.list()).items).toHaveLength(2);
  });
});
