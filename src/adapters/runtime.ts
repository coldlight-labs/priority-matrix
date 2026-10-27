// Minimal types for the claude.ai artifact runtime, taken from the platform's
// type definitions for runtime contract 0.2.89 (claude.d.ts, db.d.ts, downloads.d.ts).
// Only the members this app calls are listed. Re-check them when moving to a newer contract.

/** Rejection shape of every db call. Branch on `code`; unknown codes mean "unavailable". */
export interface DbError {
  readonly code: string;
  readonly message: string;
}

export interface DbDocumentSnapshot {
  readonly id: string;
  /** False for a missing document and for one this viewer cannot see. */
  readonly exists: boolean;
  data(): Record<string, unknown> | undefined;
}

export interface DbQuerySnapshot {
  readonly docs: readonly DbDocumentSnapshot[];
  readonly size: number;
  /** `fromCache` marks a view the server has not confirmed yet; a confirmed one follows on its own. */
  readonly metadata: {
    readonly fromCache: boolean;
    readonly hasPendingWrites: boolean;
  };
}

/** Stops a subscription. Idempotent. */
export type DbUnsubscribe = () => void;

export interface DbDocumentReference {
  /** Reads the document once; a missing one has `exists: false`. */
  get(): Promise<DbDocumentSnapshot>;
  /** Writes the whole document, creating it if absent. Last writer wins. */
  set(data: Record<string, unknown>): Promise<void>;
  /** Deletes the document. Idempotent. */
  delete(): Promise<void>;
  /**
   * Short cooperative lease (set-if-not-busy). Busy resolves `{acquired: false}`, never
   * rejects. Leases expire on their own; `ttlMs` is clamped to 1000..600000. Only
   * callers that also acquire are kept out.
   */
  acquire(options: { holder: string; ttlMs?: number }): Promise<{
    readonly acquired: boolean;
  }>;
}

export interface DbQuery {
  /** At most n documents, 1 to 1000. */
  limit(n: number): DbQuery;
  get(): Promise<DbQuerySnapshot>;
  /**
   * Live view of the matched set: `next` fires soon after subscribing, then on every
   * change, including other viewers' writes. Falls back to periodic refresh on its
   * own. `error` receives at most one terminal error, after which it is dead.
   * Subscribe once; never write from `next`.
   */
  onSnapshot(
    next: (snapshot: DbQuerySnapshot) => void,
    error: (e: DbError) => void,
  ): DbUnsubscribe;
}

export interface DbCollectionReference extends DbQuery {
  doc(id: string): DbDocumentReference;
}

/** The `db` capability namespace. */
export interface ArtifactDb {
  collection(path: string): DbCollectionReference;
}

/** The `downloads` capability namespace. */
export interface DownloadsNamespace {
  /** Resolves when the viewer accepts; rejects with `{code, message}` otherwise. */
  save(request: {
    filename: string;
    data: string;
  }): Promise<{ status: "saved" | "delivered" }>;
}

interface CapabilityMap {
  db: ArtifactDb;
  downloads: DownloadsNamespace;
}

interface ClaudeRuntime {
  use<K extends keyof CapabilityMap>(name: K): Promise<CapabilityMap[K] | null>;
}

/** True when a thrown value has the runtime's `{code, message}` error shape. */
export function isRuntimeError(value: unknown): value is DbError {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { code?: unknown }).code === "string"
  );
}

/** True when the page runs inside claude.ai (the runtime exposes window.claude), false in local preview. */
export function isInsideClaude(): boolean {
  return (globalThis as { claude?: unknown }).claude !== undefined;
}

/**
 * Resolves a capability, or null when the page runs outside claude.ai
 * (local preview, tests) or the viewer cannot use it. Callers design for null.
 */
export async function useCapability<K extends keyof CapabilityMap>(
  name: K,
): Promise<CapabilityMap[K] | null> {
  // window.claude only exists inside claude.ai; the cast reads it without a global type.
  const claude = (globalThis as { claude?: ClaudeRuntime }).claude;
  if (claude === undefined) return null;
  try {
    return await claude.use(name);
  } catch (error: unknown) {
    // The contract says use() resolves null rather than rejecting; log if it ever does.
    console.warn(`claude.use("${name}") failed`, error);
    return null;
  }
}
