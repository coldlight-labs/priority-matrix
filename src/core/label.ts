import {
  firstFreeColor,
  isPaletteColor,
  legacyFamily,
  PALETTE,
} from "./palette";
import { fail, ok, type Result } from "./result";
import {
  checkCommonFields,
  isRecord,
  LABEL_SCHEMA_VERSION,
  type CreateMeta,
} from "./schema";

/** Longest allowed label name, after trimming. */
export const LABEL_NAME_MAX = 40;

/**
 * Labels inserted on first run of the in-memory local preview. General names only
 * (#74). Colors are spread across the palette so the seeds are easy to tell apart.
 */
export const SEED_LABELS: readonly { name: string; color: string }[] = [
  { name: "Work", color: "pink" },
  { name: "Home", color: "gold" },
  { name: "Health", color: "orange" },
  { name: "Family", color: "green" },
  { name: "Money", color: "indigo" },
  { name: "Admin", color: "red" },
  { name: "Learning", color: "teal" },
  { name: "Side project", color: "purple" },
  { name: "Errands", color: "sky" },
];

/**
 * General labels every new account on the server starts with (#64), each a
 * different color. The owner's own account starts without them (`--empty`).
 */
export const STARTER_LABELS: readonly { name: string; color: string }[] = [
  { name: "Work", color: "blue" },
  { name: "Home", color: "teal" },
  { name: "Personal", color: "purple" },
  { name: "Health", color: "red" },
  { name: "Money", color: "navy" },
];

/** A domain label. Archived labels keep their tasks but cannot be picked for new ones. */
export interface Label {
  readonly id: string;
  readonly name: string;
  readonly archived: boolean;
  /**
   * Palette swatch id, for example "teal" (#45). A label read from before #45 may hold
   * an old id such as "teal-1" until `upgradeLabelColors` moves it.
   */
  readonly color: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly schemaVersion: typeof LABEL_SCHEMA_VERSION;
}

/**
 * Upper-cases the first character, keeping the rest as typed (#16): "home" -> "Home",
 * "nASA" -> "NASA". Names starting with a digit or symbol are unchanged.
 */
function capitalizeFirst(text: string): string {
  // Spread splits by code point, so an emoji or accented first character stays whole.
  const [first = "", ...rest] = text;
  return first.toLocaleUpperCase() + rest.join("");
}

/**
 * Checks a proposed label name: 1 to 40 characters after trimming, first letter
 * capitalized, and unique (ignoring case) among active labels. Returns the name to
 * store. `renamingId` skips the label being renamed.
 */
export function validateLabelName(
  name: unknown,
  labels: readonly Label[],
  renamingId?: string,
): Result<string> {
  if (typeof name !== "string") {
    return fail([{ field: "name", message: "Must be text." }]);
  }
  const trimmed = capitalizeFirst(name.trim());
  if (trimmed.length === 0 || trimmed.length > LABEL_NAME_MAX) {
    return fail([
      {
        field: "name",
        message: `Must be 1 to ${String(LABEL_NAME_MAX)} characters.`,
      },
    ]);
  }
  const key = trimmed.toLowerCase();
  const taken = labels.some(
    (l) => !l.archived && l.id !== renamingId && l.name.toLowerCase() === key,
  );
  if (taken) {
    return fail([
      { field: "name", message: "An active label already has this name." },
    ]);
  }
  return ok(trimmed);
}

const COLOR_MESSAGE = "Must be a color from the palette.";

/**
 * Creates a new active label after checking its name and color. Without a color,
 * it gets the first palette color no active label uses.
 */
export function createLabel(
  name: unknown,
  labels: readonly Label[],
  meta: CreateMeta,
  color: unknown = firstFreeColor(labels),
): Result<Label> {
  const checked = validateLabelName(name, labels);
  if (!checked.ok) return checked;
  if (!isPaletteColor(color)) {
    return fail([{ field: "color", message: COLOR_MESSAGE }]);
  }
  const now = meta.now.toISOString();
  return ok({
    id: meta.id,
    name: checked.value,
    archived: false,
    color,
    createdAt: now,
    updatedAt: now,
    schemaVersion: LABEL_SCHEMA_VERSION,
  });
}

