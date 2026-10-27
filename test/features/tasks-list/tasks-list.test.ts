// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { createMemoryRepositories } from "../../../src/adapters/storage/memory";
import { StorageError, type Label, type ScoredTask } from "../../../src/core";
import { urgencyAt } from "../../../src/core/urgency";
import { mountTasksList } from "../../../src/features/tasks-list";

const NOW = "2026-10-23T09:00:00.000Z";
const LATER = new Date("2026-10-23T10:00:00.000Z");

const JOBS: Label = {
  id: "l1",
  name: "Jobs",
  archived: false,
  color: "teal",
  createdAt: NOW,
  updatedAt: NOW,
  schemaVersion: 2,
};

/** A task as the app passes it: stored fields plus its calculated urgency. */
function task(overrides: Partial<ScoredTask>): ScoredTask {
  return {
    id: "t",
    text: "A task",
    urgency: 60,
    importance: 60,
    labelId: "l1",
    date: null,
    time: null,
    followUp: false,
    status: "open",
    createdAt: NOW,
    updatedAt: NOW,
    today: null,
    schemaVersion: 4,
    ...overrides,
  };
}

/**
 * Mounts the list with `initial` in storage and on screen, and re-renders it from saved
 * and re-read tasks, scored at LATER as the app does.
 */
async function setup(initial: ScoredTask[], labels: Label[] = [JOBS]) {
  document.body.replaceChildren();
  const container = document.createElement("div");
  document.body.append(container);
  const repos = createMemoryRepositories();
  for (const t of initial) await repos.tasks.save(t);
  let tasks = [...initial];
  const errors: unknown[] = [];
  const todayBox = document.createElement("div");
  const nextUpBox = document.createElement("div");
  container.append(todayBox, nextUpBox);
  const view = mountTasksList(
    { today: todayBox, nextUp: nextUpBox, lists: container },
    {
      tasks: repos.tasks,
      now: () => LATER,
      onSaved: (saved) => {
        const scored = { ...saved, urgency: urgencyAt(saved, LATER) };
        tasks = tasks.map((t) => (t.id === saved.id ? scored : t));
        view.render({ tasks, labels });
      },
      onLoaded: (loaded) => {
        tasks = loaded.map((t) => ({ ...t, urgency: urgencyAt(t, LATER) }));
        view.render({ tasks, labels });
      },
      onError: (e) => errors.push(e),
    },
  );
  view.render({ tasks, labels });
  return { repos, errors, container, view, tasks: () => tasks };
}

const idsIn = (container: HTMLElement, quadrant: string) =>
  [
    ...container.querySelectorAll<HTMLElement>(
      `[data-quadrant="${quadrant}"] .task`,
    ),
  ].map((li) => li.dataset.taskId);

function byId<T extends HTMLElement>(id: string, type: new () => T): T {
  const el = document.getElementById(id);
  if (!(el instanceof type)) throw new Error(`Missing #${id}`);
  return el;
}

const doneBox = (id: string) => byId(`task-done-${id}`, HTMLInputElement);

/** Ticks a row's done box and answers "Yes, done" (i72). `place` is the row's id prefix. */
function markDone(id: string, place: "task" | "next" | "today" = "task"): void {
  check(byId(`${place}-done-${id}`, HTMLInputElement), true);
  const where = place === "task" ? "list" : place;
  byId(`confirm-done-${where}-${id}`, HTMLButtonElement).click();
}

function check(box: HTMLInputElement, checked: boolean): void {
  box.checked = checked;
  box.dispatchEvent(new Event("change"));
}

