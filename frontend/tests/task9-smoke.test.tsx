// @vitest-environment jsdom
//
// Task 9 smoke test: mount the conversation column's pieces against the row
// contract from lib/rows.ts and assert the card behaviours from spec 6.2.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Composer } from "../src/components/thread/Composer";
import { MessageList } from "../src/components/thread/MessageList";
import { SubagentCard } from "../src/components/cards/SubagentCard";
import type { Row, SubagentRow, ToolRow } from "../src/lib/rows";

afterEach(cleanup);

function tool(name: string, over: Partial<ToolRow> = {}): ToolRow {
  return {
    kind: "tool",
    key: `c-${name}`,
    callId: `c-${name}`,
    name,
    args: { query: "maize yield" },
    result: null,
    status: "pending",
    ...over,
  };
}

describe("artifact result card", () => {
  function writeRow(path: string): ToolRow {
    return tool("write_file", { args: { file_path: path }, status: "done" });
  }

  it("turns a write_file that produced a real artifact into a result card", () => {
    const onOpen = vi.fn();
    render(
      <MessageList
        rows={[writeRow("/final_report.md")]}
        running={false}
        artifactPaths={["/final_report.md"]}
        onOpenArtifact={onOpen}
      />,
    );

    // The button is the point of the card: without it the report is only
    // reachable from the preview panel, which is hidden by default.
    const button = screen.getByRole("button", { name: "在右侧面板查看 final_report.md" });
    fireEvent.click(button);
    expect(onOpen).toHaveBeenCalledWith("/final_report.md", "report");
  });

  it("leaves a write to a non-artifact path as an ordinary tool card", () => {
    // The projection filters /large_tool_results/ out of the artifact list; a
    // card offering to preview one would open a panel with nothing in it.
    render(
      <MessageList
        rows={[writeRow("/large_tool_results/abc")]}
        running={false}
        artifactPaths={["/final_report.md"]}
        onOpenArtifact={vi.fn()}
      />,
    );
    expect(screen.queryByRole("button", { name: /在右侧面板查看/ })).toBeNull();
  });

  it("does not label a stopped artifact write as still running", () => {
    render(<MessageList rows={[{ ...writeRow("/final_report.md"), status: "unknown" }]} running={false} artifactPaths={["/final_report.md"]} onOpenArtifact={vi.fn()} />);
    expect(screen.getByText(/状态未确认/)).toBeTruthy();
    expect(screen.queryByText(/写入中/)).toBeNull();
  });
});

describe("ToolCallCard via MessageList", () => {
  it("opens tavily_search by default and shows the query", () => {
    const { container } = render(<MessageList rows={[tool("tavily_search")]} running={false} />);
    // The header always shows the query; the expanded body adds a <pre>.
    expect(screen.getAllByText(/maize yield/).length).toBeGreaterThan(0);
    expect(container.querySelector("pre")).not.toBeNull();
  });

  it("collapses write_todos / write_file / read_file / think_tool to one line", () => {
    for (const name of ["write_todos", "write_file", "read_file", "think_tool"]) {
      const { container, unmount } = render(
        <MessageList rows={[tool(name)]} running={false} />,
      );
      expect(container.querySelector("pre")).toBeNull();
      unmount();
    }
  });

  it("toggles open on click", () => {
    const { container } = render(<MessageList rows={[tool("think_tool")]} running={false} />);
    expect(container.querySelector("pre")).toBeNull();
    fireEvent.click(screen.getByRole("button"));
    expect(container.querySelector("pre")).not.toBeNull();
  });

  it("keeps a long write_todos result collapsed until requested", () => {
    const details = "research step ".repeat(60);
    const { container } = render(<MessageList rows={[tool("write_todos", { result: details, status: "done" })]} running={false} />);
    const button = screen.getByRole("button", { name: /write_todos/ });
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(container.querySelector("pre")).toBeNull();
    fireEvent.click(button);
    expect(button.getAttribute("aria-expanded")).toBe("true");
    expect(container.querySelector("pre")?.textContent).toContain(details);
  });

  it("shows a failed task without a running spinner and reveals its reason on demand", () => {
    const row = tool("task", { status: "failed", result: "子任务超时" });
    const { container } = render(<MessageList rows={[row]} running={false} />);
    const button = screen.getByRole("button", { name: /task.*失败/ });
    expect(button.textContent).not.toContain("⟳");
    expect(container.querySelector("pre")).toBeNull();
    fireEvent.click(button);
    expect(container.querySelector("pre")?.textContent).toContain("子任务超时");
  });
});

