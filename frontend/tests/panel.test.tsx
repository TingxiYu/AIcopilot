// @vitest-environment jsdom
//
// The right preview panel: its assembled tab strip, the close control, the
// generic Result View, and the fact that the shell is not GS-specific. Plotly
// is mocked so the 1.2 MB bundle never loads in a test run.
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";

vi.mock("plotly.js-basic-dist-min", () => ({
  default: { react: vi.fn(async () => ({})), purge: vi.fn(), newPlot: vi.fn(async () => ({})) },
}));

import { RightPanel, type RightPanelProps } from "../src/components/panel/RightPanel";
import { extractHeadings } from "../src/lib/outline";
import { useAnalysis, type AnalysisEntry } from "../src/analysis/useAnalysis";
import type { AnalysisTool } from "../src/analysis/types";
import { buildTaskPresentation, projectResearchTask } from "../src/research-task";
import type { ResearchTask } from "../src/research-task";

afterEach(cleanup);

const REPORT = "# 玉米产量研究\n\n正文一段 [1]。\n\n## 方法\n\n方法正文。\n\n### Sources\n[1] A Study: https://example.com/a";
const REQUEST = "# 研究请求\n\n请研究玉米产量。";

const FILES = {
  "/final_report.md": { content: REPORT, encoding: "utf-8" },
  "/research_request.md": { content: REQUEST, encoding: "utf-8" },
  "/charts/summary.csv": { content: "PC1,PC2\n0.1,0.2", encoding: "utf-8" },
};

const ARTIFACTS = [
  { path: "/final_report.md", name: "final_report.md", content: REPORT, bytes: 100, lines: 9 },
  { path: "/research_request.md", name: "research_request.md", content: REQUEST, bytes: 30, lines: 3 },
  { path: "/charts/summary.csv", name: "summary.csv", content: "PC1,PC2\n0.1,0.2", bytes: 15, lines: 2 },
];

function researchTask(overrides: Partial<ResearchTask> = {}): ResearchTask {
  return {
    id: "research-task:panel",
    conversationId: "panel",
    title: "玉米产量研究",
    question: "请研究玉米产量",
    status: "unknown",
    statusSource: "derived",
    steps: [],
    activities: [],
    artifacts: ARTIFACTS,
    ...overrides,
  };
}

const unknownTaskWithArtifacts = buildTaskPresentation(researchTask());

/** A stand-in for a future analysis tool: proves the shell takes any of them. */
function fakeTool(id: string, label: string, view: string): AnalysisEntry {
  const tool: AnalysisTool = {
    id,
    label,
    description: `${label} description`,
    icon: null,
    useRuntime: () => ({ hasResult: true, view: <p>{view}</p> }),
  };
  return { tool, runtime: { hasResult: true, view: <p>{view}</p> } };
}

function panel(over: Partial<RightPanelProps> = {}) {
  const props: RightPanelProps = {
    tab: "context",
    onTabChange: vi.fn(),
    onClose: vi.fn(),
    task: unknownTaskWithArtifacts,
    messageCount: 3,
    citations: [{ n: 1, url: "https://example.com/a", title: "A Study" }],
    files: FILES,
    analysis: [fakeTool("gs", "GS 基因组预测", "GS view")],
    activeToolId: "gs",
    onActiveToolChange: vi.fn(),
    datasetRows: [],
    ...over,
  };
  return { props, ...render(<RightPanel {...props} />) };
}

