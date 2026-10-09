import { Descriptions, Empty, Tag } from "antd";
import type { Citation } from "../../lib/citations";
import type { ResearchTaskPresentation } from "../../research-task";

/** Honest task/session context while no persistent Project entity exists. */
export function ProjectContextTab({
  task,
  messageCount,
  citations,
}: {
  task: ResearchTaskPresentation;
  messageCount: number;
  citations: Citation[];
}) {
  const report = task.artifacts.find((artifact) => artifact.name === "final_report.md");

  return (
    <div className="flex flex-col gap-4 overflow-auto p-3">
      <Descriptions
        column={1}
        size="small"
        bordered
        items={[
          { key: "title", label: "任务", children: task.title },
          {
            key: "status",
            label: "状态",
            children: <Tag color={task.status.color}>{task.status.label}</Tag>,
          },
          ...(task.question
            ? [{ key: "question", label: "研究问题", children: task.question }]
            : []),
          { key: "messages", label: "消息数", children: String(messageCount) },
          { key: "artifacts", label: "工件数", children: String(task.artifacts.length) },
          { key: "citations", label: "引用来源", children: String(citations.length) },
        ]}
      />

      {report ? (
        <section>
          <h3 className="mb-1 text-xs" style={{ color: "var(--muted)" }}>
            当前报告
          </h3>
          <p className="text-sm">{report.path}</p>
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            {report.lines} 行 · {report.bytes} 字节
          </p>
        </section>
      ) : (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="还没有报告。发起一次研究后，这里会显示它的概况。"
        />
      )}
    </div>
  );
}
