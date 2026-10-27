// Export feature: Export CSV offers a spreadsheet of all tasks; Full backup offers a
// JSON file of everything, the complete backup and the import format for a future
// migration (ADR 0001, #40).

import {
  LABEL_SCHEMA_VERSION,
  QUADRANT_NAMES,
  quadrantOf,
  scoreTasks,
  TASK_SCHEMA_VERSION,
  type FileSaver,
  type Label,
  type LabelRepository,
  type SaveOutcome,
  type Task,
  type TaskRepository,
} from "../../core";

const CSV_HEADER = [
  "id",
  "text",
  "label",
  "date",
  "time",
  "followUp",
  "today",
  "urgency",
  "importance",
  "quadrant",
  "status",
  "createdAt",
  "updatedAt",
] as const;

/** Leading characters a spreadsheet may treat as a formula (plan, plus OWASP: tab and CR; i21). */
const FORMULA_START = /^[=+\-@\t\r]/;

/** Byte order mark, so Excel reads the UTF-8 CSV correctly (accents, non-Latin text). */
const UTF8_BOM = "﻿";

/**
 * All labels and tasks as pretty-printed JSON, stamped with the export time and the
 * schema version of each document type. Tasks are stored fields only: urgency is
 * calculated, so it is left out (it follows from the date).
 */
export function buildJson(
  tasks: readonly Task[],
  labels: readonly Label[],
  now: Date,
): string {
  return JSON.stringify(
    {
      exportedAt: now.toISOString(),
      schemaVersions: {
        labels: LABEL_SCHEMA_VERSION,
        tasks: TASK_SCHEMA_VERSION,
      },
      labels,
      tasks,
    },
    null,
    2,
  );
}

/**
 * One CSV cell. Text that could run as a spreadsheet formula gets a leading
 * single quote; cells with quotes, commas or line breaks are quoted (RFC 4180).
 */
export function csvCell(value: string | number): string {
  let text = String(value);
  if (typeof value === "string" && FORMULA_START.test(text)) {
    text = `'${text}`;
  }
  if (/[",\r\n]/.test(text)) {
    text = `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

/**
 * One row per task with its label name, date fields, and urgency and quadrant as of
 * `now` (i40). Lines end in CRLF (RFC 4180).
 */
export function buildCsv(
  tasks: readonly Task[],
  labels: readonly Label[],
  now: Date,
): string {
  const labelNames = new Map(labels.map((l) => [l.id, l.name]));
  const rows = scoreTasks(tasks, now).map((t) =>
    [
      t.id,
      t.text,
      labelNames.get(t.labelId) ?? "",
      t.date ?? "",
      t.time ?? "",
      t.followUp ? "yes" : "no",
      t.today ?? "",
      t.urgency,
      t.importance,
      QUADRANT_NAMES[quadrantOf(t)].name,
      t.status,
      t.createdAt,
      t.updatedAt,
    ]
      .map(csvCell)
      .join(","),
  );
  return UTF8_BOM + [CSV_HEADER.join(","), ...rows].join("\r\n") + "\r\n";
}

/** File names for an export on the viewer's local date, e.g. priority-matrix-2026-10-23.json (i22). */
export function exportFilenames(now: Date): { json: string; csv: string } {
  const date = [
    String(now.getFullYear()),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
  const base = `priority-matrix-${date}`;
  return { json: `${base}.json`, csv: `${base}.csv` };
}

/** Which file to offer: the everyday CSV, or the complete JSON backup (#40). */
export type ExportKind = "csv" | "json";

/**
 * Loads all labels and tasks and offers one file: the CSV for Export, or the JSON for
 * Full backup (the complete backup and the moving-out format, ADR 0001). The viewer
 * confirms the save. Storage errors propagate as StorageError for the caller to show.
 */
export async function exportFile(
  kind: ExportKind,
  deps: {
    readonly tasks: TaskRepository;
    readonly labels: LabelRepository;
    readonly saver: FileSaver;
    readonly now: Date;
  },
): Promise<SaveOutcome> {
  const [tasks, labels] = await Promise.all([
    deps.tasks.list(),
    deps.labels.list(),
  ]);
  const names = exportFilenames(deps.now);
  return kind === "csv"
    ? deps.saver.save(names.csv, buildCsv(tasks.items, labels.items, deps.now))
    : deps.saver.save(
        names.json,
        buildJson(tasks.items, labels.items, deps.now),
      );
}

/** A short message for the result of offering one file. */
export function exportMessage(kind: ExportKind, outcome: SaveOutcome): string {
  switch (outcome) {
    case "saved":
      return kind === "csv"
        ? "Saved the CSV."
        : "Saved the full backup (JSON).";
    case "declined":
      return "Export cancelled.";
    case "failed":
      return "Couldn't save the file. Try again in a moment.";
    case "unavailable":
      return "Saving files isn't available here.";
  }
}

/**
 * Builds the "Export CSV" and "Full backup (JSON)" buttons inside `container`. Hidden
 * when saving files is not available (local preview, or a viewer without downloads).
 */
export function mountExport(
  container: HTMLElement,
  deps: {
    readonly tasks: TaskRepository;
    readonly labels: LabelRepository;
    readonly saver: FileSaver;
    readonly available: boolean;
    readonly now: () => Date;
    readonly onError: (error: unknown) => void;
  },
): void {
  const wrap = document.createElement("div");
  wrap.className = "export";
  wrap.hidden = !deps.available;
  const note = document.createElement("p");
  note.className = "export-note";
  note.id = "export-note";
  note.setAttribute("role", "status");
  note.textContent =
    "Export CSV saves all tasks as a spreadsheet. Full backup saves everything as JSON, for moving your data.";

  const buttons: HTMLButtonElement[] = [];
  const offer = (kind: ExportKind, id: string, text: string) => {
    const button = document.createElement("button");
    button.type = "button";
    button.id = id;
    button.textContent = text;
    // The everyday CSV is the main action; the full backup is the plain one.
    if (kind === "csv") button.className = "primary";
    button.addEventListener("click", () => {
      void (async () => {
        for (const b of buttons) b.disabled = true;
        try {
          const outcome = await exportFile(kind, {
            tasks: deps.tasks,
            labels: deps.labels,
            saver: deps.saver,
            now: deps.now(),
          });
          note.textContent = exportMessage(kind, outcome);
        } catch (error: unknown) {
          deps.onError(error);
        } finally {
          for (const b of buttons) b.disabled = false;
        }
      })();
    });
    buttons.push(button);
  };
  offer("csv", "export-csv", "Export CSV");
  offer("json", "export-json", "Full backup (JSON)");
  wrap.append(...buttons, note);
  container.append(wrap);
}
