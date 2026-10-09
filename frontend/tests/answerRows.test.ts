import { describe, expect, it } from "vitest";
import { buildAnswerRows } from "../src/lib/answerRows";
import type { RawMessage } from "../src/lib/rows";

const human = (id: string, content: string): RawMessage => ({ id, type: "human", content });
const ai = (id: string, content: string, tool_calls: RawMessage["tool_calls"] = []): RawMessage => ({
  id, type: "ai", content, tool_calls,
});
const tool = (id: string): RawMessage => ({ id, type: "tool", content: "internal result", tool_call_id: id });

describe("buildAnswerRows", () => {
  const messages: RawMessage[] = [
    human("h1", "群体结构 PCA 如何选主成分？"),
    ai("a1", "I'll research this and save a plan.", [{ id: "t1", name: "write_todos", args: {} }]),
    tool("t1"),
    ai("a2", "Now I will search literature.", [{ id: "t2", name: "task", args: {} }]),
    tool("t2"),
    ai("a3", "Report saved.", [{ id: "t3", name: "write_file", args: { file_path: "/artifacts/final_report.md" } }]),
    tool("t3"),
    ai("a4", "Done. See the report."),
  ];
  const report = "## 结论\n\n选择 PC 应结合碎石图与群体分层检验 [1]。\n\n### Sources\n[1] Peer reviewed study: https://example.org/paper";

  it("shows only the question while internal work is running", () => {
    expect(buildAnswerRows(messages, report, true)).toMatchObject([
      { kind: "prose", role: "human", body: "群体结构 PCA 如何选主成分？" },
    ]);
  });

  it("delivers the report body with citations after completion, not tool narration", () => {
    const rows = buildAnswerRows(messages, report, false);
    expect(rows).toMatchObject([
      { kind: "prose", role: "human", body: "群体结构 PCA 如何选主成分？" },
      { kind: "prose", role: "ai", body: report },
    ]);
    expect(JSON.stringify(rows)).not.toMatch(/write_todos|write_file|Now I will|Report saved/);
  });

  it("uses a completed direct answer when no report was written", () => {
    expect(buildAnswerRows([human("h1", "Question"), ai("a1", "## Answer\nEvidence [1].")], undefined, false)).toMatchObject([
      { role: "human", body: "Question" }, { role: "ai", body: "## Answer\nEvidence [1]." },
    ]);
  });

  it("delivers a saved report even when the final assistant message is missing", () => {
    expect(buildAnswerRows(messages.slice(0, -1), report, false)).toMatchObject([
      { role: "human" }, { role: "ai", body: report },
    ]);
  });

  it("does not mistake a stopped tool call for a final answer", () => {
    expect(buildAnswerRows(messages.slice(0, 4), undefined, false)).toHaveLength(1);
  });

  it("keeps earlier completed answers in a multi-turn thread", () => {
    const turns = [human("h1", "First?"), ai("a1", "First answer [1]."), human("h2", "Second?"), ai("a2", "I'll look up evidence", [{ id: "s", name: "task", args: {} }])];
    expect(buildAnswerRows(turns, undefined, true)).toMatchObject([
      { role: "human", body: "First?" }, { role: "ai", body: "First answer [1]." },
      { role: "human", body: "Second?" },
    ]);
  });
});
