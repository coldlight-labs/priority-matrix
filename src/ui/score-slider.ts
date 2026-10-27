// The 0 to 100 importance slider with its live value, shared by the capture form and
// the Edit form (#58). The caption is the form's own.

import { SCORE_MAX, SCORE_MIN } from "../core";

/** The built slider: its wrapper, the range input, and `set` to change the value in code. */
export interface ScoreSlider {
  readonly wrap: HTMLElement;
  readonly input: HTMLInputElement;
  readonly set: (value: number) => void;
}

/** Builds a whole-number slider from SCORE_MIN to SCORE_MAX, showing its value beside it. */
export function scoreSlider(id: string, value: number): ScoreSlider {
  const input = document.createElement("input");
  input.id = id;
  input.type = "range";
  input.min = String(SCORE_MIN);
  input.max = String(SCORE_MAX);
  input.step = "1";
  const shown = document.createElement("output");
  shown.setAttribute("for", id);
  shown.className = "score-value";
  const wrap = document.createElement("div");
  wrap.className = "slider";
  wrap.append(input, shown);
  const set = (n: number) => {
    input.value = String(n);
    shown.textContent = String(n);
  };
  input.addEventListener("input", () => {
    shown.textContent = input.value;
  });
  set(value);
  return { wrap, input, set };
}