describe("tasks list", () => {
  it("groups open tasks by quadrant in priority order", async () => {
    const { container } = await setup([
      task({ id: "do-low", urgency: 50, importance: 50 }),
      task({ id: "do-high", urgency: 95, importance: 90 }),
      task({ id: "schedule", urgency: 49, importance: 80 }),
      task({ id: "delegate", urgency: 80, importance: 49 }),
      task({ id: "drop", urgency: 10, importance: 10 }),
      task({ id: "done", status: "done" }),
    ]);
    expect(idsIn(container, "DO")).toEqual(["do-high", "do-low"]);
    expect(idsIn(container, "SCHEDULE")).toEqual(["schedule"]);
    expect(idsIn(container, "DELEGATE")).toEqual(["delegate"]);
    expect(idsIn(container, "DROP")).toEqual(["drop"]);
  });

  it("shows quadrant titles, counts and an empty message", async () => {
    const { container } = await setup([task({ id: "a" })]);
    const doSection = container.querySelector('[data-quadrant="DO"]');
    expect(doSection?.querySelector("h2")?.textContent).toBe("Do now");
    const headings = [...container.querySelectorAll(".quadrant h2")].map(
      (h) => h.textContent,
    );
    expect(headings).toEqual(["Do now", "Make time", "Fit in", "Someday"]);
    expect(doSection?.querySelector(".count")?.textContent).toBe("1");
    expect(
      container.querySelector('[data-quadrant="DROP"] .empty')?.textContent,
    ).toBe("Nothing here.");
  });

  it("shows text, label name and scores", async () => {
    const { container } = await setup([
      task({ id: "a", text: "Send invoice", urgency: 70, importance: 60 }),
    ]);
    const li = container.querySelector('[data-task-id="a"]');
    expect(li?.querySelector(".task-text")?.textContent).toBe("Send invoice");
    expect(li?.querySelector(".task-label")?.textContent).toBe("Jobs");
    expect(li?.querySelector(".task-scores")?.textContent).toBe("U 70 · I 60");
  });

  it("shows the date line, with a follow-up style for follow-ups", async () => {
    const { container } = await setup([
      task({ id: "a", date: "2026-10-24", time: "10:30" }),
      task({ id: "b", date: "2026-10-30", followUp: true }),
      task({ id: "c" }),
    ]);
    const dateOf = (id: string) =>
      container.querySelector(`[data-task-id="${id}"] .task-date`);
    expect(dateOf("a")?.textContent).toBe("Due Sat 24 Oct 10:30");
    expect(dateOf("b")?.textContent).toBe("Follow up Fri 30 Oct");
    expect(dateOf("b")?.classList.contains("follow-up")).toBe(true);
    expect(dateOf("c")?.textContent).toBe("No date");
  });

  it("names a missing label", async () => {
    const { container } = await setup([task({ id: "a", labelId: "gone" })]);
    expect(container.querySelector(".task-label")?.textContent).toBe(
      "No label",
    );
  });

  it("shows task text with markup as plain text", async () => {
    const { container } = await setup([task({ id: "a", text: "<b>x</b>" })]);
    const text = container.querySelector(".task-text");
    expect(text?.textContent).toBe("<b>x</b>");
    expect(text?.querySelector("b")).toBeNull();
  });

  it("marks a task done, which removes it from its quadrant", async () => {
    const { container, repos, tasks } = await setup([task({ id: "a" })]);
    markDone("a");
    await vi.waitFor(() => {
      expect(idsIn(container, "DO")).toEqual([]);
    });
    expect(tasks()[0]).toMatchObject({
      status: "done",
      updatedAt: LATER.toISOString(),
    });
    expect((await repos.tasks.list()).items[0]?.status).toBe("done");
  });

  it("shows done tasks only when toggled, and reopens one", async () => {
    // Overdue, so it returns to Do now when reopened.
    const { container } = await setup([
      task({ id: "a", status: "done", date: "2026-10-20", urgency: 100 }),
    ]);
    const toggle = byId("show-done", HTMLInputElement);
    const doneList = byId("done-list", HTMLUListElement);
    expect(container.textContent).toContain("Show done (1)");
    expect(doneList.hidden).toBe(true);
    check(toggle, true);
    expect(doneList.hidden).toBe(false);
    check(doneBox("a"), false);
    await vi.waitFor(() => {
      expect(idsIn(container, "DO")).toEqual(["a"]);
    });
  });

  it("restores the checkbox and reports a storage error", async () => {
    const { repos, errors } = await setup([task({ id: "a" })]);
    // Task saves go through the checked save (#34).
    repos.tasks.saveIfUnchanged = () =>
      Promise.reject(new StorageError("unavailable", "down"));
    markDone("a");
    await vi.waitFor(() => {
      expect(errors).toHaveLength(1);
    });
    expect(doneBox("a").checked).toBe(false);
    expect(doneBox("a").disabled).toBe(false);
  });

  it("shows the best Do-now task in the Next up card", async () => {
    const { container } = await setup([
      task({ id: "low", urgency: 55, importance: 55 }),
      task({ id: "best", text: "Ship it", urgency: 95, importance: 90 }),
      task({ id: "schedule", urgency: 10, importance: 99 }),
    ]);
    const card = container.querySelector(".next-up");
    expect(card?.querySelector("h2")?.textContent).toBe("Next up");
    expect(card?.querySelector<HTMLElement>(".task")?.dataset.taskId).toBe(
      "best",
    );
    expect(card?.querySelector(".task-text")?.textContent).toBe("Ship it");
  });

  it("says so when Do now is empty", async () => {
    const { container } = await setup([
      task({ id: "s", urgency: 10, importance: 90 }),
    ]);
    expect(container.querySelector(".next-up .empty")?.textContent).toBe(
      "Nothing in Do now.",
    );
  });

  it("marks the Next up task done from the card", async () => {
    const { container } = await setup([task({ id: "a" })]);
    markDone("a", "next");
    await vi.waitFor(() => {
      expect(container.querySelector(".next-up .empty")).not.toBeNull();
    });
  });

  it("shows the label color next to the label name", async () => {
    const { container } = await setup([task({ id: "a" })]);
    const dot = container.querySelector<HTMLElement>(
      '[data-task-id="a"] .task-label .color-dot',
    );
    // The label's mark: its color in its shape (#45).
    expect(dot?.querySelector("svg [fill]")?.getAttribute("fill")).toMatch(
      /^#[0-9a-f]{6}$/,
    );
  });
});

