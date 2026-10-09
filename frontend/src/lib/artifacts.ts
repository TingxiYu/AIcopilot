export type Artifact = {
  path: string;
  name: string;
  content: string;
  bytes: number;
  lines: number;
};

// The request copy is private workflow state; the report is the deliverable.
const PREFERRED_ORDER = ["final_report.md"];

// Tool results above a size threshold get spilled into this prefix by
// deepagents. They are internal plumbing, not deliverables — a real run
// produced three totalling ~1.1 MB, one of them 737 KB, which would blow up
// the artifact panel. Filtered by prefix rather than allowlisting the two
// known artifacts, so any new artifact the agent starts writing still shows.
const INTERNAL_PREFIX = "/large_tool_results/";

function rank(name: string): number {
  const i = PREFERRED_ORDER.indexOf(name);
  return i === -1 ? PREFERRED_ORDER.length : i;
}

type FileData = { content?: unknown; encoding?: unknown };

// deepagents exposes its virtual filesystem as `Record<path, FileData>`.
// Anything that is not a utf-8 text entry is skipped rather than rendered
// as mojibake.
export function buildArtifacts(files: unknown): Artifact[] {
  if (!files || typeof files !== "object") return [];

  const out: Artifact[] = [];
  for (const [path, raw] of Object.entries(files as Record<string, unknown>)) {
    if (path.startsWith(INTERNAL_PREFIX)) continue;
    if (path.split("/").filter(Boolean).pop() === "research_request.md") continue;

    const entry = raw as FileData | null;
    if (!entry || typeof entry !== "object") continue;
    if (typeof entry.content !== "string") continue;
    if (entry.encoding !== undefined && entry.encoding !== "utf-8") continue;

    const { content } = entry;
    out.push({
      path,
      name: path.split("/").filter(Boolean).pop() ?? path,
      content,
      bytes: new TextEncoder().encode(content).length,
      lines: content === "" ? 0 : content.split("\n").length,
    });
  }

  return out.sort(
    (a, b) => rank(a.name) - rank(b.name) || a.path.localeCompare(b.path),
  );
}
