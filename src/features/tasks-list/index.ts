// Tasks list feature: the Next up card, open tasks grouped by quadrant in priority
// order (plan i29), a done checkbox, a "Show done" toggle to reopen tasks (i26), and an
// inline Edit form for text, date, importance and label (Q21, #15). Rows show the date
// as "Due Fri 24 Oct 10:30" or "Follow up Fri 24 Oct" (i42). Saves are checked, so a
// task changed on another device is not overwritten (#20, #34). Marking a task done asks
// first (i72); a star picks it for the Today card (today.ts, #38); Drop sends it to the
// Graveyard tab without asking, since Revive undoes it (#42, i73).

import {
  dueText,
  editTask,
  groupByQuadrant,
  isPickedToday,
  nextUp,
  pickForToday,
  QUADRANT_NAMES,
  QUADRANTS,
  setTaskStatus,
  StorageError,
  todayList,
  unpickForToday,
  type Label,
  type Quadrant,
  type ScoredTask,
  type Task,
  type TaskRepository,
} from "../../core";
import { labelDot, labelHex } from "../../ui";
import { buildEditForm } from "./edit-form";
import { createTodayCard, renderToday } from "./today";

/** Where a row is shown. Keeps element ids unique when a task shows more than once. */
type RowPlace = "list" | "next" | "today";

/** How long the check pop and the all-done burst stay on after a tick, in ms. */
const CELEBRATION_MS = 1500;

/**
 * The list's handle. Besides `render`, the matrix dot menu acts through it (#46), so
 * every save keeps the list's rules (checked saves, Today celebration). Each action
 * takes an open task's id and does nothing for any other id.
 */
export interface TasksListView {
  render(state: {
    tasks: readonly ScoredTask[];
    labels: readonly Label[];
  }): void;
  /** Marks done. The caller has already asked "Mark as done?" (i72). */
  markDone(id: string): void;
  /** Picks for today, or removes today's pick. */
  toggleToday(id: string): void;
  /** Opens the Edit form in the list. */
  edit(id: string): void;
  /** Moves to the Graveyard (no confirm, i73). */
  drop(id: string): void;
}

/** What the list needs from the app. */
export interface TasksListDeps {
  readonly tasks: TaskRepository;
  readonly now: () => Date;
  /** Called after a task is stored, so the app can update its state. */
  readonly onSaved: (task: Task) => void;
  /** Called with the tasks re-read from storage before a save (#20). */
  readonly onLoaded: (tasks: readonly Task[]) => void;
  /** Called when storing fails (for example a StorageError, kind "conflict" for a stale page). */
  readonly onError: (error: unknown) => void;
}

/**
 * Builds the Today card inside `containers.today`, the Next up card inside
 * `containers.nextUp` and the quadrant lists inside `containers.lists`, so the app can
 * place the matrix between them (plan i33). Call `render` whenever tasks or labels change.
 */
