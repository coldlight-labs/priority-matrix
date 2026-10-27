import { describe, expect, it } from "vitest";
import {
  archiveLabel,
  createLabel,
  LABEL_NAME_MAX,
  parseStoredLabel,
  renameLabel,
  restoreLabel,
  SEED_LABELS,
  setLabelColor,
  upgradeLabelColors,
  validateLabelName,
  type Label,
} from "../../src/core/label";

const NOW = new Date("2026-10-23T09:00:00.000Z");
const LATER = new Date("2026-10-23T10:00:00.000Z");

function label(overrides: Partial<Label> = {}): Label {
  return {
    id: "l1",
    name: "Jobs",
    archived: false,
    color: "red",
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
    schemaVersion: 2,
    ...overrides,
  };
}

describe("validateLabelName", () => {
  it("trims and accepts 1 to 40 characters", () => {
    expect(validateLabelName("  Course  ", [])).toEqual({
      ok: true,
      value: "Course",
    });
    expect(validateLabelName("x".repeat(LABEL_NAME_MAX), []).ok).toBe(true);
  });

  it.each(["", "   ", "x".repeat(LABEL_NAME_MAX + 1)])("rejects %j", (name) => {
    expect(validateLabelName(name, []).ok).toBe(false);
  });

  it.each([
    ["home", "Home"],
    [" home ", "Home"],
    ["nASA", "NASA"],
    ["garden plans", "Garden plans"],
    ["élan", "Élan"],
    ["2026 taxes", "2026 taxes"],
    ["🏠 home", "🏠 home"],
  ])("capitalizes the first letter: %j -> %j", (input, stored) => {
    expect(validateLabelName(input, [])).toEqual({ ok: true, value: stored });
  });

  it("refuses Home next to home, ignoring case", () => {
    const lower = label({ name: "home" });
    expect(validateLabelName("Home", [lower]).ok).toBe(false);
    expect(validateLabelName("HOME", [lower]).ok).toBe(false);
  });

  it("rejects non-text", () => {
    expect(validateLabelName(42, []).ok).toBe(false);
  });

  it("rejects a duplicate active name, ignoring case", () => {
    expect(validateLabelName("JOBS", [label()]).ok).toBe(false);
  });

  it("allows reusing the name of an archived label", () => {
    expect(validateLabelName("Jobs", [label({ archived: true })]).ok).toBe(
      true,
    );
  });

  it("lets a label keep its own name when renamed", () => {
    expect(validateLabelName("jobs", [label()], "l1").ok).toBe(true);
  });
});

describe("createLabel", () => {
  it("creates an active label with the given id and time", () => {
    expect(createLabel(" NASA ", [], { id: "l9", now: NOW })).toEqual({
      ok: true,
      value: label({ id: "l9", name: "NASA" }),
    });
  });

  it("returns errors for an invalid name", () => {
    expect(createLabel("", [], { id: "l9", now: NOW }).ok).toBe(false);
  });

  it("gives a new label the first color no active label uses", () => {
    const used = [
      label({ color: "red" }),
      label({ id: "l2", name: "B", color: "orange" }),
    ];
    const result = createLabel("New", used, { id: "l9", now: NOW });
    expect(result.ok && result.value.color).toBe("gold");
  });

  it("reuses a color held only by an archived label", () => {
    const result = createLabel("New", [label({ archived: true })], {
      id: "l9",
      now: NOW,
    });
    expect(result.ok && result.value.color).toBe("red");
  });

  it("accepts a chosen palette color and rejects anything else", () => {
    const meta = { id: "l9", now: NOW };
    const chosen = createLabel("New", [], meta, "teal");
    expect(chosen.ok && chosen.value.color).toBe("teal");
    expect(createLabel("New", [], meta, "#ff0000").ok).toBe(false);
    expect(createLabel("New", [], meta, 7).ok).toBe(false);
  });
});

describe("setLabelColor", () => {
  it("changes the color and updates updatedAt", () => {
    expect(setLabelColor(label(), "green", LATER)).toEqual({
      ok: true,
      value: label({ color: "green", updatedAt: LATER.toISOString() }),
    });
  });

  it("rejects a color outside the palette", () => {
    expect(setLabelColor(label(), "plaid", LATER).ok).toBe(false);
    // Old color ids are readable from storage but can no longer be chosen (#45).
    expect(setLabelColor(label(), "teal-1", LATER).ok).toBe(false);
  });

  it("is idempotent", () => {
    const l = label();
    const result = setLabelColor(l, "red", LATER);
    expect(result.ok && result.value).toBe(l);
  });
});

describe("renameLabel", () => {
  it("capitalizes the new name", () => {
    const result = renameLabel(label(), "house", [label()], LATER);
    expect(result.ok && result.value.name).toBe("House");
  });

  it("renames and updates updatedAt", () => {
    const result = renameLabel(label(), "Job search", [label()], LATER);
    expect(result).toEqual({
      ok: true,
      value: label({ name: "Job search", updatedAt: LATER.toISOString() }),
    });
  });

  it("rejects a name another active label uses", () => {
    const other = label({ id: "l2", name: "Course" });
    expect(renameLabel(label(), "course", [label(), other], LATER).ok).toBe(
      false,
    );
  });
});

