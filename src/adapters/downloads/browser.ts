// Export on the self-hosted site (ADR 0003, #64): a normal browser download, since the
// claude.ai downloads capability is not there. The file is built in the page and
// offered through a temporary link; nothing is sent anywhere.

import type { FileSaver, SaveOutcome } from "../../core";

/** A FileSaver that downloads through a temporary link in `doc`. */
export function createBrowserFileSaver(doc: Document): FileSaver {
  return {
    save(filename, data): Promise<SaveOutcome> {
      try {
        const type = filename.endsWith(".json")
          ? "application/json"
          : "text/csv";
        const url = URL.createObjectURL(
          new Blob([data], { type: `${type};charset=utf-8` }),
        );
        const link = doc.createElement("a");
        link.href = url;
        link.download = filename;
        doc.body.append(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
        return Promise.resolve("saved");
      } catch {
        return Promise.resolve("failed");
      }
    },
  };
}
