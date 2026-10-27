// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { createMemoryRepositories } from "../../../src/adapters/storage/memory";
import {
  StorageError,
  type Label,
  type ScoredTask,
  type Task,
} from "../../../src/core";
import { mountShelf, type ShelfKind } from "../../../src/features/shelf";

const NOW = "2026-10-23T09:00:00.000Z";
const LATER = new Date("2026-10-26T10:00:00.000Z");

const JOBS: Label = {
  id: "l1",
  name: "Jobs",
  archived: false,
  color: "teal",
  createdAt: NOW,
  updatedAt: NOW,
  schemaVersion: 2,
};

function task(overrides: Partial<ScoredTask>): ScoredTask {
  return {
    id: "t",
    text: "A task",
    urgency: 0,
    importance: 50,
    labelId: "l1",
    date: null,
    time: null,
    followUp: false,
    status: "idea",
    createdAt: NOW,
    updatedAt: NOW,
    today: null,
    schemaVersion: 4,
    ...overrides,
  };
}

/** Mounts a shelf with `initial` in storage and on screen, redrawing from saves as the app does. */
async function setup(kind: ShelfKind, initial: ScoredTask[]) {
  document.body.replaceChildren();
  const container = document.createElement("div");
  document.body.append(container);
  const repos = createMemoryRepositories();
  for (const t of initial) await repos.tasks.save(t);
  let tasks: readonly ScoredTask[] = [...initial];
  const errors: unknown[] = [];
  const view = mountShelf(container, {
    kind,
    tasks: repos.tasks,
    now: () => LATER,
    onSaved: (saved: Task) => {
      tasks = tasks.map((t) =>
        t.id === saved.id ? { ...saved, urgency: t.urgency } : t,
      );
      view.render({ tasks, labels: [JOBS] });
    },
    onLoaded: (loaded) => {
      tasks = loaded.map((t) => ({ ...t, urgency: 0 }));
      view.render({ tasks, labels: [JOBS] });
    },
    onDeleted: (id) => {
      tasks = tasks.filter((t) => t.id !== id);
      view.render({ tasks, labels: [JOBS] });
    },
    onError: (e) => errors.push(e),
  });
  view.render({ tasks, labels: [JOBS] });
  const ids = () =>
    [...container.querySelectorAll<HTMLElement>(".task")].map(
      (li) => li.dataset.taskId,
    );
  const click = (id: string) => {
    const el = document.getElementById(id);
    if (!(el instanceof HTMLButtonElement)) throw new Error(`Missing #${id}`);
    el.click();
  };
  const stored = async (id: string) =>
    (await repos.tasks.list()).items.find((t) => t.id === id);
  return { container, repos, errors, ids, click, stored };
}

describe("Ideas shelf (#42)", () => {
  it("lists only ideas, newest first, with their label", async () => {
    const { ids, container } = await setup("idea", [
      task({ id: "old", createdAt: "2026-10-20T09:00:00.000Z" }),
      task({ id: "new", createdAt: "2026-10-22T09:00:00.000Z" }),
      task({ id: "open", status: "open" }),
      task({ id: "gone", status: "dropped" }),
    ]);
    expect(ids()).toEqual(["new", "old"]);
    expect(container.querySelector(".task-label")?.textContent).toBe("Jobs");
  });

  it("shows task text with markup as plain text", async () => {
    const { container } = await setup("idea", [
      task({ id: "a", text: "Ask <b>Sam</b>" }),
    ]);
    expect(container.querySelector(".task-text")?.textContent).toBe(
      "Ask <b>Sam</b>",
    );
    expect(container.querySelector(".task-text b")).toBeNull();
  });

  it("says how to add one when empty", async () => {
    const { container } = await setup("idea", []);
    expect(container.querySelector(".empty")?.textContent).toBe(
      "No ideas yet. Tick “Just an idea” when adding one.",
    );
  });

  it("makes an idea a task on the board", async () => {
    const { ids, click, stored, container } = await setup("idea", [
      task({ id: "a" }),
    ]);
    click("shelf-promote-a");
    await vi.waitFor(() => {
      expect(ids()).toEqual([]);
    });
    expect((await stored("a"))?.status).toBe("open");
    expect(container.querySelector(".shelf-note")?.textContent).toBe(
      "Moved to the board.",
    );
  });

  it("drops an idea into the Graveyard", async () => {
    const { click, stored } = await setup("idea", [task({ id: "a" })]);
    click("shelf-drop-a");
    await vi.waitFor(async () => {
      expect((await stored("a"))?.status).toBe("dropped");
    });
  });
});

