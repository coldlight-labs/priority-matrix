// The API (ADR 0003): one function from a request to a response, so it is tested
// without a network. main.ts connects it to Node's web server. Every request is checked
// here, in this order: address limit, key, account limit, route, body, core's rules.
// Responses never echo keys or task text; errors are generic.

import {
  changedSince,
  parseStoredLabel,
  parseStoredTask,
  upgradeLabelColors,
  validateLabelName,
  type Label,
  type Task,
  type ValidationError,
} from "../src/core";
import { findCredential, type AccountsFile } from "./accounts";
import type { RateLimiter } from "./limits";
import type { AccountData, Store } from "./store";

/** Largest request body accepted, in bytes. */
export const MAX_BODY_BYTES = 64 * 1024;
/** Most tasks and labels one account may store. */
export const MAX_TASKS = 5000;
export const MAX_LABELS = 200;

/** A request as main.ts passes it in. */
export interface ApiRequest {
  readonly method: string;
  readonly path: string;
  /** The query string with its "?", or "". */
  readonly search: string;
  readonly authorization: string | undefined;
  readonly body: string;
  /** The caller's address, for limits only; never logged. */
  readonly ip: string;
}

/** A response: a status and an optional JSON body. */
export interface ApiResponse {
  readonly status: number;
  readonly json?: unknown;
}

/** What the handler needs. */
export interface HandlerDeps {
  /** The accounts file as it is now, so a revoke takes effect on the next request. */
  readonly loadAccounts: () => Promise<AccountsFile>;
  readonly store: Store;
  readonly limits: {
    /** Per address and per account. */
    readonly request: RateLimiter;
    /** Per address, counting wrong keys only. */
    readonly failedKey: RateLimiter;
  };
  readonly now: () => Date;
  /** One structured line per request. */
  readonly log: (entry: Record<string, string | number>) => void;
}

const error = (status: number, code: string): ApiResponse => ({
  status,
  json: { error: code },
});

/** A route: its method, its path pattern and the work it does for an account. */
interface Route {
  readonly method: string;
  readonly pattern: RegExp;
  readonly name: string;
  readonly access: "read" | "full-write" | "task-write";
  readonly run: (
    accountId: string,
    id: string,
    body: unknown,
    search: URLSearchParams,
    credentialAccess: "full" | "read-only" | "task-writer",
  ) => Promise<ApiResponse>;
}

