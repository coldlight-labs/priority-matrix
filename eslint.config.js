// @ts-check
import js from "@eslint/js";
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";

export default defineConfig(
  {
    ignores: [
      "dist/",
      "dist-server/",
      "dist-site/",
      ".dev-data/",
      ".playwright-mcp/",
      "node_modules/",
      "coverage/",
      ".dependency-cruiser.cjs",
    ],
  },
  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: { allowDefaultProject: ["*.js"] },
      },
    },
    rules: {
      // Trust boundary "user input to app": render text with textContent, never as HTML.
      "no-restricted-properties": [
        "error",
        {
          property: "innerHTML",
          message: "Use textContent or DOM nodes, never innerHTML.",
        },
        {
          property: "outerHTML",
          message: "Use textContent or DOM nodes, never outerHTML.",
        },
        {
          property: "insertAdjacentHTML",
          message: "Use DOM nodes, never insertAdjacentHTML.",
        },
      ],
    },
  },
);