describe("Graveyard shelf (#42)", () => {
  it("lists only dropped tasks, most recently dropped first", async () => {
    const { ids } = await setup("dropped", [
      task({
        id: "early",
        status: "dropped",
        updatedAt: "2026-10-20T09:00:00.000Z",
      }),
      task({
        id: "late",
        status: "dropped",
        updatedAt: "2026-10-22T09:00:00.000Z",
      }),
      task({ id: "idea" }),
    ]);
    expect(ids()).toEqual(["late", "early"]);
  });

  it("says what it is for when empty", async () => {
    const { container } = await setup("dropped", []);
    expect(container.querySelector(".empty")?.textContent).toBe(
      "Nothing here. Dropped tasks rest here until you revive them.",
    );
  });

  it("revives a dropped task onto the board", async () => {
    const { ids, click, stored } = await setup("dropped", [
      task({ id: "a", status: "dropped" }),
    ]);
    click("shelf-revive-a");
    await vi.waitFor(() => {
      expect(ids()).toEqual([]);
    });
    expect((await stored("a"))?.status).toBe("open");
  });

  it("reports a failed save and keeps the task", async () => {
    const { repos, errors, ids, click } = await setup("dropped", [
      task({ id: "a", status: "dropped" }),
    ]);
    repos.tasks.saveIfUnchanged = () =>
      Promise.reject(new StorageError("unavailable", "down"));
    click("shelf-revive-a");
    await vi.waitFor(() => {
      expect(errors).toHaveLength(1);
    });
    expect(ids()).toEqual(["a"]);
  });
});

describe("Delete for good (#54)", () => {
  const dropped = () => [
    task({ id: "a", text: "Old plan", status: "dropped" }),
  ];

  it("asks first, and deletes nothing until Delete", async () => {
    const { container, click, stored } = await setup("dropped", dropped());
    click("shelf-delete-a");
    expect(container.querySelector(".shelf-confirm")?.textContent).toContain(
      "Delete for good? This can't be undone.",
    );
    expect(document.activeElement?.id).toBe("shelf-delete-yes-a");
    expect(await stored("a")).toBeDefined();
  });

  it("deletes the task from storage and says so", async () => {
    const { container, click, stored, ids } = await setup("dropped", dropped());
    click("shelf-delete-a");
    click("shelf-delete-yes-a");
    await vi.waitFor(() => {
      expect(ids()).toEqual([]);
    });
    expect(await stored("a")).toBeUndefined();
    expect(container.querySelector(".shelf-note")?.textContent).toBe(
      "Deleted for good.",
    );
  });

  it("Cancel keeps the task and puts the buttons back", async () => {
    const { container, click, stored } = await setup("dropped", dropped());
    click("shelf-delete-a");
    click("shelf-delete-no-a");
    expect(container.querySelector(".shelf-confirm")).toBeNull();
    expect(document.getElementById("shelf-revive-a")).not.toBeNull();
    expect(await stored("a")).toBeDefined();
  });

  it("Escape cancels too", async () => {
    const { container, click } = await setup("dropped", dropped());
    click("shelf-delete-a");
    container
      .querySelector(".shelf-confirm")
      ?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
    expect(container.querySelector(".shelf-confirm")).toBeNull();
  });

  it("refuses when the task was revived on another device, and shows that", async () => {
    const { repos, errors, ids, click, stored } = await setup(
      "dropped",
      dropped(),
    );
    const revived = {
      ...task({ id: "a", text: "Old plan", status: "open" }),
      updatedAt: "2026-10-26T09:30:00.000Z",
    };
    await repos.tasks.save(revived);
    click("shelf-delete-a");
    click("shelf-delete-yes-a");
    await vi.waitFor(() => {
      expect(errors).toHaveLength(1);
    });
    expect(errors[0]).toMatchObject({ kind: "conflict" });
    expect((await stored("a"))?.status).toBe("open");
    // The re-read shows it is no longer in the Graveyard.
    expect(ids()).toEqual([]);
  });

  it("reports a failed delete and keeps the task", async () => {
    const { repos, errors, ids, click } = await setup("dropped", dropped());
    repos.tasks.deleteIfUnchanged = () =>
      Promise.reject(new StorageError("unavailable", "down"));
    click("shelf-delete-a");
    click("shelf-delete-yes-a");
    await vi.waitFor(() => {
      expect(errors).toHaveLength(1);
    });
    expect(ids()).toEqual(["a"]);
  });

  it("offers delete only in the Graveyard, not on ideas", async () => {
    await setup("idea", [task({ id: "i" })]);
    expect(document.getElementById("shelf-delete-i")).toBeNull();
  });
});
