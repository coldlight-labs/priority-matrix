import { createLabel, SEED_LABELS, STARTER_LABELS, type Label } from "./label";
import type { LabelRepository } from "./ports";

/**
 * Fixed id for a seed label, for example "Side project" -> "seed-side-project".
 * Fixed ids make seeding safe to repeat: two devices seeding at once write the same documents (plan i19).
 */
export function seedLabelId(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `seed-${slug}`;
}

/**
 * The starter labels (STARTER_LABELS) as new labels, for a new account on the server
 * (#64). `newId` gives each one an id.
 */
export function starterLabels(now: Date, newId: () => string): Label[] {
  const created: Label[] = [];
  for (const { name, color } of STARTER_LABELS) {
    const result = createLabel(name, created, { id: newId(), now }, color);
    if (!result.ok) {
      // The starter names are constants checked by tests, so this means a coding error.
      throw new Error(`Starter label "${name}" is invalid.`);
    }
    created.push(result.value);
  }
  return created;
}

/**
 * Inserts the seed labels when storage holds no labels at all (plan i17).
 * Does nothing if any label exists, or if invalid label documents were skipped,
 * so existing data is never touched. Returns how many labels it created.
 */
export async function seedLabelsIfEmpty(
  repo: LabelRepository,
  now: Date,
): Promise<number> {
  const existing = await repo.list();
  if (existing.items.length > 0 || existing.skipped > 0) return 0;

  const created: Label[] = [];
  for (const { name, color } of SEED_LABELS) {
    const result = createLabel(
      name,
      created,
      { id: seedLabelId(name), now },
      color,
    );
    if (!result.ok) {
      // The seed names are constants checked by tests, so this means a coding error.
      throw new Error(`Seed label "${name}" is invalid.`);
    }
    await repo.save(result.value);
    created.push(result.value);
  }
  return created.length;
}
