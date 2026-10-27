// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import {
  mountThemeToggle,
  startTheme,
  type ThemeStorage,
} from "../../src/app/theme";

function memoryStorage(initial: Record<string, string> = {}): ThemeStorage & {
  data: Record<string, string>;
} {
  const data = { ...initial };
  return {
    data,
    getItem: (key) => data[key] ?? null,
    setItem: (key, value) => {
      data[key] = value;
    },
  };
}

const blocked: ThemeStorage = {
  getItem: () => {
    throw new Error("blocked");
  },
  setItem: () => {
    throw new Error("blocked");
  },
};

describe("startTheme", () => {
  it("follows the device when nothing is remembered", () => {
    expect(startTheme(memoryStorage(), true)).toBe("dark");
    expect(startTheme(memoryStorage(), false)).toBe("light");
  });

  it("uses the remembered choice over the device", () => {
    const storage = memoryStorage({ "priority-matrix-theme": "light" });
    expect(startTheme(storage, true)).toBe("light");
  });

  it("ignores an unknown stored value and blocked storage", () => {
    const odd = memoryStorage({ "priority-matrix-theme": "purple" });
    expect(startTheme(odd, true)).toBe("dark");
    expect(startTheme(blocked, false)).toBe("light");
    expect(startTheme(null, true)).toBe("dark");
  });
});

describe("theme toggle", () => {
  function setup(storage: ThemeStorage | null, prefersDark: boolean) {
    document.body.replaceChildren();
    const container = document.createElement("div");
    document.body.append(container);
    const root = document.createElement("div");
    mountThemeToggle(container, { root, storage, prefersDark });
    const button = container.querySelector("button");
    if (button === null) throw new Error("no button");
    return { root, button };
  }

  it("starts dark on a dark device and offers light", () => {
    const { root, button } = setup(memoryStorage(), true);
    expect(root.dataset.theme).toBe("dark");
    expect(button.textContent).toBe("☀ Light");
    expect(button.getAttribute("aria-label")).toBe("Switch to light mode");
  });

  it("switches and remembers the choice", () => {
    const storage = memoryStorage();
    const { root, button } = setup(storage, true);
    button.click();
    expect(root.dataset.theme).toBe("light");
    expect(button.textContent).toBe("☾ Dark");
    expect(storage.data["priority-matrix-theme"]).toBe("light");
    button.click();
    expect(root.dataset.theme).toBe("dark");
  });

  it("still switches when storage is blocked", () => {
    const { root, button } = setup(blocked, false);
    button.click();
    expect(root.dataset.theme).toBe("dark");
  });
});
