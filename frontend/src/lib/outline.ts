/**
 * Document outline for a markdown report.
 *
 * A separate module from `lib/citations.ts` and `lib/artifacts.ts` rather than
 * an addition to either: those two are the stream's data projections and the
 * brief forbids restructuring them, and this is a presentation concern (the
 * report tab's navigation) that nothing else consumes.
 */

export type Heading = { level: number; text: string };

/** Headings at level 5-6 are rare in these reports and too deep to navigate. */
const MAX_LEVEL = 4;

/**
 * Pull the ATX headings out of a markdown document, in document order.
 *
 * Fenced code blocks are skipped. A report about a markup-heavy topic can
 * easily contain a line starting with `#` inside a ``` fence, and treating that
 * as a heading would put a bogus entry in the outline that scrolls nowhere.
 *
 * The index of a returned heading is also its position among the rendered
 * `h1`-`h4` elements, which is what lets the tab scroll to one without the
 * renderer having to inject ids.
 */
export function extractHeadings(markdown: string): Heading[] {
  const headings: Heading[] = [];
  let inFence = false;

  for (const line of markdown.split("\n")) {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    const match = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (!match) continue;

    const level = match[1].length;
    if (level > MAX_LEVEL) continue;

    const text = match[2].trim();
    if (text !== "") headings.push({ level, text });
  }

  return headings;
}
