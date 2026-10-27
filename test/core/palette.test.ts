import { describe, expect, it } from "vitest";
import css from "../../src/app/styles.css?raw";
import {
  firstFreeColor,
  isPaletteColor,
  legacyFamily,
  PALETTE,
  swatchOf,
} from "../../src/core/palette";

/** WCAG relative luminance of a #rrggbb color. */
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [
    number,
    number,
  ];
  return (hi + 0.05) / (lo + 0.05);
}

/** Every value of a token (light and both dark blocks) as declared in styles.css. */
function tokenValues(name: string): string[] {
  const pattern = new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`, "g");
  return [...css.matchAll(pattern)].map((m) => m[1] ?? "");
}

describe("label palette (#45)", () => {
  it("has 15 swatches with unique ids, names and colors, each with a shape", () => {
    expect(PALETTE).toHaveLength(15);
    expect(new Set(PALETTE.map((s) => s.id)).size).toBe(15);
    expect(new Set(PALETTE.map((s) => s.name)).size).toBe(15);
    expect(new Set(PALETTE.map((s) => s.hex)).size).toBe(15);
    for (const s of PALETTE) {
      expect(["circle", "square", "triangle", "diamond"]).toContain(s.shape);
    }
  });

  // Reads the backgrounds from the stylesheet, so changing a theme color re-runs this check.
  const backgrounds = [...tokenValues("bg"), ...tokenValues("surface")];

  it("reads the four theme backgrounds from styles.css", () => {
    expect(new Set(backgrounds).size).toBe(4);
  });

  it.each(PALETTE.map((s) => [s.name, s.hex]))(
    "%s (%s) has at least 3:1 contrast on every light and dark background",
    (_name, hex) => {
      for (const bg of backgrounds) {
        expect(contrast(hex, bg)).toBeGreaterThanOrEqual(3);
      }
    },
  );

  // Neighbors on the color wheel are the easy ones to confuse, so they differ in shape (i81).
  it.each([
    ["red", "orange"],
    ["red", "pink"],
    ["orange", "gold"],
    ["gold", "brown"],
    ["lime", "green"],
    ["green", "teal"],
    ["teal", "sky"],
    ["sky", "blue"],
    ["blue", "navy"],
    ["blue", "indigo"],
    ["navy", "indigo"],
    ["indigo", "purple"],
    ["purple", "magenta"],
    ["magenta", "pink"],
    ["slate", "navy"],
  ])("%s and %s have different shapes", (a, b) => {
    expect(swatchOf(a)?.shape).not.toBe(swatchOf(b)?.shape);
  });

  it("looks up swatches by id", () => {
    expect(isPaletteColor("teal")).toBe(true);
    expect(isPaletteColor("#0e9a92")).toBe(false);
    expect(swatchOf("teal")?.name).toBe("Teal");
  });

  it("does not treat old color ids as palette colors", () => {
    expect(isPaletteColor("teal-1")).toBe(false);
    expect(swatchOf("teal-1")).toBeUndefined();
  });

  it("maps every old color id to its new color family (#45)", () => {
    expect(legacyFamily("scarlet-2")).toBe("red");
    expect(legacyFamily("cerulean-1")).toBe("sky");
    expect(legacyFamily("rose-1")).toBe("pink");
    expect(legacyFamily("teal")).toBeUndefined();
    expect(legacyFamily("plaid")).toBeUndefined();
  });

  it("picks the first color no active label uses", () => {
    expect(
      firstFreeColor([
        { color: "red", archived: false },
        { color: "orange", archived: true },
      ]),
    ).toBe("orange");
  });

  it("falls back to the first swatch when every color is in use", () => {
    const all = PALETTE.map((s) => ({ color: s.id, archived: false }));
    expect(firstFreeColor(all)).toBe("red");
  });
});

/** Mixes two #rrggbb colors like CSS `color-mix(in srgb, a w, b)`. */
function mix(a: string, b: string, w: number): string {
  const ch = (h: string, i: number) => parseInt(h.slice(i, i + 2), 16);
  return `#${[1, 3, 5]
    .map((i) =>
      Math.round(ch(a, i) * w + ch(b, i) * (1 - w))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

/** A number token's values (light and both dark blocks), e.g. --quad-tint. */
function numberValues(name: string): number[] {
  const pattern = new RegExp(`--${name}:\\s*([0-9.]+);`, "g");
  return [...css.matchAll(pattern)].map((m) => Number(m[1]));
}

describe("matrix quadrant names (#45)", () => {
  // Order of the three theme blocks: light, dark (system), dark (toggle).
  const surfaces = tokenValues("surface");
  const inks = tokenValues("ink");
  const tints = numberValues("quad-tint");
  const share = Number(/var\(--q\) (\d+)%, var\(--ink\)/.exec(css)?.[1]) / 100;

  it.each(["do", "schedule", "delegate", "drop"])(
    "%s name has at least 4.5:1 on its tinted quadrant in every theme",
    (q) => {
      const texts = tokenValues(`q-${q}`);
      const [fill] = tokenValues(`quad-fill-${q}`);
      expect(texts).toHaveLength(3);
      expect(tints).toHaveLength(3);
      texts.forEach((text, i) => {
        const surface = surfaces[i] ?? "";
        const tinted = mix(fill ?? "", surface, tints[i] ?? 0);
        const name = mix(text, inks[i] ?? "", share);
        expect(contrast(name, tinted)).toBeGreaterThanOrEqual(4.5);
      });
    },
  );
});

describe("matrix dot outline (#45)", () => {
  // Dots sit on tinted quadrants; an outline in the card color keeps each color's 3:1
  // contrast against what is right next to it.
  it("outlines every dot mark in the card color", () => {
    expect(css).toMatch(
      /\.matrix \.dot \.mark\s*\{[^}]*stroke:\s*var\(--surface\);[^}]*stroke-width:\s*1\.5px;/,
    );
  });
});
