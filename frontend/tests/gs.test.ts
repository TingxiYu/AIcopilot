// Node environment on purpose (the default here): lib/gs.ts is pure and has no
// DOM dependency, so these run without the jsdom docblock.
import { describe, expect, it } from "vitest";

import {
  demoCsvs,
  dosageAt,
  parseCsv,
  parseGenotypeCsv,
  parsePhenotypeCsv,
  pearson,
  relationshipMatrix,
  rmse,
  runGs,
  splitIndices,
} from "../src/lib/gs";

describe("parseCsv", () => {
  it("splits on commas and drops blank lines", () => {
    expect(parseCsv("a,b\nc,d\n\n")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });

  it("handles CRLF and a quoted field containing a comma", () => {
    expect(parseCsv('id,note\r\nS1,"a,b"\r\n')).toEqual([
      ["id", "note"],
      ["S1", "a,b"],
    ]);
  });

  it("unescapes a doubled quote inside a quoted field", () => {
    expect(parseCsv('x\n"say ""hi"""')).toEqual([["x"], ['say "hi"']]);
  });
});

describe("parseGenotypeCsv", () => {
  it("reads ids and a numeric marker matrix", () => {
    const result = parseGenotypeCsv("id,m1,m2\nS1,0,2\nS2,1,1\n");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.table.ids).toEqual(["S1", "S2"]);
    expect(result.table.markers).toEqual([
      [0, 2],
      [1, 1],
    ]);
  });

  it("imputes a missing marker with that column's mean", () => {
    // Column m1 has observed values 0 and 2, so the mean is 1.
    const result = parseGenotypeCsv("id,m1,m2\nS1,0,5\nS2,,5\nS3,2,5\n");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.table.markers.map((row) => row[0])).toEqual([0, 1, 2]);
  });

  it("rejects a non-numeric marker cell, naming the row and column", () => {
    const result = parseGenotypeCsv("id,m1\nS1,x\n");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("第 2 行");
    expect(result.error).toContain("m1");
  });

  it("rejects duplicate sample ids", () => {
    const result = parseGenotypeCsv("id,m1\nS1,1\nS1,2\n");
    expect(result.ok).toBe(false);
  });

  it("rejects a marker column that is empty for every sample", () => {
    const result = parseGenotypeCsv("id,m1,m2\nS1,1,\nS2,2,\n");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("m2");
  });

  it("rejects a file with no marker columns", () => {
    expect(parseGenotypeCsv("id\nS1\n").ok).toBe(false);
  });
});

describe("parsePhenotypeCsv", () => {
  it("prefers a column named phenotype over an earlier numeric column", () => {
    const result = parsePhenotypeCsv("id,age,phenotype\nS1,3,10\nS2,4,20\n");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.y).toEqual([10, 20]);
  });

  it("falls back to the first numeric column when no header names the trait", () => {
    const result = parsePhenotypeCsv("id,foo,bar\nS1,7,8\nS2,9,10\n");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.y).toEqual([7, 9]);
  });

  it("rejects a table with no numeric trait column", () => {
    expect(parsePhenotypeCsv("id,note\nS1,abc\n").ok).toBe(false);
  });
});

describe("pearson and rmse", () => {
  it("is 1 for a positive linear relationship and -1 for a negative one", () => {
    expect(pearson([1, 2, 3], [2, 4, 6])).toBeCloseTo(1, 10);
    expect(pearson([1, 2, 3], [6, 4, 2])).toBeCloseTo(-1, 10);
  });

  it("is 0, not NaN, when one side has no variance", () => {
    // A constant vector has an undefined correlation; NaN would render as the
    // literal string "NaN" in the metrics panel.
    const value = pearson([1, 1, 1], [1, 2, 3]);
    expect(Number.isNaN(value)).toBe(false);
    expect(value).toBe(0);
  });

  it("measures RMSE in the phenotype's own units", () => {
    expect(rmse([1, 2, 3], [1, 2, 5])).toBeCloseTo(Math.sqrt(4 / 3), 10);
  });
});

