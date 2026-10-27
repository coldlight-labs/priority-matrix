// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Label, ScoredTask } from "../../../src/core";
import {
  mountMatrix,
  toPoint,
  type DotAction,
} from "../../../src/features/matrix";

const NOW = "2026-10-23T09:00:00.000Z";
/** Noon on Friday 23 October 2026 in Sydney, the test time zone. */
const NOW_LOCAL = new Date(2026, 9, 23, 12, 0);

function label(id: string, name: string, color: string): Label {
  return {
    id,
    name,
    archived: false,
    color,
    createdAt: NOW,
    updatedAt: NOW,
    schemaVersion: 2,
  };
}

function task(overrides: Partial<ScoredTask>): ScoredTask {
  return {
    id: "t",
    text: "A task",
    urgency: 60,
    importance: 60,
    labelId: "l1",
    date: null,
    time: null,
    followUp: false,
    status: "open",
    createdAt: NOW,
    updatedAt: NOW,
    today: null,
    schemaVersion: 4,
    ...overrides,
  };
}

const LABELS = [label("l1", "Family", "red"), label("l2", "Admin", "indigo")];

function tap(container: HTMLElement, id: string): void {
  container
    .querySelector<SVGGElement>(`[data-task-id="${id}"]`)
    ?.dispatchEvent(new Event("click"));
}

/** Actions the dot menu reported, as "id:action". */
let actions: string[] = [];

function setup(tasks: ScoredTask[], labels: Label[] = LABELS) {
  document.body.replaceChildren();
  const container = document.createElement("div");
  document.body.append(container);
  actions = [];
  mountMatrix(container, {
    now: () => NOW_LOCAL,
    onAction: (id: string, action: DotAction) =>
      actions.push(`${id}:${action}`),
  }).render({ tasks, labels });
  return container;
}

describe("toPoint", () => {
  it.each([
    [0, 0, 28, 366],
    [100, 100, 380, 14],
    [50, 50, 204, 190],
    [0, 100, 28, 14],
    [100, 0, 380, 366],
  ])("urgency %d, importance %d -> (%d, %d)", (urgency, importance, x, y) => {
    expect(toPoint({ urgency, importance })).toEqual({ x, y });
  });
});

