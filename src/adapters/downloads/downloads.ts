import type { FileSaver, SaveOutcome } from "../../core";
import { isRuntimeError, type DownloadsNamespace } from "../runtime";

/** Runtime error codes that mean saving cannot work in this view (contract 0.2.89). */
const UNAVAILABLE_CODES = new Set([
  "unavailable",
  "not_granted",
  "capability_disabled",
  "capability_removed",
  "extension_not_enabled",
]);

/**
 * Wraps the runtime's `downloads` capability as a FileSaver. Pass null when the
 * capability is missing (local preview, or the viewer cannot use it): every save
 * then reports "unavailable", so the UI can hide the export button.
 */
export function createFileSaver(
  downloads: DownloadsNamespace | null,
  warn: (message: string) => void = (message) => {
    console.warn(message);
  },
): FileSaver {
  return {
    async save(filename, data): Promise<SaveOutcome> {
      if (downloads === null) return "unavailable";
      try {
        await downloads.save({ filename, data });
        return "saved";
      } catch (error: unknown) {
        const code = isRuntimeError(error) ? error.code : "unknown";
        if (code === "declined") return "declined";
        if (UNAVAILABLE_CODES.has(code)) return "unavailable";
        // rejected_extension, bad_request, too_large, rate_limited and unknown codes.
        warn(`Saving ${filename} failed: ${code}.`);
        return "failed";
      }
    },
  };
}