describe("editing a task", () => {
  const ADMIN: Label = { ...JOBS, id: "l3", name: "Admin", color: "indigo" };
  const OLD: Label = { ...JOBS, id: "l2", name: "Old", archived: true };

  function openEditor(id: string) {
    byId(`task-edit-${id}`, HTMLButtonElement).click();
    return {
      text: byId(`task-edit-text-${id}`, HTMLInputElement),
      date: byId(`task-edit-date-${id}`, HTMLInputElement),
      time: byId(`task-edit-time-${id}`, HTMLInputElement),
      followUp: byId(`task-edit-follow-up-${id}`, HTMLInputElement),
      importance: byId(`task-edit-importance-${id}`, HTMLInputElement),
      label: byId(`task-edit-label-${id}`, HTMLSelectElement),
      submit: () => {
        document
          .querySelector<HTMLFormElement>(".task-edit-form")
          ?.dispatchEvent(new Event("submit", { cancelable: true }));
      },
    };
  }

  it("opens a form filled with the task's text, date, importance and label", async () => {
    await setup(
      [
        task({
          id: "a",
          text: "Send invoice",
          date: "2026-10-30",
          time: "09:15",
          followUp: true,
          importance: 60,
        }),
      ],
      [JOBS, ADMIN, OLD],
    );
    const form = openEditor("a");
    expect(form.text.value).toBe("Send invoice");
    expect(form.date.value).toBe("2026-10-30");
    expect(form.time.value).toBe("09:15");
    expect(form.followUp.checked).toBe(true);
    expect(document.getElementById("task-edit-urgency-a")).toBeNull();
    expect(form.importance.valueAsNumber).toBe(60);
    expect(form.label.value).toBe("l1");
    expect([...form.label.options].map((o) => o.textContent)).toEqual([
      "Admin",
      "Jobs",
    ]);
  });

  it("saves new text, date, importance and label, moving the task to its new quadrant", async () => {
    const { container, tasks, repos } = await setup(
      [task({ id: "a", urgency: 100, date: "2026-10-20", importance: 60 })],
      [JOBS, ADMIN],
    );
    const form = openEditor("a");
    form.text.value = "Send revised invoice";
    // 14 days after LATER: urgency 25, so the task leaves Do now for Schedule.
    form.date.value = "2026-11-06";
    form.date.dispatchEvent(new Event("change"));
    form.followUp.checked = true;
    form.importance.value = "90";
    form.label.value = "l3";
    form.submit();
    await vi.waitFor(() => {
      expect(idsIn(container, "SCHEDULE")).toEqual(["a"]);
    });
    expect(tasks()[0]).toMatchObject({
      text: "Send revised invoice",
      date: "2026-11-06",
      followUp: true,
      importance: 90,
      labelId: "l3",
      updatedAt: LATER.toISOString(),
    });
    expect(container.querySelector(".task-edit-form")).toBeNull();
    expect(
      container.querySelector('[data-task-id="a"] .task-label')?.textContent,
    ).toBe("Admin");
    const stored = (await repos.tasks.list()).items[0];
    expect(stored && Object.keys(stored)).not.toContain("urgency");
  });

  it("shows field errors and keeps the form open for bad input", async () => {
    const { container, tasks } = await setup([task({ id: "a" })]);
    const form = openEditor("a");
    form.text.value = "  ";
    form.submit();
    expect(byId("task-edit-text-error-a", HTMLElement).hidden).toBe(false);
    expect(container.querySelector(".task-edit-form")).not.toBeNull();
    expect(tasks()[0]?.text).toBe("A task");
  });

  it("keeps typed text when the page refreshes during an edit", async () => {
    const { view, tasks } = await setup([task({ id: "a" })]);
    const form = openEditor("a");
    form.text.value = "Half typed";
    view.render({ tasks: tasks(), labels: [JOBS] });
    expect(byId("task-edit-text-a", HTMLInputElement).value).toBe("Half typed");
  });

  it("offers a task's archived label so it can be kept", async () => {
    await setup([task({ id: "a", labelId: "l2" })], [JOBS, OLD]);
    const form = openEditor("a");
    expect(form.label.value).toBe("l2");
    expect([...form.label.options].map((o) => o.textContent)).toContain(
      "Old (archived)",
    );
  });

  it("closes without saving on Cancel", async () => {
    const { container, repos } = await setup([task({ id: "a" })]);
    const form = openEditor("a");
    form.text.value = "Changed";
    [...container.querySelectorAll("button")]
      .find((b) => b.textContent === "Cancel")
      ?.click();
    expect(container.querySelector(".task-edit-form")).toBeNull();
    expect((await repos.tasks.list()).items[0]?.text).toBe("A task");
  });

  // Restored: these #20 tests were dropped by mistake in #22.
  async function changeElsewhere(
    repos: Awaited<ReturnType<typeof setup>>["repos"],
    overrides: Partial<ScoredTask>,
  ) {
    const [stored] = (await repos.tasks.list()).items;
    if (stored === undefined) throw new Error("test setup");
    await repos.tasks.save({
      ...stored,
      ...overrides,
      updatedAt: "2026-10-23T09:30:00.000Z",
    });
  }

  it("refuses an edit and shows the other device's version", async () => {
    const { container, repos, errors } = await setup([task({ id: "a" })]);
    await changeElsewhere(repos, { status: "done" });
    byId("task-edit-a", HTMLButtonElement).click();
    byId("task-edit-text-a", HTMLInputElement).value = "Edited here";
    document
      .querySelector<HTMLFormElement>(".task-edit-form")
      ?.dispatchEvent(new Event("submit", { cancelable: true }));
    await vi.waitFor(() => {
      expect(errors).toHaveLength(1);
    });
    expect(errors[0]).toBeInstanceOf(StorageError);
    expect((errors[0] as StorageError).kind).toBe("conflict");
    const stored = (await repos.tasks.list()).items[0];
    expect(stored).toMatchObject({ text: "A task", status: "done" });
    expect(container.querySelector(".task-edit-form")).toBeNull();
    expect(idsIn(container, "DO")).toEqual([]);
  });

  it("refuses a done click and keeps the other device's text", async () => {
    const { repos, errors } = await setup([task({ id: "a" })]);
    await changeElsewhere(repos, { text: "Renamed on phone" });
    markDone("a");
    await vi.waitFor(() => {
      expect(errors).toHaveLength(1);
    });
    const stored = (await repos.tasks.list()).items[0];
    expect(stored).toMatchObject({ text: "Renamed on phone", status: "open" });
    expect(doneBox("a").checked).toBe(false);
  });

  it("saves normally when nothing changed elsewhere", async () => {
    const { repos, errors } = await setup([task({ id: "a" })]);
    markDone("a");
    await vi.waitFor(async () => {
      expect((await repos.tasks.list()).items[0]?.status).toBe("done");
    });
    expect(errors).toEqual([]);
  });

  it("saves through the checked save, not a plain save (#34)", async () => {
    const { repos } = await setup([task({ id: "a" })]);
    const checked = vi.spyOn(repos.tasks, "saveIfUnchanged");
    markDone("a");
    await vi.waitFor(() => {
      expect(checked).toHaveBeenCalledOnce();
    });
  });
});

