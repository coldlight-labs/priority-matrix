// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { mountTabs, startTab, type TabStorage } from "../../src/app/tabs";

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  const storage: TabStorage = {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
  };
  return { storage, data };
}

const throwing: TabStorage = {
  getItem: () => {
    throw new Error("blocked");
  },
  setItem: () => {
    throw new Error("blocked");
  },
};

function setup(storage: TabStorage | null) {
  document.body.replaceChildren();
  const container = document.createElement("div");
  const panels = {
    board: document.createElement("div"),
    ideas: document.createElement("div"),
    graveyard: document.createElement("div"),
  };
  document.body.append(container, ...Object.values(panels));
  const tabs = mountTabs(container, { storage, panels });
  const tab = (name: string) => {
    const el = document.getElementById(`tab-${name}`);
    if (!(el instanceof HTMLButtonElement))
      throw new Error(`Missing tab ${name}`);
    return el;
  };
  return { tabs, panels, tab };
}

describe("startTab (#42, i76)", () => {
  it("uses the remembered tab", () => {
    expect(
      startTab(memoryStorage({ "priority-matrix-tab": "ideas" }).storage),
    ).toBe("ideas");
  });

  it("starts on the board otherwise, or when storage is blocked or holds junk", () => {
    expect(startTab(null)).toBe("board");
    expect(startTab(throwing)).toBe("board");
    expect(
      startTab(memoryStorage({ "priority-matrix-tab": "<script>" }).storage),
    ).toBe("board");
  });
});

describe("tabs (#42)", () => {
  it("shows the board first and hides the shelves", () => {
    const { panels, tab } = setup(null);
    expect(panels.board.hidden).toBe(false);
    expect(panels.ideas.hidden).toBe(true);
    expect(panels.graveyard.hidden).toBe(true);
    expect(tab("board").getAttribute("aria-selected")).toBe("true");
  });

  it("switches panels and remembers the choice", () => {
    const { storage, data } = memoryStorage();
    const { panels, tab } = setup(storage);
    tab("graveyard").click();
    expect(panels.board.hidden).toBe(true);
    expect(panels.graveyard.hidden).toBe(false);
    expect(tab("graveyard").getAttribute("aria-selected")).toBe("true");
    expect(data.get("priority-matrix-tab")).toBe("graveyard");
  });

  it("still switches when storage is blocked", () => {
    const { panels, tab } = setup(throwing);
    tab("ideas").click();
    expect(panels.ideas.hidden).toBe(false);
  });

  it("shows counts on the Ideas and Graveyard tabs", () => {
    const { tabs, tab } = setup(null);
    tabs.setCounts({ ideas: 3, graveyard: 0 });
    expect(tab("board").textContent).toBe("Board");
    expect(tab("ideas").textContent).toBe("Ideas (3)");
    expect(tab("graveyard").textContent).toBe("Graveyard (0)");
  });

  it("moves between tabs with the arrow keys", () => {
    const { panels, tab } = setup(null);
    tab("board").dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
    );
    expect(panels.ideas.hidden).toBe(false);
    tab("ideas").dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }),
    );
    expect(panels.board.hidden).toBe(false);
  });
});
