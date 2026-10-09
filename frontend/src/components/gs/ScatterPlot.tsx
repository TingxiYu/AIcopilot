import { useEffect, useRef, useState } from "react";
import type { GsPoint } from "../../lib/gs";

/**
 * Observed vs predicted scatter, on the held-out samples.
 *
 * Plotly is loaded with a DYNAMIC import that only fires once this component
 * actually mounts with data. That is not a micro-optimisation: the bundle is
 * ~1.2 MB, and a static import would pull it into every jsdom test run and into
 * the main chunk that the app needs before it can paint anything. Components
 * that never receive a GS result never fetch it.
 *
 * The diagonal is drawn from the data's own range rather than a fixed 0–1, so
 * it stays meaningful for a trait measured in any units — the demo's phenotype
 * is on an arbitrary scale around 36.
 */
export function ScatterPlot({ points }: { points: GsPoint[] }) {
  const root = useRef<HTMLDivElement | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const element = root.current;
    if (!element || points.length === 0) return;

    let cancelled = false;

    void (async () => {
      try {
        const Plotly = (await import("plotly.js-basic-dist-min")).default;
        if (cancelled) return;

        const observed = points.map((point) => point.observed);
        const predicted = points.map((point) => point.predicted);
        const lo = Math.min(...observed, ...predicted);
        const hi = Math.max(...observed, ...predicted);

        const bySet = (set: GsPoint["set"]) =>
          points
            .map((point, index) => ({ point, index }))
            .filter(({ point }) => point.set === set);

        const series = (set: GsPoint["set"], name: string, symbol: string) => {
          const rows = bySet(set);
          return {
            x: rows.map(({ point }) => point.observed),
            y: rows.map(({ point }) => point.predicted),
            mode: "markers",
            type: "scatter",
            name,
            marker: { symbol, size: 8, opacity: 0.85 },
          };
        };

        await Plotly.react(
          element,
          [
            series("test", "测试集（用于评估）", "circle"),
            series("train", "训练集", "diamond-open"),
            {
              x: [lo, hi],
              y: [lo, hi],
              mode: "lines",
              type: "scatter",
              name: "理想预测线",
              line: { dash: "dash", width: 1, color: "#8c8c8c" },
              hoverinfo: "skip",
            },
          ],
          {
            margin: { l: 48, r: 12, t: 8, b: 40 },
            showlegend: true,
            legend: { orientation: "h", y: -0.2, font: { size: 10 } },
            xaxis: { title: { text: "观测值", font: { size: 11 } }, zeroline: false },
            yaxis: { title: { text: "预测值", font: { size: 11 } }, zeroline: false },
            paper_bgcolor: "transparent",
            plot_bgcolor: "transparent",
            font: { size: 11 },
            dragmode: false,
          },
          { displayModeBar: false, responsive: true },
        );
      } catch {
        // A failed chart must not take the panel with it -- the metrics above it
        // are the substance and are already rendered by the time this runs.
        if (!cancelled) setFailed(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [points]);

  // Plotly owns the DOM inside `root`; purging on unmount avoids leaking the
  // internal graph div and its listeners when the tab is switched away.
  useEffect(() => {
    const element = root.current;
    return () => {
      if (!element) return;
      void import("plotly.js-basic-dist-min")
        .then((module) => module.default.purge(element))
        .catch(() => undefined);
    };
  }, []);

  if (failed) {
    return (
      <p className="p-3 text-xs" style={{ color: "var(--muted)" }}>
        图表加载失败，指标仍然有效。
      </p>
    );
  }

  return <div ref={root} style={{ width: "100%", height: 320 }} data-testid="gs-scatter" />;
}
