// Server build (ADR 0003): bundles server/main.ts and server/cli.ts, with the parts of
// src/core they use, into plain JavaScript for Node 24 in dist-server/. Node's own
// modules stay as imports. Run with `npm run build:server`.

import { defineConfig } from "vite";

export default defineConfig({
  build: {
    ssr: true,
    target: "node24",
    outDir: "dist-server",
    emptyOutDir: true,
    rolldownOptions: {
      input: { main: "server/main.ts", cli: "server/cli.ts" },
      output: { entryFileNames: "[name].js" },
    },
  },
});
