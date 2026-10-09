import type { Artifact } from "../lib/artifacts";
import {
  buildRows,
  messageText,
  type RawMessage,
  type Row,
  type SubagentLike,
} from "../lib/rows";
import { threadTitle } from "../lib/title";
import type { ResearchActivity, ResearchStep, ResearchTask, ResearchTaskStatus } from "./types";

export type TodoProjectionInput = {
  content: string;
  status: "pending" | "in_progress" | "completed";
};

/** Structural subset of Analysis Registry's existing TaskEntry contribution. */
export type AnalysisTaskProjectionInput = {
  key: string;
  label: string;
  status: "pending" | "running" | "done" | "failed";
};

/**
 * Values supplied by the future M2 integration seam after useThreadStream and
 * useAnalysis have produced their existing stabilized/projection values.
 */
export type ResearchTaskProjectionInput = {
  conversationId: string;
  messages: RawMessage[];
  todos: TodoProjectionInput[];
  subagentsByCallId: Map<string, SubagentLike>;
  artifacts: Artifact[];
  analysisTasks: AnalysisTaskProjectionInput[];
  isRunning: boolean;
  hasInterrupt: boolean;
  /** Observed stream error only; it is not authoritative scientific failure evidence. */
  error: unknown;
  /** Connectivity classification is retained as context, never mapped to task failure. */
  isConnectionError: boolean;
};

function normalizeCompatibilityText(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * Compatibility identity only: deterministic for the same semantic snapshot,
 * but deliberately not promised durable across plan edits. Authoritative task
 * and step IDs must eventually come from the backend task manifest.
 */
function todoSteps(taskId: string, todos: TodoProjectionInput[]): ResearchStep[] {
  return todos.map((todo, index) => ({
    id: `compat:${taskId}:todo:${index}:${encodeURIComponent(normalizeCompatibilityText(todo.content))}`,
    label: todo.content,
    status:
      todo.status === "in_progress"
        ? "running"
        : todo.status === "completed"
          ? "completed"
          : "pending",
    source: "todo",
  }));
}

function analysisSteps(taskId: string, tasks: AnalysisTaskProjectionInput[]): ResearchStep[] {
  return tasks.map((task) => ({
    id: `compat:${taskId}:analysis:${encodeURIComponent(task.key)}`,
    label: task.label,
    status: task.status === "done" ? "completed" : task.status,
    source: "analysis",
  }));
}

function subagentStatus(
  callId: string,
  subagents: Map<string, SubagentLike>,
  isRunning: boolean,
): ResearchActivity["status"] {
  const status = subagents.get(callId)?.status.trim().toLowerCase();
  if (status === "error" || status === "failed" || status === "failure") return "failed";
  if (status && ["completed", "complete", "success", "done"].includes(status)) {
    return "completed";
  }
  if (status && ["running", "in_progress", "pending", "queued", "starting"].includes(status)) {
    return isRunning ? "running" : "unknown";
  }
  // cancelled/stopped and unrecognized states carry no supported success or
  // failure meaning in the current compatibility contract.
  return "unknown";
}

function activitiesFromRows(
  rows: Row[],
  subagents: Map<string, SubagentLike>,
  isRunning: boolean,
  parent = "",
): ResearchActivity[] {
  const activities: ResearchActivity[] = [];

  for (const row of rows) {
    if (row.kind === "prose") continue;

    const path = parent ? `${parent}/${row.callId}` : row.callId;
    if (row.kind === "subagent") {
      activities.push({
        id: `subagent:${path}`,
        kind: "subagent",
        label: row.agent,
        status: row.status === "failed" ? "failed" : subagentStatus(row.callId, subagents, isRunning),
        sourceRef: row.callId,
      });
      activities.push(...activitiesFromRows(row.inner, subagents, isRunning, path));
      continue;
    }

    activities.push({
      id: `tool:${path}`,
      kind: "tool",
      label: row.name,
      // ToolRow.done proves only that a result message arrived. The current
      // contract does not distinguish successful scientific execution from an
      // error payload, so only an unsettled call on an active stream is known
      // to be running; every other tool outcome remains unknown.
      status: row.status === "failed" ? "failed" : row.status === "pending" && isRunning ? "running" : "unknown",
      sourceRef: row.callId,
    });
  }

  return activities;
}

function deriveStatus(
  input: ResearchTaskProjectionInput,
  question: string | undefined,
  steps: ResearchStep[],
  activities: ResearchActivity[],
): ResearchTaskStatus {
  // HITL is the most actionable state even if the underlying run remains open.
  if (input.hasInterrupt) return "waiting_for_user";
  if (input.isRunning) return "running";

  // Generic stream errors cannot currently distinguish infrastructure failure
  // from scientific execution failure. A structured subagent failure can.
  if (activities.some((activity) => activity.status === "failed")) {
    return "failed";
  }

  const meaningful = Boolean(
    question || steps.length > 0 || activities.length > 0 || input.artifacts.length > 0,
  );
  if (!meaningful) return "idle";

  // "completed" is reserved for authoritative structured success evidence.
  // The current frontend compatibility projection must not infer successful
  // ResearchTask completion from todos, artifacts or local analyses. Until a
  // backend manifest supplies that evidence, an inactive meaningful task is
  // intentionally unknown.
  return "unknown";
}

/**
 * Pure deterministic projection. It owns no state and performs no SDK, React,
 * metadata, persistence, or network operations.
 */
export function projectResearchTask(input: ResearchTaskProjectionInput): ResearchTask {
  const conversationId = input.conversationId.trim();
  if (!conversationId) {
    throw new Error(
      "ResearchTaskProjection requires a non-empty conversationId or caller-provided ephemeral scope.",
    );
  }
  const taskId = `research-task:${encodeURIComponent(conversationId)}`;
  const firstHuman = input.messages.find((message) => message.type === "human");
  const questionText = firstHuman ? messageText(firstHuman.content).trim() : "";
  const question = questionText || undefined;
  const steps = [
    ...todoSteps(taskId, input.todos),
    ...analysisSteps(taskId, input.analysisTasks),
  ];
  const activities = activitiesFromRows(
    buildRows(input.messages, input.subagentsByCallId, input.isRunning),
    input.subagentsByCallId,
    input.isRunning,
  );

  return {
    id: taskId,
    conversationId,
    title: threadTitle(input.messages),
    ...(question ? { question } : {}),
    status: deriveStatus(input, question, steps, activities),
    statusSource: "derived",
    steps,
    activities,
    // Preserve the existing Artifact projection unchanged; only the container
    // is copied so the read model cannot mutate the caller's array.
    artifacts: [...input.artifacts],
  };
}

export type { ResearchActivity, ResearchStep, ResearchTask, ResearchTaskStatus } from "./types";
