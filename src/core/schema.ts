// Shared helpers for checking stored documents. Used by label.ts and task.ts only.

import type { ValidationError } from "./result";

/**
 * Versions of the stored document shapes, one per document type (ADR 0002).
 * Bump one, and add an upgrade in its parser, when that shape changes.
 */
export const LABEL_SCHEMA_VERSION = 2;
/** Version 2 replaced the stored urgency score with a date (#15). */
export const TASK_SCHEMA_VERSION = 4;

/** Identity and clock values, created outside core so core stays pure and testable. */
export interface CreateMeta {
  readonly id: string;
  readonly now: Date;
}

const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/;

/** True for a plain object, so its fields can be read safely. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** True for a UTC ISO timestamp such as 2026-10-23T09:00:00.000Z. */
export function isIsoTimestamp(value: unknown): value is string {
  return (
    typeof value === "string" &&
    ISO_UTC.test(value) &&
    !Number.isNaN(Date.parse(value))
  );
}

/**
 * Checks the fields every stored document has: id, timestamps and a schema version
 * from `versions` (the versions its parser can read).
 */
export function checkCommonFields(
  doc: Record<string, unknown>,
  versions: readonly number[],
): ValidationError[] {
  const errors: ValidationError[] = [];
  if (typeof doc.id !== "string" || doc.id === "") {
    errors.push({ field: "id", message: "Must be a non-empty string." });
  }
  if (!isIsoTimestamp(doc.createdAt)) {
    errors.push({ field: "createdAt", message: "Must be an ISO timestamp." });
  }
  if (!isIsoTimestamp(doc.updatedAt)) {
    errors.push({ field: "updatedAt", message: "Must be an ISO timestamp." });
  }
  if (
    typeof doc.schemaVersion !== "number" ||
    !versions.includes(doc.schemaVersion)
  ) {
    errors.push({
      field: "schemaVersion",
      message: `Must be ${versions.map(String).join(" or ")}.`,
    });
  }
  return errors;
}