/** Builds the request handler. */
export function createHandler(deps: HandlerDeps) {
  const { store } = deps;

  const routes: readonly Route[] = [
    {
      method: "GET",
      pattern: /^\/api\/data$/,
      name: "GET /api/data",
      access: "read",
      run: async (accountId, _id, _body, search) => {
        const data = await store.read(accountId);
        const since = Number(search.get("since"));
        if (search.has("since") && since === data.revision) {
          return {
            status: 200,
            json: { revision: data.revision, changed: false },
          };
        }
        const tasks = parsedTasks(data);
        const labels = parsedLabels(data);
        return {
          status: 200,
          json: {
            revision: data.revision,
            tasks: tasks.items,
            labels: labels.items,
            skipped: tasks.skipped + labels.skipped,
          },
        };
      },
    },
    {
      method: "PUT",
      pattern: /^\/api\/tasks\/([A-Za-z0-9-]{1,100})$/,
      name: "PUT /api/tasks/:id",
      access: "full-write",
      run: async (accountId, id, body) => {
        const t = checkTask(body, id);
        if (t === undefined) return error(400, "invalid");
        return store.update(accountId, (data) => {
          if (
            !(id in data.tasks) &&
            Object.keys(data.tasks).length >= MAX_TASKS
          ) {
            return { changed: false, value: error(413, "too_many") };
          }
          data.tasks[id] = t;
          return { changed: true, value: { status: 200, json: { ok: true } } };
        });
      },
    },
    {
      method: "POST",
      pattern: /^\/api\/tasks\/([A-Za-z0-9-]{1,100})\/create-if-absent$/,
      name: "POST /api/tasks/:id/create-if-absent",
      access: "task-write",
      run: async (accountId, id, body) => {
        const t = checkTask(body, id);
        if (t === undefined) return error(400, "invalid");
        return store.update(accountId, (data) => {
          if (id in data.tasks) {
            return { changed: false, value: error(409, "conflict") };
          }
          if (Object.keys(data.tasks).length >= MAX_TASKS) {
            return { changed: false, value: error(413, "too_many") };
          }
          if (!hasActiveLabel(data, t.labelId)) {
            return { changed: false, value: error(400, "invalid") };
          }
          data.tasks[id] = t;
          return { changed: true, value: { status: 200, json: { ok: true } } };
        });
      },
    },
    {
      method: "POST",
      pattern: /^\/api\/tasks\/([A-Za-z0-9-]{1,100})\/save-if-unchanged$/,
      name: "POST /api/tasks/:id/save-if-unchanged",
      access: "task-write",
      run: async (accountId, id, body, _search, credentialAccess) => {
        if (!isRecord(body)) return error(400, "invalid");
        const loaded = checkTask(body.loaded, id);
        const updated = checkTask(body.updated, id);
        if (loaded === undefined || updated === undefined) {
          return error(400, "invalid");
        }
        return store.update(accountId, (data) => {
          if (credentialAccess === "task-writer") {
            // A writer may update an existing task only; creation has its own
            // create-if-absent route so a guessed id can never become an upsert.
            if (storedTask(data, id) === undefined) {
              return { changed: false, value: error(409, "conflict") };
            }
            if (
              updated.labelId !== loaded.labelId &&
              !hasActiveLabel(data, updated.labelId)
            ) {
              return { changed: false, value: error(400, "invalid") };
            }
          }
          if (changedSince(loaded, storedTask(data, id))) {
            return { changed: false, value: error(409, "conflict") };
          }
          if (
            !(id in data.tasks) &&
            Object.keys(data.tasks).length >= MAX_TASKS
          ) {
            return { changed: false, value: error(413, "too_many") };
          }
          data.tasks[id] = updated;
          return { changed: true, value: { status: 200, json: { ok: true } } };
        });
      },
    },
    {
      method: "POST",
      pattern: /^\/api\/tasks\/([A-Za-z0-9-]{1,100})\/delete-if-unchanged$/,
      name: "POST /api/tasks/:id/delete-if-unchanged",
      access: "full-write",
      run: async (accountId, id, body) => {
        if (!isRecord(body)) return error(400, "invalid");
        const loaded = checkTask(body.loaded, id);
        if (loaded === undefined) return error(400, "invalid");
        return store.update(accountId, (data) => {
          // A task already gone counts as deleted (#54).
          if (!(id in data.tasks)) {
            return {
              changed: false,
              value: { status: 200, json: { ok: true } },
            };
          }
          if (changedSince(loaded, storedTask(data, id))) {
            return { changed: false, value: error(409, "conflict") };
          }
          data.tasks = withoutKey(data.tasks, id);
          return { changed: true, value: { status: 200, json: { ok: true } } };
        });
      },
    },
    {
      method: "PUT",
      pattern: /^\/api\/labels\/([A-Za-z0-9-]{1,100})$/,
      name: "PUT /api/labels/:id",
      access: "full-write",
      run: async (accountId, id, body) => {
        const l = checkLabel(body, id);
        if (l === undefined) return error(400, "invalid");
        return store.update(accountId, (data) => {
          if (
            !(id in data.labels) &&
            Object.keys(data.labels).length >= MAX_LABELS
          ) {
            return { changed: false, value: error(413, "too_many") };
          }
          data.labels[id] = l;
          return { changed: true, value: { status: 200, json: { ok: true } } };
        });
      },
    },
    {
      method: "POST",
      pattern: /^\/api\/labels\/([A-Za-z0-9-]{1,100})\/save-if-name-free$/,
      name: "POST /api/labels/:id/save-if-name-free",
      access: "full-write",
      run: async (accountId, id, body) => {
        if (!isRecord(body)) return error(400, "invalid");
        const l = checkLabel(body.label, id);
        if (l === undefined) return error(400, "invalid");
        return store.update(accountId, (data) => {
          const stored = parsedLabels(data).items;
          // The same name rule the app runs, now on the server's own copy (#56).
          if (!l.archived) {
            const checked = validateLabelName(l.name, stored, l.id);
            if (!checked.ok) {
              return {
                changed: false,
                value: nameRefused(checked.errors, stored),
              };
            }
          }
          if (
            !(id in data.labels) &&
            Object.keys(data.labels).length >= MAX_LABELS
          ) {
            return { changed: false, value: error(413, "too_many") };
          }
          data.labels[id] = l;
          return {
            changed: true,
            value: { status: 200, json: { ok: true, labels: stored } },
          };
        });
      },
    },
  ];

  return async function handle(request: ApiRequest): Promise<ApiResponse> {
    const started = deps.now().getTime();
    let accountId = "-";
    let routeName = "-";
    const finish = (response: ApiResponse): ApiResponse => {
      deps.log({
        time: deps.now().toISOString(),
        account: accountId,
        route: routeName,
        status: response.status,
        ms: deps.now().getTime() - started,
      });
      return response;
    };

    try {
      if (!deps.limits.request.allow(`ip:${request.ip}`)) {
        return finish(error(429, "rate_limited"));
      }
      const key = bearer(request.authorization);
      const credential =
        key === undefined
          ? undefined
          : await findCredential(await deps.loadAccounts(), key);
      if (credential === undefined) {
        // Count only wrong keys, so guessing is slowed without blocking a valid key.
        const allowed = deps.limits.failedKey.allow(`ip:${request.ip}`);
        return finish(
          error(allowed ? 401 : 429, allowed ? "unauthorized" : "rate_limited"),
        );
      }
      const account = credential.account;
      accountId = account.id;
      if (!deps.limits.request.allow(`account:${account.id}`)) {
        return finish(error(429, "rate_limited"));
      }

      const matches = routes.filter((r) => r.pattern.test(request.path));
      if (matches.length === 0) return finish(error(404, "not_found"));
      const route = matches.find((r) => r.method === request.method);
      if (route === undefined) return finish(error(405, "method_not_allowed"));
      routeName = route.name;
      const allowed =
        route.access === "read"
          ? credential.access !== "task-writer"
          : route.access === "task-write"
            ? credential.access !== "read-only"
            : credential.access === "full";
      if (!allowed) {
        return finish(error(403, "forbidden"));
      }

      if (new TextEncoder().encode(request.body).length > MAX_BODY_BYTES) {
        return finish(error(413, "too_large"));
      }
      let body: unknown = undefined;
      if (request.body !== "") {
        try {
          body = JSON.parse(request.body);
        } catch {
          return finish(error(400, "invalid"));
        }
      }
      // Ids are letters, digits and dashes (UUIDs, seed ids), matched by the route.
      const id = route.pattern.exec(request.path)?.[1] ?? "";
      return finish(
        await route.run(
          account.id,
          id,
          body,
          new URLSearchParams(request.search),
          credential.access,
        ),
      );
    } catch {
      // Details stay out of the response; the route and status are logged.
      return finish(error(500, "server_error"));
    }
  };
}

