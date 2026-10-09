import { describe, expect, it } from "vitest";
import { buildRows, type RawMessage, type SubagentLike } from "../src/lib/rows";

const human = (text: string): RawMessage => ({ id: "h1", type: "human", content: text });

type RawToolCall = { id?: string; name?: string; args?: unknown };

const ai = (text: string, toolCalls: RawToolCall[] = []): RawMessage => ({
  id: `a-${text || "x"}-${toolCalls.length}`,
  type: "ai",
  content: text,
  tool_calls: toolCalls,
});

const toolMsg = (callId: string, content: string): RawMessage => ({
  id: `t-${callId}`,
  type: "tool",
  tool_call_id: callId,
  content,
});

const failedToolMsg = (callId: string, content: string): RawMessage => ({
  ...toolMsg(callId, content),
  status: "error",
});

const taskCall = (id: string, agent = "research-agent") => ({
  id,
  name: "task",
  args: { subagent_type: agent, description: "go research" },
});

const subagent = (callId: string, over: Partial<SubagentLike> = {}): SubagentLike => ({
  id: callId,
  status: "running",
  result: null,
  toolCall: { name: "task", args: { subagent_type: "research-agent" } },
  messages: [],
  ...over,
});

describe("buildRows", () => {
  it("collapses repeated adjacent streaming prose without changing the saved message", () => {
    const sentence = "I'll research PCA-based population structure analysis in crops. Let me start by planning the work and saving the request.";
    const source = ai(sentence.repeat(4), [{ id: "todos", name: "write_todos", args: {} }]);
    const rows = buildRows([source]);
    expect(rows).toMatchObject([{ kind: "prose", body: sentence }, { kind: "tool", name: "write_todos" }]);
    expect(source.content).toBe(sentence.repeat(4));
    expect(buildRows([ai(sentence + sentence.slice(0, 48), [{ id: "todos", name: "write_todos", args: {} }])])[0]).toMatchObject({
      kind: "prose", body: sentence,
    });
  });

  it("does not merge a final answer with an earlier matching status", () => {
    const sentence = "I'll research PCA-based population structure analysis in crops.";
    const status = ai(sentence, [{ id: "todo-1", name: "write_todos", args: {} }]);
    expect(buildRows([status, { ...status, id: "a-second", tool_calls: [] }])).toHaveLength(3);
  });

  it("preserves intentional repetition in a final answer", () => {
    const paragraph = "A cited conclusion about population structure. ";
    expect(buildRows([ai(paragraph.repeat(3))])[0]).toMatchObject({
      kind: "prose", body: paragraph.repeat(3).trim(),
    });
  });

  it("keeps distinct prose and user text intact", () => {
    const text = "PCA can separate populations. PCA can reveal relatedness.";
    expect(buildRows([human(text), ai(text)])).toMatchObject([
      { kind: "prose", role: "human", body: text },
      { kind: "prose", role: "ai", body: text },
    ]);
  });

  it("marks a timed-out task as failed and a stopped unresolved task as unknown", () => {
    const messages = [ai("", [taskCall("c1")]), failedToolMsg("c1", "Subagent timed out")];
    expect(buildRows(messages, new Map([["c1", subagent("c1")]]))[0]).toMatchObject({
      kind: "subagent", status: "failed", result: "Subagent timed out",
    });
    expect(buildRows([ai("", [taskCall("c2")])], new Map(), false)[0]).toMatchObject({
      kind: "tool", status: "unknown",
    });
  });
  it("renders human and ai prose", () => {
    const rows = buildRows([human("hi"), ai("hello")]);
    expect(rows.map((r) => r.kind)).toEqual(["prose", "prose"]);
  });

  it("pairs a tool call with its result and marks it done", () => {
    const rows = buildRows([
      ai("", [{ id: "c1", name: "tavily_search", args: { query: "gp" } }]),
      toolMsg("c1", "3 results"),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      kind: "tool",
      name: "tavily_search",
      result: "3 results",
      status: "done",
    });
  });

  it("leaves a tool call pending until its result arrives", () => {
    const rows = buildRows([ai("", [{ id: "c1", name: "tavily_search", args: {} }])]);
    expect(rows[0]).toMatchObject({ status: "pending", result: null });
  });

  it("renders a task call as a subagent row when a matching subagent exists", () => {
    const rows = buildRows(
      [human("research gp"), ai("delegating", [taskCall("c1")])],
      new Map([["c1", subagent("c1")]]),
    );
    expect(rows.map((r) => r.kind)).toEqual(["prose", "prose", "subagent"]);
    expect(rows[2]).toMatchObject({
      kind: "subagent",
      callId: "c1",
      agent: "research-agent",
      status: "running",
    });
  });

  it("falls back to a plain tool row when no subagent stream was provided", () => {
    // Deliberate degradation: if the backend never emits namespaced subgraph
    // events, the hand-off must still be visible as an ordinary tool card.
    const rows = buildRows([ai("", [taskCall("c1")])]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: "tool", name: "task", callId: "c1" });
  });

  it("projects the subagent's own messages into the card", () => {
    const inner: RawMessage[] = [
      ai("", [{ id: "s1", name: "tavily_search", args: { query: "gp" } }]),
      toolMsg("s1", "5 results"),
      ai("enough information gathered"),
    ];
    const rows = buildRows(
      [ai("", [taskCall("c1")])],
      new Map([["c1", subagent("c1", { messages: inner })]]),
    );
    const card = rows[0];
    expect(card.kind).toBe("subagent");
    if (card.kind === "subagent") {
      expect(card.inner.map((r) => r.kind)).toEqual(["tool", "prose"]);
      expect(card.inner[0]).toMatchObject({ name: "tavily_search", result: "5 results" });
    }
  });

  it("marks the card done and keeps the result once the task call resolves", () => {
    const rows = buildRows(
      [
        ai("delegating", [taskCall("c1")]),
        toolMsg("c1", "findings from the subagent"),
      ],
      new Map([["c1", subagent("c1", { status: "running" })]]),
    );
    const card = rows.find((r) => r.kind === "subagent");
    expect(card).toMatchObject({ status: "done", result: "findings from the subagent" });
  });

  it("reads the agent name from the tool call when the stream omits it", () => {
    const rows = buildRows(
      [ai("", [taskCall("c1", "market-researcher")])],
      new Map([["c1", subagent("c1", { toolCall: undefined })]]),
    );
    expect(rows[0]).toMatchObject({ kind: "subagent", agent: "market-researcher" });
  });
});
