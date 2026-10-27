// Labels feature: create, rename, recolor, archive and restore domain labels (plan i3, i35).
// Create, rename and restore go through the checked save: storage re-reads labels and
// runs the name rule under a shared lease, so neither a stale page (i44) nor two
// devices at once (#56, i66) can store a duplicate name.

import {
  archiveLabel,
  createLabel,
  LABEL_NAME_MAX,
  PALETTE,
  renameLabel,
  restoreLabel,
  setLabelColor,
  StorageError,
  swatchOf,
  type Label,
  type LabelRepository,
  type Result,
} from "../../core";
import { errorLine, labelDot } from "../../ui";

/** Shown in the field's error line while another device holds the label-names lease. */
const BUSY_MESSAGE =
  "Labels are being changed on another device. Try again in a few seconds.";

/** What the label manager needs from the app. */
export interface LabelsDeps {
  readonly labels: LabelRepository;
  readonly now: () => Date;
  readonly newId: () => string;
  /** Called after a label is stored, so the app can update its state. */
  readonly onSaved: (label: Label) => void;
  /** Called with the labels re-read from storage before a name check (i44). */
  readonly onLoaded: (labels: readonly Label[]) => void;
  /** Called when storing or loading fails (for example a StorageError). */
  readonly onError: (error: unknown) => void;
}

/**
 * Builds the label manager inside `container`. Call `render` whenever the labels change.
 * Archiving asks for a second click instead of a dialog, because artifact pages
 * cannot show confirm() dialogs. Archived labels can be restored (changes i28).
 */