describe("matrix view", () => {
  it("draws one dot per open task, at its scores", () => {
    const container = setup([
      task({ id: "a", urgency: 100, importance: 100 }),
      task({ id: "b", urgency: 0, importance: 0 }),
      task({ id: "done", status: "done" }),
    ]);
    const dots = [...container.querySelectorAll<SVGGElement>(".dot")];
    expect(dots.map((d) => d.dataset.taskId).sort()).toEqual(["a", "b"]);
    const b = container.querySelector('[data-task-id="b"] .mark');
    expect([b?.getAttribute("cx"), b?.getAttribute("cy")]).toEqual([
      "28",
      "366",
    ]);
  });

  it("keeps the Next up ring inside the view at urgency and importance 100", () => {
    const container = setup([task({ id: "a", urgency: 100, importance: 100 })]);
    const ring = container.querySelector(".ring");
    const cx = Number(ring?.getAttribute("cx"));
    const cy = Number(ring?.getAttribute("cy"));
    const r = Number(ring?.getAttribute("r"));
    expect(cx + r).toBeLessThanOrEqual(400);
    expect(cy - r).toBeGreaterThanOrEqual(0);
  });

  it("colors each dot with its label's palette color", () => {
    const container = setup([
      task({ id: "a", labelId: "l1" }),
      task({ id: "b", labelId: "l2", urgency: 10 }),
    ]);
    const fill = (id: string) =>
      container
        .querySelector<SVGElement>(`[data-task-id="${id}"] .mark`)
        ?.getAttribute("fill");
    expect(fill("a")).not.toBe(fill("b"));
    expect(fill("a")).not.toBe("");
  });

  it("rings only the Next up dot", () => {
    const container = setup([
      task({ id: "best", urgency: 95, importance: 95 }),
      task({ id: "other", urgency: 60, importance: 60 }),
    ]);
    const ringed = [...container.querySelectorAll<SVGGElement>(".dot.next")];
    expect(ringed.map((d) => d.dataset.taskId)).toEqual(["best"]);
    expect(ringed[0]?.querySelector(".ring")).not.toBeNull();
  });

  it("shows a card for the tapped dot with label, quadrant, date and time left", () => {
    const container = setup([
      task({
        id: "a",
        text: "Dentist appointment",
        date: "2026-10-24",
        time: "10:30",
        urgency: 93,
        importance: 80,
      }),
      task({ id: "b", labelId: "l2", urgency: 10, importance: 10 }),
    ]);
    tap(container, "a");
    const card = container.querySelector("#matrix-caption .caption-card");
    expect(card?.querySelector(".caption-title")?.textContent).toBe(
      "Dentist appointment",
    );
    const meta = [...(card?.querySelectorAll(".caption-meta") ?? [])].map(
      (p) => p.textContent,
    );
    expect(meta).toEqual([
      "Family · Do now · Next up",
      "Due Sat 24 Oct 10:30 · tomorrow",
    ]);
    expect(card?.textContent).not.toMatch(/\d+ · I|urgency|importance/i);
    expect((card as HTMLElement | null)?.style.borderLeftColor).not.toBe("");
  });

  it("shows the label name large, in the label color (i84)", () => {
    const container = setup([task({ id: "a" })]);
    tap(container, "a");
    const name = container.querySelector<HTMLElement>(".caption-label");
    expect(name?.textContent).toBe("Family");
    expect(name?.style.color).not.toBe("");
  });

  it("names the quadrant and says No date for an undated task", () => {
    const container = setup([
      task({ id: "b", labelId: "l2", urgency: 0, importance: 10 }),
    ]);
    tap(container, "b");
    const meta = [
      ...container.querySelectorAll("#matrix-caption .caption-meta"),
    ].map((p) => p.textContent);
    expect(meta).toEqual(["Admin · Someday", "No date"]);
  });

  it("grows the selected dot and moves the selection to the next tap", () => {
    const container = setup([
      task({ id: "a", urgency: 10, importance: 10 }),
      task({ id: "b", urgency: 20, importance: 20 }),
    ]);
    const radiusOf = (id: string) =>
      container
        .querySelector(`[data-task-id="${id}"] .mark`)
        ?.getAttribute("r");
    tap(container, "a");
    expect(radiusOf("a")).toBe("10");
    tap(container, "b");
    expect(radiusOf("a")).toBe("7");
    expect(radiusOf("b")).toBe("10");
    expect(
      [...container.querySelectorAll(".dot.selected")].map(
        (d) => (d as SVGGElement).dataset.taskId,
      ),
    ).toEqual(["b"]);
  });

  it("names a task below the grid when its dot is tapped", () => {
    const container = setup([task({ id: "a", text: "Call <b>Sam</b>" })]);
    container
      .querySelector<SVGGElement>('[data-task-id="a"]')
      ?.dispatchEvent(new Event("click"));
    const caption = container.querySelector("#matrix-caption");
    expect(caption?.textContent).toContain("Call <b>Sam</b>");
    expect(caption?.querySelector("b")).toBeNull();
  });

  it("lists only labels that have open tasks in the legend", () => {
    const container = setup([task({ id: "a", labelId: "l2" })]);
    expect(
      [...container.querySelectorAll("#matrix-legend li")].map(
        (li) => li.textContent,
      ),
    ).toEqual(["Admin"]);
  });

  it("labels the quadrants with the new names (Q33: a)", () => {
    const container = setup([]);
    expect(
      [...container.querySelectorAll(".quad-name")].map((t) => t.textContent),
    ).toEqual(["Make time", "Do now", "Someday", "Fit in"]);
  });

  it("explains the empty grid", () => {
    const container = setup([]);
    expect(container.querySelector("#matrix-caption")?.textContent).toBe(
      "No open tasks yet. Add one above to see it here.",
    );
  });

  it("fills follow-up dots with stripes in the label color", () => {
    const container = setup([
      task({ id: "a", date: "2026-10-30", followUp: true }),
      task({ id: "b", date: "2026-10-30", followUp: true, urgency: 70 }),
      task({ id: "c", labelId: "l2" }),
    ]);
    const fillOf = (id: string) =>
      container
        .querySelector(`[data-task-id="${id}"] .mark`)
        ?.getAttribute("fill");
    expect(fillOf("a")).toBe("url(#stripes-red)");
    expect(fillOf("b")).toBe("url(#stripes-red)");
    expect(fillOf("c")).toMatch(/^#/);
    // One pattern per color, white stripes over the label color.
    const patterns = container.querySelectorAll("defs pattern");
    expect(patterns).toHaveLength(1);
    const rects = patterns[0]?.querySelectorAll("rect");
    expect(rects?.[0]?.getAttribute("fill")).toBe("#e0303f");
    expect(rects?.[1]?.getAttribute("fill")).toBe("#ffffff");
    expect(
      container.querySelector('[data-task-id="a"]')?.getAttribute("aria-label"),
    ).toContain("Follow up Fri 30 Oct");
    expect(container.querySelector(".legend-follow-up")?.textContent).toBe(
      "Striped: follow-up date",
    );
  });

  it("shows no stripe legend without follow-up dots", () => {
    const container = setup([task({ id: "a" })]);
    expect(container.querySelector(".legend-follow-up")).toBeNull();
  });

  it("draws each dot in its label's shape, with an outline (#45)", () => {
    const container = setup([
      task({ id: "a", labelId: "l1" }),
      task({ id: "b", labelId: "l2", urgency: 10 }),
    ]);
    const mark = (id: string) =>
      container.querySelector(`[data-task-id="${id}"] .mark`);
    expect(mark("a")?.tagName).toBe("circle");
    expect(mark("b")?.tagName).toBe("polygon");
    expect(container.querySelector(".legend-follow-up")).toBeNull();
    expect(
      container.querySelector("#matrix-legend li .color-dot svg polygon"),
    ).not.toBeNull();
  });
});

describe("dot menu (#46)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  const dotOf = (container: HTMLElement, id: string) => {
    const g = container.querySelector<SVGGElement>(`[data-task-id="${id}"]`);
    if (g === null) throw new Error(`Missing dot ${id}`);
    return g;
  };
  const menu = (container: HTMLElement) =>
    container.querySelector<HTMLElement>("#dot-menu");
  const items = (container: HTMLElement) =>
    [...(menu(container)?.querySelectorAll("button") ?? [])].map(
      (b) => b.textContent,
    );
  const click = (container: HTMLElement, text: string) => {
    const button = [
      ...(menu(container)?.querySelectorAll("button") ?? []),
    ].find((b) => b.textContent === text);
    if (button === undefined) throw new Error(`Missing ${text}`);
    button.click();
  };
  const rightClick = (container: HTMLElement, id: string) => {
    const event = new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
    });
    dotOf(container, id).dispatchEvent(event);
    return event;
  };
  /** Presses at viewBox point `at`; `unitScale` maps 1 CSS pixel to 1 unit. */
  const press = (
    target: EventTarget,
    type: string,
    pointerType = "touch",
    at = { x: 0, y: 0 },
  ) =>
    target.dispatchEvent(
      new PointerEvent(type, {
        bubbles: true,
        pointerType,
        clientX: at.x,
        clientY: at.y,
      }),
    );
  /** Makes the svg report a 400 x 400 box at the page origin; happy-dom has no layout. */
  const unitScale = (container: HTMLElement) => {
    const svg = container.querySelector("svg");
    if (svg === null) throw new Error("Missing svg");
    svg.getBoundingClientRect = () => new DOMRect(0, 0, 400, 400);
    return svg;
  };

  it("opens on right-click with the four actions, first one focused", () => {
    const container = setup([task({ id: "a" })]);
    expect(menu(container)?.hidden).toBe(true);
    const event = rightClick(container, "a");
    expect(event.defaultPrevented).toBe(true);
    expect(menu(container)?.hidden).toBe(false);
    expect(menu(container)?.getAttribute("role")).toBe("menu");
    expect(items(container)).toEqual([
      "Mark done",
      "Pick for today",
      "Edit",
      "Drop",
    ]);
    expect(document.activeElement?.textContent).toBe("Mark done");
    expect(container.querySelector(".dot.selected")).not.toBeNull();
  });

  it("offers Remove from today for a task picked today", () => {
    const container = setup([task({ id: "a", today: "2026-10-23" })]);
    rightClick(container, "a");
    expect(items(container)).toContain("Remove from today");
  });

  it("asks before Mark done, and reports it only after Yes (i72)", () => {
    const container = setup([task({ id: "a" })]);
    rightClick(container, "a");
    click(container, "Mark done");
    expect(actions).toEqual([]);
    expect(menu(container)?.textContent).toContain("Mark as done?");
    expect(document.activeElement?.textContent).toBe("Yes, done");
    click(container, "Yes, done");
    expect(actions).toEqual(["a:done"]);
    expect(menu(container)?.hidden).toBe(true);
  });

  it("Cancel on the done question closes the menu and saves nothing", () => {
    const container = setup([task({ id: "a" })]);
    rightClick(container, "a");
    click(container, "Mark done");
    click(container, "Cancel");
    expect(actions).toEqual([]);
    expect(menu(container)?.hidden).toBe(true);
    expect(document.activeElement).toBe(dotOf(container, "a"));
  });

  it.each([
    ["Pick for today", "today"],
    ["Edit", "edit"],
    ["Drop", "drop"],
  ])("%s reports %s and closes", (text, action) => {
    const container = setup([task({ id: "a" })]);
    rightClick(container, "a");
    click(container, text);
    expect(actions).toEqual([`a:${action}`]);
    expect(menu(container)?.hidden).toBe(true);
  });

  it("Escape closes and puts focus back on the dot", () => {
    const container = setup([task({ id: "a" })]);
    rightClick(container, "a");
    menu(container)?.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    expect(menu(container)?.hidden).toBe(true);
    expect(document.activeElement).toBe(dotOf(container, "a"));
  });

  it("arrow keys move between actions", () => {
    const container = setup([task({ id: "a" })]);
    rightClick(container, "a");
    const key = (k: string) =>
      document.activeElement?.dispatchEvent(
        new KeyboardEvent("keydown", { key: k, bubbles: true }),
      );
    key("ArrowDown");
    expect(document.activeElement?.textContent).toBe("Pick for today");
    key("ArrowUp");
    key("ArrowUp");
    expect(document.activeElement?.textContent).toBe("Drop");
  });

  it.each([[{ key: "ContextMenu" }], [{ key: "F10", shiftKey: true }]])(
    "opens from the keyboard (%o)",
    (init) => {
      const container = setup([task({ id: "a" })]);
      dotOf(container, "a").dispatchEvent(
        new KeyboardEvent("keydown", {
          ...init,
          bubbles: true,
          cancelable: true,
        }),
      );
      expect(menu(container)?.hidden).toBe(false);
    },
  );

  it("opens on a long press with touch, not on a short tap", () => {
    vi.useFakeTimers();
    const container = setup([task({ id: "a" })]);
    unitScale(container);
    const at = toPoint(task({}));
    press(dotOf(container, "a"), "pointerdown", "touch", at);
    vi.advanceTimersByTime(200);
    press(dotOf(container, "a"), "pointerup", "touch", at);
    vi.advanceTimersByTime(1000);
    expect(menu(container)?.hidden).toBe(true);
    press(dotOf(container, "a"), "pointerdown", "touch", at);
    vi.advanceTimersByTime(500);
    expect(menu(container)?.hidden).toBe(false);
  });

  it("counts a hold near a dot, not only on its shape (Q73: b)", () => {
    vi.useFakeTimers();
    const container = setup([task({ id: "a" })]);
    const svg = unitScale(container);
    const { x, y } = toPoint(task({}));
    press(svg, "pointerdown", "touch", { x: x + 15, y: y - 12 });
    vi.advanceTimersByTime(500);
    expect(menu(container)?.hidden).toBe(false);
    expect(menu(container)?.getAttribute("aria-label")).toBe("Actions: A task");
  });

  it("ignores a hold far from every dot", () => {
    vi.useFakeTimers();
    const container = setup([task({ id: "a" })]);
    const svg = unitScale(container);
    const { x, y } = toPoint(task({}));
    press(svg, "pointerdown", "touch", { x: x + 40, y });
    vi.advanceTimersByTime(1000);
    expect(menu(container)?.hidden).toBe(true);
  });

  it("opens the nearest dot when two are close", () => {
    vi.useFakeTimers();
    const container = setup([
      task({ id: "a", text: "Left", urgency: 60 }),
      task({ id: "b", text: "Right", urgency: 64 }),
    ]);
    const svg = unitScale(container);
    const right = toPoint({ urgency: 64, importance: 60 });
    press(svg, "pointerdown", "touch", { x: right.x + 3, y: right.y });
    vi.advanceTimersByTime(500);
    expect(menu(container)?.getAttribute("aria-label")).toBe("Actions: Right");
  });

  it("cancels the hold when the finger moves away (a scroll)", () => {
    vi.useFakeTimers();
    const container = setup([task({ id: "a" })]);
    const svg = unitScale(container);
    const at = toPoint(task({}));
    press(svg, "pointerdown", "touch", at);
    press(svg, "pointermove", "touch", { x: at.x, y: at.y + 20 });
    vi.advanceTimersByTime(1000);
    expect(menu(container)?.hidden).toBe(true);
  });

  it("ignores a long press with a mouse (right-click is the mouse way)", () => {
    vi.useFakeTimers();
    const container = setup([task({ id: "a" })]);
    press(dotOf(container, "a"), "pointerdown", "mouse");
    vi.advanceTimersByTime(1000);
    expect(menu(container)?.hidden).toBe(true);
  });

  it("closes on a press outside the menu", () => {
    const container = setup([task({ id: "a" })]);
    rightClick(container, "a");
    press(document.body, "pointerdown", "mouse");
    expect(menu(container)?.hidden).toBe(true);
  });

  it("marks dots as opening a menu", () => {
    const container = setup([task({ id: "a" })]);
    expect(dotOf(container, "a").getAttribute("aria-haspopup")).toBe("menu");
  });
});

