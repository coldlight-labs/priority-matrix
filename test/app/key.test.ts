import { describe, expect, it } from "vitest";
import { KEY_STORAGE, takeKey, type KeyStorage } from "../../src/app/key";

const KEY = "A".repeat(20) + "b_c-" + "9".repeat(19);

function memory(initial: Record<string, string> = {}): KeyStorage & {
  data: Record<string, string>;
} {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => data[k] ?? null,
    setItem: (k, v) => {
      data[k] = v;
    },
  };
}

describe("taking the key from the link (#64)", () => {
  it("reads a key from #key=, keeps it on the device and clears the address", () => {
    const storage = memory();
    const cleared: string[] = [];
    const key = takeKey(`#key=${KEY}`, storage, () => cleared.push("x"));
    expect(key).toBe(KEY);
    expect(storage.data[KEY_STORAGE]).toBe(KEY);
    expect(cleared).toEqual(["x"]);
  });

  it("uses the key kept on the device when the address has none", () => {
    const storage = memory({ [KEY_STORAGE]: KEY });
    expect(takeKey("", storage, () => undefined)).toBe(KEY);
  });

  it("lets a new link replace the kept key", () => {
    const other = "Z".repeat(43);
    const storage = memory({ [KEY_STORAGE]: KEY });
    expect(takeKey(`#key=${other}`, storage, () => undefined)).toBe(other);
    expect(storage.data[KEY_STORAGE]).toBe(other);
  });

  it("ignores a malformed key, in the address or kept", () => {
    expect(takeKey("#key=short", memory(), () => undefined)).toBeNull();
    expect(
      takeKey("", memory({ [KEY_STORAGE]: "bad key!" }), () => undefined),
    ).toBeNull();
  });

  it("still works for this visit when storage is blocked", () => {
    const blocked: KeyStorage = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    expect(takeKey(`#key=${KEY}`, blocked, () => undefined)).toBe(KEY);
    expect(takeKey("", blocked, () => undefined)).toBeNull();
    expect(takeKey(`#key=${KEY}`, null, () => undefined)).toBe(KEY);
  });

  it("leaves other address fragments alone", () => {
    const cleared: string[] = [];
    expect(takeKey("#section", memory(), () => cleared.push("x"))).toBeNull();
    expect(cleared).toEqual([]);
  });
});
