// Request limits (ADR 0003, denial of service): a fixed-window counter per key, kept
// in memory. Enough for a handful of people; it resets when the server restarts.

/** Counts requests per key (an address or an account) in fixed time windows. */
export interface RateLimiter {
  /** Counts one request for `key`; false once `key` is over its limit this window. */
  allow(key: string): boolean;
}

/** Allows `limit` requests per key in each window of `windowMs`. */
export function createRateLimiter(options: {
  limit: number;
  windowMs: number;
  now: () => Date;
}): RateLimiter {
  const windows = new Map<string, { start: number; count: number }>();
  return {
    allow(key) {
      const now = options.now().getTime();
      // Drop finished windows now and then, so the map stays small.
      if (windows.size > 10_000) {
        for (const [k, w] of windows) {
          if (now - w.start >= options.windowMs) windows.delete(k);
        }
      }
      const current = windows.get(key);
      if (current === undefined || now - current.start >= options.windowMs) {
        windows.set(key, { start: now, count: 1 });
        return true;
      }
      current.count += 1;
      return current.count <= options.limit;
    },
  };
}
