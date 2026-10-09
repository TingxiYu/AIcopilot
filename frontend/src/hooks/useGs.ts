import { useCallback, useRef, useState } from "react";
import { demoCsvs, runGs, type GsResult } from "../lib/gs";

/**
 * State for the in-browser GS demo.
 *
 * This computes locally. The backend has no genotype/phenotype pipeline and no
 * prediction endpoint, and the project's constraints forbid adding one, so the
 * only honest way to make the "GS Prediction" surface real is to run the model
 * in the tab. Nothing here is sent anywhere.
 *
 * The fit is synchronous and can be slow for a large upload — the panel's copy
 * states the practical ceiling rather than pretending otherwise. Making it
 * asynchronous would buy a spinner on top of a still-blocked main thread, which
 * is not an improvement.
 */

export type GsUpload = { name: string; size: number };
export type GsKind = "genotype" | "phenotype";

export type GsState =
  | { status: "idle" }
  | { status: "ok"; result: Extract<GsResult, { ok: true }> }
  | { status: "error"; message: string };

export function useGs() {
  const [state, setState] = useState<GsState>({ status: "idle" });
  const [sources, setSources] = useState<{ genotype?: GsUpload; phenotype?: GsUpload }>({});

  // The CSV bodies are kept in a ref rather than in state: they can be
  // megabytes, they are never rendered, and putting them in state would re-render
  // the panel (and the Plotly chart) on every keystroke elsewhere.
  const bodies = useRef<{ genotype?: string; phenotype?: string }>({});

  const run = useCallback((genotypeCsv: string, phenotypeCsv: string) => {
    const result = runGs(genotypeCsv, phenotypeCsv);
    setState(
      result.ok ? { status: "ok", result } : { status: "error", message: result.error },
    );
  }, []);

  /**
   * Accept one of the two tables. The fit runs as soon as BOTH are present,
   * which is why the order the user picks them in does not matter and there is
   * no separate "run" button to forget to press.
   */
  const accept = useCallback(
    (kind: GsKind, csv: string, file: GsUpload) => {
      bodies.current = { ...bodies.current, [kind]: csv };
      setSources((current) => ({ ...current, [kind]: file }));

      const { genotype, phenotype } = bodies.current;
      if (genotype && phenotype) run(genotype, phenotype);
    },
    [run],
  );

  /** Load the built-in dataset. Used by the panel's "用示例数据运行" button. */
  const runDemo = useCallback(() => {
    const { genotypeCsv, phenotypeCsv } = demoCsvs();
    bodies.current = { genotype: genotypeCsv, phenotype: phenotypeCsv };
    setSources({
      genotype: { name: "示例基因型.csv", size: genotypeCsv.length },
      phenotype: { name: "示例表型.csv", size: phenotypeCsv.length },
    });
    run(genotypeCsv, phenotypeCsv);
  }, [run]);

  const reset = useCallback(() => {
    bodies.current = {};
    setState({ status: "idle" });
    setSources({});
  }, []);

  return { state, sources, accept, runDemo, reset };
}
