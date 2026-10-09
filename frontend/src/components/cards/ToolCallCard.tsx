import { useState } from "react";
import type { ToolRow } from "../../lib/rows";

const ALWAYS_OPEN = new Set(["tavily_search"]);
const ALWAYS_CLOSED = new Set(["write_todos", "write_file", "read_file", "think_tool"]);

function summary(row: ToolRow): string {
  const args = row.args as Record<string, unknown> | null;
  if (row.status === "failed") return "失败";
  if (row.status === "unknown") return "状态未确认";
  if (row.name === "tavily_search" && typeof args?.query === "string") return args.query;
  if (row.status === "pending") return "running…";
  return row.result ? `${row.result.length} chars` : "done";
}

export function ToolCallCard({ row }: { row: ToolRow }) {
  const defaultOpen = ALWAYS_OPEN.has(row.name) && !ALWAYS_CLOSED.has(row.name);
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="rounded border text-sm" style={{ borderColor: "var(--border)" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 py-2 text-left font-mono"
      >
        <span style={{ color: row.status === "done" ? "var(--success)" : row.status === "failed" ? "var(--danger)" : "var(--warn)" }}>
          {row.status === "done" ? "✓" : row.status === "failed" ? "×" : row.status === "unknown" ? "?" : "⟳"}
        </span>
        <span>{row.name}</span>
        <span className="truncate" style={{ color: "var(--muted)" }}>{summary(row)}</span>
        <span className="ml-auto">{open ? "▾" : "▸"}</span>
      </button>
      {open ? (
        <pre className="overflow-auto border-t px-3 py-2 text-xs" style={{ borderColor: "var(--border)" }}>
          {JSON.stringify(row.args, null, 2)}
          {row.result ? `\n\n--- result ---\n${row.result}` : ""}
        </pre>
      ) : null}
    </div>
  );
}
