import type { ReactNode } from "react";

/**
 * The extensibility seam for bioinformatics tooling.
 *
 * Only genomic selection is implemented today, but nothing in the shell is
 * allowed to know that. The preview panel's tabs, the welcome screen's actions
 * and the Result View all read from the registry; a tool additionally
 * *contributes* rows to the shared tabs rather than the tabs reaching into the
 * tool. Adding GWAS or a population PCA is one registry entry plus one
 * `useRuntime`, with no change to the panel, the tabs or the page.
 */

/** A row in the 数据集列表 tab. */
export type DatasetRow = {
  key: string;
  name: string;
  /** 基因型 / 表型 / 研究文档 / whatever a future tool calls its inputs. */
  kind: string;
  /** Rendered as "—" when a tool has no notion of one. */
  samples: string;
  markers: string;
  source: string;
};

/** An entry in the 任务状态 tab. */
export type TaskEntry = {
  key: string;
  label: string;
  status: "pending" | "running" | "done" | "failed";
};

/** What a tool reports about itself on any given render. */
export type ToolRuntimeState = {
  /** True once the tool has something worth previewing. */
  hasResult: boolean;
  /** Rendered inside the generic "Result View" tab when this tool is active. */
  view: ReactNode;
  /** Rows this tool adds to the 数据集列表 tab. Usually only once it has run. */
  datasets?: DatasetRow[];
  /** Entries this tool adds to the 任务状态 tab, alongside the agent's todos. */
  tasks?: TaskEntry[];
};

export type AnalysisTool = {
  /** Stable id, used as the tab's React key and for the active-tool pointer. */
  id: string;
  /** Human label: welcome screen action, tool list, empty states. */
  label: string;
  /** One line of explanation, shown under the label where there is room. */
  description: string;
  icon: ReactNode;
  /**
   * Owns this tool's state.
   *
   * Called once per tool, in registry order, on every render. The order is
   * stable because it comes from a module-level array that never changes
   * length, which is what makes calling a hook per entry legitimate. A tool
   * registered at runtime would break that — the registry is a compile-time
   * list.
   */
  useRuntime: () => ToolRuntimeState;
};
