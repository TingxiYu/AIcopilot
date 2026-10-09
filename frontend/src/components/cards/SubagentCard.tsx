import { useState } from "react";
import type { Row, SubagentRow } from "../../lib/rows";
import { ToolCallCard } from "./ToolCallCard";

export function SubagentCard({ row }: { row: SubagentRow }) {
  // §6.2: open while running, collapsed once finished.
  //
  // `useState(row.status === "running")` would be WRONG here: the row key is
  // stable for the whole subagent lifecycle, so React keeps the instance and an
  // initial value never re-derives — the card would mount open and stay open
  // after completion. Track only the user's manual override and derive `open`
  // from the live status, so the card collapses on its own when the run ends.
  const [override, setOverride] = useState<boolean | null>(null);
  const open = override ?? row.status === "running";

  const searches = row.inner.filter(
    (child): child is Extract<Row, { kind: "tool" }> =>
      child.kind === "tool" && child.name === "tavily_search",
  ).length;

  return (
    <div className="rounded border" style={{ borderColor: "var(--border)" }}>
      <button
        type="button"
        onClick={() => setOverride(!open)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-mono"
      >
        <span style={{ color: row.status === "done" ? "var(--success)" : row.status === "failed" ? "var(--danger)" : "var(--warn)" }}>
          {row.status === "done" ? "✓" : row.status === "failed" ? "×" : row.status === "unknown" ? "?" : "⟳"}
        </span>
        <span>{row.agent}</span>
        {row.status === "failed" ? <span>失败</span> : null}
        {row.status === "unknown" ? <span>状态未确认</span> : null}
        {searches > 0 ? (
          <span style={{ color: "var(--muted)" }}>{searches} 次搜索</span>
        ) : null}
        <span className="ml-auto">{open ? "▾" : "▸"}</span>
      </button>

      {open ? (
        <div className="flex flex-col gap-2 border-t p-3" style={{ borderColor: "var(--border)" }}>
          {row.result && row.status === "failed" ? <p className="text-sm">{row.result}</p> : null}
          {row.inner.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--muted)" }}>
              {row.status === "running" ? "子代理正在工作…" : "没有可展示的子代理轨迹。"}
            </p>
          ) : (
            row.inner.map((child) =>
              child.kind === "tool" ? (
                <ToolCallCard key={child.key} row={child} />
              ) : child.kind === "prose" ? (
                <p key={child.key} className="text-sm" style={{ color: "var(--muted)" }}>
                  {child.body}
                </p>
              ) : (
                <SubagentCard key={child.key} row={child} />
              ),
            )
          )}
        </div>
      ) : null}
    </div>
  );
}
