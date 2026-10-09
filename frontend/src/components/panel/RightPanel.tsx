import { Button, Empty, Tabs } from "antd";
import { CloseOutlined } from "@ant-design/icons";
import type { Citation } from "../../lib/citations";
import type { AnalysisEntry } from "../../analysis/useAnalysis";
import type { DatasetRow } from "../../analysis/types";
import type { ResearchTaskPresentation } from "../../research-task";
import { ProjectContextTab } from "./ProjectContextTab";
import { DatasetTab } from "./DatasetTab";
import { TaskStatusTab } from "./TaskStatusTab";
import { ReportTab } from "./ReportTab";

export type RightPanelProps = {
  tab: string;
  onTabChange: (tab: string) => void;
  onClose: () => void;

  task: ResearchTaskPresentation;
  messageCount: number;
  citations: Citation[];
  files: unknown;

  /** Analysis tools, in registry order. The panel never names one itself. */
  analysis: AnalysisEntry[];
  activeToolId: string;
  onActiveToolChange: (id: string) => void;
  /** Composed by the caller from Analysis Registry dataset contributions only. */
  datasetRows: DatasetRow[];
};

/** Tab key for an artifact that gets its own tab. */
export function artifactTabKey(path: string): string {
  return `artifact:${path}`;
}

/**
 * The right preview panel.
 *
 * The tab strip is assembled, not written out: fixed tabs over session state,
 * one tab per artifact beyond the primary report, and a single generic
 * "Result View" whose contents come from whichever analysis tool is active.
 * Nothing here names GS, so a new analysis gets a result surface and a dataset
 * row without this file changing.
 */
export function RightPanel(props: RightPanelProps) {
  const { tab, onTabChange, onClose, task, analysis, activeToolId } = props;
  const artifacts = task.artifacts.filter((artifact) => artifact.name !== "research_request.md");
  const publicTask = { ...task, artifacts };

  const activeTool = analysis.find((entry) => entry.tool.id === activeToolId) ?? analysis[0];

  // The primary report is the 报告预览 tab; every further artifact gets its own,
  // which is how a second output becomes previewable without the report tab
  // growing a nested switcher.
  const primary = artifacts.find((artifact) => artifact.name === "final_report.md") ?? artifacts[0];
  const extras = artifacts.filter((artifact) => artifact !== primary);

  return (
    <div
      className="flex h-full min-h-0 flex-col"
      style={{ background: "var(--panel)", borderLeft: "1px solid var(--border)" }}
      aria-label="预览面板"
    >
      <Tabs
        size="small"
        activeKey={tab}
        onChange={onTabChange}
        className="min-h-0 flex-1 [&_.ant-tabs-content-holder]:overflow-auto"
        tabBarExtraContent={
          <Button
            type="text"
            size="small"
            aria-label="关闭预览面板"
            title="关闭预览面板 (Ctrl+B)"
            icon={<CloseOutlined />}
            onClick={onClose}
          />
        }
        items={[
          {
            key: "context",
            label: "任务概览",
            children: (
              <ProjectContextTab
                task={publicTask}
                messageCount={props.messageCount}
                citations={props.citations}
              />
            ),
          },
          {
            key: "datasets",
            label: "数据集列表",
            children: <DatasetTab rows={props.datasetRows} />,
          },
          {
            key: "tasks",
            label: "任务状态",
            children: <TaskStatusTab task={publicTask} />,
          },
          ...(artifacts.length > 0
            ? [
                {
                  key: "report",
                  label: "报告预览",
                  children: <ReportTab files={props.files} />,
                },
              ]
            : []),
          ...extras.map((artifact) => ({
            key: artifactTabKey(artifact.path),
            label: artifact.name,
            children: <ReportTab files={props.files} initialPath={artifact.path} />,
          })),
          {
            key: "result",
            label: "Result View",
            children: (
              <div className="flex h-full min-h-0 flex-col">
                {/* Tool switcher. With one tool it reads as a single chip; with
                    several, it is how the Result View changes hands — so the
                    strip above never has to grow a tab per analysis. */}
                {analysis.length > 0 ? (
                  <div
                    className="flex shrink-0 items-center gap-1 overflow-auto border-b px-2 py-1"
                    style={{ borderColor: "var(--border)" }}
                    role="group"
                    aria-label="分析工具"
                  >
                    {analysis.map((entry) => (
                      <Button
                        key={entry.tool.id}
                        size="small"
                        type={entry.tool.id === activeTool?.tool.id ? "primary" : "text"}
                        icon={entry.tool.icon}
                        aria-label={entry.tool.label}
                        title={entry.tool.description}
                        onClick={() => props.onActiveToolChange(entry.tool.id)}
                      >
                        {entry.tool.label}
                      </Button>
                    ))}
                  </div>
                ) : null}

                <div className="min-h-0 flex-1">
                  {activeTool ? (
                    activeTool.runtime.view
                  ) : (
                    <div className="p-3">
                      <Empty
                        image={Empty.PRESENTED_IMAGE_SIMPLE}
                        description="还没有可用的分析工具。"
                      />
                    </div>
                  )}
                </div>
              </div>
            ),
          },
        ]}
      />
    </div>
  );
}
