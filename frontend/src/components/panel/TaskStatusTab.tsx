import { Tag } from "antd";
import type { ResearchTaskPresentation } from "../../research-task";

/** Public status only. Planning and tool activity remain private runtime data. */
export function TaskStatusTab({ task }: { task: ResearchTaskPresentation }) {
  return (
    <div className="flex items-center justify-between p-3">
      <span className="text-sm font-medium">研究任务</span>
      <Tag color={task.status.color}>{task.status.label}</Tag>
    </div>
  );
}