describe("RightPanel tab strip", () => {
  it("assembles the documented tabs", () => {
    panel();
    for (const label of ["任务概览", "数据集列表", "任务状态", "报告预览", "Result View"]) {
      expect(screen.getByRole("tab", { name: label })).toBeTruthy();
    }
    expect(screen.queryByRole("tab", { name: "项目上下文" })).toBeNull();
  });

  it("drops the report tab when there is no artifact to preview", () => {
    panel({
      task: buildTaskPresentation(researchTask({ artifacts: [] })),
      files: {},
    });
    expect(screen.queryByRole("tab", { name: "报告预览" })).toBeNull();
    // The generic tabs survive regardless.
    expect(screen.getByRole("tab", { name: "Result View" })).toBeTruthy();
  });

  it("gives each additional artifact its own tab, opening its own document", () => {
    // The primary report keeps the 报告预览 tab; anything else is a new tab, so
    // a second output is previewable without a nested switcher.
    panel({ tab: "artifact:/charts/summary.csv" });
    expect(screen.getByRole("tab", { name: "summary.csv" })).toBeTruthy();
    expect(screen.getByText("PC1,PC2", { exact: false })).toBeTruthy();
    expect(screen.queryByRole("tab", { name: "research_request.md" })).toBeNull();
  });

  it("has a close control wired to onClose", () => {
    const { props } = panel();
    fireEvent.click(screen.getByRole("button", { name: "关闭预览面板" }));
    expect(props.onClose).toHaveBeenCalled();
  });

  it("requests a tab change when another tab is clicked", () => {
    const { props } = panel();
    fireEvent.click(screen.getByRole("tab", { name: "数据集列表" }));
    expect(props.onTabChange).toHaveBeenCalledWith("datasets");
  });

  it("keeps artifacts viewable while the ResearchTask outcome is unknown", () => {
    panel({ tab: "tasks", task: unknownTaskWithArtifacts });
    expect(screen.getByText("状态未确认")).toBeTruthy();
    expect(screen.getByRole("tab", { name: "报告预览" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "summary.csv" })).toBeTruthy();
    expect(screen.queryByRole("tab", { name: "research_request.md" })).toBeNull();
  });
});

describe("Result View is generic", () => {
  it("renders whichever tool is active, with no GS knowledge in the shell", () => {
    panel({ tab: "result", activeToolId: "gwas", analysis: [fakeTool("gs", "GS 基因组预测", "GS view"), fakeTool("gwas", "GWAS 关联分析", "GWAS view")] });
    expect(screen.getByText("GWAS view")).toBeTruthy();
    expect(screen.queryByText("GS view")).toBeNull();
  });

  it("offers a switcher per registered tool and reports the change upward", () => {
    const { props } = panel({
      tab: "result",
      analysis: [fakeTool("gs", "GS 基因组预测", "GS view"), fakeTool("gwas", "GWAS 关联分析", "GWAS view")],
    });
    fireEvent.click(screen.getByRole("button", { name: "GWAS 关联分析" }));
    expect(props.onActiveToolChange).toHaveBeenCalledWith("gwas");
  });

  it("drives the REAL registry through useAnalysis without naming a tool", () => {
    // Uses the actual registry rather than fakes, so a registry entry that
    // stopped rendering would fail here. The harness reads the same API `App`
    // does, which is the point: the shell needs nothing tool-specific.
    function Harness() {
      const analysis = useAnalysis();
      return (
        <RightPanel
          tab="result"
          onTabChange={() => {}}
          onClose={() => {}}
          task={buildTaskPresentation(
            researchTask({ title: "t", question: undefined, status: "idle", artifacts: [] }),
          )}
          messageCount={0}
          citations={[]}
          files={{}}
          analysis={analysis.entries}
          activeToolId={analysis.activeId}
          onActiveToolChange={() => {}}
          datasetRows={analysis.entries.flatMap((e) => e.runtime.datasets ?? [])}
        />
      );
    }

    render(<Harness />);
    expect(screen.getByRole("button", { name: "GS 基因组预测" })).toBeTruthy();
    // The GS view's own upload surface renders inside the generic tab.
    expect(screen.getByText("本地演示")).toBeTruthy();
  });

  it("carries the whole GS flow through the real registry, end to end", () => {
    // The requirement is that the existing GS flow keeps working after the
    // remodel. This drives it the way a user does — press the demo button, read
    // the metrics, get a chart — through the actual registry entry rather than
    // a stub, so a wiring break between the registry, the tab and the tool
    // shows up here rather than only in the browser.
    function Harness() {
      const analysis = useAnalysis();
      const [tab, setTab] = useState("result");
      const task = buildTaskPresentation(
        projectResearchTask({
          conversationId: "gs-harness",
          messages: [{ id: "h", type: "human", content: "Run GS" }],
          todos: [],
          subagentsByCallId: new Map(),
          artifacts: [],
          analysisTasks: analysis.entries.flatMap((entry) => entry.runtime.tasks ?? []),
          isRunning: false,
          hasInterrupt: false,
          error: null,
          isConnectionError: false,
        }),
      );
      return (
        <RightPanel
          tab={tab}
          onTabChange={setTab}
          onClose={() => {}}
          task={task}
          messageCount={0}
          citations={[]}
          files={{}}
          analysis={analysis.entries}
          activeToolId={analysis.activeId}
          onActiveToolChange={() => {}}
          datasetRows={analysis.entries.flatMap((e) => e.runtime.datasets ?? [])}
        />
      );
    }

    render(<Harness />);
    expect(screen.queryByText("PCC（测试集）")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "用示例数据运行" }));

    // A real fit ran in this process; these are its reported numbers, not
    // fixtures. The chart mount point is asserted too, since the plot is the
    // half of the result that is easiest to leave unwired.
    expect(screen.getByText("PCC（测试集）")).toBeTruthy();
    expect(screen.getByText("RMSE（测试集）")).toBeTruthy();
    expect(screen.getByTestId("gs-scatter")).toBeTruthy();
    expect(screen.getByText(/样本 60/)).toBeTruthy();
    expect(screen.getByText(/标记 120/)).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: "任务状态" }));
    expect(screen.getByText("状态未确认")).toBeTruthy();
    expect(screen.queryByText("GS 基因组预测（本地计算）")).toBeNull();
  });
});