describe("confirm before done (i72)", () => {
  it("asks first, and saves nothing until Yes", async () => {
    const { container, repos } = await setup([task({ id: "a" })]);
    const save = vi.spyOn(repos.tasks, "saveIfUnchanged");
    check(doneBox("a"), true);
    const bar = container.querySelector('[data-task-id="a"] .confirm-done');
    expect(bar?.textContent).toContain("Mark as done?");
    expect(doneBox("a").checked).toBe(true);
    expect(doneBox("a").disabled).toBe(true);
    expect(save).not.toHaveBeenCalled();
    expect(idsIn(container, "DO")).toEqual(["a"]);
  });

  it("Cancel unticks the box and saves nothing", async () => {
    const { container, repos } = await setup([task({ id: "a" })]);
    const save = vi.spyOn(repos.tasks, "saveIfUnchanged");
    check(doneBox("a"), true);
    [...container.querySelectorAll<HTMLButtonElement>(".confirm-done button")]
      .find((b) => b.textContent === "Cancel")
      ?.click();
    expect(container.querySelector(".confirm-done")).toBeNull();
    expect(doneBox("a").checked).toBe(false);
    expect(save).not.toHaveBeenCalled();
  });

  it("Escape cancels too", async () => {
    const { container } = await setup([task({ id: "a" })]);
    check(doneBox("a"), true);
    container
      .querySelector(".confirm-done")
      ?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
    expect(container.querySelector(".confirm-done")).toBeNull();
    expect(doneBox("a").checked).toBe(false);
  });
});

