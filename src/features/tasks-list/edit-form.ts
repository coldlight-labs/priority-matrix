// The task Edit form: text, date, time, follow-up, importance and label (Q21, #15).
// It only builds the form and collects its values; the tasks list decides what a
// submit does (edit checks and the stale-page check, #20). Split out in #21.

import {
  TASK_TEXT_MAX,
  type Label,
  type Task,
  type TaskInput,
} from "../../core";
import { dateFields, scoreSlider } from "../../ui";

/** What the Edit form needs from the tasks list. */
export interface EditFormOptions {
  /** All labels; the form offers active ones plus the task's own if archived since. */
  readonly labels: readonly Label[];
  /** Error message per field from the last submit, shown under each field. */
  readonly errors: ReadonlyMap<string, string>;
  /** Called on Cancel or Escape. */
  readonly onCancel: () => void;
  /** Called with the raw form values and the Save button (to disable while saving). */
  readonly onSubmit: (input: TaskInput, save: HTMLButtonElement) => void;
}

/** Builds the inline Edit form for `task`, filled with its current values. */
export function buildEditForm(
  task: Task,
  options: EditFormOptions,
): HTMLFormElement {
  const form = document.createElement("form");
  form.className = "task-edit-form";
  form.noValidate = true;
  form.setAttribute("aria-label", `Edit task: ${task.text}`);

  const text = document.createElement("input");
  text.type = "text";
  text.id = `task-edit-text-${task.id}`;
  text.maxLength = TASK_TEXT_MAX;
  text.value = task.text;
  text.setAttribute("aria-label", "Task text");

  const dates = editDates(task);
  const importance = scoreSlider(
    `task-edit-importance-${task.id}`,
    task.importance,
  );
  // The caption sits inside the slider row here, before the range.
  const importanceCaption = document.createElement("label");
  importanceCaption.htmlFor = importance.input.id;
  importanceCaption.textContent = "Importance";
  importance.wrap.prepend(importanceCaption);

  const label = document.createElement("select");
  label.id = `task-edit-label-${task.id}`;
  label.setAttribute("aria-label", "Label");
  // Active labels, plus the task's own label if it was archived since.
  const choices = options.labels
    .filter((l) => !l.archived || l.id === task.labelId)
    .sort((a, b) => a.name.localeCompare(b.name));
  for (const l of choices) {
    const option = document.createElement("option");
    option.value = l.id;
    option.textContent = l.archived ? `${l.name} (archived)` : l.name;
    label.append(option);
  }
  label.value = task.labelId;

  const save = document.createElement("button");
  save.type = "submit";
  save.textContent = "Save";
  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.textContent = "Cancel";
  cancel.addEventListener("click", options.onCancel);
  form.addEventListener("keydown", (event) => {
    if (event.key === "Escape") options.onCancel();
  });

  const errorFor = (field: string) => {
    const p = document.createElement("p");
    p.className = "field-error";
    p.id = `task-edit-${field}-error-${task.id}`;
    p.setAttribute("role", "alert");
    const message = options.errors.get(field) ?? "";
    p.textContent = message;
    p.hidden = message === "";
    return p;
  };

  const actions = document.createElement("div");
  actions.className = "task-edit-actions";
  actions.append(save, cancel);
  form.append(
    text,
    errorFor("text"),
    dates.wrap,
    errorFor("date"),
    errorFor("time"),
    errorFor("followUp"),
    importance.wrap,
    errorFor("importance"),
    label,
    errorFor("labelId"),
    actions,
  );

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    options.onSubmit(
      {
        text: text.value,
        importance: importance.input.valueAsNumber,
        labelId: label.value,
        date: dates.date.value,
        time: dates.time.value,
        followUp: dates.followUp.checked,
      },
      save,
    );
  });
  return form;
}

/**
 * The shared date, time and follow-up controls (#58), filled from `task`, in one row
 * with spoken names instead of captions.
 */
function editDates(task: Task) {
  const parts = dateFields(
    {
      date: `task-edit-date-${task.id}`,
      time: `task-edit-time-${task.id}`,
      followUp: `task-edit-follow-up-${task.id}`,
    },
    { date: task.date ?? "", time: task.time ?? "", followUp: task.followUp },
  );
  parts.date.setAttribute("aria-label", "Date (optional)");
  parts.time.setAttribute("aria-label", "Time (optional)");
  const wrap = document.createElement("div");
  wrap.className = "task-edit-dates";
  wrap.append(parts.date, parts.time, parts.followUpWrap);
  return { wrap, date: parts.date, time: parts.time, followUp: parts.followUp };
}
