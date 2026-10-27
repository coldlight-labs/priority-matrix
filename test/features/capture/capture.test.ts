// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryRepositories } from "../../../src/adapters/storage/memory";
import { StorageError, type Label, type Task } from "../../../src/core";
import { mountCapture } from "../../../src/features/capture";

const NOW = new Date("2026-10-23T09:00:00.000Z");

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

function setup(
  labels: Label[] = [label("l1", "Jobs"), label("l2", "Old", true)],
) {
  document.body.replaceChildren();
  const container = document.createElement("div");
  document.body.append(container);
  const repos = createMemoryRepositories();
  const saved: Task[] = [];
  const errors: unknown[] = [];
  let n = 0;
  const view = mountCapture(container, {
    tasks: repos.tasks,
    now: () => NOW,
    newId: () => `t${String(++n)}`,
    onSaved: (t) => saved.push(t),
    onError: (e) => errors.push(e),
  });
  view.render(labels);
  const form = container.querySelector("form");
  if (form === null) throw new Error("form not rendered");
  const ui = {
    text: byId("capture-text", HTMLInputElement),
    date: byId("capture-date", HTMLInputElement),
    time: byId("capture-time", HTMLInputElement),
    followUp: byId("capture-follow-up", HTMLInputElement),
    importance: byId("capture-importance", HTMLInputElement),
    label: byId("capture-label", HTMLSelectElement),
    form,
    error: (field: string) => byId(`capture-${field}-error`, HTMLElement),
  };
  const submit = () => {
    ui.form.dispatchEvent(new Event("submit", { cancelable: true }));
  };
  return { repos, saved, errors, view, ui, submit };
}

/** Finds an element by id and checks its type, so tests fail clearly if the form changes. */
function byId<T extends HTMLElement>(id: string, type: new () => T): T {
  const el = document.getElementById(id);
  if (!(el instanceof type)) throw new Error(`Missing #${id}`);
  return el;
}

function setScore(input: HTMLInputElement, value: number) {
  input.value = String(value);
  input.dispatchEvent(new Event("input"));
}

function setDate(input: HTMLInputElement, value: string) {
  input.value = value;
  input.dispatchEvent(new Event("change"));
}

