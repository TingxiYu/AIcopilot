// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { TaskStatusTab } from "../src/components/panel/TaskStatusTab";
import { ProjectContextTab } from "../src/components/panel/ProjectContextTab";
import { buildTaskPresentation } from "../src/research-task";
import type { ResearchTask } from "../src/research-task";

afterEach(cleanup);

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

describe("ResearchTask workspace consumers", () => {
  it("shows running and waiting task statuses directly", () => {
    const { rerender } = render(
      <TaskStatusTab task={buildTaskPresentation(task({ status: "running" }))} />,
    );
    expect(screen.getByText("正在运行")).toBeTruthy();

    rerender(
      <TaskStatusTab task={buildTaskPresentation(task({ status: "waiting_for_user" }))} />,
    );
    expect(screen.getByText("等待用户")).toBeTruthy();
  });

  it("shows unknown neutrally and never claims task completion", () => {
    render(
      <TaskStatusTab
        task={buildTaskPresentation(
          task({
            status: "unknown",
            steps: [
              { id: "done", label: "GS local", status: "completed", source: "analysis" },
            ],
          }),
        )}
      />,
    );
    expect(screen.getByText("状态未确认")).toBeTruthy();
    expect(screen.queryByText("任务已完成")).toBeNull();
  });

  it("keeps plan and execution details out of the public status tab", () => {
    render(
      <TaskStatusTab
        task={buildTaskPresentation(
          task({
            steps: [
              { id: "s1", label: "Inspect inputs", status: "running", source: "todo" },
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
        )}
      />,
    );
    expect(screen.queryByRole("region", { name: "研究计划" })).toBeNull();
    expect(screen.queryByRole("region", { name: "执行活动" })).toBeNull();
    expect(screen.queryByText("Inspect inputs")).toBeNull();
    expect(screen.queryByText("research-agent")).toBeNull();
    expect(screen.getByText("状态未确认")).toBeTruthy();
  });

  it("shows idle empty state without a completed workflow", () => {
    render(<TaskStatusTab task={buildTaskPresentation(task({ status: "idle" }))} />);
    expect(screen.getByText("尚未运行")).toBeTruthy();
    expect(screen.queryByText(/还没有任务/)).toBeNull();
    expect(screen.queryByText("任务已完成")).toBeNull();
  });

  it("presents current task context without claiming a Project entity", () => {
    render(
      <ProjectContextTab
        task={buildTaskPresentation(task({ status: "unknown" }))}
        messageCount={3}
        citations={[]}
      />,
    );
    expect(screen.getByText("状态未确认")).toBeTruthy();
    expect(screen.queryByText("项目 ID")).toBeNull();
    expect(screen.queryByText("项目数据集")).toBeNull();
  });
});
