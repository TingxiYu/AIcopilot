import { Table, Tag } from "antd";
import type { DatasetRow } from "../../analysis/types";

/** Colour the kind tag by a stable hash, so a new tool's kind is never unstyled. */
const KIND_COLORS = ["blue", "cyan", "geekblue", "purple", "magenta"];
function colorFor(kind: string): string {
  let hash = 0;
  for (let i = 0; i < kind.length; i += 1) hash = (hash * 31 + kind.charCodeAt(i)) % 997;
  return KIND_COLORS[hash % KIND_COLORS.length];
}

/**
 * The datasets this session knows about.
 *
 * Two sources feed it, and neither is named here: the analysis tools
 * contribute their own inputs, and the agent's file artifacts are appended by
 * the caller. A future tool's datasets appear without touching this file.
 *
 * A tool that cannot measure a column contributes "—" rather than a zero — a
 * zero would read as "measured, and it was zero".
 */
export function DatasetTab({ rows }: { rows: DatasetRow[] }) {
  return (
    <div className="flex flex-col gap-2 overflow-auto p-3">
      <Table<DatasetRow>
        size="small"
        pagination={false}
        dataSource={rows}
        locale={{ emptyText: "还没有数据集。可在 Result View 中上传或运行分析工具。" }}
        columns={[
          { title: "数据集", dataIndex: "name", key: "name", ellipsis: true },
          {
            title: "类型",
            dataIndex: "kind",
            key: "kind",
            width: 88,
            render: (kind: string) => <Tag color={colorFor(kind)}>{kind}</Tag>,
          },
          { title: "样本数", dataIndex: "samples", key: "samples", width: 72 },
          { title: "SNP 数", dataIndex: "markers", key: "markers", width: 72 },
          { title: "来源", dataIndex: "source", key: "source", width: 80 },
        ]}
      />
    </div>
  );
}
