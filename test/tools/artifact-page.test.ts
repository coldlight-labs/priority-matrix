import { describe, expect, it } from "vitest";
import { toArtifactPage } from "../../tools/artifact-page";

const BUILT = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <meta name="claude:viewport-fit-sides" content="cover" />
    <title>Priority Matrix</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=X&display=swap" />
    <script type="module" crossorigin src="./assets/index-abc.js"></script>
    <link rel="stylesheet" crossorigin href="./assets/index-def.css">
  </head>
  <body>
    <div class="page"><h1>Priority Matrix</h1></div>
  </body>
</html>`;

describe("toArtifactPage", () => {
  const page = toArtifactPage(BUILT);

  it("drops the document wrapper and the skeleton's own metas", () => {
    expect(page).not.toMatch(
      /<!doctype|<html|<\/html>|<head|<body|charset|name="viewport"/i,
    );
  });

  it("starts with the title, then keeps head tags in order, then the body", () => {
    expect(page.split("\n").slice(0, 7)).toEqual([
      "<title>Priority Matrix</title>",
      '<meta name="claude:viewport-fit-sides" content="cover" />',
      '<link rel="preconnect" href="https://fonts.googleapis.com" />',
      '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=X&display=swap" />',
      '<script type="module" crossorigin src="./assets/index-abc.js"></script>',
      '<link rel="stylesheet" crossorigin href="./assets/index-def.css">',
      '<div class="page"><h1>Priority Matrix</h1></div>',
    ]);
  });

  it("refuses a document without a title or body", () => {
    expect(() =>
      toArtifactPage("<html><head></head><body></body></html>"),
    ).toThrow("needs a <title>");
    expect(() => toArtifactPage("<p>fragment</p>")).toThrow(
      "<head> and a <body>",
    );
  });
});