/** The key from "Bearer <key>", or undefined. */
function bearer(header: string | undefined): string | undefined {
  const match = /^Bearer ([A-Za-z0-9_-]{1,128})$/.exec(header ?? "");
  return match?.[1];
}

/** A task document that core accepts and whose id is the path's, or undefined. */
function checkTask(doc: unknown, id: string): Task | undefined {
  const parsed = parseStoredTask(doc);
  return parsed.ok && parsed.value.id === id ? parsed.value : undefined;
}

function checkLabel(doc: unknown, id: string): Label | undefined {
  const parsed = parseStoredLabel(doc);
  return parsed.ok && parsed.value.id === id ? parsed.value : undefined;
}

/** The stored task with this id, if core accepts it (an unreadable one counts as missing). */
function storedTask(data: AccountData, id: string): Task | undefined {
  const parsed = parseStoredTask(data.tasks[id]);
  return parsed.ok ? parsed.value : undefined;
}

/** A task may be created or relabeled only to a valid, active label. */
function hasActiveLabel(data: AccountData, id: string): boolean {
  const parsed = parseStoredLabel(data.labels[id]);
  return parsed.ok && !parsed.value.archived;
}

function parsedTasks(data: AccountData): { items: Task[]; skipped: number } {
  const items: Task[] = [];
  let skipped = 0;
  for (const doc of Object.values(data.tasks)) {
    const parsed = parseStoredTask(doc);
    if (parsed.ok) items.push(parsed.value);
    else skipped += 1;
  }
  return { items, skipped };
}

/** Stored labels that core accepts, moved to the current palette (as the artifact adapter does). */
function parsedLabels(data: AccountData): { items: Label[]; skipped: number } {
  const items: Label[] = [];
  let skipped = 0;
  for (const doc of Object.values(data.labels)) {
    const parsed = parseStoredLabel(doc);
    if (parsed.ok) items.push(parsed.value);
    else skipped += 1;
  }
  return { items: upgradeLabelColors(items), skipped };
}

function nameRefused(
  errors: readonly ValidationError[],
  stored: readonly Label[],
): ApiResponse {
  return { status: 200, json: { ok: false, errors, labels: stored } };
}

/** A copy of `record` without `key`. */
function withoutKey(
  record: Record<string, unknown>,
  key: string,
): Record<string, unknown> {
  return Object.assign(
    Object.create(null) as Record<string, unknown>,
    Object.fromEntries(Object.entries(record).filter(([k]) => k !== key)),
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
