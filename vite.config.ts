import { defineConfig } from "vitest/config";
import { toArtifactPage } from "./tools/artifact-page";

/** Where `npm run dev:server` listens, for the site build's dev page. */
const DEV_SERVER = "http://localhost:8787";

export default defineConfig(({ mode }) => ({
  // Relative asset paths, so the built files work when published as a multi-file artifact.
  base: "./",
  // `--mode site` builds the page for the self-hosted server (ADR 0003, #64) into dist-site/.
  build: { outDir: mode === "site" ? "dist-site" : "dist" },
  plugins: [
    {
      // Artifact build only: reduce dist/index.html to artifact page content
      // (tools/artifact-page.ts). The site build keeps a normal web page.
      name: "artifact-page",
      apply: (_config, env) => env.command === "build" && mode !== "site",
      transformIndexHtml: { order: "post", handler: toArtifactPage },
    },
  ],
  // In site mode the dev page sends API calls to the local server.
  server: mode === "site" ? { proxy: { "/api": DEV_SERVER } } : {},
  test: {
    include: ["src/**/*.test.ts", "test/**/*.test.ts"],
    // Dates are local wall-clock values (ADR 0002), so tests run in one fixed time zone.
    env: { TZ: "Australia/Sydney" },
    // Lets test/core/palette.test.ts read the theme colors from styles.css (Vitest empties CSS by default).
    css: { include: [/styles\.css/] },
  },
}));