describe("shared tabs take contributions", () => {
  it("renders dataset rows a tool contributed", () => {
    panel({
      tab: "datasets",
      datasetRows: [
        { key: "a", name: "geno.csv", kind: "基因型", samples: "40", markers: "30", source: "本地上传" },
      ],
    });
    const row = screen.getByText("geno.csv").closest("tr");
    expect(row).not.toBeNull();
    expect(within(row as HTMLElement).getByText("40")).toBeTruthy();
    expect(within(row as HTMLElement).getByText("30")).toBeTruthy();
  });

  it("says so rather than showing an empty table with no datasets", () => {
    panel({ tab: "datasets", datasetRows: [] });
    expect(screen.getByText(/还没有数据集/)).toBeTruthy();
  });

  it("does not classify report artifacts as datasets", () => {
    panel({ tab: "datasets", task: unknownTaskWithArtifacts, datasetRows: [] });
    const datasets = screen.getByRole("tabpanel", { name: "数据集列表" });
    expect(within(datasets).getByText(/还没有数据集/)).toBeTruthy();
    expect(within(datasets).queryByText("final_report.md")).toBeNull();
    expect(within(datasets).queryByText("research_request.md")).toBeNull();
  });

  it("keeps projected plan and execution contributions private", () => {
    panel({
      tab: "tasks",
      task: buildTaskPresentation(
        researchTask({
          steps: [
            { id: "todo-1", label: "搜索文献", status: "completed", source: "todo" },
            { id: "analysis-1", label: "GWAS 关联分析", status: "failed", source: "analysis" },
          ],
          activities: [
            {
              id: "activity-1",
              kind: "subagent",
              label: "research-agent",
              status: "running",
              sourceRef: "call-1",
            },
          ],
        }),
      ),
    });
    expect(screen.queryByRole("region", { name: "研究计划" })).toBeNull();
    expect(screen.queryByRole("region", { name: "执行活动" })).toBeNull();
    expect(screen.queryByText("搜索文献")).toBeNull();
    expect(screen.queryByText("research-agent")).toBeNull();
    expect(screen.getByText("状态未确认")).toBeTruthy();
  });
});

describe("report tab outline", () => {
  it("lists headings and scrolls to the one that was clicked", () => {
    panel({ tab: "report" });
    const outline = screen.getByRole("navigation", { name: "文档大纲" });
    expect(outline.textContent).toContain("玉米产量研究");
    expect(outline.textContent).toContain("方法");

    // HTMLElement.prototype, not Element.prototype: the setup file defines the
    // stub on the former, which shadows the latter for every DOM element.
    const spy = vi.fn();
    HTMLElement.prototype.scrollIntoView = spy;
    // Scoped to the outline: "方法" is also an h2 in the rendered report body.
    fireEvent.click(within(outline).getByText("方法"));
    expect(spy).toHaveBeenCalled();
  });
});

describe("extractHeadings", () => {
  it("returns headings in document order with their levels", () => {
    expect(extractHeadings("# A\n\ntext\n\n## B\n\n### C")).toEqual([
      { level: 1, text: "A" },
      { level: 2, text: "B" },
      { level: 3, text: "C" },
    ]);
  });

  it("ignores a '#' line inside a fenced code block", () => {
    expect(extractHeadings("# Real\n\n```\n# not a heading\n```\n\n## Also real")).toEqual([
      { level: 1, text: "Real" },
      { level: 2, text: "Also real" },
    ]);
  });

  it("strips trailing hashes and ignores headings deeper than h4", () => {
    expect(extractHeadings("## Title ##")).toEqual([{ level: 2, text: "Title" }]);
    expect(extractHeadings("##### Too deep")).toEqual([]);
  });
});
