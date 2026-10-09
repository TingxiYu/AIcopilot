// @vitest-environment jsdom
//
// Task 10 smoke test: the right column (artifact panel, todo strip) and the
// left column (thread sidebar). The behaviours asserted here are the ones the
// brief's self-review calls out as easy to get wrong.
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ArtifactPanel } from "../src/components/artifacts/ArtifactPanel";
import { TodoStrip } from "../src/components/cards/TodoStrip";
import { Sidebar } from "../src/components/shell/Sidebar";
import { stabilizeMessages } from "../src/hooks/useThreadStream";
import type { RawMessage } from "../src/lib/rows";
import { buildTaskPresentation, type ResearchStepStatus, type ResearchTask } from "../src/research-task";

afterEach(cleanup);

describe("ArtifactPanel", () => {
  it("is not blank before a report exists (spec 4.5)", () => {
    const { container } = render(<ArtifactPanel files={undefined} />);
    expect(container.textContent).toContain("研究进行中");
  });

  it("treats an empty files map as no artifact yet", () => {
    const { container } = render(<ArtifactPanel files={{}} />);
    expect(container.textContent).toContain("研究进行中");
  });

  it("renders the report markdown and its citations once an artifact exists", () => {
    const { container } = render(
      <ArtifactPanel
        files={{
          "/final_report.md": {
            content: "# Findings\n\nMaize yield rose [1].\n\n### Sources\n[1] A Study: https://example.com/a",
            encoding: "utf-8",
          },
        }}
      />,
    );
    expect(screen.getByText("Findings")).toBeTruthy();
    expect(screen.getByText(/引用来源 · 1/)).toBeTruthy();
    // The citation list, not the report body (which links [1] too).
    expect(container.querySelector("ol a")?.getAttribute("href")).toBe("https://example.com/a");
  });

  it("hides internal /large_tool_results/ spill from the panel", () => {
    const { container } = render(
      <ArtifactPanel
        files={{
          "/large_tool_results/abc": { content: "x".repeat(10), encoding: "utf-8" },
        }}
      />,
    );
    expect(container.textContent).toContain("研究进行中");
  });
});

describe("TodoStrip", () => {
  function plan(items: Array<{ label: string; status: ResearchStepStatus }>) {
    const task: ResearchTask = {
      id: "research-task:task10",
      conversationId: "task10",
      title: "Task 10",
      status: "unknown",
      statusSource: "derived",
      steps: items.map((item, index) => ({
        id: `step-${index}`,
        label: item.label,
        status: item.status,
        source: "todo",
      })),
      activities: [],
      artifacts: [],
    };
    return buildTaskPresentation(task).plan;
  }

  it("renders nothing for an empty todo list, not an empty bar", () => {
    const { container } = render(<TodoStrip plan={plan([])} />);
    expect(container.innerHTML).toBe("");
  });

  it("shows 0/N with a zero-width fill when nothing is completed", () => {
    // A real run produced todos that were all pending/in_progress and zero
    // completed -- this is an expected state and must look intentional.
    const { container } = render(
      <TodoStrip
        plan={plan([
          { label: "搜索", status: "running" },
          { label: "写作", status: "pending" },
        ])}
      />,
    );
    expect(screen.getByText("0/2")).toBeTruthy();
    expect(container.textContent).toContain("PLAN");
  });

  it("opens to list each todo with a status glyph", () => {
    render(
      <TodoStrip
        plan={plan([
          { label: "搜索", status: "completed" },
          { label: "写作", status: "pending" },
        ])}
      />,
    );
    expect(screen.getByText("1/2")).toBeTruthy();
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByText("搜索")).toBeTruthy();
    expect(screen.getByText("写作")).toBeTruthy();
    expect(screen.getByText("✓")).toBeTruthy();
    expect(screen.getByText("○")).toBeTruthy();
  });
});

