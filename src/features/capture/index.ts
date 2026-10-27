// Capture feature: the quick-add form (text, optional date with time and follow-up flag,
// importance slider, label picker, and "Just an idea" to save to the Ideas tab, #42).
// Urgency comes from the date (#15).

import {
  createTask,
  TASK_TEXT_MAX,
  type Label,
  type Task,
  type TaskRepository,
  type ValidationError,
} from "../../core";
import { dateFields, errorLine, scoreSlider } from "../../ui";

/** What the capture form needs from the app. */
export interface CaptureDeps {
  readonly tasks: TaskRepository;
  readonly now: () => Date;
  readonly newId: () => string;
  /** Called after a task is stored, so the app can update its state. */
  readonly onSaved: (task: Task) => void;
  /** Called when storing fails (for example a StorageError). */
  readonly onError: (error: unknown) => void;
}

/** Slider starting value and the value it returns to after each add (i27). */
const SCORE_START = 50;

type Field = "text" | "date" | "time" | "followUp" | "importance" | "labelId";

/**
 * Builds the capture form inside `container`. Call `render` whenever the labels change.
 */
export function mountCapture(
  container: HTMLElement,
  deps: CaptureDeps,
): { render(labels: readonly Label[]): void } {
  let labels: readonly Label[] = [];

  const form = document.createElement("form");
  form.className = "capture";
  form.noValidate = true;
  form.setAttribute("aria-label", "Add a task");

  const text = document.createElement("input");
  text.id = "capture-text";
  text.name = "text";
  text.type = "text";
  text.maxLength = TASK_TEXT_MAX;
  text.placeholder = "What needs doing?";
  text.autocomplete = "off";

  // Time and follow-up wait for a date (shared rule, #58).
  const dates = dateFields({
    date: "capture-date",
    time: "capture-time",
    followUp: "capture-follow-up",
  });
  const { date, time, followUp, followUpWrap } = dates;
  date.name = "date";
  time.name = "time";
  followUp.name = "followUp";

  const importance = scoreSlider("capture-importance", SCORE_START);
  importance.input.name = "importance";

  const label = document.createElement("select");
  label.id = "capture-label";
  label.name = "labelId";

  const submit = document.createElement("button");
  submit.type = "submit";
  submit.textContent = "Add task";

  const idea = document.createElement("input");
  idea.id = "capture-idea";
  idea.name = "idea";
  idea.type = "checkbox";
  const ideaText = document.createElement("label");
  ideaText.htmlFor = idea.id;
  ideaText.textContent = "Just an idea";
  const ideaWrap = document.createElement("div");
  ideaWrap.className = "capture-idea";
  ideaWrap.append(idea, ideaText);
  const syncIdea = () => {
    submit.textContent = idea.checked ? "Save idea" : "Add task";
  };
  idea.addEventListener("change", syncIdea);
  // "Just an idea" sits with the button it relabels.
  const actions = document.createElement("div");
  actions.className = "capture-actions";
  actions.append(ideaWrap, submit);

  const errors: Record<Field, HTMLElement> = {
    text: errorLine("capture-text-error"),
    date: errorLine("capture-date-error"),
    time: errorLine("capture-time-error"),
    followUp: errorLine("capture-follow-up-error"),
    importance: errorLine("capture-importance-error"),
    labelId: errorLine("capture-label-error"),
  };

  form.append(
    field("Task", text, errors.text, "capture-field-text"),
    field("Date (optional)", date, errors.date, "capture-field-date"),
    field("Time (optional)", time, errors.time, "capture-field-time"),
    group(followUpWrap, errors.followUp, "capture-field-follow-up"),
    field(
      "Importance",
      importance.wrap,
      errors.importance,
      "capture-field-score",
      importance.input.id,
    ),
    field("Label", label, errors.labelId, "capture-field-label"),
    actions,
  );
  container.append(form);

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    void addTask();
  });

  async function addTask(): Promise<void> {
    showErrors([]);
    const result = createTask(
      {
        text: text.value,
        importance: importance.input.valueAsNumber,
        labelId: label.value,
        date: date.value,
        time: time.value,
        followUp: followUp.checked,
      },
      labels,
      { id: deps.newId(), now: deps.now() },
      idea.checked ? "idea" : "open",
    );
    if (!result.ok) {
      showErrors(result.errors);
      return;
    }
    submit.disabled = true;
    try {
      await deps.tasks.save(result.value);
      deps.onSaved(result.value);
      text.value = "";
      date.value = "";
      dates.sync();
      importance.set(SCORE_START);
      idea.checked = false;
      syncIdea();
      text.focus();
    } catch (error: unknown) {
      deps.onError(error);
    } finally {
      submit.disabled = false;
    }
  }

  function showErrors(list: readonly ValidationError[]): void {
    for (const [name, line] of Object.entries(errors)) {
      const message = list.find((e) => e.field === name)?.message ?? "";
      line.textContent = message;
      line.hidden = message === "";
    }
    text.setAttribute(
      "aria-invalid",
      String(list.some((e) => e.field === "text")),
    );
  }

  return {
    render(next) {
      labels = next;
      const active = next.filter((l) => !l.archived);
      const keep = active.some((l) => l.id === label.value) ? label.value : "";
      label.replaceChildren();
      if (active.length === 0) {
        label.append(option("", "Create a label first"));
        label.disabled = true;
        return;
      }
      label.disabled = false;
      for (const l of [...active].sort((a, b) =>
        a.name.localeCompare(b.name),
      )) {
        label.append(option(l.id, l.name));
      }
      label.value = keep === "" ? (label.options[0]?.value ?? "") : keep;
    },
  };
}

function field(
  caption: string,
  control: HTMLElement,
  error: HTMLElement,
  className: string,
  controlId = control.id,
): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = `capture-field ${className}`;
  const labelEl = document.createElement("label");
  labelEl.htmlFor = controlId;
  labelEl.textContent = caption;
  wrap.append(labelEl, control, error);
  return wrap;
}

/** A field whose control carries its own label (the follow-up tickbox). */
function group(
  control: HTMLElement,
  error: HTMLElement,
  className: string,
): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = `capture-field ${className}`;
  wrap.append(control, error);
  return wrap;
}

function option(value: string, text: string): HTMLOptionElement {
  const o = document.createElement("option");
  o.value = value;
  o.textContent = text;
  return o;
}
