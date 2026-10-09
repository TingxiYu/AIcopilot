import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { buildArtifacts, type Artifact } from "../src/lib/artifacts";
import type { RawMessage, SubagentLike } from "../src/lib/rows";
import {
  projectResearchTask,
  type ResearchTaskProjectionInput,
  type TodoProjectionInput,
} from "../src/research-task/projection";

const human = (content: string): RawMessage => ({ id: "human-1", type: "human", content });
const ai = (
  toolCalls: Array<{ id: string; name: string; args?: unknown }> = [],
): RawMessage => ({ id: "ai-1", type: "ai", content: "", tool_calls: toolCalls });
const toolResult = (callId: string, content = "result"): RawMessage => ({
  id: `tool-${callId}`,
  type: "tool",
  content,
  tool_call_id: callId,
});

const artifact: Artifact = {
  path: "/final_report.md",
  name: "final_report.md",
  content: "# Result",
  bytes: 8,
  lines: 1,
};

function input(overrides: Partial<ResearchTaskProjectionInput> = {}): ResearchTaskProjectionInput {
  return {
    conversationId: "thread-42",
    messages: [],
    todos: [],
    subagentsByCallId: new Map(),
    artifacts: [],
    analysisTasks: [],
    isRunning: false,
    hasInterrupt: false,
    error: null,
    isConnectionError: false,
    ...overrides,
  };
}

describe("projectResearchTask status", () => {
  it("maps an empty thread to idle", () => {
    expect(projectResearchTask(input())).toMatchObject({
      id: "research-task:thread-42",
      conversationId: "thread-42",
      status: "idle",
      statusSource: "derived",
    });
  });

  it("maps an active stream to running", () => {
    expect(projectResearchTask(input({ isRunning: true })).status).toBe("running");
  });

  it("reports a failed subagent after its task tool returns an error", () => {
    const task = projectResearchTask(input({
      messages: [
        human("Research PCA"),
        ai([{ id: "task-1", name: "task", args: { subagent_type: "research-agent" } }]),
        { ...toolResult("task-1", "Subagent timed out"), status: "error" },
      ],
      subagentsByCallId: new Map([["task-1", { id: "task-1", status: "running", result: null }]]),
    }));
    expect(task.status).toBe("failed");
    expect(task.activities).toMatchObject([{ kind: "subagent", status: "failed" }]);
  });

  it("gives an interrupt precedence over an active stream", () => {
    expect(projectResearchTask(input({ hasInterrupt: true, isRunning: true })).status).toBe(
      "waiting_for_user",
    );
  });

  it("keeps completed todos unknown without authoritative success evidence", () => {
    const task = projectResearchTask(
      input({
        messages: [human("Run the analysis")],
        todos: [{ content: "Generate report", status: "completed" }],
      }),
    );
    expect(task.status).toBe("unknown");
  });

  it("keeps an inactive artifact-bearing task unknown without authoritative success", () => {
    const task = projectResearchTask(
      input({ messages: [human("Run the analysis")], artifacts: [artifact] }),
    );
    expect(task.status).toBe("unknown");
  });

  it("keeps an ambiguous stopped conversation unknown", () => {
    expect(projectResearchTask(input({ messages: [human("Run the analysis")] })).status).toBe(
      "unknown",
    );
  });

  it("keeps a generic stream error unknown because its source is ambiguous", () => {
    const task = projectResearchTask(
      input({ messages: [human("Run the analysis")], error: new Error("run failed") }),
    );
    expect(task.status).toBe("unknown");
  });

  it("does not mislabel a connectivity failure as execution failure", () => {
    const task = projectResearchTask(
      input({
        messages: [human("Run the analysis")],
        error: new Error("Failed to fetch"),
        isConnectionError: true,
      }),
    );
    expect(task.status).toBe("unknown");
  });
});

