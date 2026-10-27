// Matrix drawing (#52, split from index.ts in review 4): builds the SVG background,
// the dots, the caption card and the legend items. No state and no event handling;
// index.ts owns those.

import {
  dueText,
  QUADRANT_LINE,
  QUADRANT_NAMES,
  quadrantOf,
  SCORE_MAX,
  timeLeftText,
  type Label,
  type ScoredTask,
} from "../../core";
import { labelDot, labelHex, labelShape, markShape } from "../../ui";

export const SVG_NS = "http://www.w3.org/2000/svg";

/** Width and height of the viewBox. */
export const VIEW_SIZE = 400;
/**
 * Plot area inside the 400 x 400 viewBox, leaving room for the axis titles and for
 * the Next up ring around a dot at 100 (common now that overdue tasks are 100).
 */
const PLOT = { left: 28, top: 14, size: 352 } as const;
export const DOT_RADIUS = 7;
const RING_RADIUS = 12;
/** A selected dot grows so it stands out from its neighbours. */
const SELECTED_RADIUS = 10;
/** Stripe tile size and stripe width, in viewBox units. */
const STRIPE_TILE = 4;
const STRIPE_WIDTH = 1.6;

/** Maps scores (0 to 100) to viewBox coordinates: urgency to the right, importance up. */
export function toPoint(scores: {
  readonly urgency: number;
  readonly importance: number;
}): { x: number; y: number } {
  const scale = PLOT.size / SCORE_MAX;
  return {
    x: PLOT.left + scores.urgency * scale,
    y: PLOT.top + (SCORE_MAX - scores.importance) * scale,
  };
}

/** The words for a task: shared by the caption card and the dot's spoken label (i57). */
function describe(
  task: ScoredTask,
  label: Label | undefined,
  now: Date,
): { place: string; when: string } {
  const quadrant = QUADRANT_NAMES[quadrantOf(task)].name;
  const place = `${label?.name ?? "No label"} · ${quadrant}`;
  const when =
    task.date === null
      ? "No date"
      : `${dueText(task, now)} · ${timeLeftText(task, now)}`;
  return { place, when };
}

/** The caption card for the selected dot: a bar in the label color, then the details. */
export function card(
  task: ScoredTask,
  label: Label | undefined,
  isNext: boolean,
  now: Date,
): HTMLElement {
  const { when } = describe(task, label, now);
  const box = document.createElement("div");
  box.className = "caption-card";
  box.style.borderLeftColor = labelHex(label) ?? "";
  const title = document.createElement("p");
  title.className = "caption-title";
  title.textContent = task.text;
  const placeLine = document.createElement("p");
  placeLine.className = "caption-meta";
  const swatch = labelDot(label);
  // The label name is large text in its own color (i84); large text needs 3:1, which
  // every palette color has on the page backgrounds (palette test).
  const labelName = document.createElement("span");
  labelName.className = "caption-label";
  labelName.textContent = label?.name ?? "No label";
  labelName.style.color = labelHex(label) ?? "";
  const placeText = document.createElement("span");
  const quadrant = QUADRANT_NAMES[quadrantOf(task)].name;
  placeText.textContent = ` · ${quadrant}${isNext ? " · Next up" : ""}`;
  placeLine.append(swatch, labelName, placeText);
  const whenLine = document.createElement("p");
  whenLine.className = "caption-meta";
  whenLine.textContent = when;
  box.append(title, placeLine, whenLine);
  return box;
}

/** One task's dot: a focusable group with its spoken label, Next up ring and mark. */
export function dot(
  task: ScoredTask,
  label: Label | undefined,
  fill: string,
  isNext: boolean,
  isSelected: boolean,
  now: Date,
): SVGGElement {
  const { x, y } = toPoint(task);
  const g = document.createElementNS(SVG_NS, "g");
  g.setAttribute(
    "class",
    [
      "dot",
      isNext ? "next" : "",
      isSelected ? "selected" : "",
      task.followUp ? "follow-up" : "",
    ]
      .filter(Boolean)
      .join(" "),
  );
  g.dataset.taskId = task.id;
  g.setAttribute("tabindex", "0");
  g.setAttribute("role", "button");
  g.setAttribute("aria-haspopup", "menu");
  const { place, when } = describe(task, label, now);
  const description = `${isNext ? "Next up: " : ""}${task.text}, ${place}, ${when}`;
  g.setAttribute("aria-label", description);

  const title = document.createElementNS(SVG_NS, "title");
  title.textContent = description;
  g.append(title);

  if (isNext) {
    const ring = document.createElementNS(SVG_NS, "circle");
    ring.setAttribute("class", "ring");
    ring.setAttribute("cx", String(x));
    ring.setAttribute("cy", String(y));
    ring.setAttribute("r", String(RING_RADIUS));
    g.append(ring);
  }
  // The label's shape tells look-alike colors apart (#45); the outline is in styles.css.
  const mark = markShape(
    labelShape(label),
    x,
    y,
    isSelected ? SELECTED_RADIUS : DOT_RADIUS,
  );
  mark.setAttribute("class", "mark");
  mark.setAttribute("fill", fill);
  g.append(mark);
  return g;
}

