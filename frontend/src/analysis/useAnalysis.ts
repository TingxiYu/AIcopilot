import { useState } from "react";
import { ANALYSIS_TOOLS } from "./registry";
import type { AnalysisTool, ToolRuntimeState } from "./types";

export type AnalysisEntry = {
  tool: AnalysisTool;
  runtime: ToolRuntimeState;
};

export type AnalysisApi = {
  entries: AnalysisEntry[];
  /** The tool whose result the preview panel is showing. */
  activeId: string;
  active: AnalysisEntry;
  setActiveId: (id: string) => void;
  /** True when at least one tool has produced a result. */
  hasAnyResult: boolean;
  /** Report a tool's result state outward, for the auto-open rule. */
  hasResult: (id: string) => boolean;
};

/**
 * Instantiate every registered tool and expose the active one.
 *
 * `useRuntime` is called once per registry entry, in a fixed order. That is why
 * `ANALYSIS_TOOLS` is a module constant whose length never varies: React
 * identifies hooks by call order, so a registry that grew or shrank between
 * renders would corrupt every tool's state at once. Adding a tool to the array
 * is safe because the change is made in source, not at runtime.
 */
export function useAnalysis(): AnalysisApi {
  const entries: AnalysisEntry[] = ANALYSIS_TOOLS.map((tool) => ({
    tool,
    // Called unconditionally, in registry order — see the note above.
    runtime: tool.useRuntime(),
  }));

  const [activeId, setActiveId] = useState<string>(ANALYSIS_TOOLS[0].id);
  const active = entries.find((entry) => entry.tool.id === activeId) ?? entries[0];

  return {
    entries,
    activeId: active.tool.id,
    active,
    setActiveId,
    hasAnyResult: entries.some((entry) => entry.runtime.hasResult),
    hasResult: (id) => entries.find((entry) => entry.tool.id === id)?.runtime.hasResult ?? false,
  };
}
