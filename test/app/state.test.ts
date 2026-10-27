import { describe, expect, it } from "vitest";
import {
  chooseStorage,
  skippedMessage,
  storageMessage,
  storageModeText,
  upsert,
} from "../../src/app/state";
import { StorageError } from "../../src/core";

describe("upsert", () => {
  it("adds a new item at the end", () => {
    expect(upsert([{ id: "a" }], { id: "b" })).toEqual([
      { id: "a" },
      { id: "b" },
    ]);
  });

  it("replaces the item with the same id in place", () => {
    const list = [
      { id: "a", v: 1 },
      { id: "b", v: 1 },
    ];
    expect(upsert(list, { id: "a", v: 2 })).toEqual([
      { id: "a", v: 2 },
      { id: "b", v: 1 },
    ]);
    expect(list[0]?.v).toBe(1);
  });
});

describe("storageMessage", () => {
  it.each([
    ["full", "Couldn't save: storage is full."],
    ["unavailable", "Couldn't reach storage. Try again in a moment."],
    [
      "rejected",
      "Couldn't save: storage refused the change. Check that you can edit this page.",
    ],
    [
      "conflict",
      "This task changed on another device. The page now shows the latest version; make your change again.",
    ],
  ] as const)("explains a %s error", (kind, message) => {
    expect(storageMessage(new StorageError(kind, "x"))).toBe(message);
  });

  it("has a fallback for other errors", () => {
    expect(storageMessage(new Error("boom"))).toBe(
      "Something went wrong. Try again.",
    );
  });
});

describe("skippedMessage", () => {
  it.each([
    [0, null],
    [1, "1 saved item could not be read and was skipped."],
    [3, "3 saved items could not be read and were skipped."],
  ])("%d skipped -> %j", (n, message) => {
    expect(skippedMessage(n)).toBe(message);
  });
});

describe("chooseStorage", () => {
  it.each([
    [false, false, "memory"],
    [false, true, "memory"],
    [true, true, "artifact"],
    [true, false, "unavailable"],
  ] as const)("inside claude.ai %s, db %s -> %s", (inside, db, mode) => {
    expect(chooseStorage(inside, db)).toBe(mode);
  });

  it("uses the self-hosted server in the site build, wherever it runs (#64)", () => {
    expect(chooseStorage(false, false, true)).toBe("server");
    expect(chooseStorage(true, true, true)).toBe("server");
  });
});

describe("storageModeText", () => {
  it("warns clearly when storage is unavailable", () => {
    expect(storageModeText("unavailable")).toBe(
      "Storage isn't available, so nothing can be saved. Reload the page.",
    );
  });
});
