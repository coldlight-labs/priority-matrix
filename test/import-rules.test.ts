import { cruise } from "dependency-cruiser";
import extractDepcruiseOptions from "dependency-cruiser/config-utl/extract-depcruise-options";
import { describe, expect, it } from "vitest";

// Relative to the project root, where Vitest runs. Avoids Node path APIs (no @types/node).
const fixtureDir = "test/import-rules-fixtures";
const configFile = "./.dependency-cruiser.cjs";

/**
 * Proves the import rules in .dependency-cruiser.cjs block each boundary crossing
 * from docs/plan.md, using a fixture tree with one known violation per boundary rule.
 */
describe("import rules", () => {
  it("reports exactly the expected violations in the fixture tree", async () => {
    const options = await extractDepcruiseOptions(configFile);
    const result = await cruise(["src", "server"], {
      ...options,
      baseDir: fixtureDir,
    });
    if (typeof result.output === "string") {
      throw new Error("Expected a structured cruise result, got a string.");
    }

    const found = result.output.summary.violations
      .map((v) => `${v.rule.name}: ${v.from} -> ${v.to}`)
      .sort();

    expect(found).toEqual([
      "adapters-not-features: src/adapters/storage/bad-adapter.ts -> src/features/tasks-list/list.ts",
      "core-imports-only-core: src/core/bad-core.ts -> src/adapters/storage/memory.ts",
      "core-imports-only-core: src/core/bad-package.ts -> vitest",
      "core-only-through-index: src/features/capture/deep-core.ts -> src/core/task.ts",
      "features-not-each-other: src/features/capture/capture.ts -> src/features/tasks-list/list.ts",
      // The fixture tree has no node_modules, so the package import is also unresolvable there.
      "not-to-unresolvable: server/bad-package.ts -> vitest",
      "not-to-unresolvable: src/core/bad-package.ts -> vitest",
      "nothing-imports-app: src/features/tasks-list/bad-app.ts -> src/app/main.ts",
      "nothing-imports-server: src/features/capture/bad-server-import.ts -> server/good-server.ts",
      "only-app-imports-adapters: src/core/bad-core.ts -> src/adapters/storage/memory.ts",
      "only-app-imports-adapters: src/features/capture/capture.ts -> src/adapters/storage/memory.ts",
      "server-imports-only-core: server/bad-server.ts -> src/core/task.ts",
      "server-imports-only-core: server/bad-server.ts -> src/features/tasks-list/list.ts",
      "server-no-packages: server/bad-package.ts -> vitest",
      "ui-imports-only-core: src/ui/bad-ui.ts -> src/features/tasks-list/list.ts",
      "ui-only-through-index: src/features/capture/deep-ui.ts -> src/ui/label-mark.ts",
    ]);
  });
});
