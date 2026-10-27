// Import rules from docs/plan.md section 6. Blocking: a failure means a module boundary was crossed.
// Paths are relative to the cruise's base directory (the project root).
/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "core-imports-only-core",
      comment:
        "core holds the domain rules: no other module, framework, storage or browser library.",
      severity: "error",
      from: { path: "^src/core/" },
      to: { pathNot: "^src/core/" },
    },
    {
      name: "core-only-through-index",
      comment:
        "Outside core, import core only through src/core/index.ts, its public interface (review #12, Q16).",
      severity: "error",
      from: { path: "^src/", pathNot: "^src/core/" },
      to: { path: "^src/core/", pathNot: "^src/core/index\\.ts$" },
    },
    {
      name: "ui-imports-only-core",
      comment:
        "ui holds shared page pieces (review 3, Q65: a): it imports core only, never features, adapters or app.",
      severity: "error",
      from: { path: "^src/ui/" },
      to: { pathNot: "^src/(core|ui)/" },
    },
    {
      name: "ui-only-through-index",
      comment:
        "Outside ui, import ui only through src/ui/index.ts, its public interface.",
      severity: "error",
      from: { path: "^src/", pathNot: "^src/ui/" },
      to: { path: "^src/ui/", pathNot: "^src/ui/index\\.ts$" },
    },
    {
      name: "features-not-each-other",
      comment: "A feature imports core only, never another feature.",
      severity: "error",
      from: { path: "^src/features/([^/]+)/" },
      to: { path: "^src/features/", pathNot: "^src/features/$1/" },
    },
    {
      name: "only-app-imports-adapters",
      comment: "Adapters are picked and wired in app only.",
      severity: "error",
      from: { path: "^src/", pathNot: "^src/(app|adapters)/" },
      to: { path: "^src/adapters/" },
    },
    {
      name: "nothing-imports-app",
      comment: "app is the entry point; nothing depends on it.",
      severity: "error",
      from: { path: "^src/", pathNot: "^src/app/" },
      to: { path: "^src/app/" },
    },
    {
      name: "adapters-not-features",
      comment:
        "Adapters implement core interfaces and know nothing about features.",
      severity: "error",
      from: { path: "^src/adapters/" },
      to: { path: "^src/features/" },
    },
    {
      name: "server-imports-only-core",
      comment:
        "The server (ADR 0003) reuses core's rules through src/core/index.ts and nothing else from src: no features, ui, adapters or app.",
      severity: "error",
      from: { path: "^server/" },
      to: { path: "^src/", pathNot: "^src/core/index\\.ts$" },
    },
    {
      name: "server-no-packages",
      comment:
        "The server runs on Node's own modules only (ADR 0003). Node's type definitions are allowed: they are types only and never ship.",
      severity: "error",
      from: { path: "^server/" },
      to: {
        // "unknown" also catches a package that is not installed.
        dependencyTypes: [
          "npm",
          "npm-dev",
          "npm-optional",
          "npm-peer",
          "npm-no-pkg",
          "unknown",
        ],
        pathNot: "^node_modules/@types/node/",
      },
    },
    {
      name: "nothing-imports-server",
      comment: "The app never imports server code; they talk over HTTP only.",
      severity: "error",
      from: { path: "^src/" },
      to: { path: "^server/" },
    },
    {
      name: "no-circular",
      severity: "error",
      from: {},
      to: { circular: true },
    },
    {
      name: "not-to-unresolvable",
      severity: "error",
      from: {},
      to: { couldNotResolve: true },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    tsPreCompilationDeps: true,
  },
};
