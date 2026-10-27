// Matrix feature: open tasks as dots on the urgency/importance grid (plan step 5).
// Dots take their label's color (i35); the Next up dot gets a ring. Tapping or
// focusing a dot selects it: the dot grows and a card below the grid shows the task,
// its label, quadrant, date and time left (Q34: A), since phones show no tooltips.
// Follow-up dates get white diagonal stripes over the label color (Q24: a).
// Right-click, a long press or the menu key opens the dot menu (#46, dot-menu.ts).
// This file holds state and interaction; the SVG pieces are built in draw.ts (#52).

import {
  compareTasks,
  isPickedToday,
  nextUp,
  type Label,
  type ScoredTask,
} from "../../core";
import { labelHex } from "../../ui";
import { createDotMenu, type DotAction } from "./dot-menu";
import {
  card,
  dot,
  DOT_RADIUS,
  drawBackground,
  followUpLegendItem,
  legendItem,
  stripes,
  SVG_NS,
  toPoint,
  VIEW_SIZE,
} from "./draw";

export type { DotAction } from "./dot-menu";
export { toPoint } from "./draw";

/** How long a touch must hold a dot to open its menu, and how far it may drift. */
const LONG_PRESS_MS = 500;
const PRESS_SLOP_PX = 10;
/**
 * A hold counts for the nearest dot within this many viewBox units (about 40px across
 * on a phone), so small shapes such as triangles are as easy to hold as ringed dots.
 */
const PRESS_REACH = 22;
/** Dots closer than this (center to center, viewBox units) touch, so a press there lists them (#50). */
const CROWD_DISTANCE = 2 * DOT_RADIUS;

/** What the matrix needs from the app. */
export interface MatrixDeps {
  /** The clock, for the date words in the caption ("tomorrow"). */
  readonly now: () => Date;
  /** Called with the action picked in a dot's menu (#46); the app routes it. */
  readonly onAction: (taskId: string, action: DotAction) => void;
}

/** What the matrix draws. */
interface MatrixState {
  readonly tasks: readonly ScoredTask[];
  readonly labels: readonly Label[];
}

