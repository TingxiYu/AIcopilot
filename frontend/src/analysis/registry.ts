import { gsTool } from "./tools/gs";
import type { AnalysisTool } from "./types";

/**
 * Every analysis tool the app offers.
 *
 * TO ADD ONE: write `tools/<name>.tsx` exporting an `AnalysisTool`, then append
 * it here. Nothing else changes — the Result View tab, the welcome screen's
 * actions and the "does anything have a result?" check all iterate this array.
 *
 * The array is a module constant and its length must never change at runtime:
 * `useAnalysis` calls each entry's `useRuntime` in order, and React requires
 * that call order to be stable between renders.
 */
export const ANALYSIS_TOOLS: AnalysisTool[] = [gsTool];

export function findTool(id: string): AnalysisTool | undefined {
  return ANALYSIS_TOOLS.find((tool) => tool.id === id);
}