export function mountLabels(
  container: HTMLElement,
  deps: LabelsDeps,
): { render(labels: readonly Label[]): void } {
  let labels: readonly Label[] = [];
  let editingId: string | null = null;
  let confirmingId: string | null = null;
  let pickingId: string | null = null;
  let renameError = "";
  /** What the user typed in the rename box, kept across redraws. */
  let renameDraft = "";
  /** Restore error per archived label id, shown under that label. */
  const restoreErrors = new Map<string, string>();

  const form = document.createElement("form");
  form.className = "label-new";
  form.noValidate = true;
  const nameInput = document.createElement("input");
  nameInput.id = "label-new-name";
  nameInput.type = "text";
  nameInput.maxLength = LABEL_NAME_MAX;
  nameInput.placeholder = "New label";
  nameInput.autocomplete = "off";
  nameInput.setAttribute("aria-label", "New label name");
  const addButton = document.createElement("button");
  addButton.type = "submit";
  addButton.textContent = "Add label";
  const newError = errorLine("label-new-error");
  form.append(nameInput, addButton, newError);

  const list = document.createElement("ul");
  list.id = "label-list";
  list.className = "label-list";

  const archived = document.createElement("details");
  archived.className = "label-archived";
  const archivedSummary = document.createElement("summary");
  const archivedList = document.createElement("ul");
  archivedList.id = "label-archived-list";
  archived.append(archivedSummary, archivedList);

  container.append(form, list, archived);

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const name = nameInput.value;
    const id = deps.newId();
    void (async () => {
      const message = await storeChecked(
        (stored) => createLabel(name, stored, { id, now: deps.now() }),
        () => {
          nameInput.value = "";
        },
      );
      showMessage(newError, message);
    })();
  });

  /**
   * Saves a name change through the checked save (#56) and passes the labels it was
   * checked against to the app. Returns the message for the field's error line: the
   * rule's reason, the busy message, or "" when saved (other failures go to onError).
   */
  async function storeChecked(
    build: (stored: readonly Label[]) => Result<Label>,
    done: () => void,
  ): Promise<string> {
    try {
      const { result, stored } = await deps.labels.saveChecked(build);
      labels = stored;
      deps.onLoaded(stored);
      if (!result.ok) return result.errors[0]?.message ?? "";
      done();
      deps.onSaved(result.value);
      return "";
    } catch (error: unknown) {
      if (error instanceof StorageError && error.kind === "conflict") {
        return BUSY_MESSAGE;
      }
      deps.onError(error);
      return "";
    }
  }

  /** The stored version of `label` from `fresh`, or `label` if it is not there. */
  function latest(label: Label, fresh: readonly Label[]): Label {
    return fresh.find((l) => l.id === label.id) ?? label;
  }

  /** Saves a label; on success runs `done` and tells the app. */
  async function store(label: Label, done: () => void): Promise<void> {
    try {
      await deps.labels.save(label);
      done();
      deps.onSaved(label);
    } catch (error: unknown) {
      deps.onError(error);
    }
  }

  function draw(): void {
    const active = sortByName(labels.filter((l) => !l.archived));
    list.replaceChildren(...active.map(row));
    if (active.length === 0) {
      const empty = document.createElement("li");
      empty.className = "empty";
      empty.textContent = "No active labels. Add one above.";
      list.append(empty);
    }
    const old = sortByName(labels.filter((l) => l.archived));
    archived.hidden = old.length === 0;
    archivedSummary.textContent = `Archived (${String(old.length)})`;
    archivedList.replaceChildren(...old.map(archivedRow));
  }

  function archivedRow(label: Label): HTMLLIElement {
    const li = document.createElement("li");
    li.className = "label-row";
    li.dataset.labelId = label.id;
    const name = document.createElement("span");
    name.className = "label-name";
    name.textContent = label.name;
    li.append(labelDot({ color: label.color }));
    const error = errorLine(`label-restore-error-${label.id}`);
    const message = restoreErrors.get(label.id) ?? "";
    error.textContent = message;
    error.hidden = message === "";
    const restore = button("Restore", () => {
      void (async () => {
        const message = await storeChecked(
          (stored) => restoreLabel(latest(label, stored), stored, deps.now()),
          () => {
            restoreErrors.delete(label.id);
          },
        );
        if (message !== "") {
          restoreErrors.set(label.id, message);
          draw();
        }
      })();
    });
    li.append(name, restore, error);
    return li;
  }

  function row(label: Label): HTMLLIElement {
    const li = document.createElement("li");
    li.className = "label-row";
    li.dataset.labelId = label.id;

    if (editingId === label.id) {
      const input = document.createElement("input");
      input.id = `label-rename-${label.id}`;
      input.type = "text";
      input.maxLength = LABEL_NAME_MAX;
      input.value = renameDraft;
      input.addEventListener("input", () => {
        renameDraft = input.value;
      });
      input.setAttribute("aria-label", `Rename ${label.name}`);
      const error = errorLine(`label-rename-error-${label.id}`);
      error.textContent = renameError;
      error.hidden = renameError === "";
      const save = button("Save", () => {
        renameDraft = input.value;
        void (async () => {
          const draft = renameDraft;
          const message = await storeChecked(
            (stored) =>
              renameLabel(latest(label, stored), draft, stored, deps.now()),
            () => {
              editingId = null;
              renameError = "";
            },
          );
          if (message !== "") {
            renameError = message;
            draw();
          }
        })();
      });
      const cancel = button("Cancel", () => {
        editingId = null;
        renameError = "";
        draw();
      });
      input.addEventListener("keydown", (event) => {
        if (event.key === "Enter") save.click();
        if (event.key === "Escape") cancel.click();
      });
      li.append(input, save, cancel, error);
      return li;
    }

    const name = document.createElement("span");
    name.className = "label-name";
    name.textContent = label.name;

    if (confirmingId === label.id) {
      const note = document.createElement("span");
      note.className = "label-confirm";
      note.textContent = "Archive? Its tasks stay.";
      const yes = button("Archive", () => {
        confirmingId = null;
        void store(archiveLabel(label, deps.now()), () => undefined);
      });
      yes.classList.add("danger");
      const no = button("Cancel", () => {
        confirmingId = null;
        draw();
      });
      li.append(name, note, yes, no);
      return li;
    }

    const swatch = swatchOf(label.color);
    const colorButton = button("", () => {
      pickingId = pickingId === label.id ? null : label.id;
      editingId = null;
      confirmingId = null;
      draw();
    });
    colorButton.className = "color-button";
    colorButton.id = `label-color-${label.id}`;
    colorButton.append(labelDot({ color: label.color }));
    colorButton.setAttribute(
      "aria-label",
      `Color for ${label.name}: ${swatch === undefined ? "none" : `${swatch.name} ${swatch.shape}`}. Change color`,
    );
    colorButton.setAttribute("aria-expanded", String(pickingId === label.id));

    li.append(
      colorButton,
      name,
      button("Rename", () => {
        editingId = label.id;
        confirmingId = null;
        pickingId = null;
        renameError = "";
        renameDraft = label.name;
        draw();
        document.getElementById(`label-rename-${label.id}`)?.focus();
      }),
      button("Archive", () => {
        confirmingId = label.id;
        editingId = null;
        pickingId = null;
        draw();
      }),
    );
    if (pickingId === label.id) li.append(picker(label));
    return li;
  }

  /** The 15-swatch grid of shaped colors for one label (#45). Picking one saves it and closes the grid. */
  function picker(label: Label): HTMLElement {
    const grid = document.createElement("div");
    grid.className = "color-picker";
    grid.id = `label-picker-${label.id}`;
    grid.setAttribute("role", "group");
    grid.setAttribute("aria-label", `Colors for ${label.name}`);
    for (const swatch of PALETTE) {
      const option = button("", () => {
        const result = setLabelColor(label, swatch.id, deps.now());
        if (!result.ok) return;
        void store(result.value, () => {
          pickingId = null;
        });
      });
      option.className = "swatch";
      option.dataset.color = swatch.id;
      option.append(labelDot({ color: swatch.id }));
      option.title = `${swatch.name} ${swatch.shape}`;
      option.setAttribute("aria-label", `${swatch.name} ${swatch.shape}`);
      option.setAttribute("aria-pressed", String(swatch.id === label.color));
      grid.append(option);
    }
    return grid;
  }

  return {
    render(next) {
      labels = next;
      draw();
    },
  };
}

function sortByName(labels: readonly Label[]): Label[] {
  return [...labels].sort((a, b) => a.name.localeCompare(b.name));
}

function button(text: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement("button");
  b.type = "button";
  b.textContent = text;
  b.addEventListener("click", onClick);
  return b;
}

/** Shows `message` in an error line, or hides the line when it is empty. */
function showMessage(line: HTMLElement, message: string): void {
  line.textContent = message;
  line.hidden = message === "";
}
