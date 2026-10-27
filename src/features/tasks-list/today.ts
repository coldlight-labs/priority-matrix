// The Today card (#38): the tasks picked for today, a "2 of 4 done" count, and a short
// celebration when a pick is ticked and when the last one is done. Rows come from the
// list, so ticking, confirming and saving work the same as everywhere else.

import { TODAY_LIMIT, type ScoredTask } from "../../core";

/** Everything the card shows for one draw. */
export interface TodayView {
  readonly open: readonly ScoredTask[];
  readonly done: readonly ScoredTask[];
  /** A message about the last pick, such as "Today is full (5)", or null. */
  readonly message: string | null;
  /** The task whose tick should play the check pop, or null. */
  readonly justDoneId: string | null;
  /** True right after the last open pick was done: plays the burst. */
  readonly celebrate: boolean;
  /** Label colors of today's picks, for the burst dots. */
  readonly colors: readonly string[];
}

/** Number of dots in the all-done burst. */
const BURST_DOTS = 12;

/** Builds the Today card's section once; `renderToday` fills it. */
export function createTodayCard(): HTMLElement {
  const card = document.createElement("section");
  card.className = "today-card";
  card.setAttribute("aria-labelledby", "today-title");
  return card;
}

/** Redraws `card` from `view`, building each task row with `row`. */
export function renderToday(
  card: HTMLElement,
  view: TodayView,
  row: (task: ScoredTask) => HTMLLIElement,
): void {
  const total = view.open.length + view.done.length;
  const allDone = total > 0 && view.open.length === 0;
  card.classList.toggle("all-done", allDone);

  const header = document.createElement("header");
  const title = document.createElement("h2");
  title.id = "today-title";
  title.textContent = "Today";
  header.append(title);
  if (total > 0) {
    const progress = document.createElement("p");
    progress.className = "today-progress";
    progress.textContent = `${String(view.done.length)} of ${String(total)} done`;
    header.append(progress);
  }

  const body: HTMLElement[] = [header];
  if (view.message !== null) {
    const message = document.createElement("p");
    message.className = "today-message";
    message.setAttribute("role", "status");
    message.textContent = view.message;
    body.push(message);
  }

  if (allDone) {
    const cheer = document.createElement("p");
    cheer.className = "today-cheer";
    cheer.textContent =
      total === 1 ? "Done for today." : `All ${String(total)} done for today.`;
    if (view.celebrate) cheer.append(burst(view.colors));
    body.push(cheer);
  }

  const list = document.createElement("ul");
  list.className = "task-list";
  if (total === 0) {
    const empty = document.createElement("li");
    empty.className = "empty";
    empty.textContent = `Pick up to ${String(TODAY_LIMIT)} tasks with ☆ to plan your day.`;
    list.append(empty);
  }
  for (const task of [...view.open, ...view.done]) {
    const li = row(task);
    if (task.id === view.justDoneId) li.classList.add("just-done");
    list.append(li);
  }
  body.push(list);
  card.replaceChildren(...body);
}

/** Dots that fly out from the all-done message, in the picks' label colors. */
function burst(colors: readonly string[]): HTMLElement {
  const wrap = document.createElement("span");
  wrap.className = "burst";
  wrap.setAttribute("aria-hidden", "true");
  for (let i = 0; i < BURST_DOTS; i += 1) {
    const dot = document.createElement("span");
    dot.className = "burst-dot";
    // Spread the dots evenly around a circle; the stylesheet animates them outward.
    dot.style.setProperty("--angle", `${String((360 / BURST_DOTS) * i)}deg`);
    dot.style.backgroundColor =
      colors.length > 0 ? (colors[i % colors.length] ?? "") : "";
    wrap.append(dot);
  }
  return wrap;
}