/** A tile of white diagonal stripes over `color`, used to fill follow-up dots. */
export function stripes(id: string, color: string): SVGPatternElement {
  const pattern = document.createElementNS(SVG_NS, "pattern");
  pattern.id = id;
  pattern.setAttribute("patternUnits", "userSpaceOnUse");
  pattern.setAttribute("width", String(STRIPE_TILE));
  pattern.setAttribute("height", String(STRIPE_TILE));
  pattern.setAttribute("patternTransform", "rotate(45)");
  const base = document.createElementNS(SVG_NS, "rect");
  base.setAttribute("width", String(STRIPE_TILE));
  base.setAttribute("height", String(STRIPE_TILE));
  base.setAttribute("fill", color);
  const stripe = document.createElementNS(SVG_NS, "rect");
  stripe.setAttribute("width", String(STRIPE_WIDTH));
  stripe.setAttribute("height", String(STRIPE_TILE));
  stripe.setAttribute("fill", "#ffffff");
  pattern.append(base, stripe);
  return pattern;
}

/** Legend entry explaining the striped dots. */
export function followUpLegendItem(): HTMLLIElement {
  const li = document.createElement("li");
  li.className = "legend-follow-up";
  const swatch = labelDot(undefined, { striped: true });
  const name = document.createElement("span");
  name.textContent = "Striped: follow-up date";
  li.append(swatch, name);
  return li;
}

/** Legend entry for one label: its mark and name. */
export function legendItem(label: Label): HTMLLIElement {
  const li = document.createElement("li");
  const swatch = labelDot(label);
  const name = document.createElement("span");
  name.textContent = label.name;
  li.append(swatch, name);
  return li;
}

/** Quadrant tints, the two 50 lines, quadrant names and axis titles. */
export function drawBackground(g: SVGGElement): void {
  const mid = toPoint({ urgency: QUADRANT_LINE, importance: QUADRANT_LINE });
  const right = PLOT.left + PLOT.size;
  const bottom = PLOT.top + PLOT.size;
  const quads: [string, number, number, number, number, string][] = [
    [
      "schedule",
      PLOT.left,
      PLOT.top,
      mid.x - PLOT.left,
      mid.y - PLOT.top,
      QUADRANT_NAMES.SCHEDULE.name,
    ],
    [
      "do",
      mid.x,
      PLOT.top,
      right - mid.x,
      mid.y - PLOT.top,
      QUADRANT_NAMES.DO.name,
    ],
    [
      "drop",
      PLOT.left,
      mid.y,
      mid.x - PLOT.left,
      bottom - mid.y,
      QUADRANT_NAMES.DROP.name,
    ],
    [
      "delegate",
      mid.x,
      mid.y,
      right - mid.x,
      bottom - mid.y,
      QUADRANT_NAMES.DELEGATE.name,
    ],
  ];
  for (const [key, x, y, w, h, name] of quads) {
    const rect = document.createElementNS(SVG_NS, "rect");
    rect.setAttribute("class", `quad quad-${key}`);
    rect.setAttribute("x", String(x));
    rect.setAttribute("y", String(y));
    rect.setAttribute("width", String(w));
    rect.setAttribute("height", String(h));
    const text = document.createElementNS(SVG_NS, "text");
    text.setAttribute("class", `quad-name quad-name-${key}`);
    text.setAttribute("x", String(x + 8));
    text.setAttribute("y", String(y + 18));
    text.textContent = name;
    g.append(rect, text);
  }
  for (const [x1, y1, x2, y2] of [
    [mid.x, PLOT.top, mid.x, bottom],
    [PLOT.left, mid.y, right, mid.y],
  ] as const) {
    const line = document.createElementNS(SVG_NS, "line");
    line.setAttribute("class", "mid-line");
    line.setAttribute("x1", String(x1));
    line.setAttribute("y1", String(y1));
    line.setAttribute("x2", String(x2));
    line.setAttribute("y2", String(y2));
    g.append(line);
  }
  const frame = document.createElementNS(SVG_NS, "rect");
  frame.setAttribute("class", "frame");
  frame.setAttribute("x", String(PLOT.left));
  frame.setAttribute("y", String(PLOT.top));
  frame.setAttribute("width", String(PLOT.size));
  frame.setAttribute("height", String(PLOT.size));
  g.append(frame);

  const xTitle = document.createElementNS(SVG_NS, "text");
  xTitle.setAttribute("class", "axis-title");
  xTitle.setAttribute("x", String(right));
  xTitle.setAttribute("y", String(bottom + 22));
  xTitle.setAttribute("text-anchor", "end");
  xTitle.textContent = "Urgency →";
  const yTitle = document.createElementNS(SVG_NS, "text");
  yTitle.setAttribute("class", "axis-title");
  yTitle.setAttribute("x", "14");
  yTitle.setAttribute("y", String(PLOT.top + 4));
  // Rotated to run up the left edge; anchored at its end so it starts below the top.
  yTitle.setAttribute("text-anchor", "end");
  yTitle.setAttribute("transform", `rotate(-90 14 ${String(PLOT.top + 4)})`);
  yTitle.textContent = "Importance →";
  g.append(xTitle, yTitle);
}
