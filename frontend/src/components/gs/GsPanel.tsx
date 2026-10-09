import { Alert, Button, Statistic, Tag, Upload } from "antd";
import { InboxOutlined } from "@ant-design/icons";
import type { GsState, GsUpload } from "../../hooks/useGs";
import { ScatterPlot } from "./ScatterPlot";

/**
 * The "GS Prediction Result" tab.
 *
 * Everything shown here is computed in the browser from files the user selects;
 * nothing is uploaded and no backend is involved. The panel says so explicitly,
 * because a metrics table sitting next to a research agent's output would
 * otherwise read as something the agent produced.
 */
export function GsPanel({
  state,
  sources,
  onFiles,
  onDemo,
  onReset,
}: {
  state: GsState;
  sources: { genotype?: GsUpload; phenotype?: GsUpload };
  onFiles: (kind: "genotype" | "phenotype", csv: string, file: GsUpload) => void;
  onDemo: () => void;
  onReset: () => void;
}) {
  const readInto = (kind: "genotype" | "phenotype") => async (file: File) => {
    onFiles(kind, await file.text(), { name: file.name, size: file.size });
    // `false` stops antd from uploading anything. This component only borrows
    // the drop zone's affordances; there is no server to send it to.
    return false;
  };

  return (
    <div className="flex min-h-0 flex-col gap-3 overflow-auto p-3">
      <Alert
        type="info"
        showIcon
        message="本地演示"
        description="基因组预测在本机浏览器内计算（GBLUP），不会上传任何数据，也与研究 agent 的输出无关。建议样本数 ≤ 200、标记数 ≤ 5000。"
      />

      <div className="flex gap-2">
        <div className="flex-1">
          <Upload.Dragger
            accept=".csv,.txt"
            maxCount={1}
            showUploadList={false}
            beforeUpload={readInto("genotype")}
          >
            <p className="ant-upload-drag-icon">
              <InboxOutlined />
            </p>
            <p className="text-xs">基因型 CSV</p>
            <p className="text-xs" style={{ color: "var(--muted)" }}>
              第一列样本编号，其余列为标记
            </p>
          </Upload.Dragger>
        </div>
        <div className="flex-1">
          <Upload.Dragger
            accept=".csv,.txt"
            maxCount={1}
            showUploadList={false}
            beforeUpload={readInto("phenotype")}
          >
            <p className="ant-upload-drag-icon">
              <InboxOutlined />
            </p>
            <p className="text-xs">表型 CSV</p>
            <p className="text-xs" style={{ color: "var(--muted)" }}>
              第一列样本编号，另有一列表型值
            </p>
          </Upload.Dragger>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {sources.genotype ? <Tag color="blue">基因型：{sources.genotype.name}</Tag> : null}
        {sources.phenotype ? <Tag color="cyan">表型：{sources.phenotype.name}</Tag> : null}
      </div>

      <div className="flex gap-2">
        <Button onClick={onDemo}>用示例数据运行</Button>
        {state.status !== "idle" ? <Button onClick={onReset}>清除结果</Button> : null}
      </div>

      {state.status === "error" ? (
        <Alert type="error" showIcon message="无法完成预测" description={state.message} />
      ) : null}

      {state.status === "ok" ? (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Statistic title="PCC（测试集）" value={state.result.metrics.pcc} precision={3} />
            <Statistic title="RMSE（测试集）" value={state.result.metrics.rmse} precision={3} />
          </div>
          <div className="flex flex-wrap gap-1 text-xs" style={{ color: "var(--muted)" }}>
            <Tag>样本 {state.result.metrics.nSamples}</Tag>
            <Tag>标记 {state.result.metrics.nMarkers}</Tag>
            <Tag>训练 {state.result.metrics.nTrain}</Tag>
            <Tag>测试 {state.result.metrics.nTest}</Tag>
            <Tag>每 5 个留出 1 个</Tag>
          </div>
          <ScatterPlot points={state.result.points} />
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            指标只在留出的测试集上计算 —— 训练集上的拟合值会明显更好看，但那是模型见过的数据，不是预测精度。
          </p>
        </>
      ) : null}
    </div>
  );
}
