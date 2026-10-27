// Shelf feature (#42): one list view used twice, for the Ideas tab (ideas, newest first,
// with "Make it a task" and "Drop") and the Graveyard tab (dropped tasks, most recently
// dropped first, with "Revive" and "Delete for good", which asks first, #54). Saves and
// deletes are checked, so a task changed on another device is not overwritten or
// deleted (#20, #34).

import {
  setTaskStatus,
  StorageError,
  type Label,
  type ScoredTask,
  type Task,
  type TaskRepository,
  type TaskStatus,
} from "../../core";
import { labelDot } from "../../ui";

/** Which shelf: ideas, or dropped tasks (the Graveyard). */
export type ShelfKind = "idea" | "dropped";

/** What a shelf needs from the app. */
export interface ShelfDeps {
  readonly kind: ShelfKind;
  readonly tasks: TaskRepository;
  readonly now: () => Date;
  /** Called after a task is stored, so the app can update its state. */
  readonly onSaved: (task: Task) => void;
  /** Called with the tasks re-read from storage after a conflict. */
  readonly onLoaded: (tasks: readonly Task[]) => void;
  /** Called after a task is deleted for good, so the app can drop it from its state. */
  readonly onDeleted: (id: string) => void;
  /** Called when storing fails. */
  readonly onError: (error: unknown) => void;
}

/** A button on a shelf row: its id prefix, text and the status it moves the task to. */
interface ShelfAction {
  readonly id: string;
  readonly text: string;
  readonly to: TaskStatus;
  readonly note: string;
}

const ACTIONS: Readonly<Record<ShelfKind, readonly ShelfAction[]>> = {
  idea: [
    {
      id: "shelf-promote",
      text: "Make it a task",
      to: "open",
      note: "Moved to the board.",
    },
    {
      id: "shelf-drop",
      text: "Drop",
      to: "dropped",
      note: "Moved to Graveyard. Revive it there.",
    },
  ],
  dropped: [
    {
      id: "shelf-revive",
      text: "Revive",
      to: "open",
      note: "Back on the board.",
    },
  ],
};

const EMPTY: Readonly<Record<ShelfKind, string>> = {
  idea: "No ideas yet. Tick “Just an idea” when adding one.",
  dropped: "Nothing here. Dropped tasks rest here until you revive them.",
};