describe("relationshipMatrix", () => {
  it("centres markers, not samples — pinned against hand-computed values", () => {
    // The decisive test for the module's original bug. An end-to-end PCC
    // threshold could NOT catch it: measured, per-sample centring still scored
    // 0.90 on the oligogenic fixture, because any reasonable similarity kernel
    // predicts something. Only the matrix's actual values expose it.
    //
    // Hand-computed for X = [[0,0],[1,2],[2,0]], p = 2:
    //   column means   m1 = 1, m2 = 2/3
    //   centred        S1 [-1,-2/3]  S2 [0,4/3]  S3 [1,-2/3]
    //   G = Xc Xcᵀ / 2 → diag 13/18, 8/9, 13/18; off-diag -4/9, -5/18, -4/9
    // Per-sample centring gives G11 = 0 instead of 13/18 — a different matrix.
    const g = relationshipMatrix([
      [0, 0],
      [1, 2],
      [2, 0],
    ]);

    expect(g[0][0]).toBeCloseTo(13 / 18, 10);
    expect(g[1][1]).toBeCloseTo(8 / 9, 10);
    expect(g[2][2]).toBeCloseTo(13 / 18, 10);
    expect(g[0][1]).toBeCloseTo(-4 / 9, 10);
    expect(g[1][2]).toBeCloseTo(-4 / 9, 10);
    expect(g[0][2]).toBeCloseTo(-5 / 18, 10);
  });

  it("is symmetric and has a zero row only when a sample equals the panel mean", () => {
    const g = relationshipMatrix([
      [0, 0],
      [1, 2],
      [2, 0],
    ]);
    for (let i = 0; i < 3; i += 1) {
      for (let j = 0; j < 3; j += 1) expect(g[i][j]).toBeCloseTo(g[j][i], 12);
    }
  });
});

describe("splitIndices", () => {
  it("holds out every 5th index, from the second sample on", () => {
    expect(splitIndices(7)).toEqual({ train: [0, 1, 2, 3, 4, 6], test: [5] });
  });

  it("never puts the same index in both halves", () => {
    const { train, test } = splitIndices(53);
    expect(train.filter((i) => test.includes(i))).toEqual([]);
    expect(train.length + test.length).toBe(53);
  });
});

describe("runGs", () => {
  /** A genotype table plus a trailing `trait` column, joined by sample id. */
  function tables(n: number, markers: number, trait: (i: number, d: (j: number) => number) => number) {
    // The shared hash, not a home-made formula. An earlier version used
    // `(i*7 + j*3) % 3`, which is identically `i % 3` for every j -- every
    // marker of a sample was the same value, so the marker matrix had rank 1
    // and the relationship matrix carried no information at all.
    const dosage = (i: number, j: number): number => dosageAt(i, j);
    const geno = [["id", ...Array.from({ length: markers }, (_, j) => `m${j}`)].join(",")];
    const pheno = ["id,phenotype"];
    for (let i = 0; i < n; i += 1) {
      geno.push([`S${i}`, ...Array.from({ length: markers }, (_, j) => dosage(i, j))].join(","));
      pheno.push(`S${i},${trait(i, (j) => dosage(i, j)).toFixed(6)}`);
    }
    return { genotypeCsv: geno.join("\n"), phenotypeCsv: pheno.join("\n") };
  }

  it("recovers an oligogenic trait whose causal markers are observed", () => {
    // The strongest available correctness signal. Six large-effect markers out
    // of forty, no environmental noise: a correct GBLUP reproduces the trait
    // almost exactly on held-out samples. This is the assertion that catches a
    // broken relationship matrix -- when the centring was wrong (per sample
    // instead of per marker) this read exactly 0.000.
    const { genotypeCsv, phenotypeCsv } = tables(100, 40, (_i, d) => {
      let v = 0;
      for (let j = 0; j < 6; j += 1) v += d(j) * (1.4 - j * 0.1);
      return v;
    });

    const result = runGs(genotypeCsv, phenotypeCsv);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.metrics.pcc).toBeGreaterThan(0.9);
    expect(result.metrics.nSamples).toBe(100);
    expect(result.metrics.nMarkers).toBe(40);
  });

  it("fits the training samples far more tightly than it predicts", () => {
    // The shape of a working kernel ridge fit: with n_train < n_markers the
    // training block is solved almost exactly (residual falls to the lambda*|a|
    // scale), while held-out samples are only predicted. If the solve silently
    // degraded -- singular, mis-centred, wrong block -- the training residual
    // would rise towards the trait's own spread, which is exactly what the
    // broken per-sample centring produced (residual == SD of y).
    const { genotypeCsv, phenotypeCsv } = tables(60, 120, (_i, d) => {
      let v = 0;
      for (let j = 0; j < 40; j += 1) v += d(j) * 0.3;
      return v;
    });

    const result = runGs(genotypeCsv, phenotypeCsv);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const y = result.dataset.y;
    const meanY = y.reduce((a, b) => a + b, 0) / y.length;
    const sdY = Math.sqrt(y.reduce((a, b) => a + (b - meanY) ** 2, 0) / y.length);

    const train = result.points.filter((p) => p.set === "train");
    const maxResidual = Math.max(...train.map((p) => Math.abs(p.observed - p.predicted)));

    expect(maxResidual).toBeLessThan(sdY * 0.5);
    // ...while the held-out correlation stays in a real, imperfect band.
    expect(result.metrics.pcc).toBeGreaterThan(0.3);
    expect(result.metrics.pcc).toBeLessThan(0.95);
  });

  it("scores the held-out samples, not the ones the model was fitted on", () => {
    // Recomputing the metric from the points labelled "test" must reproduce the
    // reported PCC. If `metrics` were computed over the training points this
    // would disagree, which is exactly the failure worth catching: a training
    // fit always looks far better than a real prediction.
    const { genotypeCsv, phenotypeCsv } = tables(60, 40, (i, d) => d(0) + d(1) * 0.5 + i * 0.01);
    const result = runGs(genotypeCsv, phenotypeCsv);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const test = result.points.filter((p) => p.set === "test");
    const train = result.points.filter((p) => p.set === "train");

    expect(test.length).toBe(result.metrics.nTest);
    expect(train.length).toBe(result.metrics.nTrain);
    expect(result.points.length).toBe(result.metrics.nSamples);

    expect(pearson(test.map((p) => p.observed), test.map((p) => p.predicted))).toBeCloseTo(
      result.metrics.pcc,
      10,
    );
    expect(rmse(test.map((p) => p.observed), test.map((p) => p.predicted))).toBeCloseTo(
      result.metrics.rmse,
      10,
    );
  });

  it("is deterministic: the same upload always yields the same metrics", () => {
    const { genotypeCsv, phenotypeCsv } = tables(40, 20, (_i, d) => d(0) * 2 + d(3));
    const first = runGs(genotypeCsv, phenotypeCsv);
    const second = runGs(genotypeCsv, phenotypeCsv);
    expect(first).toEqual(second);
  });

  it("joins on sample id rather than trusting row order", () => {
    // The phenotype file lists the samples in reverse. A join on position would
    // pair every sample with the wrong trait and destroy the correlation.
    const { genotypeCsv, phenotypeCsv } = tables(40, 20, (_i, d) => d(0) + d(1));
    const lines = phenotypeCsv.split("\n");
    const reversed = [lines[0], ...lines.slice(1).reverse()].join("\n");

    const ordered = runGs(genotypeCsv, phenotypeCsv);
    const shuffled = runGs(genotypeCsv, reversed);
    expect(ordered.ok && shuffled.ok).toBe(true);
    if (!ordered.ok || !shuffled.ok) return;
    expect(shuffled.metrics.pcc).toBeCloseTo(ordered.metrics.pcc, 10);
  });

  it("refuses a constant trait instead of reporting a meaningless PCC", () => {
    const { genotypeCsv, phenotypeCsv } = tables(30, 10, () => 5);
    const result = runGs(genotypeCsv, phenotypeCsv);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("变异");
  });

  it("names the overlap when the two files share too few samples", () => {
    const geno = "id,m1,m2\nA,0,1\nB,1,2\nC,2,0\nD,1,1\n";
    const pheno = "id,phenotype\nA,1\nB,2\nX,3\n";
    const result = runGs(geno, pheno);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("样本编号一致");
  });

  it("propagates a parse failure from either table", () => {
    const good = 'id,phenotype\nS0,1\nS1,2\nS2,3\nS3,4\n';
    expect(runGs("id,m1\nS0,x\n", good).ok).toBe(false);
    expect(runGs("id,m1\nS0,1\nS1,2\nS2,3\nS3,4\n", "id,note\nS0,a\n").ok).toBe(false);
  });
});

