/**
 * Entry point: picks the storage adapter, loads data and wires the features.
 * The site build (`npm run build:site`, ADR 0003) uses the self-hosted server with the key from
 * the person's link (#64); without a key it shows only how to get in.
 * Inside claude.ai it uses the artifact database (labels are seeded there once, after
 * publishing; plan i31). In local preview it uses in-memory storage, seeded on start,
 * which resets on reload (ADR 0001). Inside claude.ai without a database, every save
 * is refused and a warning shows (review #12). After loading it watches both
 * collections, so changes from other devices appear without a reload (#28).
 */

import "./styles.css";
import { isInsideClaude, useCapability } from "../adapters/runtime";
import { createArtifactDbRepositories } from "../adapters/storage/artifact-db";
import { createMemoryRepositories } from "../adapters/storage/memory";
import { createServerRepositories } from "../adapters/storage/server";
import { createUnavailableRepositories } from "../adapters/storage/unavailable";
import {
  scoreTasks,
  seedLabelsIfEmpty,
  type Label,
  type StorageError,
  type Task,
} from "../core";
import { createBrowserFileSaver } from "../adapters/downloads/browser";
import { createFileSaver } from "../adapters/downloads/downloads";
import { mountCapture } from "../features/capture";
import { mountExport } from "../features/export";
import { mountLabels } from "../features/labels";
import { mountMatrix } from "../features/matrix";
import { mountShelf } from "../features/shelf";
import { mountTasksList } from "../features/tasks-list";
import { mountTabs } from "./tabs";
import { takeKey } from "./key";
import { mountThemeToggle, type ThemeStorage } from "./theme";
import {
  chooseStorage,
  LIVE_STOPPED_MESSAGE,
  NO_KEY_MESSAGE,
  REVOKED_KEY_MESSAGE,
  skippedMessage,
  storageMessage,
  storageModeText,
  upsert,
  type AppState,
} from "./state";

/** How often an open page recalculates urgency from dates (i37). */
const REFRESH_MS = 15 * 60 * 1000;

function element(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (el === null) throw new Error(`Missing #${id} in index.html.`);
  return el;
}

const status = element("status");
const storageMode = element("storage-mode");

function showStatus(message: string | null): void {
  status.textContent = message ?? "";
  status.hidden = message === null;
}

/** This browser's storage, or null when the page may not use it (it can throw). */
function browserStorage(): ThemeStorage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

// Tabs (#42) and the theme come first, before storage loads, so the page does not flash
// the wrong view or theme.
mountThemeToggle(element("theme"), {
  root: document.documentElement,
  storage: browserStorage(),
  prefersDark: window.matchMedia("(prefers-color-scheme: dark)").matches,
});
const tabs = mountTabs(element("tabs"), {
  storage: browserStorage(),
  panels: {
    board: element("board-view"),
    ideas: element("ideas-view"),
    graveyard: element("graveyard-view"),
  },
});

/** Replaces the app with one message, for a page with no working key (#64). */
function showLocked(message: string): void {
  element("app-main").hidden = true;
  storageMode.textContent = "";
  showStatus(message);
}

/** The site build talks to the self-hosted server (ADR 0003); `vite build --mode site`. */
const SITE_BUILD = import.meta.env.MODE === "site";

/** Repositories on the self-hosted server for the key in the link, or null without a key. */
function serverRepositories() {
  const key = takeKey(window.location.hash, browserStorage(), () => {
    window.history.replaceState(
      null,
      "",
      window.location.pathname + window.location.search,
    );
  });
  if (key === null) return null;
  return createServerRepositories({
    key,
    fetch: (url, init) => window.fetch(url, init),
    page: {
      visible: () => document.visibilityState === "visible",
      onVisible: (callback) => {
        document.addEventListener("visibilitychange", () => {
          if (document.visibilityState === "visible") callback();
        });
      },
    },
    schedule: (callback, ms) => {
      window.setTimeout(callback, ms);
    },
    onUnauthorized: () => {
      showLocked(REVOKED_KEY_MESSAGE);
    },
  });
}

