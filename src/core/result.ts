/** One reason an input or stored document was rejected. */
export interface ValidationError {
  readonly field: string;
  readonly message: string;
}

/** Outcome of a check: the typed value, or every reason it was rejected. */
export type Result<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly errors: readonly ValidationError[] };

/** Wraps a valid value. */
export function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

/** Wraps one or more validation errors. */
export function fail(errors: readonly ValidationError[]): Result<never> {
  return { ok: false, errors };
}
