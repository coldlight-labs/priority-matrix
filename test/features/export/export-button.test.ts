// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { createMemoryRepositories } from "../../../src/adapters/storage/memory";
import type { FileSaver } from "../../../src/core";
import { mountExport } from "../../../src/features/export";

function setup(available: boolean) {
  document.body.replaceChildren();
  const container = document.createElement("div");
  document.body.append(container);
  const files: string[] = [];
  const saver: FileSaver = {
    save(filename) {
      files.push(filename);
      return Promise.resolve("saved");
    },
  };
  mountExport(container, {
    ...createMemoryRepositories(),
    saver,
    available,
    now: () => new Date(2026, 9, 23),
    onError: () => undefined,
  });
  return { container, files };
}

describe("export buttons", () => {
  it("is hidden when saving files is not available", () => {
    const { container } = setup(false);
    expect(container.querySelector<HTMLElement>(".export")?.hidden).toBe(true);
  });

  it("shows Export CSV and Full backup (JSON) (#40)", () => {
    setup(true);
    expect(document.getElementById("export-csv")?.textContent).toBe(
      "Export CSV",
    );
    expect(document.getElementById("export-json")?.textContent).toBe(
      "Full backup (JSON)",
    );
  });

  it("Export CSV saves one CSV file", async () => {
    const { files } = setup(true);
    document.getElementById("export-csv")?.click();
    await vi.waitFor(() => {
      expect(document.getElementById("export-note")?.textContent).toBe(
        "Saved the CSV.",
      );
    });
    expect(files).toEqual(["priority-matrix-2026-10-23.csv"]);
  });

  it("Full backup saves one JSON file", async () => {
    const { files } = setup(true);
    document.getElementById("export-json")?.click();
    await vi.waitFor(() => {
      expect(document.getElementById("export-note")?.textContent).toBe(
        "Saved the full backup (JSON).",
      );
    });
    expect(files).toEqual(["priority-matrix-2026-10-23.json"]);
  });
});
