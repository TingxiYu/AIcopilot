// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("plotly.js-basic-dist-min", () => ({
  default: { react: vi.fn(async () => ({})), purge: vi.fn(), newPlot: vi.fn(async () => ({})) },
}));

const streamFixture = vi.hoisted(() => ({
  stream: {
    values: {
      todos: [{ content: "Write report", status: "completed" as const }],
      files: {
        "/final_report.md": { content: "# Result", encoding: "utf-8" },
      },
    },
    isLoading: false,
    interrupt: undefined,
    error: null,
    stop: vi.fn(),
  },
  threadId: undefined,
  selectThread: vi.fn(),
  subagentsByCallId: new Map(),
  messages: [{ id: "human-1", type: "human", content: "Run research" }],
  apiUrl: "http://127.0.0.1:2026",
  connectionError: false,
  isConnecting: false,
  submit: vi.fn(),
}));

vi.mock("../src/hooks/useThreadStream", () => ({
  API_URL: "http://127.0.0.1:2026",
  useThreadStream: () => streamFixture,
}));

import App from "../src/App";

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.reject(new Error("offline in tests"))),
  );
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("App ResearchTask wiring", () => {
  it("keeps tool narration out of the conversation and shows the final report", () => {
    const previousMessages = streamFixture.messages;
    const previousFiles = streamFixture.stream.values.files;
    Object.assign(streamFixture, { messages: [
      { id: "h1", type: "human", content: "群体 PCA 怎么分析？" },
      { id: "a1", type: "ai", content: "I'll research and plan.", tool_calls: [{ id: "c1", name: "write_todos", args: {} }] },
      { id: "t1", type: "tool", content: "plan saved", tool_call_id: "c1" },
      { id: "a-write", type: "ai", content: "Report saved.", tool_calls: [{ id: "c2", name: "write_file", args: { file_path: "/artifacts/final_report.md" } }] },
      { id: "t-write", type: "tool", content: "saved", tool_call_id: "c2" },
      { id: "a2", type: "ai", content: "Done. See file." },
    ] });
    Object.assign(streamFixture.stream.values, { files: {
      "/artifacts/final_report.md": { content: "## 结论\n\nPCA should be validated [1].\n\n### Sources\n[1] Study: https://example.org", encoding: "utf-8" },
    } });
    try {
      render(<App />);
      const conversation = within(screen.getByTestId("conversation-scroll"));
      expect(conversation.getByText("PCA should be validated [1].")).toBeTruthy();
      expect(conversation.queryByText(/I'll research and plan/)).toBeNull();
      expect(conversation.queryByText(/write_todos/)).toBeNull();
      expect(conversation.queryByText(/Done. See file/)).toBeNull();
    } finally {
      Object.assign(streamFixture, { messages: previousMessages });
      Object.assign(streamFixture.stream.values, { files: previousFiles });
    }
  });

  it(
    "projects an unbound inactive artifact task without inventing completion",
    async () => {
      const view = render(<App />);

      await waitFor(() => {
        expect(screen.getByLabelText("预览面板")).toBeTruthy();
      });
      fireEvent.click(screen.getByRole("tab", { name: "任务状态" }));

      expect(screen.getByText("状态未确认")).toBeTruthy();
      expect(screen.queryByText("任务已完成")).toBeNull();

      view.rerender(<App />);
      expect(screen.getByText("状态未确认")).toBeTruthy();
    },
    15_000,
  );
});