describe("projectResearchTask mappings", () => {
  it("maps todos to plan steps without turning them into tasks", () => {
    const task = projectResearchTask(
      input({
        messages: [human("Study drought tolerance")],
        todos: [
          { content: "Inspect inputs", status: "completed" },
          { content: "Run model", status: "in_progress" },
        ],
      }),
    );

    expect(task.question).toBe("Study drought tolerance");
    expect(task.title).toBe("Study drought tolerance");
    expect(task.steps).toEqual([
      {
        id: "compat:research-task:thread-42:todo:0:inspect%20inputs",
        label: "Inspect inputs",
        status: "completed",
        source: "todo",
      },
      {
        id: "compat:research-task:thread-42:todo:1:run%20model",
        label: "Run model",
        status: "running",
        source: "todo",
      },
    ]);
  });

  it("requires the caller to provide a non-empty conversation or ephemeral scope", () => {
    expect(() => projectResearchTask(input({ conversationId: "  " }))).toThrow(
      /conversationId.*ephemeral scope/i,
    );
  });

  it("maps a subagent to an activity using its call id", () => {
    const subagent: SubagentLike = {
      id: "call-1",
      status: "running",
      result: null,
      toolCall: { name: "task", args: { subagent_type: "research-agent" } },
      messages: [],
    };
    const task = projectResearchTask(
      input({
        messages: [
          human("Research rust resistance"),
          ai([{ id: "call-1", name: "task", args: { subagent_type: "research-agent" } }]),
        ],
        subagentsByCallId: new Map([["call-1", subagent]]),
        isRunning: true,
      }),
    );

    expect(task.activities).toContainEqual({
      id: "subagent:call-1",
      kind: "subagent",
      label: "research-agent",
      status: "running",
      sourceRef: "call-1",
    });
  });

  it("preserves a structured subagent execution error as failed", () => {
    const failed: SubagentLike = {
      id: "call-failed",
      status: "error",
      result: "worker failed",
      toolCall: { name: "task", args: { subagent_type: "research-agent" } },
      messages: [],
    };
    const task = projectResearchTask(
      input({
        messages: [
          human("Research rust resistance"),
          ai([{ id: "call-failed", name: "task" }]),
        ],
        subagentsByCallId: new Map([["call-failed", failed]]),
      }),
    );

    expect(task.activities[0]).toMatchObject({ status: "failed" });
    expect(task.status).toBe("failed");
  });

  it("maps structurally available tool calls without inventing step lineage", () => {
    const task = projectResearchTask(
      input({
        messages: [human("Search"), ai([{ id: "search-1", name: "tavily_search" }])],
        isRunning: true,
      }),
    );
    expect(task.activities).toContainEqual({
      id: "tool:search-1",
      kind: "tool",
      label: "tavily_search",
      status: "running",
      sourceRef: "search-1",
    });
  });

  it("maps a pending tool to unknown after the stream becomes inactive", () => {
    const task = projectResearchTask(
      input({ messages: [human("Search"), ai([{ id: "search-1", name: "tavily_search" }])] }),
    );
    expect(task.activities[0]).toMatchObject({ kind: "tool", status: "unknown" });
    expect(task.status).toBe("unknown");
  });

  it("does not interpret a generic tool result as successful scientific activity", () => {
    const task = projectResearchTask(
      input({
        messages: [
          human("Search"),
          ai([{ id: "search-1", name: "tavily_search" }]),
          toolResult("search-1", "results or an untyped error payload"),
        ],
      }),
    );
    expect(task.activities[0]).toMatchObject({ kind: "tool", status: "unknown" });
    expect(task.status).toBe("unknown");
  });

  it("keeps cancelled, stopped and unrecognized subagent states unknown", () => {
    for (const status of ["cancelled", "stopped", "mystery-state"]) {
      const subagent: SubagentLike = {
        id: "call-ambiguous",
        status,
        result: null,
        toolCall: { name: "task", args: { subagent_type: "research-agent" } },
        messages: [],
      };
      const task = projectResearchTask(
        input({
          messages: [human("Research"), ai([{ id: "call-ambiguous", name: "task" }])],
          subagentsByCallId: new Map([["call-ambiguous", subagent]]),
        }),
      );
      expect(task.activities[0]).toMatchObject({ kind: "subagent", status: "unknown" });
      expect(task.status).toBe("unknown");
    }
  });

  it("keeps existing artifact objects at thread scope", () => {
    const task = projectResearchTask(input({ artifacts: [artifact] }));
    expect(task.artifacts).toEqual([artifact]);
    expect(task.artifacts[0]).toBe(artifact);
  });

  it("does not treat an artifact as completion while structured work is unfinished", () => {
    const task = projectResearchTask(
      input({
        messages: [human("Build report")],
        todos: [{ content: "Validate results", status: "pending" }],
        artifacts: [artifact],
      }),
    );
    expect(task.status).toBe("unknown");
  });

  it("maps analysis task contributions as separately sourced steps", () => {
    const task = projectResearchTask(
      input({
        analysisTasks: [{ key: "gs-run", label: "GS prediction", status: "done" }],
      }),
    );
    expect(task.steps).toEqual([
      {
        id: "compat:research-task:thread-42:analysis:gs-run",
        label: "GS prediction",
        status: "completed",
        source: "analysis",
      },
    ]);
    expect(task.status).toBe("unknown");
  });

  it("scopes compatibility step identity and documents plan-edit instability in behavior", () => {
    const todo = (content: string): TodoProjectionInput => ({ content, status: "pending" });
    const original = projectResearchTask(
      input({ todos: [todo("Inspect inputs"), todo("Run model")] }),
    );
    const inserted = projectResearchTask(
      input({ todos: [todo("Confirm trait"), todo("Inspect inputs"), todo("Run model")] }),
    );
    const otherTask = projectResearchTask(
      input({ conversationId: "thread-99", todos: [todo("Inspect inputs"), todo("Run model")] }),
    );

    expect(original.steps[0].id).toBe(
      "compat:research-task:thread-42:todo:0:inspect%20inputs",
    );
    expect(inserted.steps[1].id).toBe(
      "compat:research-task:thread-42:todo:1:inspect%20inputs",
    );
    expect(inserted.steps[1].id).not.toBe(original.steps[0].id);
    expect(otherTask.steps[0].id).not.toBe(original.steps[0].id);
  });

  it("is deterministic for equivalent semantic input", () => {
    const first = projectResearchTask(
      input({
        messages: [human("Build a report")],
        todos: [{ content: "Write", status: "completed" }],
        artifacts: [artifact],
      }),
    );
    const second = projectResearchTask(
      input({
        messages: [human("Build a report")],
        todos: [{ content: "Write", status: "completed" }],
        artifacts: [{ ...artifact }],
      }),
    );
    expect(second).toEqual(first);
  });

  it("projects the existing captured real-run state conservatively", () => {
    const fixture = JSON.parse(
      readFileSync(new URL("./fixtures/research-run.json", import.meta.url), "utf8"),
    ) as {
      threadId: string;
      finalValues: {
        messages: RawMessage[];
        todos?: TodoProjectionInput[];
        files?: Record<string, unknown>;
      };
    };

    const task = projectResearchTask(
      input({
        conversationId: fixture.threadId,
        messages: fixture.finalValues.messages,
        todos: fixture.finalValues.todos ?? [],
        artifacts: buildArtifacts(fixture.finalValues.files),
      }),
    );

    expect(task.status).toBe("unknown");
    expect(task.artifacts.map((item) => item.name)).toEqual(["final_report.md"]);
    expect(task.activities.length).toBeGreaterThan(0);
    expect(task.activities.every((activity) => activity.status === "unknown")).toBe(true);
  });
});
