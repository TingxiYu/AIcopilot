export type Citation = { n: number; url: string; title: string };

/**
 * Match a source line and capture the text between the number and the URL.
 *
 * The research prompt mandates a `### Sources` section shaped
 *   [1] Source Title: https://example.com/paper
 * — title FIRST, URL LAST. A previous revision of this parser required the URL
 * to immediately follow `[n]`, matched nothing in a real report, and still
 * passed its own tests because the fixtures encoded the same wrong assumption.
 *
 * `[^\n]*?` is lazy and newline-bounded, so mid-sentence markers like `[1]`
 * never cross a line to reach a URL that appears elsewhere.
 */
const SOURCE_LINE = /\[(\d+)\]([^\n]*?)(https?:\/\/[^\s>)\]]+)/g;

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** `[1] Title: url` yields "Title"; a missing title falls back to the host. */
function titleOf(raw: string, url: string): string {
  const title = raw.trim().replace(/[:\-–—\s]+$/, "").trim();
  return title.length > 0 ? title : hostOf(url);
}

export function parseCitations(markdown: string): Citation[] {
  const byNumber = new Map<number, Citation>();

  for (const match of markdown.matchAll(SOURCE_LINE)) {
    const n = Number(match[1]);
    if (byNumber.has(n)) continue;
    const url = match[3].replace(/[.,;:)\]]+$/, "");
    byNumber.set(n, { n, url, title: titleOf(match[2], url) });
  }

  return [...byNumber.values()].sort((a, b) => a.n - b.n);
}
