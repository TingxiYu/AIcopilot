import { useState } from "react";
import type { ResearchTaskPresentation } from "../../research-task";

export function TodoStrip({ plan }: { plan: ResearchTaskPresentation["plan"] }) {
  const [open, setOpen] = useState(false);
  if (plan.total === 0) return null;

  return (
    <div className="border-t" style={{ borderColor: "var(--border)" }}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left font-mono text-xs"
      >
        <span>PLAN</span>
        <span className="flex-1">
          <span
            className="inline-block h-1 rounded align-middle"
            style={{ width: "100%", background: "var(--panel-2)" }}
          >
            <span
              className="block h-1 rounded"
              style={{ width: `${plan.percent}%`, background: "var(--success)" }}
            />
          </span>
        </span>
        <span style={{ color: "var(--muted)" }}>
          {plan.completed}/{plan.total}
        </span>
        <span>{open ? "▾" : "▸"}</span>
      </button>
      {open ? (
        <ol className="flex flex-col gap-1 px-3 pb-2 text-xs">
          {plan.items.map((item) => {
            const icon =
              item.status.code === "completed"
                ? "✓"
                : item.status.code === "running"
                  ? "⟳"
                  : item.status.code === "failed"
                    ? "×"
                    : "○";
            return (
              <li key={item.id} className="flex gap-2">
                <span
                  style={{
                    color:
                      item.status.code === "completed"
                        ? "var(--success)"
                        : item.status.code === "failed"
                          ? "var(--danger)"
                          : "var(--muted)",
                  }}
                >
                  {icon}
                </span>
                <span>{item.label}</span>
              </li>
            );
          })}
        </ol>
      ) : null}
    </div>
  );
}
