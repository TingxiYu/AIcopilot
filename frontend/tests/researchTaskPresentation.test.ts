import { describe, expect, it } from "vitest";
import { buildTaskPresentation } from "../src/research-task";
import type { ResearchTask } from "../src/research-task";

const artifact = {
  path: "/final_report.md",
  name: "final_report.md",
  content: "# Result",
  bytes: 8,
  lines: 1,
};

function task(overrides: Partial<ResearchTask> = {}): ResearchTask {
  return {
    id: "research-task:thread-1",
    conversationId: "thread-1",
    title: "Rust resistance",
    question: "Study rust resistance",
    status: "unknown",
    statusSource: "derived",
    steps: [],
    activities: [],
    artifacts: [],
    ...overrides,
  };
}

describe("buildTaskPresentation", () => {
  it.each([
    ["idle", "尚未运行", "default"],
    ["running", "正在运行", "blue"],
    ["waiting_for_user", "等待用户", "gold"],
    ["completed", "已完成", "green"],
    ["failed", "失败", "red"],
    ["unknown", "状态未确认", "default"],
  ] as const)("presents %s without changing its lifecycle", (status, label, color) => {
    expect(buildTaskPresentation(task({ status })).status).toEqual({ code: status, label, color });
  });

  it("keeps plan and execution separate and counts only completed plan steps", () => {
    const presentation = buildTaskPresentation(
      task({
        steps: [
          { id: "s1", label: "Inspect", status: "completed", source: "todo" },
          { id: "s2", label: "GS", status: "unknown", source: "analysis" },
        ],
        activities: [
          {
            id: "a1",
            kind: "subagent",
            label: "research-agent",
            status: "running",
            sourceRef: "call-1",
          },
        ],
      }),
    );

    expect(presentation.plan.completed).toBe(1);
    expect(presentation.plan.total).toBe(2);
    expect(presentation.plan.percent).toBe(50);
    expect(presentation.plan.items.map((item) => item.id)).toEqual(["s1", "s2"]);
    expect(presentation.activities.map((item) => item.id)).toEqual(["a1"]);
    expect(presentation.plan.items[0].status.label).toBe("已完成");
    expect(presentation.plan.items[1].status.label).toBe("状态未确认");
  });

  it("preserves artifacts without using them to change unknown status", () => {
    const presentation = buildTaskPresentation(task({ artifacts: [artifact] }));
    expect(presentation.status.code).toBe("unknown");
    expect(presentation.artifacts).toEqual([artifact]);
    expect(presentation.artifacts[0]).toBe(artifact);
  });

  it("uses zero percent for an empty plan", () => {
    expect(buildTaskPresentation(task()).plan).toMatchObject({
      completed: 0,
      total: 0,
      percent: 0,
    });
  });
});
