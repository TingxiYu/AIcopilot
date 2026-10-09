import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Row } from "../../lib/rows";
import { ToolCallCard } from "../cards/ToolCallCard";
import { SubagentCard } from "../cards/SubagentCard";
import { ArtifactCard } from "./ArtifactCard";
import { CONTENT_WIDTH } from "../../config/layout";

/** The `file_path` argument of a `write_file` call, when it has one. */
function filePathOf(row: Extract<Row, { kind: "tool" }>): string | null {
  if (row.name !== "write_file") return null;
  const args = row.args as { file_path?: unknown } | null | undefined;
  return typeof args?.file_path === "string" ? args.file_path : null;
}

/**
 * The reading column.
 *
 * Content is width-limited and centred rather than stretched across the column:
 * a long report segment at full width on a wide monitor is harder to read, and
 * the extra space is what the preview panel is for.
 */
export function MessageList({
  rows,
  running,
  artifactPaths = [],
  onOpenArtifact,
}: {
  rows: Row[];
  running: boolean;
  /** Paths `buildArtifacts` actually produced, so a write can be matched to one. */
  artifactPaths?: string[];
  onOpenArtifact?: (path: string, tab: "report") => void;
}) {
  return (
    // Same width band as the composer and the welcome cards below it — the
    // three share one constant so they stay aligned instead of drifting.
    <div className={`${CONTENT_WIDTH} flex flex-col gap-3 p-4`}>
      {rows.map((row) => {
        if (row.kind === "prose") {
          return (
            <article
              key={row.key}
              className={
                row.role === "human" ? "max-w-[85%] self-end rounded-xl px-3 py-2 shadow-sm" : "prose"
              }
              style={row.role === "human" ? { background: "var(--panel-2)" } : undefined}
            >
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{row.body}</ReactMarkdown>
            </article>
          );
        }

        if (row.kind === "tool") {
          const path = filePathOf(row);
          // A `write_file` that produced a real artifact becomes a result card;
          // everything else (including a write to a path the artifact
          // projection filtered out) stays an ordinary tool call.
          if (path && artifactPaths.includes(path) && onOpenArtifact) {
            return <ArtifactCard key={row.key} row={row} path={path} onOpen={onOpenArtifact} />;
          }
          return <ToolCallCard key={row.key} row={row} />;
        }

        return <SubagentCard key={row.key} row={row} />;
      })}
      {/* The running affordance lives in RunIndicator (spec §4.3), rendered by
          App above this list. Keeping a second "研究中…" here would announce
          the same state twice to a screen reader. */}
      <div className="h-4 shrink-0" aria-hidden />
    </div>
  );
}
