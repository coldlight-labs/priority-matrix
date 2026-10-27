// Page tabs (#42): Board (capture stays above all tabs), Ideas and Graveyard. The tab in
// use is remembered in this browser only, a per-device convenience like the theme (i76).

/** The three views of the page. */
export type Tab = "board" | "ideas" | "graveyard";

const TABS: readonly Tab[] = ["board", "ideas", "graveyard"];
const NAMES: Readonly<Record<Tab, string>> = {
  board: "Board",
  ideas: "Ideas",
  graveyard: "Graveyard",
};

/** Browser storage key for the remembered tab. */
const STORAGE_KEY = "priority-matrix-tab";

/** The minimal storage the tabs use, so tests can pass a fake. */
export interface TabStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** The remembered tab, or the board when there is none, storage fails or it holds junk. */
export function startTab(storage: TabStorage | null): Tab {
  try {
    const stored = storage?.getItem(STORAGE_KEY);
    const known = TABS.find((t) => t === stored);
    if (known !== undefined) return known;
  } catch {
    // Storage can be blocked (private windows, previews); start on the board.
  }
  return "board";
}

/**
 * Builds the tab buttons inside `container` and shows the panel for the starting tab.
 * Call `setCounts` whenever tasks change.
 */
export function mountTabs(
  container: HTMLElement,
  deps: {
    readonly storage: TabStorage | null;
    readonly panels: Readonly<Record<Tab, HTMLElement>>;
  },
): { setCounts(counts: { ideas: number; graveyard: number }): void } {
  let current = startTab(deps.storage);
  const list = document.createElement("div");
  list.className = "tabs";
  list.setAttribute("role", "tablist");
  list.setAttribute("aria-label", "Views");
  const buttons = new Map<Tab, HTMLButtonElement>();
  for (const tab of TABS) {
    const button = document.createElement("button");
    button.type = "button";
    button.id = `tab-${tab}`;
    button.className = "tab";
    button.setAttribute("role", "tab");
    button.setAttribute("aria-controls", deps.panels[tab].id || `${tab}-view`);
    button.textContent = NAMES[tab];
    button.addEventListener("click", () => {
      select(tab);
    });
    buttons.set(tab, button);
    list.append(button);
    deps.panels[tab].setAttribute("role", "tabpanel");
    deps.panels[tab].setAttribute("aria-labelledby", button.id);
  }
  // Left and right arrows move between tabs, as the tab pattern expects.
  list.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    const step = event.key === "ArrowRight" ? 1 : TABS.length - 1;
    const next = TABS[(TABS.indexOf(current) + step) % TABS.length];
    if (next === undefined) return;
    select(next);
    buttons.get(next)?.focus();
  });
  container.append(list);

  function show(): void {
    for (const tab of TABS) {
      const selected = tab === current;
      deps.panels[tab].hidden = !selected;
      const button = buttons.get(tab);
      button?.setAttribute("aria-selected", String(selected));
      if (button) button.tabIndex = selected ? 0 : -1;
    }
  }

  function select(tab: Tab): void {
    current = tab;
    show();
    try {
      deps.storage?.setItem(STORAGE_KEY, tab);
    } catch {
      // Not remembered when storage is blocked; the switch still works for this visit.
    }
  }

  show();
  return {
    setCounts(counts) {
      const ideas = buttons.get("ideas");
      const graveyard = buttons.get("graveyard");
      if (ideas) ideas.textContent = `${NAMES.ideas} (${String(counts.ideas)})`;
      if (graveyard) {
        graveyard.textContent = `${NAMES.graveyard} (${String(counts.graveyard)})`;
      }
    },
  };
}
