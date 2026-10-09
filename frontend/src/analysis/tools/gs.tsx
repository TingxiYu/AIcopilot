import { ExperimentOutlined } from "@ant-design/icons";
import { useGs } from "../../hooks/useGs";
import { GsPanel } from "../../components/gs/GsPanel";
import type { AnalysisTool } from "../types";

/**
 * Genomic selection — the one tool implemented so far.
 *
 * Everything tool-specific is confined to this file plus `lib/gs.ts`. The shell
 * knows it only as "a tool with id `gs`": its view goes into the generic Result
 * View tab, and its datasets and task entry are contributed to the shared tabs
 * rather than the tabs reaching in here.
 */
export const gsTool: AnalysisTool = {
  id: "gs",
  label: "GS 基因组预测",
  description: "上传基因型与表型数据，在本机浏览器内拟合 GBLUP 并给出 PCC / RMSE",
  icon: <ExperimentOutlined />,
  useRuntime: () => {
    const gs = useGs();
    const counts =
      gs.state.status === "ok"
        ? { samples: gs.state.result.metrics.nSamples, markers: gs.state.result.metrics.nMarkers }
        : null;

    const datasets = [
      ...(gs.sources.genotype
        ? [
            {
              key: "gs-genotype",
              name: gs.sources.genotype.name,
              kind: "基因型",
              // Known only after a successful fit; a zero here would read as
              // "zero samples" rather than "not measured yet".
              samples: counts ? String(counts.samples) : "—",
              markers: counts ? String(counts.markers) : "—",
              source: "本地上传",
            },
          ]
        : []),
      ...(gs.sources.phenotype
        ? [
            {
              key: "gs-phenotype",
              name: gs.sources.phenotype.name,
              kind: "表型",
              samples: counts ? String(counts.samples) : "—",
              markers: "—",
              source: "本地上传",
            },
          ]
        : []),
    ];

    const tasks =
      gs.state.status === "idle"
        ? []
        : [
            {
              key: "gs",
              label: "GS 基因组预测（本地计算）",
              status:
                gs.state.status === "ok"
                  ? ("done" as const)
                  : gs.state.status === "error"
                    ? ("failed" as const)
                    : ("running" as const),
            },
          ];

    return {
      hasResult: gs.state.status === "ok",
      datasets,
      tasks,
      view: (
        <GsPanel
          state={gs.state}
          sources={gs.sources}
          onFiles={gs.accept}
          onDemo={gs.runDemo}
          onReset={gs.reset}
        />
      ),
    };
  },
};