describe("Today card (#38)", () => {
  /** LATER is 21:00 on 23 October in Sydney, the test time zone. */
  const TODAY = "2026-10-23";
  const card = (container: HTMLElement) =>
    container.querySelector<HTMLElement>(".today-card");
  const todayIds = (container: HTMLElement) =>
    [...(card(container)?.querySelectorAll<HTMLElement>(".task") ?? [])].map(
      (li) => li.dataset.taskId,
    );

  it("invites picks when empty", async () => {
    const { container } = await setup([task({ id: "a" })]);
    expect(card(container)?.querySelector(".empty")?.textContent).toBe(
      "Pick up to 5 tasks with ☆ to plan your day.",
    );
  });

  it("picks a task with the star and shows it on the card", async () => {
    const { container, repos } = await setup([task({ id: "a" })]);
    byId("list-star-a", HTMLButtonElement).click();
    await vi.waitFor(() => {
      expect(todayIds(container)).toEqual(["a"]);
    });
    expect((await repos.tasks.list()).items[0]?.today).toBe(TODAY);
    expect(byId("list-star-a", HTMLButtonElement).textContent).toBe("★");
    expect(card(container)?.querySelector(".today-progress")?.textContent).toBe(
      "0 of 1 done",
    );
  });

  it("removes a pick with the star on the card", async () => {
    const { container } = await setup([task({ id: "a", today: TODAY })]);
    byId("today-star-a", HTMLButtonElement).click();
    await vi.waitFor(() => {
      expect(todayIds(container)).toEqual([]);
    });
  });

  it("ignores picks from another day (i69)", async () => {
    const { container } = await setup([task({ id: "a", today: "2026-10-22" })]);
    expect(todayIds(container)).toEqual([]);
  });

  it("refuses a sixth pick with a message, saving nothing (i68)", async () => {
    const picks = ["p1", "p2", "p3", "p4", "p5"].map((id) =>
      task({ id, today: TODAY }),
    );
    const { container, repos } = await setup([...picks, task({ id: "a" })]);
    const save = vi.spyOn(repos.tasks, "saveIfUnchanged");
    byId("list-star-a", HTMLButtonElement).click();
    expect(card(container)?.querySelector(".today-message")?.textContent).toBe(
      "Today is full (5). Finish or unpick one first.",
    );
    expect(save).not.toHaveBeenCalled();
  });

  it("keeps a done pick on the card, ticked, and counts it (i70)", async () => {
    const { container } = await setup([
      task({ id: "a", today: TODAY }),
      task({ id: "b", today: TODAY, urgency: 10 }),
    ]);
    markDone("a", "today");
    await vi.waitFor(() => {
      expect(
        card(container)?.querySelector(".today-progress")?.textContent,
      ).toBe("1 of 2 done");
    });
    expect(todayIds(container)).toEqual(["b", "a"]);
    expect(byId("today-done-a", HTMLInputElement).checked).toBe(true);
    expect(
      card(container)?.querySelector('[data-task-id="a"]')?.classList,
    ).toContain("just-done");
    expect(card(container)?.querySelector(".burst")).toBeNull();
  });

  it("celebrates when the last pick is done", async () => {
    const { container } = await setup([
      task({ id: "a", today: TODAY }),
      task({ id: "b", today: TODAY, status: "done" }),
    ]);
    markDone("a", "today");
    await vi.waitFor(() => {
      expect(card(container)?.querySelector(".today-cheer")?.textContent).toBe(
        "All 2 done for today.",
      );
    });
    expect(card(container)?.classList).toContain("all-done");
    expect(card(container)?.querySelectorAll(".burst-dot").length).toBe(12);
  });
});