describe("Sidebar", () => {
  it("sends an empty string for new thread rather than a stale id", () => {
    const onSelect = vi.fn();
    render(<Sidebar activeId="t1" onSelect={onSelect} />);
    fireEvent.click(screen.getByText("＋ 新建"));
    expect(onSelect).toHaveBeenCalledWith("");
  });

  // Re-review Finding B: with no backend a thread cannot actually be created,
  // so the click must not silently no-op.
  it("disables new thread and explains when the backend is unreachable", () => {
    const onSelect = vi.fn();
    render(<Sidebar onSelect={onSelect} newThreadBlocked />);

    const button = screen.getByRole("button", { name: /新建/ }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.click(button);
    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.getByText("后端不可达，无法新建会话。")).toBeTruthy();
  });

  it("renders an empty state, not a stray heading, when there are no threads", async () => {
    // The thread search used to live in this component; it now lives in
    // `useThreads`, which swallows the same failure (covered in threads.test.ts).
    // What matters here is that being handed nothing still renders, and does
    // not emit a group heading with no items under it.
    const onSelect = vi.fn();
    const { container } = render(<Sidebar onSelect={onSelect} />);
    await waitFor(() => {
      expect(container.textContent).toContain("＋ 新建");
    });
    expect(container.querySelectorAll("section").length).toBe(0);
    expect(container.textContent).toContain("还没有会话");
  });

  it("groups threads by age and reports a selection upward", () => {
    const onSelect = vi.fn();
    const now = Date.now();
    render(
      <Sidebar
        onSelect={onSelect}
        threads={[
          {
            id: "today",
            title: "今天的研究",
            updatedAt: new Date(now - 60_000).toISOString(),
            archived: false,
            pinned: false,
            running: false,
          },
          {
            id: "old",
            title: "很久以前",
            updatedAt: new Date(now - 30 * 86_400_000).toISOString(),
            archived: false,
            pinned: false,
            running: false,
          },
        ]}
      />,
    );

    expect(screen.getByText("今天")).toBeTruthy();
    expect(screen.getByText("更早")).toBeTruthy();
    // An empty group renders no heading at all.
    expect(screen.queryByText("最近 7 天")).toBeNull();

    fireEvent.click(screen.getByText("今天的研究"));
    expect(onSelect).toHaveBeenCalledWith("today");
  });
});

describe("message array stability", () => {
  function msg(over: Partial<RawMessage> = {}): RawMessage {
    return { id: "m1", type: "ai", content: "hello", ...over };
  }

  it("reuses the previous array when values are unchanged", () => {
    const previous = [msg()];
    const next = [msg()];
    expect(stabilizeMessages(previous, next)).toBe(previous);
  });

  it("adopts the new array when streamed content grows within one message", () => {
    // The frozen-card guard: the array LENGTH is unchanged, only the content
    // is longer. A count-only key would wrongly report "same".
    const previous = [msg({ content: "search" })];
    const next = [msg({ content: "searching for genomic prediction" })];
    expect(previous.length).toBe(next.length);
    expect(stabilizeMessages(previous, next)).not.toBe(previous);
  });

  it("adopts the new array when tool-call args grow with the content unchanged", () => {
    // Mid-stream an AI message carries tool_calls whose args accumulate from
    // tool_call_chunks while its own content stays empty. Both the array
    // length and the tool-call COUNT are unchanged here.
    const call = (args: unknown): RawMessage => ({
      id: "m1",
      type: "ai",
      content: "",
      tool_calls: [{ id: "c1", name: "task", args }],
    });
    const previous = [call({ description: "Fetch" })];
    const next = [call({ description: "Fetch the page at https://example.com" })];
    expect(previous.length).toBe(next.length);
    expect(previous[0].tool_calls?.length).toBe(next[0].tool_calls?.length);
    expect(stabilizeMessages(previous, next)).not.toBe(previous);
  });

  it("holds identity across a rebuild of identical tool calls", () => {
    const call = (): RawMessage => ({
      id: "m1",
      type: "ai",
      content: "hi",
      tool_calls: [{ id: "c1", name: "task", args: { a: 1, b: [1, 2] } }],
    });
    const previous = [call()];
    expect(stabilizeMessages(previous, [call()])).toBe(previous);
  });

  it("adopts the new array when the message count changes", () => {
    const previous = [msg()];
    expect(stabilizeMessages(previous, [msg(), msg({ id: "m2" })])).not.toBe(previous);
  });

  it("adopts the new array when a tool call gains a result", () => {
    const previous = [msg({ type: "tool", tool_call_id: "c1", content: "" })];
    const next = [msg({ type: "tool", tool_call_id: "c1", content: "result" })];
    expect(stabilizeMessages(previous, next)).not.toBe(previous);
  });

  it("uses the first array when there is no previous one", () => {
    const next = [msg()];
    expect(stabilizeMessages(null, next)).toBe(next);
  });
});