describe("archiveLabel", () => {
  it("archives and updates updatedAt", () => {
    expect(archiveLabel(label(), LATER)).toEqual(
      label({ archived: true, updatedAt: LATER.toISOString() }),
    );
  });

  it("is idempotent", () => {
    const archived = label({ archived: true });
    expect(archiveLabel(archived, LATER)).toBe(archived);
  });
});

describe("parseStoredLabel", () => {
  it("accepts a valid stored label", () => {
    expect(parseStoredLabel(label())).toEqual({ ok: true, value: label() });
  });

  it("accepts a version 1 label with an old color id, kept for the upgrade (#45)", () => {
    const result = parseStoredLabel({
      ...label(),
      color: "green-1",
      schemaVersion: 1,
    });
    expect(result.ok && result.value).toMatchObject({
      color: "green-1",
      schemaVersion: 2,
    });
  });

  it.each([null, "Jobs", [], 42])("rejects a non-object: %j", (doc) => {
    expect(parseStoredLabel(doc).ok).toBe(false);
  });

  it("reports every bad field without throwing", () => {
    const result = parseStoredLabel({
      id: "",
      name: " Jobs",
      archived: "no",
      color: "plaid",
      createdAt: "yesterday",
      updatedAt: 5,
      schemaVersion: 3,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.map((e) => e.field).sort()).toEqual([
        "archived",
        "color",
        "createdAt",
        "id",
        "name",
        "schemaVersion",
        "updatedAt",
      ]);
    }
  });
});

describe("SEED_LABELS", () => {
  it("are all valid, unique and in different colors", () => {
    const created: Label[] = [];
    for (const [i, { name, color }] of SEED_LABELS.entries()) {
      const result = createLabel(
        name,
        created,
        { id: `s${String(i)}`, now: NOW },
        color,
      );
      expect(result.ok).toBe(true);
      if (result.ok) created.push(result.value);
    }
    expect(created.map((l) => l.name)).toEqual([
      "Work",
      "Home",
      "Health",
      "Family",
      "Money",
      "Admin",
      "Learning",
      "Side project",
      "Errands",
    ]);
    expect(new Set(created.map((l) => l.color)).size).toBe(9);
  });
});

describe("restoreLabel", () => {
  it("makes an archived label active and updates updatedAt", () => {
    const archived = label({ archived: true });
    expect(restoreLabel(archived, [archived], LATER)).toEqual({
      ok: true,
      value: label({ archived: false, updatedAt: LATER.toISOString() }),
    });
  });

  it("is refused when an active label has the same name, ignoring case", () => {
    const archived = label({ archived: true });
    const other = label({ id: "l2", name: "JOBS" });
    const result = restoreLabel(archived, [archived, other], LATER);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0]?.message).toContain("already");
  });

  it("allows it when only another archived label has the name", () => {
    const archived = label({ archived: true });
    const otherArchived = label({ id: "l2", archived: true });
    expect(restoreLabel(archived, [archived, otherArchived], LATER).ok).toBe(
      true,
    );
  });

  it("is idempotent for an active label", () => {
    const active = label();
    const result = restoreLabel(active, [active], LATER);
    expect(result.ok && result.value).toBe(active);
  });
});

describe("upgradeLabelColors (#45, i82)", () => {
  const at = (minute: number) =>
    new Date(Date.UTC(2026, 9, 23, 9, minute)).toISOString();

  it("moves an old color to its new family and to the current version", () => {
    const [up] = upgradeLabelColors([label({ color: "cerulean-1" })]);
    expect(up).toMatchObject({ color: "sky", schemaVersion: 2 });
  });

  it("gives a later label that shares a family the first free color", () => {
    const family = label({ id: "family", color: "green-1", createdAt: at(0) });
    const home = label({ id: "home", color: "green-1", createdAt: at(5) });
    const red = label({ id: "red", color: "red", createdAt: at(1) });
    const up = upgradeLabelColors([home, red, family]);
    expect(up.map((l) => [l.id, l.color])).toEqual([
      ["home", "orange"],
      ["red", "red"],
      ["family", "green"],
    ]);
  });

  it("is the same whatever order the labels arrive in", () => {
    const labels = [
      label({ id: "a", color: "green-1", createdAt: at(0) }),
      label({ id: "b", color: "jade-2", createdAt: at(0) }),
    ];
    const forward = upgradeLabelColors(labels).map((l) => l.color);
    const backward = upgradeLabelColors([...labels].reverse())
      .reverse()
      .map((l) => l.color);
    expect(forward).toEqual(backward);
    expect(new Set(forward).size).toBe(2);
  });

  it("keeps labels already on the new palette unchanged, even when they share a color", () => {
    const a = label({ id: "a", color: "teal" });
    const b = label({ id: "b", color: "teal" });
    const up = upgradeLabelColors([a, b]);
    expect(up[0]).toBe(a);
    expect(up[1]).toBe(b);
  });

  it("does not let archived labels hold a color", () => {
    const old = label({ id: "old", color: "green", archived: true });
    const [, up] = upgradeLabelColors([
      old,
      label({ id: "new", color: "green-2" }),
    ]);
    expect(up?.color).toBe("green");
  });
});
