// The account key from a personal link (ADR 0003, #64). A link ends in "#key=<key>":
// the part after "#" is never sent to the server with the page request. The app keeps
// the key in this browser and clears it from the address bar, so it does not show in
// screenshots or get copied with the address. A new link replaces the kept key.

/** Browser storage name for the kept key. */
export const KEY_STORAGE = "priority-matrix-key";

/** Keys are 32 bytes as base64url: 43 letters, digits, "_" or "-" (server/accounts.ts). */
const KEY_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/** The minimal storage used, so tests can pass a fake. */
export interface KeyStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/**
 * The key from `hash` (location.hash) if it holds one, kept on the device, else the
 * key kept from an earlier visit; null if there is no well-formed key. Calls
 * `clearAddress` after taking a key from the address. Blocked storage only means the
 * key lasts for this visit.
 */
export function takeKey(
  hash: string,
  storage: KeyStorage | null,
  clearAddress: () => void,
): string | null {
  const fromLink = /^#key=(.*)$/.exec(hash)?.[1];
  if (fromLink !== undefined) {
    clearAddress();
    if (!KEY_PATTERN.test(fromLink)) return null;
    try {
      storage?.setItem(KEY_STORAGE, fromLink);
    } catch {
      // Kept for this visit only; the person opens their link again next time.
    }
    return fromLink;
  }
  try {
    const kept = storage?.getItem(KEY_STORAGE) ?? null;
    return kept !== null && KEY_PATTERN.test(kept) ? kept : null;
  } catch {
    return null;
  }
}
