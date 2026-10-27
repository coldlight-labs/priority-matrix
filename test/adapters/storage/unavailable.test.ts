import { describe, expect, it } from "vitest";
import { createUnavailableRepositories } from "../../../src/adapters/storage/unavailable";
import type { Task } from "../../../src/core";

describe("unavailable repositories", () => {
  it("load nothing", async () => {
    const { tasks, labels } = createUnavailableRepositories();
    expect(await tasks.list()).toEqual({ items: [], skipped: 0 });
    expect(await labels.list()).toEqual({ items: [], skipped: 0 });
  });

  it("refuse every save with an unavailable StorageError", async () => {
    const { tasks } = createUnavailableRepositories();
    await expect(tasks.save({ id: "t1" } as Task)).rejects.toMatchObject({
      name: "StorageError",
      kind: "unavailable",
    });
    const t = { id: "t1" } as Task;
    await expect(tasks.saveIfUnchanged(t, t)).rejects.toMatchObject({
      kind: "unavailable",
    });
    await expect(tasks.deleteIfUnchanged(t)).rejects.toMatchObject({
      kind: "unavailable",
    });
    const { labels } = createUnavailableRepositories();
    await expect(
      labels.saveChecked(() => {
        throw new Error("never called");
      }),
    ).rejects.toMatchObject({ kind: "unavailable" });
  });

  it("watching does nothing and can be stopped", () => {
    const { tasks } = createUnavailableRepositories();
    let calls = 0;
    const stop = tasks.watch(
      () => (calls += 1),
      () => (calls += 1),
    );
    stop();
    expect(calls).toBe(0);
  });
});