describe("capture form", () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  it("offers only active labels", () => {
    const { ui } = setup();
    expect([...ui.label.options].map((o) => o.textContent)).toEqual(["Jobs"]);
  });

  it("starts importance at 50 and shows its value", () => {
    const { ui } = setup();
    expect(ui.importance.valueAsNumber).toBe(50);
    setScore(ui.importance, 72);
    expect(ui.importance.parentElement?.textContent).toContain("72");
  });

  it("has no urgency slider", () => {
    setup();
    expect(document.getElementById("capture-urgency")).toBeNull();
  });

  it("enables time and follow-up only once a date is picked", () => {
    const { ui } = setup();
    expect(ui.time.disabled).toBe(true);
    expect(ui.followUp.disabled).toBe(true);
    setDate(ui.date, "2026-10-30");
    expect(ui.time.disabled).toBe(false);
    expect(ui.followUp.disabled).toBe(false);
    ui.time.value = "10:30";
    ui.followUp.checked = true;
    setDate(ui.date, "");
    expect(ui.time.value).toBe("");
    expect(ui.followUp.checked).toBe(false);
  });

  it("labels the follow-up tickbox", () => {
    const { ui } = setup();
    expect(ui.followUp.labels?.[0]?.textContent).toBe(
      "Follow-up date (not a firm deadline)",
    );
  });

  it("saves a valid task and reports it", async () => {
    const { ui, submit, saved, repos } = setup();
    ui.text.value = "  Send invoice ";
    setDate(ui.date, "2026-10-30");
    ui.time.value = "10:30";
    ui.followUp.checked = true;
    setScore(ui.importance, 60);
    submit();
    await vi.waitFor(() => {
      expect(saved).toHaveLength(1);
    });
    expect(saved[0]).toMatchObject({
      id: "t1",
      text: "Send invoice",
      importance: 60,
      labelId: "l1",
      date: "2026-10-30",
      time: "10:30",
      followUp: true,
      status: "open",
    });
    expect((await repos.tasks.list()).items).toHaveLength(1);
  });

  it("saves a task without a date", async () => {
    const { ui, submit, saved } = setup();
    ui.text.value = "Someday";
    submit();
    await vi.waitFor(() => {
      expect(saved).toHaveLength(1);
    });
    expect(saved[0]).toMatchObject({ date: null, time: null, followUp: false });
  });

  it("after adding, clears the text and date, resets importance and keeps the label", async () => {
    const labels = [label("l1", "Jobs"), label("l3", "Course")];
    const { ui, submit, saved } = setup(labels);
    ui.label.value = "l1";
    ui.text.value = "Task";
    setDate(ui.date, "2026-10-30");
    ui.followUp.checked = true;
    setScore(ui.importance, 90);
    submit();
    await vi.waitFor(() => {
      expect(saved).toHaveLength(1);
    });
    expect(ui.text.value).toBe("");
    expect(ui.date.value).toBe("");
    expect(ui.followUp.checked).toBe(false);
    expect(ui.importance.valueAsNumber).toBe(50);
    expect(ui.label.value).toBe("l1");
  });

  it("shows a field error and saves nothing for empty text", async () => {
    const { ui, submit, saved, repos } = setup();
    ui.text.value = "   ";
    submit();
    await Promise.resolve();
    expect(ui.error("text").hidden).toBe(false);
    expect(ui.error("text").textContent).toContain("1 to 500");
    expect(saved).toHaveLength(0);
    expect((await repos.tasks.list()).items).toHaveLength(0);
  });

  it("clears old errors after a successful add", async () => {
    const { ui, submit, saved } = setup();
    ui.text.value = "";
    submit();
    ui.text.value = "Now valid";
    submit();
    await vi.waitFor(() => {
      expect(saved).toHaveLength(1);
    });
    expect(ui.error("text").hidden).toBe(true);
  });

  it("disables the label picker when there are no active labels", () => {
    const { ui } = setup([label("l2", "Old", true)]);
    expect(ui.label.disabled).toBe(true);
    expect(ui.label.options[0]?.textContent).toBe("Create a label first");
  });

  it("rejects a task when the chosen label was archived meanwhile", async () => {
    const { ui, view, submit, saved } = setup();
    view.render([label("l1", "Jobs", true)]);
    ui.text.value = "Task";
    submit();
    await Promise.resolve();
    expect(ui.error("label").hidden).toBe(false);
    expect(saved).toHaveLength(0);
  });

  it("keeps the input and reports a storage error", async () => {
    const { ui, submit, errors, repos } = setup();
    repos.tasks.save = () =>
      Promise.reject(new StorageError("full", "Storage is full."));
    ui.text.value = "Keep me";
    submit();
    await vi.waitFor(() => {
      expect(errors).toHaveLength(1);
    });
    expect(ui.text.value).toBe("Keep me");
  });

  it("saves an idea when Just an idea is ticked, then unticks it (#42)", async () => {
    const { submit, saved } = setup();
    const idea = byId("capture-idea", HTMLInputElement);
    const button = document.querySelector<HTMLButtonElement>(
      'form.capture button[type="submit"]',
    );
    expect(button?.textContent).toBe("Add task");
    idea.checked = true;
    idea.dispatchEvent(new Event("change"));
    expect(button?.textContent).toBe("Save idea");
    byId("capture-text", HTMLInputElement).value = "Learn Portuguese";
    submit();
    await vi.waitFor(() => {
      expect(saved).toHaveLength(1);
    });
    expect(saved[0]?.status).toBe("idea");
    expect(idea.checked).toBe(false);
    expect(button?.textContent).toBe("Add task");
  });
});
