import { Button, Card, Tag } from "antd";
import { FileTextOutlined } from "@ant-design/icons";
import type { ToolRow } from "../../lib/rows";

/**
 * A result card: a `write_file` tool call whose target is a real artifact.
 *
 * The middleware streams the report body past in the conversation, but the
 * artifact itself lives in the virtual filesystem and is only rendered by the
 * preview panel. Without this card the report is effectively invisible in the
 * conversation — the user sees the tool call, not the deliverable. The button
 * opens the preview panel at the report tab.
 *
 * Styled as a Card rather than a `ToolCallCard` because it is a different kind
 * of thing: a tool call is process, this is output.
 */
export function ArtifactCard({
  row,
  path,
  onOpen,
}: {
  row: ToolRow;
  path: string;
  onOpen: (path: string, tab: "report") => void;
}) {
  const name = path.split("/").filter(Boolean).pop() ?? path;
  const isReport = name === "final_report.md";

  return (
    <Card
      size="small"
      className="rounded-lg"
      styles={{ body: { padding: 12 } }}
      title={
        <span className="flex items-center gap-2 text-sm">
          <FileTextOutlined />
          <span className="font-mono">{name}</span>
          {isReport ? <Tag color="green">研究报告</Tag> : <Tag>工件</Tag>}
        </span>
      }
      extra={
        <Button
          type="primary"
          size="small"
          onClick={() => onOpen(path, "report")}
          aria-label={`在右侧面板查看 ${name}`}
        >
          在右侧面板查看
        </Button>
      }
    >
      <p className="m-0 font-mono text-xs" style={{ color: "var(--muted)" }}>
        {path}
        {row.status === "done" ? " · 已写入" : row.status === "failed" ? " · 写入失败" : row.status === "unknown" ? " · 状态未确认" : " · 写入中…"}
      </p>
    </Card>
  );
}
