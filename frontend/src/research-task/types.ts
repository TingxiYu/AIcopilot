import type { Artifact } from "../lib/artifacts";

export type ResearchTaskStatus =
  | "idle"
  | "running"
  | "waiting_for_user"
  | "completed"
  | "failed"
  | "unknown";

export type ResearchStepStatus = "pending" | "running" | "completed" | "failed" | "unknown";

export type ResearchStep = {
  id: string;
  label: string;
  status: ResearchStepStatus;
  source: "todo" | "analysis";
};

export type ResearchActivity = {
  id: string;
  kind: "tool" | "subagent";
  label: string;
  status: "running" | "completed" | "failed" | "unknown";
  sourceRef: string;
};

/**
 * Frontend-only read model for M1.
 *
 * A ResearchTask is currently scoped to one conversation for compatibility.
 * It does not own or persist any of the source values projected into it.
 */
export type ResearchTask = {
  id: string;
  conversationId: string;
  title: string;
  question?: string;
  status: ResearchTaskStatus;
  statusSource: "derived";
  steps: ResearchStep[];
  activities: ResearchActivity[];
  artifacts: Artifact[];
};
