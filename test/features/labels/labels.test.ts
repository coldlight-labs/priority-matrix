// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { createMemoryRepositories } from "../../../src/adapters/storage/memory";
import { StorageError, type Label } from "../../../src/core";
import { mountLabels } from "../../../src/features/labels";

const NOW = new Date("2026-10-23T09:00:00.000Z");
const LATER = new Date("2026-10-23T10:00:00.000Z");

function label(id: string, name: string, archived = false): Label {
  return {
    id,
    name,
    archived,
    color: "teal",
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
    schemaVersion: 2,
  };
}

/**
 * Mounts the manager with `initial` in storage and on screen, and re-renders it from
 * saved and re-read labels, as the app does.
 */
async function setup(initial: Label[]) {
  document.body.replaceChildren();
  const container = document.createElement("div");
  document.body.append(container);
  const repos = createMemoryRepositories();
  for (const l of initial) await repos.labels.save(l);
  let state: readonly Label[] = [...initial];
  const errors: unknown[] = [];
  let n = 0;
  const view = mountLabels(container, {
    labels: repos.labels,
    now: () => LATER,
    newId: () => `new${String(++n)}`,
    onSaved: (saved) => {
      state = [...state.filter((l) => l.id !== saved.id), saved];
      view.render(state);
    },
    onLoaded: (loaded) => {
      state = loaded;
      view.render(state);
    },
    onError: (e) => errors.push(e),
  });
  view.render(state);
  return { repos, errors, state: () => state, container };
}

function byId<T extends HTMLElement>(id: string, type: new () => T): T {
  const el = document.getElementById(id);
  if (!(el instanceof type)) throw new Error(`Missing #${id}`);
  return el;
}

function rowOf(container: HTMLElement, id: string): HTMLElement {
  const row = container.querySelector<HTMLElement>(`[data-label-id="${id}"]`);
  if (row === null) throw new Error(`Missing row ${id}`);
  return row;
}

function clickButton(scope: HTMLElement, text: string): void {
  const match = [...scope.querySelectorAll("button")].find(
    (b) => b.textContent === text,
  );
  if (match === undefined) throw new Error(`Missing button ${text}`);
  match.click();
}

function addLabel(container: HTMLElement, name: string): void {
  byId("label-new-name", HTMLInputElement).value = name;
  container
    .querySelector("form")
    ?.dispatchEvent(new Event("submit", { cancelable: true }));
}

const listedNames = (container: HTMLElement) =>
  [...container.querySelectorAll("#label-list .label-name")].map(
    (e) => e.textContent,
  );

