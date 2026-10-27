// Build step (review #12): the Artifact tool wraps a published page in its own
// doctype, <html>, <head> and <body>, so the built index.html must be page content
// only. This keeps the title, the viewport-sides meta, stylesheet and preconnect
// links and scripts from <head>, then the body content, and drops the rest.

/** Head tags to keep, in the order they appear. Charset and viewport come from the skeleton. */
const KEEP_FROM_HEAD = [
  /<title>[\s\S]*?<\/title>/i,
  /<meta\s+name="claude:viewport-fit-sides"[^>]*>/i,
  /<link\b[^>]*>/gi,
  /<script\b[^>]*>[\s\S]*?<\/script>/gi,
];

/**
 * Turns a full HTML document (Vite's index.html) into artifact page content.
 * Throws when the document has no <title>, <head> or <body>, so a broken build stops.
 */
export function toArtifactPage(html: string): string {
  const head = /<head\b[^>]*>([\s\S]*?)<\/head>/i.exec(html)?.[1];
  const body = /<body\b[^>]*>([\s\S]*?)<\/body>/i.exec(html)?.[1];
  if (head === undefined || body === undefined) {
    throw new Error("artifact-page: index.html needs a <head> and a <body>.");
  }
  if (!/<title>/i.test(head)) {
    throw new Error("artifact-page: index.html needs a <title>.");
  }

  // Collect kept head tags with their positions, so their order is preserved.
  const kept: { index: number; tag: string }[] = [];
  for (const pattern of KEEP_FROM_HEAD) {
    const global = new RegExp(
      pattern.source,
      pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`,
    );
    for (const match of head.matchAll(global)) {
      kept.push({ index: match.index, tag: match[0] });
    }
  }
  // The title goes first (the publisher reads it from the top of the file), then the
  // other kept tags in their original order.
  kept.sort((a, b) => a.index - b.index);
  const title = kept.filter((k) => /^<title>/i.test(k.tag));
  const rest = kept.filter((k) => !/^<title>/i.test(k.tag));
  const tags = [...title, ...rest].map((k) => k.tag);

  return `${tags.join("\n")}\n${body.trim()}\n`;
}