/** Builds the shelf inside `container`. Call `render` whenever tasks or labels change. */
export function mountShelf(
  container: HTMLElement,
  deps: ShelfDeps,
): {
  render(state: {
    tasks: readonly ScoredTask[];
    labels: readonly Label[];
  }): void;
} {
  let state: { tasks: readonly ScoredTask[]; labels: readonly Label[] } = {
    tasks: [],
    labels: [],
  };
  /** The Graveyard row asking "Delete for good?", or null (#54). */
  let confirmingDelete: string | null = null;
  const note = document.createElement("p");
  note.className = "shelf-note";
  note.setAttribute("role", "status");
  const list = document.createElement("ul");
  list.className = "task-list shelf-list";
  container.append(note, list);

  /** After a conflict, shows the latest tasks; the conflict itself is still reported. */
  async function reloadAfter(error: unknown): Promise<void> {
    if (!(error instanceof StorageError && error.kind === "conflict")) return;
    try {
      deps.onLoaded((await deps.tasks.list()).items);
    } catch {
      // Live updates bring the latest version.
    }
  }

  /** Deletes for good through the checked delete; a revived task is kept (#54). */
  async function remove(
    task: ScoredTask,
    buttons: readonly HTMLButtonElement[],
  ): Promise<void> {
    for (const b of buttons) b.disabled = true;
    try {
      await deps.tasks.deleteIfUnchanged(task);
      confirmingDelete = null;
      note.textContent = "Deleted for good.";
      deps.onDeleted(task.id);
    } catch (error: unknown) {
      confirmingDelete = null;
      draw();
      await reloadAfter(error);
      deps.onError(error);
    }
  }

  /** Saves the move through the checked save; on a conflict, shows the latest tasks. */
  async function move(
    task: ScoredTask,
    action: ShelfAction,
    button: HTMLButtonElement,
  ): Promise<void> {
    button.disabled = true;
    const updated = setTaskStatus(task, action.to, deps.now());
    try {
      await deps.tasks.saveIfUnchanged(task, updated);
      note.textContent = action.note;
      deps.onSaved(updated);
    } catch (error: unknown) {
      button.disabled = false;
      await reloadAfter(error);
      deps.onError(error);
    }
  }

  function draw(): void {
    const labels = new Map(state.labels.map((l) => [l.id, l]));
    const shown = state.tasks
      .filter((t) => t.status === deps.kind)
      .sort((a, b) =>
        deps.kind === "idea"
          ? b.createdAt.localeCompare(a.createdAt)
          : b.updatedAt.localeCompare(a.updatedAt),
      );
    if (shown.length === 0) {
      const empty = document.createElement("li");
      empty.className = "empty";
      empty.textContent = EMPTY[deps.kind];
      list.replaceChildren(empty);
      return;
    }
    list.replaceChildren(...shown.map((t) => row(t, labels.get(t.labelId))));
  }

  function row(task: ScoredTask, label: Label | undefined): HTMLLIElement {
    const li = document.createElement("li");
    li.className = "task shelf-task";
    li.dataset.taskId = task.id;
    const text = document.createElement("span");
    text.className = "task-text";
    text.textContent = task.text;
    const meta = document.createElement("span");
    meta.className = "task-meta";
    const labelName = document.createElement("span");
    labelName.className = "task-label";
    const dot = labelDot(label);
    const labelText = document.createElement("span");
    labelText.textContent = label?.name ?? "No label";
    labelName.append(dot, labelText);
    meta.append(labelName);
    if (confirmingDelete === task.id) {
      li.append(text, meta, deleteConfirm(task));
      return li;
    }
    const actions = document.createElement("div");
    actions.className = "task-actions";
    for (const action of ACTIONS[deps.kind]) {
      const button = document.createElement("button");
      button.type = "button";
      button.id = `${action.id}-${task.id}`;
      button.textContent = action.text;
      button.setAttribute("aria-label", `${action.text}: ${task.text}`);
      button.addEventListener("click", () => {
        void move(task, action, button);
      });
      actions.append(button);
    }
    if (deps.kind === "dropped") {
      const del = document.createElement("button");
      del.type = "button";
      del.id = `shelf-delete-${task.id}`;
      del.className = "shelf-delete";
      del.textContent = "Delete for good";
      del.setAttribute("aria-label", `Delete for good: ${task.text}`);
      del.addEventListener("click", () => {
        confirmingDelete = task.id;
        draw();
        document.getElementById(`shelf-delete-yes-${task.id}`)?.focus();
      });
      actions.append(del);
    }
    li.append(text, meta, actions);
    return li;
  }

  /** "Delete for good? This can't be undone. Delete / Cancel", in the row (#54). */
  function deleteConfirm(task: ScoredTask): HTMLElement {
    const bar = document.createElement("div");
    bar.className = "shelf-confirm";
    bar.setAttribute("role", "group");
    bar.setAttribute("aria-label", `Confirm delete: ${task.text}`);
    const question = document.createElement("span");
    question.textContent = "Delete for good? This can't be undone.";
    const yes = document.createElement("button");
    yes.type = "button";
    yes.id = `shelf-delete-yes-${task.id}`;
    yes.className = "confirm-delete";
    yes.textContent = "Delete";
    const no = document.createElement("button");
    no.type = "button";
    no.id = `shelf-delete-no-${task.id}`;
    no.textContent = "Cancel";
    const cancel = () => {
      confirmingDelete = null;
      draw();
      document.getElementById(`shelf-delete-${task.id}`)?.focus();
    };
    yes.addEventListener("click", () => {
      void remove(task, [yes, no]);
    });
    no.addEventListener("click", cancel);
    bar.addEventListener("keydown", (event) => {
      if (event.key === "Escape") cancel();
    });
    bar.append(question, yes, no);
    return bar;
  }

  return {
    render(next) {
      state = next;
      draw();
    },
  };
}