/** Builds the matrix inside `container`. Call `render` whenever tasks or labels change. */
export function mountMatrix(
  container: HTMLElement,
  deps: MatrixDeps,
): { render(state: MatrixState): void } {
  let state: MatrixState = { tasks: [], labels: [] };
  /** The task whose dot was tapped; kept across redraws while it stays open. */
  let selectedId: string | null = null;

  const figure = document.createElement("figure");
  figure.className = "matrix";
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", `0 0 ${String(VIEW_SIZE)} ${String(VIEW_SIZE)}`);
  svg.setAttribute("role", "group");
  svg.setAttribute("aria-label", "Open tasks by urgency and importance");
  const defs = document.createElementNS(SVG_NS, "defs");
  const background = document.createElementNS(SVG_NS, "g");
  const dots = document.createElementNS(SVG_NS, "g");
  svg.append(defs, background, dots);
  drawBackground(background);

  const caption = document.createElement("figcaption");
  caption.className = "matrix-caption";
  caption.id = "matrix-caption";
  caption.setAttribute("aria-live", "polite");
  const legend = document.createElement("ul");
  legend.className = "matrix-legend";
  legend.id = "matrix-legend";
  figure.append(svg, caption, legend);
  container.append(figure);

  const dotOf = (id: string) =>
    [...dots.querySelectorAll<SVGGElement>(".dot")].find(
      (d) => d.dataset.taskId === id,
    );
  const menu = createDotMenu(figure, { onAction: deps.onAction, dotOf });

  /** Selects the dot, then opens its menu. */
  function openMenu(task: ScoredTask): void {
    selectedId = task.id;
    draw();
    menu.open(task, isPickedToday(task, deps.now()));
  }

  /** Selects the dot and keeps keyboard focus on its redrawn copy. */
  function selectTask(task: ScoredTask): void {
    if (selectedId === task.id) return;
    selectedId = task.id;
    draw();
    dotOf(task.id)?.focus();
  }

  /** The open tasks whose dots touch `task`'s (itself included), in priority order. */
  function crowdOf(task: ScoredTask): ScoredTask[] {
    const at = toPoint(task);
    return state.tasks
      .filter((t) => {
        if (t.status !== "open") return false;
        const p = toPoint(t);
        return Math.hypot(p.x - at.x, p.y - at.y) < CROWD_DISTANCE;
      })
      .sort(compareTasks);
  }

  /**
   * A pointer picked `task`'s dot: select it or open its menu, unless other dots touch
   * it; then list them first, so a hidden task can be reached (#50).
   */
  function pick(task: ScoredTask, then: "select" | "menu"): void {
    const crowd = crowdOf(task);
    if (crowd.length < 2) {
      if (then === "menu") openMenu(task);
      else selectTask(task);
      return;
    }
    const labels = new Map(state.labels.map((l) => [l.id, l]));
    menu.choose(task.id, crowd, labels, (chosen) => {
      if (then === "menu") {
        openMenu(chosen);
      } else {
        menu.close(false);
        selectTask(chosen);
      }
    });
  }

  // A press would focus, and so select, a dot before its click could list a crowd;
  // pointer selection goes through `pick` instead, and keyboard focus still selects.
  svg.addEventListener("mousedown", (event) => {
    event.preventDefault();
  });

  // Long press (touch only; iPhones send no contextmenu). Phones snap taps to the
  // nearest target but not presses, so the press picks the nearest open dot itself.
  let pressTimer: ReturnType<typeof setTimeout> | undefined;
  let pressStart = { x: 0, y: 0 };
  /** Set when a hold opened the popup, so the click from lifting the finger is ignored. */
  let pressOpened = false;
  const cancelPress = () => {
    clearTimeout(pressTimer);
    pressTimer = undefined;
  };
  svg.addEventListener("pointerdown", (event) => {
    pressOpened = false;
    if (event.pointerType === "mouse") return;
    cancelPress();
    const task = nearestTask(event.clientX, event.clientY);
    if (task === undefined) return;
    pressStart = { x: event.clientX, y: event.clientY };
    pressTimer = setTimeout(() => {
      pressTimer = undefined;
      pressOpened = true;
      pick(task, "menu");
    }, LONG_PRESS_MS);
  });
  svg.addEventListener(
    "click",
    (event) => {
      if (!pressOpened) return;
      pressOpened = false;
      event.stopPropagation();
    },
    true,
  );
  svg.addEventListener("pointermove", (event) => {
    const drift = Math.hypot(
      event.clientX - pressStart.x,
      event.clientY - pressStart.y,
    );
    if (drift > PRESS_SLOP_PX) cancelPress();
  });
  for (const type of ["pointerup", "pointercancel", "pointerleave"]) {
    svg.addEventListener(type, cancelPress);
  }

  /** The open task whose dot is nearest a page point, within PRESS_REACH. */
  function nearestTask(
    clientX: number,
    clientY: number,
  ): ScoredTask | undefined {
    const box = svg.getBoundingClientRect();
    if (box.width === 0) return undefined;
    const scale = VIEW_SIZE / box.width;
    const x = (clientX - box.left) * scale;
    const y = (clientY - box.top) * scale;
    let best: ScoredTask | undefined;
    let bestDistance = PRESS_REACH;
    for (const task of state.tasks) {
      if (task.status !== "open") continue;
      const p = toPoint(task);
      const distance = Math.hypot(p.x - x, p.y - y);
      if (distance <= bestDistance) {
        best = task;
        bestDistance = distance;
      }
    }
    return best;
  }

  function draw(): void {
    const { tasks, labels } = state;
    const byId = new Map(labels.map((l) => [l.id, l]));
    const open = tasks.filter((t) => t.status === "open");
    const next = nextUp(open);
    const selected = open.find((t) => t.id === selectedId);
    if (selected === undefined) selectedId = null;
    const now = deps.now();

    if (selected === undefined) {
      caption.replaceChildren(
        open.length === 0
          ? "No open tasks yet. Add one above to see it here."
          : "Tap a dot to see its task. Right-click or hold it for actions.",
      );
      caption.classList.remove("has-card");
    } else {
      caption.replaceChildren(
        card(selected, byId.get(selected.labelId), selected === next, now),
      );
      caption.classList.add("has-card");
    }

    dots.replaceChildren();
    defs.replaceChildren();
    const patterns = new Set<string>();
    // Draw the Next up dot, then the selected dot, last so they sit on top.
    const ordered = [
      ...open.filter((t) => t !== next && t !== selected),
      ...(next && next !== selected ? [next] : []),
      ...(selected ? [selected] : []),
    ];
    for (const task of ordered) {
      const label = byId.get(task.labelId);
      const color = labelHex(label);
      let fill = color ?? "currentColor";
      if (task.followUp && color !== undefined) {
        const id = `stripes-${label?.color ?? ""}`;
        if (!patterns.has(id)) {
          defs.append(stripes(id, color));
          patterns.add(id);
        }
        fill = `url(#${id})`;
      }
      const g = dot(task, label, fill, task === next, task === selected, now);
      g.addEventListener("click", () => {
        pick(task, "select");
      });
      g.addEventListener("focus", () => {
        selectTask(task);
      });
      g.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") selectTask(task);
        if (
          event.key === "ContextMenu" ||
          (event.key === "F10" && event.shiftKey)
        ) {
          event.preventDefault();
          openMenu(task);
        }
      });
      g.addEventListener("contextmenu", (event) => {
        event.preventDefault();
        pick(task, "menu");
      });
      dots.append(g);
    }

    const menuId = menu.openFor();
    if (menuId !== null) {
      if (open.some((t) => t.id === menuId)) menu.place();
      else menu.close(false);
    }

    const used = labels.filter((l) => open.some((t) => t.labelId === l.id));
    legend.replaceChildren(
      ...[...used]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((l) => legendItem(l)),
    );
    if (open.some((t) => t.followUp)) legend.append(followUpLegendItem());
  }

  return {
    render(next) {
      state = next;
      draw();
    },
  };
}
