// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { errorLine, labelDot, labelHex, markShape } from "../../src/ui";

describe("labelHex (#44)", () => {
  it("gives the palette color of a label", () => {
    expect(labelHex({ color: "green" })).toBe("#14a050");
  });

  it("gives undefined for no label or an unknown color", () => {
    expect(labelHex(undefined)).toBeUndefined();
    expect(labelHex({ color: "plaid" })).toBeUndefined();
  });
});

describe("labelDot (#44)", () => {
  it("is a decorative mark in the label's color and shape (#45)", () => {
    const dot = labelDot({ color: "green" });
    expect(dot.className).toBe("color-dot mark");
    expect(dot.getAttribute("aria-hidden")).toBe("true");
    const square = dot.querySelector("svg rect");
    expect(square?.getAttribute("fill")).toBe("#14a050");
  });

  it("draws each shape (#45)", () => {
    expect(
      labelDot({ color: "red" }).querySelector("svg circle"),
    ).not.toBeNull();
    expect(
      labelDot({ color: "teal" })
        .querySelector("svg polygon")
        ?.getAttribute("points"),
    ).toMatch(/^[\d. ,]+$/);
  });

  it("is transparent without a label", () => {
    expect(labelDot(undefined).style.backgroundColor).toBe("transparent");
  });

  it("leaves the striped follow-up dot to the stylesheet", () => {
    const dot = labelDot(undefined, { striped: true });
    expect(dot.className).toBe("color-dot striped");
    expect(dot.style.backgroundColor).toBe("");
  });
});

describe("errorLine (#44)", () => {
  it("is a hidden alert with the given id", () => {
    const line = errorLine("capture-text-error");
    expect(line.id).toBe("capture-text-error");
    expect(line.className).toBe("field-error");
    expect(line.getAttribute("role")).toBe("alert");
    expect(line.hidden).toBe(true);
  });
});

describe("markShape (#45)", () => {
  it("draws a circle, square, triangle or diamond centred on a point", () => {
    expect(markShape("circle", 10, 20, 5).tagName).toBe("circle");
    expect(markShape("square", 10, 20, 5).tagName).toBe("rect");
    expect(markShape("triangle", 10, 20, 5).tagName).toBe("polygon");
    expect(markShape("diamond", 10, 20, 5).tagName).toBe("polygon");
    expect(markShape("circle", 10, 20, 5).getAttribute("cx")).toBe("10");
    expect(markShape("diamond", 10, 20, 5).getAttribute("points")).toContain(
      "10,15",
    );
  });

  it("keeps every shape inside its radius box", () => {
    for (const shape of ["square", "triangle", "diamond"] as const) {
      const el = markShape(shape, 0, 0, 10);
      const points =
        el.tagName === "rect"
          ? [Number(el.getAttribute("x")), Number(el.getAttribute("y"))]
          : (el.getAttribute("points") ?? "").split(/[ ,]/).map(Number);
      for (const p of points) expect(Math.abs(p)).toBeLessThanOrEqual(10.5);
    }
  });
});