describe("SubagentCard", () => {
  function sub(status: "running" | "done", inner: Row[] = []): SubagentRow {
    return {
      kind: "subagent",
      key: "sub-1",
      callId: "sub-1",
      agent: "researcher",
      status,
      result: null,
      inner,
    };
  }

  it("starts open while running and collapsed once done", () => {
    const running = render(<SubagentCard row={sub("running")} />);
    expect(running.getByText("子代理正在工作…")).toBeTruthy();
    running.unmount();

    const done = render(<SubagentCard row={sub("done")} />);
    expect(done.queryByText("没有可展示的子代理轨迹。")).toBeNull();
    done.unmount();
  });

  // Regression: §6.2 "open while running, collapsed once finished". The row key
  // (`sub-${callId}`) is stable for the whole subagent lifecycle, so React keeps
  // the same component instance across the running -> done transition. Seeding
  // `useState(row.status === "running")` passes the test above (which unmounts
  // between the two renders) but leaves a card that mounted while running stuck
  // open forever. This test re-renders in place with the same key and no
  // unmount, which is what actually happens live.
  it("collapses on its own when a running subagent finishes, same key, no unmount", () => {
    const { container, rerender } = render(
      <MessageList rows={[sub("running")]} running={false} />,
    );
    expect(container.querySelectorAll("button").length).toBe(1);
    expect(screen.getByText("子代理正在工作…")).toBeTruthy();

    // Same key (`sub-1`), same mounted tree -- only the status changes.
    rerender(<MessageList rows={[sub("done")]} running={false} />);

    expect(screen.queryByText("子代理正在工作…")).toBeNull();
    expect(screen.queryByText("没有可展示的子代理轨迹。")).toBeNull();
  });

  it("keeps a user-opened card open when a running subagent finishes", () => {
    // A manual override must still beat the derived default.
    const { container, rerender } = render(
      <MessageList rows={[sub("running")]} running={false} />,
    );
    const body = () => container.textContent ?? "";
    const clickHeader = () => {
      const btn = container.querySelector("button");
      if (!btn) throw new Error("no card header");
      fireEvent.click(btn);
    };

    // Running: open by default.
    expect(body()).toContain("子代理正在工作…");
    clickHeader(); // user collapses it -> override false
    expect(body()).not.toContain("子代理正在工作…");
    clickHeader(); // user re-opens it -> override true
    expect(body()).toContain("子代理正在工作…");

    // Completion must NOT override the user's explicit choice.
    rerender(<MessageList rows={[sub("done")]} running={false} />);
    expect(body()).toContain("没有可展示的子代理轨迹。");
  });

  it("renders a nested subagent row without infinite recursion", () => {
    // Two levels of subagent. Both start collapsed (both are "done"), so
    // before any click only the two headers exist -- no descent happened and
    // therefore no runaway recursion.
    const child = { ...sub("done", [tool("tavily_search")]), key: "sub-2", callId: "sub-2" };
    const nested = sub("done", [child]);
    const { container } = render(<SubagentCard row={nested} />);
    expect(container.querySelectorAll("button").length).toBe(1);

    // Opening the outer card descends exactly one level and mounts the child.
    fireEvent.click(screen.getAllByRole("button")[0]);
    expect(container.querySelectorAll("button").length).toBe(2);
    expect(screen.getAllByText("researcher").length).toBe(2);
  });

  it("counts tavily searches in the header", () => {
    render(<SubagentCard row={sub("running", [tool("tavily_search"), tool("tavily_search")])} />);
    expect(screen.getByText("2 次搜索")).toBeTruthy();
  });
});

describe("Composer", () => {
  it("submits on Enter and clears the textarea", () => {
    const onSubmit = vi.fn();
    render(<Composer onSubmit={onSubmit} running={false} onStop={vi.fn()} />);
    const box = screen.getByPlaceholderText("提一个研究问题…") as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: "hello" } });
    fireEvent.keyDown(box, { key: "Enter" });
    expect(onSubmit).toHaveBeenCalledWith("hello");
    expect(box.value).toBe("");
  });

  it("does not submit on Shift+Enter", () => {
    const onSubmit = vi.fn();
    render(<Composer onSubmit={onSubmit} running={false} onStop={vi.fn()} />);
    const box = screen.getByPlaceholderText("提一个研究问题…");
    fireEvent.change(box, { target: { value: "hello" } });
    fireEvent.keyDown(box, { key: "Enter", shiftKey: true });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("does not submit while running or when blank", () => {
    const onSubmit = vi.fn();
    const { unmount } = render(<Composer onSubmit={onSubmit} running={false} onStop={vi.fn()} disabled />);
    const box = screen.getByPlaceholderText("提一个研究问题…");
    fireEvent.change(box, { target: { value: "hello" } });
    fireEvent.keyDown(box, { key: "Enter" });
    expect(onSubmit).not.toHaveBeenCalled();
    unmount();

    const onSubmit2 = vi.fn();
    render(<Composer onSubmit={onSubmit2} running={false} onStop={vi.fn()} />);
    const box2 = screen.getByPlaceholderText("提一个研究问题…");
    fireEvent.change(box2, { target: { value: "   " } });
    fireEvent.keyDown(box2, { key: "Enter" });
    expect(onSubmit2).not.toHaveBeenCalled();
  });

  // Re-review Finding A: `blocked` is deliberately not `disabled`. The whole
  // point is that the user keeps their draft while the backend is down.
  it("allows drafting but refuses to send when blocked", () => {
    const onSubmit = vi.fn();
    render(<Composer onSubmit={onSubmit} running={false} onStop={vi.fn()} blocked />);

    const box = screen.getByPlaceholderText("提一个研究问题…") as HTMLTextAreaElement;
    expect(box.disabled).toBe(false);
    fireEvent.change(box, { target: { value: "hello" } });
    expect(box.value).toBe("hello");

    const send = screen.getByRole("button", { name: "发送" }) as HTMLButtonElement;
    expect(send.disabled).toBe(true);

    fireEvent.keyDown(box, { key: "Enter" });
    expect(onSubmit).not.toHaveBeenCalled();
    // The draft survives the refused submit.
    expect(box.value).toBe("hello");
  });
});