/** Renames a label after checking the new name against the other labels. */
export function renameLabel(
  label: Label,
  name: unknown,
  labels: readonly Label[],
  now: Date,
): Result<Label> {
  const checked = validateLabelName(name, labels, label.id);
  if (!checked.ok) return checked;
  return ok({ ...label, name: checked.value, updatedAt: now.toISOString() });
}

/** Changes a label's color. Setting the color it already has returns it unchanged (idempotent). */
export function setLabelColor(
  label: Label,
  color: unknown,
  now: Date,
): Result<Label> {
  if (!isPaletteColor(color)) {
    return fail([{ field: "color", message: COLOR_MESSAGE }]);
  }
  if (label.color === color) return ok(label);
  return ok({ ...label, color, updatedAt: now.toISOString() });
}

/** Archives a label. Archiving an archived label returns it unchanged (idempotent). */
export function archiveLabel(label: Label, now: Date): Label {
  if (label.archived) return label;
  return { ...label, archived: true, updatedAt: now.toISOString() };
}

/**
 * Makes an archived label active again, keeping its tasks attached. Refused when an
 * active label already has the same name (ignoring case). Restoring an active label
 * returns it unchanged (idempotent).
 */
export function restoreLabel(
  label: Label,
  labels: readonly Label[],
  now: Date,
): Result<Label> {
  if (!label.archived) return ok(label);
  const checked = validateLabelName(label.name, labels, label.id);
  if (!checked.ok) return checked;
  return ok({ ...label, archived: false, updatedAt: now.toISOString() });
}

/** Checks a document loaded from storage. Never throws; invalid documents return errors. */
export function parseStoredLabel(doc: unknown): Result<Label> {
  if (!isRecord(doc)) {
    return fail([{ field: "document", message: "Must be an object." }]);
  }
  const errors = checkCommonFields(doc, [1, LABEL_SCHEMA_VERSION]);
  const name = doc.name;
  if (
    typeof name !== "string" ||
    name.trim() !== name ||
    name.length === 0 ||
    name.length > LABEL_NAME_MAX
  ) {
    errors.push({
      field: "name",
      message: `Must be 1 to ${String(LABEL_NAME_MAX)} trimmed characters.`,
    });
  }
  if (typeof doc.archived !== "boolean") {
    errors.push({ field: "archived", message: "Must be true or false." });
  }
  // Old color ids stay readable; upgradeLabelColors moves them to the new palette (#45).
  if (!isPaletteColor(doc.color) && legacyFamily(doc.color) === undefined) {
    errors.push({ field: "color", message: COLOR_MESSAGE });
  }
  if (errors.length > 0) return fail(errors);
  // Every field was checked above. Built field by field so no other stored field is kept.
  return ok({
    id: doc.id as string,
    name: name as string,
    archived: doc.archived as boolean,
    color: doc.color as string,
    createdAt: doc.createdAt as string,
    updatedAt: doc.updatedAt as string,
    schemaVersion: LABEL_SCHEMA_VERSION,
  });
}

/**
 * Moves labels still holding a color id from before #45 to the new palette (i82). Each
 * takes its color family, unless an active label already shows that color: then it takes
 * the first free one. Older labels choose first (by createdAt, then id), so every device
 * gets the same result in any order. Labels already on the new palette are returned
 * unchanged, and archived ones never hold a color. Nothing is written: a moved label is
 * stored with its new color the next time it is saved.
 */
export function upgradeLabelColors(labels: readonly Label[]): Label[] {
  const used = new Set(
    labels
      .filter((l) => !l.archived && isPaletteColor(l.color))
      .map((l) => l.color),
  );
  const moved = new Map<string, string>();
  const legacy = labels
    .filter((l) => !isPaletteColor(l.color))
    .sort(
      (a, b) =>
        a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
    );
  for (const label of legacy) {
    const family = legacyFamily(label.color) ?? PALETTE[0]?.id ?? "";
    if (label.archived) {
      moved.set(label.id, family);
      continue;
    }
    const color = used.has(family)
      ? (PALETTE.find((s) => !used.has(s.id))?.id ?? family)
      : family;
    used.add(color);
    moved.set(label.id, color);
  }
  return labels.map((label) => {
    const color = moved.get(label.id);
    return color === undefined ? label : { ...label, color };
  });
}