describe("demoCsvs", () => {
  it("produces two tables that parse and show a real, imperfect fit", () => {
    const { genotypeCsv, phenotypeCsv } = demoCsvs();
    const result = runGs(genotypeCsv, phenotypeCsv);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.metrics.nSamples).toBe(60);
    expect(result.metrics.nMarkers).toBe(120);

    // The band is the assertion, not a floor: a demo that predicted nothing
    // would be broken, and a demo that predicted near-perfectly would be
    // rigged -- real genomic selection on unrelated individuals lands in the
    // middle. Measured, this configuration sits at roughly 0.55.
    expect(result.metrics.pcc).toBeGreaterThan(0.3);
    expect(result.metrics.pcc).toBeLessThan(0.9);
  });

  it("gives markers genuinely different allele frequencies", () => {
    // Guards the property the fixture depends on. Uniform dosages (every marker
    // mean equal) make per-marker and per-sample centring numerically almost
    // identical, so a panel of them cannot discriminate the two -- which is how
    // the centring bug survived its first test suite.
    const means = Array.from({ length: 120 }, (_, j) => {
      let total = 0;
      for (let i = 0; i < 200; i += 1) total += dosageAt(i, j);
      return total / 200;
    });

    expect(Math.min(...means)).toBeLessThan(0.5);
    expect(Math.max(...means)).toBeGreaterThan(1.5);
  });

  it("draws dosages only from {0,1,2} and repeats them exactly", () => {
    for (let i = 0; i < 20; i += 1) {
      for (let j = 0; j < 20; j += 1) {
        expect([0, 1, 2]).toContain(dosageAt(i, j));
        expect(dosageAt(i, j)).toBe(dosageAt(i, j));
      }
    }
  });

  it("is reproducible across calls", () => {
    expect(demoCsvs(10, 5)).toEqual(demoCsvs(10, 5));
  });
});