describe("chooser for crowded spots (#50)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  // Two overdue tasks on the same spot, and one on its own.
  const crowded = () => [
    task({ id: "a", text: "Fix the gate", urgency: 100, importance: 80 }),
    task({
      id: "b",
      text: "finish prototype",
      urgency: 100,
      importance: 80,
      createdAt: "2026-10-20T09:00:00.000Z",
    }),
    task({ id: "lone", text: "Alone", urgency: 20, importance: 20 }),
  ];
  const dotOf = (container: HTMLElement, id: string) => {
    const g = container.querySelector<SVGGElement>(`[data-task-id="${id}"]`);
    if (g === null) throw new Error(`Missing dot ${id}`);
    return g;
  };
  const popup = (container: HTMLElement) =>
    container.querySelector<HTMLElement>("#dot-menu");
  const rows = (container: HTMLElement) =>
    [...(popup(container)?.querySelectorAll(".chooser-row") ?? [])].map(
      (b) => b.textContent,
    );
  const choose = (container: HTMLElement, text: string) => {
    const row = [
      ...(popup(container)?.querySelectorAll<HTMLButtonElement>(
        ".chooser-row",
      ) ?? []),
    ].find((b) => b.textContent === text);
    if (row === undefined) throw new Error(`Missing row ${text}`);
    row.click();
  };
  const selectedText = (container: HTMLElement) =>
    container.querySelector(".caption-title")?.textContent;

  it("lists every task at a crowded spot in priority order, selecting none yet", () => {
    const container = setup(crowded());
    tap(container, "a");
    expect(popup(container)?.hidden).toBe(false);
    expect(popup(container)?.querySelector(".chooser-title")?.textContent).toBe(
      "2 tasks here",
    );
    // Same scores: the older task comes first, as in the lists.
    expect(rows(container)).toEqual(["finish prototype", "Fix the gate"]);
    expect(document.activeElement?.textContent).toBe("finish prototype");
    expect(selectedText(container)).toBeUndefined();
  });

  it("selects the picked task after a tap", () => {
    const container = setup(crowded());
    tap(container, "a");
    choose(container, "finish prototype");
    expect(popup(container)?.hidden).toBe(true);
    expect(selectedText(container)).toBe("finish prototype");
  });

  it("opens the picked task's menu after a right-click", () => {
    const container = setup(crowded());
    dotOf(container, "a").dispatchEvent(
      new MouseEvent("contextmenu", { bubbles: true, cancelable: true }),
    );
    expect(rows(container)).toHaveLength(2);
    choose(container, "Fix the gate");
    expect(popup(container)?.getAttribute("aria-label")).toBe(
      "Actions: Fix the gate",
    );
    expect(selectedText(container)).toBe("Fix the gate");
  });

  it("opens the list on a long press, then the menu", () => {
    vi.useFakeTimers();
    const container = setup(crowded());
    const svg = container.querySelector("svg");
    if (svg === null) throw new Error("Missing svg");
    svg.getBoundingClientRect = () => new DOMRect(0, 0, 400, 400);
    const at = toPoint({ urgency: 100, importance: 80 });
    svg.dispatchEvent(
      new PointerEvent("pointerdown", {
        bubbles: true,
        pointerType: "touch",
        clientX: at.x,
        clientY: at.y,
      }),
    );
    vi.advanceTimersByTime(500);
    expect(rows(container)).toHaveLength(2);
    choose(container, "finish prototype");
    expect(popup(container)?.getAttribute("aria-label")).toBe(
      "Actions: finish prototype",
    );
  });

  it("acts at once on a dot with no touching neighbor", () => {
    const container = setup([
      task({ id: "a", urgency: 60, importance: 60 }),
      // 15 viewBox units away: close, but not touching.
      task({ id: "b", text: "Near", urgency: 60, importance: 64.3 }),
    ]);
    tap(container, "a");
    expect(popup(container)?.hidden).toBe(true);
    expect(selectedText(container)).toBe("A task");
  });

  it("lists three tasks on one spot", () => {
    const container = setup([
      ...crowded(),
      task({ id: "c", text: "Third", urgency: 100, importance: 80 }),
    ]);
    tap(container, "c");
    expect(popup(container)?.querySelector(".chooser-title")?.textContent).toBe(
      "3 tasks here",
    );
  });

  it("Escape closes the list without selecting", () => {
    const container = setup(crowded());
    tap(container, "a");
    popup(container)?.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    expect(popup(container)?.hidden).toBe(true);
    expect(selectedText(container)).toBeUndefined();
  });

  it("selects at once from the keyboard, as every dot is reachable with Tab (i98)", () => {
    const container = setup(crowded());
    dotOf(container, "a").dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );
    expect(popup(container)?.hidden).toBe(true);
    expect(selectedText(container)).toBe("Fix the gate");
  });
});
