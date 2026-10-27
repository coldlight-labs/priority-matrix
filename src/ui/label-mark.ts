// The label mark: how a label shows next to a task, drawn the same way everywhere (#44).
// Each palette color has a fixed shape (#45), so look-alike colors still differ.

import { swatchOf, type MarkShape } from "../core";

const SVG_NS = "http://www.w3.org/2000/svg";

/** The label's palette color, or undefined for no label or an unknown color. */
export function labelHex(
  label: { readonly color: string } | undefined,
): string | undefined {
  return label === undefined ? undefined : swatchOf(label.color)?.hex;
}

/** The label's mark shape (#45); a circle for no label or an unknown color. */
export function labelShape(
  label: { readonly color: string } | undefined,
): MarkShape {
  return (
    (label === undefined ? undefined : swatchOf(label.color)?.shape) ?? "circle"
  );
}

/** Rounds a coordinate to 2 decimals for compact, stable SVG attributes. */
function n(value: number): string {
  return String(Math.round(value * 100) / 100);
}

/**
 * One mark shape centred on (cx, cy), fitting inside a circle of radius r, so every
 * shape reads at the same size. The caller sets fill and stroke.
 */
export function markShape(
  shape: MarkShape,
  cx: number,
  cy: number,
  r: number,
): SVGElement {
  if (shape === "circle") {
    const circle = document.createElementNS(SVG_NS, "circle");
    circle.setAttribute("cx", n(cx));
    circle.setAttribute("cy", n(cy));
    circle.setAttribute("r", n(r));
    return circle;
  }
  if (shape === "square") {
    // Side 1.7r: a little smaller than the circle's width, so it looks the same size.
    const half = 0.85 * r;
    const rect = document.createElementNS(SVG_NS, "rect");
    rect.setAttribute("x", n(cx - half));
    rect.setAttribute("y", n(cy - half));
    rect.setAttribute("width", n(2 * half));
    rect.setAttribute("height", n(2 * half));
    rect.setAttribute("rx", n(0.2 * r));
    return rect;
  }
  const points =
    shape === "triangle"
      ? [
          [cx, cy - r],
          [cx + 0.95 * r, cy + 0.75 * r],
          [cx - 0.95 * r, cy + 0.75 * r],
        ]
      : [
          [cx, cy - r],
          [cx + r, cy],
          [cx, cy + r],
          [cx - r, cy],
        ];
  const polygon = document.createElementNS(SVG_NS, "polygon");
  polygon.setAttribute(
    "points",
    points.map(([x = 0, y = 0]) => `${n(x)},${n(y)}`).join(" "),
  );
  return polygon;
}

/**
 * A small mark in the label's color and shape; decorative, since the label name sits
 * next to it. Empty and transparent without a known label. A `striped` dot (the
 * follow-up legend) gets its look from the stylesheet.
 */
export function labelDot(
  label: { readonly color: string } | undefined,
  options: { readonly striped?: boolean } = {},
): HTMLSpanElement {
  const dot = document.createElement("span");
  dot.setAttribute("aria-hidden", "true");
  if (options.striped === true) {
    dot.className = "color-dot striped";
    return dot;
  }
  const swatch = label === undefined ? undefined : swatchOf(label.color);
  if (swatch === undefined) {
    dot.className = "color-dot";
    dot.style.backgroundColor = "transparent";
    return dot;
  }
  dot.className = "color-dot mark";
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 12 12");
  const shape = markShape(swatch.shape, 6, 6, 5.5);
  shape.setAttribute("fill", swatch.hex);
  svg.append(shape);
  dot.append(svg);
  return dot;
}