describe("Drop (#42)", () => {
  it("moves a board task to the Graveyard, clearing its pick, and says where", async () => {
    const { container, repos } = await setup([
      task({ id: "a", today: "2026-10-23" }),
    ]);
    byId("task-drop-a", HTMLButtonElement).click();
    await vi.waitFor(() => {
      expect(idsIn(container, "DO")).toEqual([]);
    });
    expect((await repos.tasks.list()).items[0]).toMatchObject({
      status: "dropped",
      today: null,
    });
    expect(container.querySelector(".list-notice")?.textContent).toBe(
      "Moved to Graveyard. Revive it there.",
    );
    expect(
      container.querySelector('.today-card [data-task-id="a"]'),
    ).toBeNull();
  });

  it("leaves ideas and dropped tasks off the board and the done list", async () => {
    const { container } = await setup([
      task({ id: "idea", status: "idea", urgency: 100, importance: 100 }),
      task({ id: "gone", status: "dropped", urgency: 100, importance: 100 }),
    ]);
    expect(idsIn(container, "DO")).toEqual([]);
    expect(container.textContent).toContain("Show done (0)");
  });
});

describe("actions from the matrix dot menu (#46)", () => {
  it("marks a task done without asking again (the menu asked)", async () => {
    const { container, repos, view } = await setup([task({ id: "a" })]);
    view.markDone("a");
    await vi.waitFor(() => {
      expect(idsIn(container, "DO")).toEqual([]);
    });
    expect((await repos.tasks.list()).items[0]?.status).toBe("done");
  });

  it("picks a task for today, then removes the pick", async () => {
    const { repos, view } = await setup([task({ id: "a" })]);
    view.toggleToday("a");
    await vi.waitFor(async () => {
      expect((await repos.tasks.list()).items[0]?.today).toBe("2026-10-23");
    });
    view.toggleToday("a");
    await vi.waitFor(async () => {
      expect((await repos.tasks.list()).items[0]?.today).toBeNull();
    });
  });

  it("opens the Edit form in the list with the text field focused", async () => {
    const { view } = await setup([task({ id: "a" })]);
    view.edit("a");
    expect(document.activeElement?.id).toBe("task-edit-text-a");
  });

  it("drops a task to the Graveyard and says where", async () => {
    const { container, repos, view } = await setup([task({ id: "a" })]);
    view.drop("a");
    await vi.waitFor(async () => {
      expect((await repos.tasks.list()).items[0]?.status).toBe("dropped");
    });
    expect(container.querySelector(".list-notice")?.textContent).toBe(
      "Moved to Graveyard. Revive it there.",
    );
  });

  it("ignores an id that is not an open task on the board", async () => {
    const { repos, view } = await setup([task({ id: "a", status: "done" })]);
    const save = vi.spyOn(repos.tasks, "saveIfUnchanged");
    view.markDone("a");
    view.toggleToday("a");
    view.drop("a");
    view.markDone("missing");
    expect(save).not.toHaveBeenCalled();
  });
});
