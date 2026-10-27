// Label colors (#45, option C): 15 colors, each with a fixed shape, so labels stay easy to
// tell apart in the matrix. Neighbors on the color wheel get different shapes (i81). Each
// color has at least 3:1 contrast against the page and card backgrounds in light and dark
// mode (WCAG minimum for shapes). test/core/palette.test.ts checks both.

/** The shape a label's mark takes, alongside its color. */
export type MarkShape = "circle" | "square" | "triangle" | "diamond";

/** One palette swatch. Labels store the id. */
export interface Swatch {
  readonly id: string;
  readonly name: string;
  readonly hex: string;
  readonly shape: MarkShape;
}

/** All label colors, in picker order (around the color wheel, then neutrals). */
export const PALETTE: readonly Swatch[] = [
  { id: "red", name: "Red", hex: "#e0303f", shape: "circle" },
  { id: "orange", name: "Orange", hex: "#d4610a", shape: "square" },
  { id: "gold", name: "Gold", hex: "#a8800a", shape: "triangle" },
  { id: "brown", name: "Brown", hex: "#9a6438", shape: "diamond" },
  { id: "lime", name: "Lime", hex: "#5f9a12", shape: "circle" },
  { id: "green", name: "Green", hex: "#14a050", shape: "square" },
  { id: "teal", name: "Teal", hex: "#0e9a92", shape: "triangle" },
  { id: "sky", name: "Sky", hex: "#1588c8", shape: "circle" },
  { id: "blue", name: "Blue", hex: "#3d6ee6", shape: "square" },
  { id: "navy", name: "Navy", hex: "#4a63c8", shape: "diamond" },
  { id: "indigo", name: "Indigo", hex: "#6c5ce7", shape: "triangle" },
  { id: "purple", name: "Purple", hex: "#9a4fd8", shape: "circle" },
  { id: "magenta", name: "Magenta", hex: "#c43aa8", shape: "square" },
  { id: "pink", name: "Pink", hex: "#e0457e", shape: "triangle" },
  { id: "slate", name: "Slate", hex: "#6e7a8c", shape: "circle" },
];

/**
 * The 50-color palette before #45 named colors "<hue>-<1|2>". Each old hue maps to the
 * nearest new color, so labels saved before #45 keep their color family when read.
 */
const LEGACY_HUES: Readonly<Record<string, string>> = {
  red: "red",
  scarlet: "red",
  rust: "orange",
  orange: "orange",
  ochre: "gold",
  amber: "gold",
  gold: "gold",
  olive: "lime",
  lime: "lime",
  green: "green",
  jade: "green",
  sea: "teal",
  teal: "teal",
  cyan: "teal",
  ocean: "sky",
  cerulean: "sky",
  azure: "sky",
  blue: "blue",
  indigo: "indigo",
  violet: "purple",
  purple: "purple",
  orchid: "magenta",
  magenta: "magenta",
  pink: "pink",
  rose: "pink",
};

/** The new color for an old (before #45) color id such as "teal-1", or undefined. */
export function legacyFamily(id: unknown): string | undefined {
  if (typeof id !== "string") return undefined;
  const match = /^([a-z]+)-[12]$/.exec(id);
  return match?.[1] === undefined ? undefined : LEGACY_HUES[match[1]];
}

const BY_ID = new Map(PALETTE.map((s) => [s.id, s]));

/** True when `id` names a palette swatch. */
export function isPaletteColor(id: unknown): id is string {
  return typeof id === "string" && BY_ID.has(id);
}

/** The swatch for a color id, or undefined for an unknown id. */
export function swatchOf(id: string): Swatch | undefined {
  return BY_ID.get(id);
}

/** The first swatch no active label uses, or the first swatch when all are taken. */
export function firstFreeColor(
  labels: readonly { readonly color: string; readonly archived: boolean }[],
): string {
  const used = new Set(labels.filter((l) => !l.archived).map((l) => l.color));
  return (PALETTE.find((s) => !used.has(s.id)) ?? PALETTE[0])?.id ?? "";
}
