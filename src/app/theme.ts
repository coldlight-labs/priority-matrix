// Light and dark mode toggle (#23, Q36: a). The page starts from the device's setting;
// pressing the button switches theme and remembers the choice in this browser only,
// a per-device convenience. Colors for both themes are tokens in styles.css, which
// switch on the root element's data-theme attribute.

/** The two themes the page offers. */
export type Theme = "light" | "dark";

/** Browser storage key for the remembered choice. */
const STORAGE_KEY = "priority-matrix-theme";

/** The minimal storage the toggle uses, so tests can pass a fake. */
export interface ThemeStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** The remembered theme, or the device's setting when there is none (or storage fails). */
export function startTheme(
  storage: ThemeStorage | null,
  prefersDark: boolean,
): Theme {
  try {
    const stored = storage?.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark") return stored;
  } catch {
    // Storage can be blocked (private windows, previews); fall back to the device setting.
  }
  return prefersDark ? "dark" : "light";
}

/**
 * Builds the toggle button inside `container` and applies the starting theme to `root`.
 * The button names the theme it switches to.
 */
export function mountThemeToggle(
  container: HTMLElement,
  deps: {
    readonly root: HTMLElement;
    readonly storage: ThemeStorage | null;
    readonly prefersDark: boolean;
  },
): void {
  let theme = startTheme(deps.storage, deps.prefersDark);
  const button = document.createElement("button");
  button.type = "button";
  button.id = "theme-toggle";
  button.className = "theme-toggle";
  container.append(button);

  const apply = () => {
    deps.root.dataset.theme = theme;
    const next = theme === "dark" ? "light" : "dark";
    button.textContent = next === "light" ? "☀ Light" : "☾ Dark";
    button.setAttribute("aria-label", `Switch to ${next} mode`);
  };
  apply();

  button.addEventListener("click", () => {
    theme = theme === "dark" ? "light" : "dark";
    apply();
    try {
      deps.storage?.setItem(STORAGE_KEY, theme);
    } catch {
      // Not remembered when storage is blocked; the switch still works for this visit.
    }
  });
}
