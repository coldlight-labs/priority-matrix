import { describe, expect, it } from "vitest";
import type { Label, LabelRepository } from "../../src/core";
import { SEED_LABELS } from "../../src/core/label";
import { seedLabelId, seedLabelsIfEmpty } from "../../src/core/seed";

const NOW = new Date("2026-10-23T09:00:00.000Z");

/** Minimal in-test repository so core is tested without any adapter. */
function fakeRepo(initial: Label[] = [], skipped = 0) {
  const store = new Map(initial.map((l) => [l.id, l]));
  const repo: LabelRepository = {
    list: () => Promise.resolve({ items: [...store.values()], skipped }),
    save: (label) => {
      store.set(label.id, label);
      return Promise.resolve();
    },
    watch: () => () => undefined,
    // Seeding never sets names through the checked save.
    saveChecked: () => Promise.reject(new Error("not used by seeding")),
  };
  return { repo, store };
}

describe("seedLabelId", () => {
  it.each([
    ["Work", "seed-work"],
    ["Side project", "seed-side-project"],
    ["Learning", "seed-learning"],
    ["Weekly review", "seed-weekly-review"],
  ])("%s -> %s", (name, id) => {
    expect(seedLabelId(name)).toBe(id);
  });

  it("gives every seed name a different id", () => {
    const ids = SEED_LABELS.map((l) => seedLabelId(l.name));
    expect(new Set(ids).size).toBe(SEED_LABELS.length);
  });
});

describe("seedLabelsIfEmpty", () => {
  it("creates the 9 seed labels with their colors in an empty store", async () => {
    const { repo, store } = fakeRepo();
    expect(await seedLabelsIfEmpty(repo, NOW)).toBe(9);
    expect([...store.values()].map((l) => [l.name, l.color])).toEqual(
      SEED_LABELS.map((l) => [l.name, l.color]),
    );
    expect(store.get("seed-work")?.archived).toBe(false);
  });

  it("leaves a store with labels untouched", async () => {
    const mine: Label = {
      id: "l1",
      name: "Mine",
      archived: true,
      color: "teal",
      createdAt: NOW.toISOString(),
      updatedAt: NOW.toISOString(),
      schemaVersion: 2,
    };
    const { repo, store } = fakeRepo([mine]);
    expect(await seedLabelsIfEmpty(repo, NOW)).toBe(0);
    expect([...store.keys()]).toEqual(["l1"]);
  });

  it("does nothing when invalid label documents were skipped", async () => {
    const { repo, store } = fakeRepo([], 1);
    expect(await seedLabelsIfEmpty(repo, NOW)).toBe(0);
    expect(store.size).toBe(0);
  });

  it("creates no duplicates when two devices seed at once", async () => {
    const { repo, store } = fakeRepo();
    await Promise.all([
      seedLabelsIfEmpty(repo, NOW),
      seedLabelsIfEmpty(repo, NOW),
    ]);
    expect(store.size).toBe(9);
  });
});

describe("starter labels for new accounts (#64)", () => {
  it("are Work, Home, Personal, Health and Money, each a different color", async () => {
    const { starterLabels } = await import("../../src/core/seed");
    const { swatchOf } = await import("../../src/core/palette");
    let n = 0;
    const labels = starterLabels(NOW, () => `s${String(++n)}`);
    expect(labels.map((l) => l.name)).toEqual([
      "Work",
      "Home",
      "Personal",
      "Health",
      "Money",
    ]);
    expect(new Set(labels.map((l) => l.color)).size).toBe(5);
    const shapes = labels.map((l) => swatchOf(l.color)?.shape);
    expect(shapes).not.toContain(undefined);
    expect(labels.map((l) => l.id)).toEqual(["s1", "s2", "s3", "s4", "s5"]);
  });
});
