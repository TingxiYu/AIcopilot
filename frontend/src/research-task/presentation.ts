import type { Artifact } from "../lib/artifacts";
import type {
  ResearchActivity,
  ResearchStep,
  ResearchStepStatus,
  ResearchTask,
  ResearchTaskStatus,
} from "./types";

export type StatusPresentation<Code extends string> = {
  code: Code;
  label: string;
  color: "default" | "blue" | "gold" | "green" | "red";
};

export type ResearchStepPresentation = Omit<ResearchStep, "status"> & {
  status: StatusPresentation<ResearchStepStatus>;
};

export type ResearchActivityPresentation = Omit<ResearchActivity, "status"> & {
  status: StatusPresentation<ResearchStepStatus>;
};

export type ResearchTaskPresentation = {
  id: string;
  title: string;
  question?: string;
  status: StatusPresentation<ResearchTaskStatus>;
  plan: {
    items: ResearchStepPresentation[];
    completed: number;
    total: number;
    percent: number;
  };
  activities: ResearchActivityPresentation[];
  artifacts: Artifact[];
};

function taskStatus(status: ResearchTaskStatus): StatusPresentation<ResearchTaskStatus> {
  switch (status) {
    case "idle":
      return { code: status, label: "尚未运行", color: "default" };
    case "running":
      return { code: status, label: "正在运行", color: "blue" };
    case "waiting_for_user":
      return { code: status, label: "等待用户", color: "gold" };
    case "completed":
      return { code: status, label: "已完成", color: "green" };
    case "failed":
      return { code: status, label: "失败", color: "red" };
    case "unknown":
      return { code: status, label: "状态未确认", color: "default" };
  }
}

function itemStatus(status: ResearchStepStatus): StatusPresentation<ResearchStepStatus> {
  switch (status) {
    case "pending":
      return { code: status, label: "待办", color: "default" };
    case "running":
      return { code: status, label: "进行中", color: "blue" };
    case "completed":
      return { code: status, label: "已完成", color: "green" };
    case "failed":
      return { code: status, label: "失败", color: "red" };
    case "unknown":
      return { code: status, label: "状态未确认", color: "default" };
  }
}

/**
 * Format an existing ResearchTask for workspace consumers without deriving a
 * second lifecycle. Status labels are direct translations of projected state.
 */
export function buildTaskPresentation(task: ResearchTask): ResearchTaskPresentation {
  const items = task.steps.map((step) => ({ ...step, status: itemStatus(step.status) }));
  const completed = task.steps.filter((step) => step.status === "completed").length;
  const total = task.steps.length;

  return {
    id: task.id,
    title: task.title,
    ...(task.question ? { question: task.question } : {}),
    status: taskStatus(task.status),
    plan: {
      items,
      completed,
      total,
      percent: total === 0 ? 0 : Math.round((completed / total) * 100),
    },
    activities: task.activities.map((activity) => ({
      ...activity,
      status: itemStatus(activity.status),
    })),
    artifacts: [...task.artifacts],
  };
}