describe("label manager", () => {
  it("lists active labels by name and archived ones separately", async () => {
    const { container } = await setup([
      label("l1", "Jobs"),
      label("l2", "Course"),
      label("l3", "Old", true),
    ]);
    expect(listedNames(container)).toEqual(["Course", "Jobs"]);
    expect(container.querySelector("summary")?.textContent).toBe(
      "Archived (1)",
    );
    expect(
      container.querySelector("#label-archived-list .label-name")?.textContent,
    ).toBe("Old");
  });

  it("creates a label", async () => {
    const { container, repos } = await setup([]);
    addLabel(container, "  NASA ");
    await vi.waitFor(() => {
      expect(listedNames(container)).toEqual(["NASA"]);
    });
    expect((await repos.labels.list()).items[0]).toMatchObject({
      id: "new1",
      name: "NASA",
    });
    expect(byId("label-new-name", HTMLInputElement).value).toBe("");
  });

  it("shows an error for a duplicate name and saves nothing", async () => {
    const { container, repos } = await setup([label("l1", "Jobs")]);
    addLabel(container, "jobs");
    const error = byId("label-new-error", HTMLElement);
    await vi.waitFor(() => {
      expect(error.hidden).toBe(false);
    });
    expect(error.textContent).toContain("already");
    expect((await repos.labels.list()).items).toHaveLength(1);
  });

  it("renames a label", async () => {
    const { container, state } = await setup([label("l1", "Jobs")]);
    clickButton(rowOf(container, "l1"), "Rename");
    byId("label-rename-l1", HTMLInputElement).value = "Job search";
    clickButton(rowOf(container, "l1"), "Save");
    await vi.waitFor(() => {
      expect(listedNames(container)).toEqual(["Job search"]);
    });
    expect(state()[0]?.updatedAt).toBe(LATER.toISOString());
  });

  it("shows a rename error for a name another label uses", async () => {
    const { container } = await setup([
      label("l1", "Jobs"),
      label("l2", "Course"),
    ]);
    clickButton(rowOf(container, "l1"), "Rename");
    byId("label-rename-l1", HTMLInputElement).value = "COURSE";
    clickButton(rowOf(container, "l1"), "Save");
    await vi.waitFor(() => {
      expect(byId("label-rename-error-l1", HTMLElement).hidden).toBe(false);
    });
    expect(byId("label-rename-error-l1", HTMLElement).textContent).toContain(
      "already",
    );
    expect(byId("label-rename-l1", HTMLInputElement).value).toBe("COURSE");
  });

  it("archives only after a second click", async () => {
    const { container, state } = await setup([label("l1", "Jobs")]);
    clickButton(rowOf(container, "l1"), "Archive");
    expect(rowOf(container, "l1").textContent).toContain(
      "Archive? Its tasks stay.",
    );
    expect(state()[0]?.archived).toBe(false);
    clickButton(rowOf(container, "l1"), "Archive");
    await vi.waitFor(() => {
      expect(state()[0]?.archived).toBe(true);
    });
    expect(listedNames(container)).toEqual([]);
  });

  it("cancels an archive", async () => {
    const { container, state } = await setup([label("l1", "Jobs")]);
    clickButton(rowOf(container, "l1"), "Archive");
    clickButton(rowOf(container, "l1"), "Cancel");
    expect(rowOf(container, "l1").textContent).not.toContain("Its tasks stay");
    expect(state()[0]?.archived).toBe(false);
  });

  it("shows a label name with markup as plain text", async () => {
    const { container } = await setup([label("l1", "<b>Bold</b>")]);
    const name = rowOf(container, "l1").querySelector(".label-name");
    expect(name?.textContent).toBe("<b>Bold</b>");
    expect(name?.querySelector("b")).toBeNull();
  });

  it("restores an archived label to the active list", async () => {
    const { container, state } = await setup([label("l3", "Old", true)]);
    clickButton(rowOf(container, "l3"), "Restore");
    await vi.waitFor(() => {
      expect(listedNames(container)).toEqual(["Old"]);
    });
    expect(state()[0]).toMatchObject({
      archived: false,
      updatedAt: LATER.toISOString(),
    });
    expect(
      container.querySelector<HTMLElement>(".label-archived")?.hidden,
    ).toBe(true);
  });

  it("refuses to restore when an active label has the same name", async () => {
    const { container, repos } = await setup([
      label("l1", "Jobs"),
      label("l3", "jobs", true),
    ]);
    clickButton(rowOf(container, "l3"), "Restore");
    await vi.waitFor(() => {
      expect(byId("label-restore-error-l3", HTMLElement).hidden).toBe(false);
    });
    expect(byId("label-restore-error-l3", HTMLElement).textContent).toContain(
      "already",
    );
    const stored = (await repos.labels.list()).items;
    expect(stored.find((l) => l.id === "l3")?.archived).toBe(true);
  });

  it("opens a 15-swatch picker of shaped colors with the current one marked (#45)", async () => {
    const { container } = await setup([label("l1", "Jobs")]);
    byId("label-color-l1", HTMLButtonElement).click();
    const swatches = [
      ...byId("label-picker-l1", HTMLElement).querySelectorAll<HTMLElement>(
        ".swatch",
      ),
    ];
    expect(swatches).toHaveLength(15);
    expect(swatches[0]?.querySelector("svg circle")).not.toBeNull();
    const pressed = swatches.filter(
      (s) => s.getAttribute("aria-pressed") === "true",
    );
    expect(pressed.map((s) => s.dataset.color)).toEqual(["teal"]);
    expect(container.querySelector(".swatch")?.getAttribute("aria-label")).toBe(
      "Red circle",
    );
  });

  it("saves a picked color and closes the picker", async () => {
    const { container, state } = await setup([label("l1", "Jobs")]);
    byId("label-color-l1", HTMLButtonElement).click();
    const green = container.querySelector<HTMLButtonElement>(
      '[data-color="green"]',
    );
    green?.click();
    await vi.waitFor(() => {
      expect(state()[0]?.color).toBe("green");
    });
    expect(document.getElementById("label-picker-l1")).toBeNull();
    expect(
      byId("label-color-l1", HTMLButtonElement).getAttribute("aria-label"),
    ).toBe("Color for Jobs: Green square. Change color");
  });

  it("gives a new label the first unused color", async () => {
    const { container, state } = await setup([]);
    addLabel(container, "Fresh");
    await vi.waitFor(() => {
      expect(state()[0]?.color).toBe("red");
    });
  });

  it("saves a new label with a capital first letter", async () => {
    const { container } = await setup([]);
    addLabel(container, "home");
    await vi.waitFor(() => {
      expect(listedNames(container)).toEqual(["Home"]);
    });
  });

  describe("re-reads labels before a name check (i44)", () => {
    it("refuses a name another page stored after this one loaded", async () => {
      const { container, repos } = await setup([]);
      await repos.labels.save(label("seed-learning", "Learning"));
      addLabel(container, "learning");
      await vi.waitFor(() => {
        expect(byId("label-new-error", HTMLElement).hidden).toBe(false);
      });
      expect((await repos.labels.list()).items).toHaveLength(1);
      expect(listedNames(container)).toEqual(["Learning"]);
    });

    it("refuses a rename to a name stored by another page", async () => {
      const { container, repos } = await setup([label("l1", "Jobs")]);
      await repos.labels.save(label("l2", "Course"));
      clickButton(rowOf(container, "l1"), "Rename");
      byId("label-rename-l1", HTMLInputElement).value = "course";
      clickButton(rowOf(container, "l1"), "Save");
      await vi.waitFor(() => {
        expect(byId("label-rename-error-l1", HTMLElement).hidden).toBe(false);
      });
      const stored = (await repos.labels.list()).items;
      expect(stored.find((l) => l.id === "l1")?.name).toBe("Jobs");
    });

    it("refuses a restore when another page made the name active", async () => {
      const { container, repos } = await setup([label("l3", "Old", true)]);
      await repos.labels.save(label("l4", "old"));
      clickButton(rowOf(container, "l3"), "Restore");
      await vi.waitFor(() => {
        expect(byId("label-restore-error-l3", HTMLElement).hidden).toBe(false);
      });
    });

    it("reports a failed load and saves nothing", async () => {
      const { container, repos, errors } = await setup([]);
      // The re-read now happens inside the checked save (#56).
      const failure = new StorageError("unavailable", "offline");
      vi.spyOn(repos.labels, "saveChecked").mockRejectedValueOnce(failure);
      const save = vi.spyOn(repos.labels, "save");
      addLabel(container, "New");
      await vi.waitFor(() => {
        expect(errors).toEqual([failure]);
      });
      expect(save).not.toHaveBeenCalled();
    });
  });

  describe("label names set on two devices at once (#56, i66)", () => {
    const busy = () =>
      new StorageError("conflict", "Label names are being changed elsewhere.");

    it("says another device is changing labels, under the field", async () => {
      const { container, repos, errors } = await setup([]);
      vi.spyOn(repos.labels, "saveChecked").mockRejectedValueOnce(busy());
      addLabel(container, "New");
      await vi.waitFor(() => {
        expect(byId("label-new-error", HTMLElement).hidden).toBe(false);
      });
      expect(byId("label-new-error", HTMLElement).textContent).toBe(
        "Labels are being changed on another device. Try again in a few seconds.",
      );
      expect(errors).toEqual([]);
      expect(byId("label-new-name", HTMLInputElement).value).toBe("New");
    });

    it("shows the same message for a rename", async () => {
      const { container, repos } = await setup([label("l1", "Jobs")]);
      vi.spyOn(repos.labels, "saveChecked").mockRejectedValueOnce(busy());
      clickButton(rowOf(container, "l1"), "Rename");
      byId("label-rename-l1", HTMLInputElement).value = "Work";
      clickButton(rowOf(container, "l1"), "Save");
      await vi.waitFor(() => {
        expect(
          byId("label-rename-error-l1", HTMLElement).textContent,
        ).toContain("another device");
      });
    });

    it("shows the same message for a restore", async () => {
      const { container, repos } = await setup([label("l3", "Old", true)]);
      vi.spyOn(repos.labels, "saveChecked").mockRejectedValueOnce(busy());
      clickButton(rowOf(container, "l3"), "Restore");
      await vi.waitFor(() => {
        expect(
          byId("label-restore-error-l3", HTMLElement).textContent,
        ).toContain("another device");
      });
    });

    it("sets names only through the checked save", async () => {
      const { container, repos } = await setup([
        label("l1", "Jobs"),
        label("l3", "Old", true),
      ]);
      const checked = vi.spyOn(repos.labels, "saveChecked");
      const plain = vi.spyOn(repos.labels, "save");
      addLabel(container, "New");
      await vi.waitFor(() => {
        expect(checked).toHaveBeenCalledTimes(1);
      });
      clickButton(rowOf(container, "l1"), "Rename");
      byId("label-rename-l1", HTMLInputElement).value = "Work";
      clickButton(rowOf(container, "l1"), "Save");
      await vi.waitFor(() => {
        expect(checked).toHaveBeenCalledTimes(2);
      });
      clickButton(rowOf(container, "l3"), "Restore");
      await vi.waitFor(() => {
        expect(checked).toHaveBeenCalledTimes(3);
      });
      // Name changes never use the plain save, which has no name check.
      expect(plain).not.toHaveBeenCalled();
    });
  });
});
