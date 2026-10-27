// Dot menu (#46): a small popup next to a dot with Mark done, Pick for today, Edit
// and Drop. It only reports the chosen action; the app passes it to the task list,
// which does the saving. Mark done asks first, as the list does (i72). For dots that
// touch, the same popup first lists the tasks there to pick from (#50).

import type { Label, ScoredTask } from "../../core";
import { labelDot } from "../../ui";

/** What the dot menu can ask for. */
export type DotAction = "done" | "today" | "edit" | "drop";

/** What the menu needs from the matrix. */
interface DotMenuDeps {
  readonly onAction: (taskId: string, action: DotAction) => void;
  /** The current dot for a task; dots are replaced on every redraw. */
  readonly dotOf: (taskId: string) => SVGGElement | undefined;
}

/** Space between the dot and the menu, in CSS pixels. */
const MENU_GAP = 6;

/** The menu's handle, used by the matrix. */
export interface DotMenu {
  /** Opens the menu for `task` and focuses its first action. */
  open(task: ScoredTask, pickedToday: boolean): void;
  /**
   * Lists `tasks` (already in priority order) beside the dot `anchorId`, and calls
   * `onPick` with the one picked. The list closes only when `onPick` closes or
   * replaces it.
   */
  choose(
    anchorId: string,
    tasks: readonly ScoredTask[],
    labels: ReadonlyMap<string, Label>,
    onPick: (task: ScoredTask) => void,
  ): void;
  /** Closes the menu, optionally putting focus back on its dot. */
  close(focusDot: boolean): void;
  /** Moves the menu next to its dot again, after a redraw. */
  place(): void;
  /** The task the menu is open for, or null. */
  openFor(): string | null;
}

/** Builds the (hidden) menu inside `figure`, which must be the positioning parent. */
export function createDotMenu(figure: HTMLElement, deps: DotMenuDeps): DotMenu {
  const menu = document.createElement("div");
  menu.className = "dot-menu";
  menu.id = "dot-menu";
  menu.hidden = true;
  figure.append(menu);
  let taskId: string | null = null;
  /** Whether the list of a crowded spot is showing, rather than one task's menu. */
  let choosing = false;

  const buttons = () => [...menu.querySelectorAll("button")];

  function close(focusDot: boolean): void {
    const id = taskId;
    taskId = null;
    choosing = false;
    menu.hidden = true;
    menu.replaceChildren();
    if (focusDot && id !== null) deps.dotOf(id)?.focus();
  }

  /** Closes, then reports. Edit moves focus to its form, so it skips the dot. */
  function act(action: DotAction): void {
    const id = taskId;
    if (id === null) return;
    close(action !== "edit");
    deps.onAction(id, action);
  }

  function button(
    text: string,
    onClick: () => void,
    className?: string,
  ): HTMLButtonElement {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = text;
    if (className !== undefined) b.className = className;
    b.addEventListener("click", onClick);
    return b;
  }

  function showActions(task: ScoredTask, pickedToday: boolean): void {
    menu.setAttribute("role", "menu");
    menu.setAttribute("aria-label", `Actions: ${task.text}`);
    const items = [
      button("Mark done", () => {
        showConfirm(task);
      }),
      button(pickedToday ? "Remove from today" : "Pick for today", () => {
        act("today");
      }),
      button("Edit", () => {
        act("edit");
      }),
      button(
        "Drop",
        () => {
          act("drop");
        },
        "dot-menu-drop",
      ),
    ];
    for (const item of items) item.setAttribute("role", "menuitem");
    menu.replaceChildren(...items);
  }

  /** The same question as a ticked list row (i72). */
  function showConfirm(task: ScoredTask): void {
    menu.setAttribute("role", "group");
    menu.setAttribute("aria-label", `Confirm done: ${task.text}`);
    const question = document.createElement("p");
    question.textContent = "Mark as done?";
    const yes = button(
      "Yes, done",
      () => {
        act("done");
      },
      "confirm-yes",
    );
    const cancel = button("Cancel", () => {
      close(true);
    });
    menu.replaceChildren(question, yes, cancel);
    yes.focus();
  }

  menu.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      // Focusing the anchor would select it, and the list was there to avoid guessing.
      close(!choosing);
    } else if (event.key === "Tab") {
      close(false);
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const list = buttons();
      const at = list.findIndex((b) => b === document.activeElement);
      const step = event.key === "ArrowDown" ? 1 : -1;
      list[(at + step + list.length) % list.length]?.focus();
    }
  });

  // A press anywhere else closes the menu, like a native one.
  document.addEventListener("pointerdown", (event) => {
    if (taskId === null) return;
    if (event.target instanceof Node && menu.contains(event.target)) return;
    close(false);
  });

  /** Beside the dot, to its right, or to its left when there is no room. */
  function place(): void {
    if (taskId === null) return;
    const mark = deps.dotOf(taskId)?.querySelector(".mark");
    if (!mark) return;
    const dot = mark.getBoundingClientRect();
    const box = figure.getBoundingClientRect();
    const width = menu.offsetWidth;
    let left = dot.right - box.left + MENU_GAP;
    if (left + width > box.width) {
      left = Math.max(0, dot.left - box.left - MENU_GAP - width);
    }
    menu.style.left = `${String(Math.round(left))}px`;
    menu.style.top = `${String(Math.round(dot.bottom - box.top + MENU_GAP))}px`;
  }

  return {
    choose(anchorId, tasks, labels, onPick) {
      taskId = anchorId;
      choosing = true;
      menu.hidden = false;
      menu.setAttribute("role", "menu");
      menu.setAttribute("aria-label", `${String(tasks.length)} tasks here`);
      const title = document.createElement("p");
      title.className = "chooser-title";
      title.textContent = `${String(tasks.length)} tasks here`;
      // The menu's own label already says this to screen readers.
      title.setAttribute("aria-hidden", "true");
      const items = tasks.map((task) => {
        const row = button(
          "",
          () => {
            onPick(task);
          },
          "chooser-row",
        );
        row.setAttribute("role", "menuitem");
        const text = document.createElement("span");
        text.textContent = task.text;
        row.append(labelDot(labels.get(task.labelId)), text);
        return row;
      });
      menu.replaceChildren(title, ...items);
      place();
      items[0]?.focus();
    },
    open(task, pickedToday) {
      taskId = task.id;
      choosing = false;
      menu.hidden = false;
      showActions(task, pickedToday);
      place();
      buttons()[0]?.focus();
    },
    close,
    place,
    openFor: () => taskId,
  };
}