export function mountTasksList(
  containers: {
    readonly today: HTMLElement;
    readonly nextUp: HTMLElement;
    readonly lists: HTMLElement;
  },
  deps: TasksListDeps,
): TasksListView {
  let state: { tasks: readonly ScoredTask[]; labels: readonly Label[] } = {
    tasks: [],
    labels: [],
  };
  /** The task whose Edit form is open, and that form's error messages by field. */
  let editingId: string | null = null;
  let editErrors = new Map<string, string>();
  /** The row asking "Mark as done?", as "place:id" (i72), or null. */
  let confirming: string | null = null;
  /** The last pick message (for example "Today is full"), shown on the Today card. */
  let todayMessage: string | null = null;
  /** The pick whose tick plays the check pop, whether all picks just got done, and until when. */
  let justDoneId: string | null = null;
  let celebrate = false;
  let celebrateUntil = 0;

  const todayCard = createTodayCard();
  containers.today.append(todayCard);

  const grid = document.createElement("div");
  grid.className = "quadrants";

  const toggleWrap = document.createElement("div");
  toggleWrap.className = "done-toggle";
  const toggle = document.createElement("input");
  toggle.type = "checkbox";
  toggle.id = "show-done";
  const toggleLabel = document.createElement("label");
  toggleLabel.htmlFor = toggle.id;
  toggleWrap.append(toggle, toggleLabel);

  const doneList = document.createElement("ul");
  doneList.id = "done-list";
  doneList.className = "task-list done-list";
  doneList.hidden = true;

  const nextCard = document.createElement("section");
  nextCard.className = "next-up";
  nextCard.setAttribute("aria-labelledby", "next-up-title");
  const nextTitle = document.createElement("h2");
  nextTitle.id = "next-up-title";
  nextTitle.textContent = "Next up";
  const nextBody = document.createElement("ul");
  nextBody.className = "task-list";
  nextCard.append(nextTitle, nextBody);
  containers.nextUp.append(nextCard);

  /** Says where a dropped task went (#42). */
  const notice = document.createElement("p");
  notice.className = "list-notice";
  notice.setAttribute("role", "status");
  notice.hidden = true;

  containers.lists.append(notice, grid, toggleWrap, doneList);
  toggle.addEventListener("change", draw);

  /**
   * Saves `updated` through the repository's checked save (#20, #34). On a conflict,
   * re-reads tasks so the page shows the other device's version, then rethrows.
   */
  async function saveIfUnchanged(loaded: Task, updated: Task): Promise<void> {
    try {
      await deps.tasks.saveIfUnchanged(loaded, updated);
    } catch (error: unknown) {
      if (error instanceof StorageError && error.kind === "conflict") {
        try {
          deps.onLoaded((await deps.tasks.list()).items);
        } catch {
          // The conflict below is still reported; live updates bring the latest version.
        }
      }
      throw error;
    }
  }

  /** `box` is the row's checkbox, or null when the matrix menu asked (#46). */
  async function setStatus(
    task: Task,
    status: Task["status"],
    box: HTMLInputElement | null,
  ): Promise<void> {
    if (box) box.disabled = true;
    const now = deps.now();
    const updated = setTaskStatus(task, status, now);
    try {
      await saveIfUnchanged(task, updated);
      if (status === "done" && isPickedToday(task, now)) {
        // Celebrate a ticked pick, and the whole day when it was the last open one.
        const picks = todayList(state.tasks, now);
        justDoneId = task.id;
        celebrate = picks.open.every((t) => t.id === task.id);
        celebrateUntil = now.getTime() + CELEBRATION_MS;
      }
      deps.onSaved(updated);
    } catch (error: unknown) {
      if (box) {
        box.checked = task.status === "done";
        box.disabled = false;
      }
      deps.onError(error);
    }
  }

  /** Moves a board task to the Graveyard (#42). Revive brings it back. */
  async function drop(
    task: ScoredTask,
    button: HTMLButtonElement | null,
  ): Promise<void> {
    if (button) button.disabled = true;
    const updated = setTaskStatus(task, "dropped", deps.now());
    try {
      await saveIfUnchanged(task, updated);
      notice.textContent = "Moved to Graveyard. Revive it there.";
      notice.hidden = false;
      deps.onSaved(updated);
    } catch (error: unknown) {
      if (button) button.disabled = false;
      deps.onError(error);
    }
  }

  /** Picks a task for today or removes its pick. A refused pick shows on the Today card. */
  async function setToday(
    task: ScoredTask,
    pick: boolean,
    button: HTMLButtonElement | null,
  ): Promise<void> {
    const now = deps.now();
    let updated: Task;
    if (pick) {
      const result = pickForToday(task, state.tasks, now);
      if (!result.ok) {
        todayMessage = result.errors[0]?.message ?? null;
        draw();
        return;
      }
      updated = result.value;
    } else {
      updated = unpickForToday(task, now);
    }
    if (updated === task) return;
    todayMessage = null;
    if (button) button.disabled = true;
    try {
      await saveIfUnchanged(task, updated);
      deps.onSaved(updated);
    } catch (error: unknown) {
      if (button) button.disabled = false;
      deps.onError(error);
    }
  }

  function draw(): void {
    const labelNames = new Map(state.labels.map((l) => [l.id, l]));
    const now = deps.now();
    if (now.getTime() >= celebrateUntil) {
      justDoneId = null;
      celebrate = false;
    }
    const picks = todayList(state.tasks, now);
    renderToday(
      todayCard,
      {
        ...picks,
        message: todayMessage,
        justDoneId,
        celebrate,
        colors: [...picks.open, ...picks.done].map(
          (t) => labelHex(labelNames.get(t.labelId)) ?? "",
        ),
      },
      (t) => taskItem(t, labelNames, "today"),
    );
    const open = state.tasks.filter((t) => t.status === "open");
    const next = nextUp(open);
    nextBody.replaceChildren(
      next === undefined
        ? emptyItem("Nothing in Do now.")
        : taskItem(next, labelNames, "next"),
    );
    const groups = groupByQuadrant(open);

    grid.replaceChildren(
      ...QUADRANTS.map((q) => quadrantSection(q, groups[q], labelNames)),
    );

    const done = state.tasks
      .filter((t) => t.status === "done")
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    toggleLabel.textContent = `Show done (${String(done.length)})`;
    doneList.hidden = !toggle.checked;
    doneList.replaceChildren(
      ...(done.length === 0
        ? [emptyItem("No done tasks yet.")]
        : done.map((t) => taskItem(t, labelNames))),
    );
  }

  function quadrantSection(
    quadrant: Quadrant,
    tasks: readonly ScoredTask[],
    labelNames: ReadonlyMap<string, Label>,
  ): HTMLElement {
    const section = document.createElement("section");
    section.className = "quadrant";
    section.dataset.quadrant = quadrant;
    const header = document.createElement("header");
    const title = document.createElement("h2");
    title.textContent = QUADRANT_NAMES[quadrant].name;
    const count = document.createElement("span");
    count.className = "count";
    count.textContent = String(tasks.length);
    const rule = document.createElement("p");
    rule.className = "rule";
    rule.textContent = QUADRANT_NAMES[quadrant].rule;
    header.append(title, count, rule);
    const list = document.createElement("ul");
    list.className = "task-list";
    list.append(
      ...(tasks.length === 0
        ? [emptyItem("Nothing here.")]
        : tasks.map((t) => taskItem(t, labelNames))),
    );
    section.append(header, list);
    return section;
  }

  /**
   * One task row. `where` keeps ids unique when a task shows in several places; the
   * Edit form opens only in the list row, and the star shows in the list and Today rows.
   */
  function taskItem(
    task: ScoredTask,
    labelNames: ReadonlyMap<string, Label>,
    where: RowPlace = "list",
  ): HTMLLIElement {
    const li = document.createElement("li");
    li.className = task.status === "done" ? "task is-done" : "task";
    li.dataset.taskId = task.id;
    if (where === "list" && editingId === task.id) {
      li.classList.add("editing");
      li.append(editForm(task));
      return li;
    }
    const box = document.createElement("input");
    box.type = "checkbox";
    box.id =
      where === "list" ? `task-done-${task.id}` : `${where}-done-${task.id}`;
    box.checked = task.status === "done";
    box.setAttribute(
      "aria-label",
      `${task.status === "done" ? "Reopen" : "Mark done"}: ${task.text}`,
    );
    const key = `${where}:${task.id}`;
    box.addEventListener("change", () => {
      if (box.checked) {
        // Ask before marking done (i72); reopening is the undo, so it saves at once.
        confirming = key;
        draw();
        document.getElementById(`confirm-done-${where}-${task.id}`)?.focus();
      } else {
        void setStatus(task, "open", box);
      }
    });
    const text = document.createElement("span");
    text.className = "task-text";
    text.textContent = task.text;
    const meta = document.createElement("span");
    meta.className = "task-meta";
    const label = labelNames.get(task.labelId);
    const labelName = document.createElement("span");
    labelName.className = "task-label";
    const dot = labelDot(label);
    const labelText = document.createElement("span");
    labelText.textContent = label?.name ?? "No label";
    labelName.append(dot, labelText);
    const due = document.createElement("span");
    due.className = task.followUp ? "task-date follow-up" : "task-date";
    due.textContent = dueText(task, deps.now());
    const scores = document.createElement("span");
    scores.className = "task-scores";
    scores.textContent = `U ${String(task.urgency)} · I ${String(task.importance)}`;
    scores.title = `Urgency ${String(task.urgency)} (from the date), importance ${String(task.importance)}`;
    meta.append(labelName, due, scores);
    li.append(box, text, meta);
    if (confirming === key && task.status === "open") {
      box.checked = true;
      box.disabled = true;
      li.append(confirmDone(task, where, box));
      return li;
    }
    const actions = document.createElement("div");
    actions.className = "task-actions";
    if (where !== "next" && task.status === "open") {
      const picked = isPickedToday(task, deps.now());
      const star = document.createElement("button");
      star.type = "button";
      star.className = picked ? "task-star picked" : "task-star";
      star.id = `${where}-star-${task.id}`;
      star.textContent = picked ? "★" : "☆";
      star.setAttribute("aria-pressed", String(picked));
      star.setAttribute(
        "aria-label",
        `${picked ? "Remove from today" : "Pick for today"}: ${task.text}`,
      );
      star.addEventListener("click", () => {
        void setToday(task, !picked, star);
      });
      actions.append(star);
    }
    if (where === "list") {
      const edit = document.createElement("button");
      edit.type = "button";
      edit.className = "task-edit";
      edit.id = `task-edit-${task.id}`;
      edit.textContent = "Edit";
      edit.setAttribute("aria-label", `Edit: ${task.text}`);
      edit.addEventListener("click", () => {
        openEdit(task.id);
      });
      actions.append(edit);
      if (task.status === "open") {
        const dropButton = document.createElement("button");
        dropButton.type = "button";
        dropButton.className = "task-drop";
        dropButton.id = `task-drop-${task.id}`;
        dropButton.textContent = "Drop";
        dropButton.setAttribute(
          "aria-label",
          `Drop to Graveyard: ${task.text}`,
        );
        dropButton.addEventListener("click", () => {
          void drop(task, dropButton);
        });
        actions.append(dropButton);
      }
    }
    if (actions.childElementCount > 0) li.append(actions);
    return li;
  }

  /** Opens the Edit form in the list row and focuses its text, which scrolls to it. */
  function openEdit(id: string): void {
    editingId = id;
    editErrors = new Map();
    draw();
    document.getElementById(`task-edit-text-${id}`)?.focus();
  }

  /** The open board task with this id, or undefined (the menu may lag a live update). */
  function openTask(id: string): ScoredTask | undefined {
    return state.tasks.find((t) => t.id === id && t.status === "open");
  }

  /** The "Mark as done? Yes, done / Cancel" bar shown in a ticked row (i72). */
  function confirmDone(
    task: ScoredTask,
    where: RowPlace,
    box: HTMLInputElement,
  ): HTMLElement {
    const bar = document.createElement("div");
    bar.className = "confirm-done";
    bar.setAttribute("role", "group");
    bar.setAttribute("aria-label", `Confirm done: ${task.text}`);
    const question = document.createElement("span");
    question.textContent = "Mark as done?";
    const yes = document.createElement("button");
    yes.type = "button";
    yes.id = `confirm-done-${where}-${task.id}`;
    yes.className = "confirm-yes";
    yes.textContent = "Yes, done";
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.textContent = "Cancel";
    const close = () => {
      confirming = null;
      draw();
    };
    yes.addEventListener("click", () => {
      yes.disabled = true;
      cancel.disabled = true;
      confirming = null;
      void setStatus(task, "done", box).finally(() => {
        // A failed save keeps the task open; redraw so the row shows that.
        if (task.status === "open") draw();
      });
    });
    cancel.addEventListener("click", close);
    bar.addEventListener("keydown", (event) => {
      if (event.key === "Escape") close();
    });
    bar.append(question, yes, cancel);
    return bar;
  }

  /** The Edit form for `task`, wired to the save rules (edit checks, stale-page check). */
  function editForm(task: ScoredTask): HTMLFormElement {
    const close = () => {
      editingId = null;
      editErrors = new Map();
      draw();
    };
    return buildEditForm(task, {
      labels: state.labels,
      errors: editErrors,
      onCancel: close,
      onSubmit: (input, save) => {
        const result = editTask(task, input, state.labels, deps.now());
        if (!result.ok) {
          editErrors = new Map(result.errors.map((e) => [e.field, e.message]));
          draw();
          return;
        }
        if (result.value === task) {
          close();
          return;
        }
        save.disabled = true;
        void (async () => {
          try {
            await saveIfUnchanged(task, result.value);
            editingId = null;
            editErrors = new Map();
            deps.onSaved(result.value);
          } catch (error: unknown) {
            save.disabled = false;
            if (error instanceof StorageError && error.kind === "conflict") {
              // Close the form so the row shows the version from the other device.
              close();
            }
            deps.onError(error);
          }
        })();
      },
    });
  }

  return {
    render(next) {
      state = next;
      // Redrawing would rebuild an open Edit form and lose what was typed, so wait
      // until it closes (Save and Cancel both redraw). Covers the 15-minute refresh.
      if (editingId === null) draw();
    },
    markDone(id) {
      const task = openTask(id);
      if (task) void setStatus(task, "done", null);
    },
    toggleToday(id) {
      const task = openTask(id);
      if (task) void setToday(task, !isPickedToday(task, deps.now()), null);
    },
    edit(id) {
      if (openTask(id)) openEdit(id);
    },
    drop(id) {
      const task = openTask(id);
      if (task) void drop(task, null);
    },
  };
}

function emptyItem(text: string): HTMLLIElement {
  const li = document.createElement("li");
  li.className = "empty";
  li.textContent = text;
  return li;
}
