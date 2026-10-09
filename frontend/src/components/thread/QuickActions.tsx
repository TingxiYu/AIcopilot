import { Button } from "antd";
import { BarChartOutlined, CloudUploadOutlined, FileSearchOutlined } from "@ant-design/icons";

/**
 * The three shortcuts under the composer on an empty thread.
 *
 * Each one does something real rather than being a decorative chip: the first
 * two land on the GS tab (where the upload control is), and the third opens the
 * report tab. None of them sends anything to the backend.
 */
export function QuickActions({
  onUploadData,
  onRunGs,
  onViewResults,
  blocked = false,
}: {
  onUploadData: () => void;
  onRunGs: () => void;
  onViewResults: () => void;
  blocked?: boolean;
}) {
  return (
    <div className="flex flex-wrap justify-center gap-2 px-4 pb-3">
      {/* Every icon button carries an explicit aria-label. antd renders an icon
          as `role="img" aria-label="cloud-upload"`, and that label is folded
          into the parent button's accessible name — without this, a screen
          reader announces "cloud-upload 上传数据" instead of "上传数据". */}
      <Button
        size="small"
        icon={<CloudUploadOutlined />}
        onClick={onUploadData}
        disabled={blocked}
        aria-label="上传数据"
      >
        上传数据
      </Button>
      <Button size="small" icon={<BarChartOutlined />} onClick={onRunGs} aria-label="GS 预测">
        GS 预测
      </Button>
      <Button size="small" icon={<FileSearchOutlined />} onClick={onViewResults} aria-label="查看结果">
        查看结果
      </Button>
    </div>
  );
}