async function start(): Promise<void> {
  const inside = isInsideClaude();
  const db = inside && !SITE_BUILD ? await useCapability("db") : null;
  const mode = chooseStorage(inside, db !== null, SITE_BUILD);
  const server = mode === "server" ? serverRepositories() : null;
  if (mode === "server" && server === null) {
    showLocked(NO_KEY_MESSAGE);
    return;
  }
  const repos =
    server ??
    (db !== null
      ? createArtifactDbRepositories(db)
      : mode === "memory"
        ? createMemoryRepositories()
        : createUnavailableRepositories());
  storageMode.textContent = storageModeText(mode);
  storageMode.classList.toggle("warning", mode === "unavailable");
  storageMode.setAttribute("role", mode === "unavailable" ? "alert" : "note");

  const now = () => new Date();
  const newId = () => crypto.randomUUID();
  let state: AppState = { tasks: [], labels: [] };

  const onError = (error: unknown) => {
    console.warn(error);
    showStatus(storageMessage(error));
  };
  const onTaskSaved = (task: Task) => {
    showStatus(null);
    state = { ...state, tasks: upsert(state.tasks, task) };
    renderAll();
  };
  const onLabelSaved = (label: Label) => {
    showStatus(null);
    state = { ...state, labels: upsert(state.labels, label) };
    renderAll();
  };

  const capture = mountCapture(element("capture"), {
    tasks: repos.tasks,
    now,
    newId,
    onSaved: onTaskSaved,
    onError,
  });
  const list = mountTasksList(
    {
      today: element("today"),
      nextUp: element("next-up"),
      lists: element("tasks"),
    },
    {
      tasks: repos.tasks,
      now,
      onSaved: onTaskSaved,
      onLoaded: (loaded) => {
        state = { ...state, tasks: loaded };
        renderAll();
      },
      onError,
    },
  );
  const onTasksLoaded = (loaded: readonly Task[]) => {
    state = { ...state, tasks: loaded };
    renderAll();
  };
  const shelves = (["idea", "dropped"] as const).map((kind) =>
    mountShelf(element(kind === "idea" ? "ideas" : "graveyard"), {
      kind,
      tasks: repos.tasks,
      now,
      onSaved: onTaskSaved,
      onLoaded: onTasksLoaded,
      // A task deleted for good in the Graveyard (#54) leaves every view.
      onDeleted: (id) => {
        showStatus(null);
        state = { ...state, tasks: state.tasks.filter((t) => t.id !== id) };
        renderAll();
      },
      onError,
    }),
  );
  // The dot menu (#46) only reports a choice; the list does the saving.
  const matrix = mountMatrix(element("matrix"), {
    now,
    onAction: (taskId, action) => {
      switch (action) {
        case "done":
          list.markDone(taskId);
          break;
        case "today":
          list.toggleToday(taskId);
          break;
        case "edit":
          list.edit(taskId);
          break;
        case "drop":
          list.drop(taskId);
          break;
      }
    },
  });
  const labels = mountLabels(element("labels"), {
    labels: repos.labels,
    now,
    newId,
    onSaved: onLabelSaved,
    onLoaded: (loaded) => {
      state = { ...state, labels: loaded };
      renderAll();
    },
    onError,
  });

  /** Redraws every feature, with urgency worked out from dates at this moment. */
  function renderAll(): void {
    const scored = {
      tasks: scoreTasks(state.tasks, now()),
      labels: state.labels,
    };
    capture.render(state.labels);
    list.render(scored);
    matrix.render(scored);
    for (const shelf of shelves) shelf.render(scored);
    tabs.setCounts({
      ideas: state.tasks.filter((t) => t.status === "idea").length,
      graveyard: state.tasks.filter((t) => t.status === "dropped").length,
    });
    labels.render(state.labels);
  }

  renderAll();
  // Dots move right as dates near: recalculate every 15 minutes, and when the
  // page comes back into view (phones pause timers in the background).
  setInterval(renderAll, REFRESH_MS);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") renderAll();
  });
  // The export button appears once the downloads capability answers, without
  // holding up the first render (the runtime can take up to 10 s to answer).
  if (mode === "server") {
    mountExport(element("export"), {
      tasks: repos.tasks,
      labels: repos.labels,
      saver: createBrowserFileSaver(document),
      available: true,
      now,
      onError,
    });
  }
  if (mode === "artifact") {
    void useCapability("downloads").then((downloads) => {
      mountExport(element("export"), {
        tasks: repos.tasks,
        labels: repos.labels,
        saver: createFileSaver(downloads),
        available: downloads !== null,
        now,
        onError,
      });
    });
  }
  showStatus("Loading your tasks…");
  try {
    if (mode === "memory") await seedLabelsIfEmpty(repos.labels, now());
    const [loadedTasks, loadedLabels] = await Promise.all([
      repos.tasks.list(),
      repos.labels.list(),
    ]);
    state = { tasks: loadedTasks.items, labels: loadedLabels.items };
    renderAll();
    // With no labels a task cannot be added, so show where to make one first (#64).
    if (!state.labels.some((l) => !l.archived)) {
      const panel = document.querySelector<HTMLDetailsElement>(".labels-panel");
      if (panel !== null) panel.open = true;
    }
    showStatus(skippedMessage(loadedTasks.skipped + loadedLabels.skipped));
  } catch (error: unknown) {
    onError(error);
  }
  // Live sync (#28): after the first load, changes saved on any device arrive here.
  // Watch once per page; updates only redraw, they never write.
  const onStopped = (error: StorageError) => {
    console.warn(error);
    showStatus(LIVE_STOPPED_MESSAGE);
  };
  repos.tasks.watch((result) => {
    state = { ...state, tasks: result.items };
    renderAll();
  }, onStopped);
  repos.labels.watch((result) => {
    state = { ...state, labels: result.items };
    renderAll();
  }, onStopped);
}

void start();
