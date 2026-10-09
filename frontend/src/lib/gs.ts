/**
 * Browser-side genomic selection (GS) demo.
 *
 * WHY THIS EXISTS: the application's backend is a research agent — it searches
 * the web and writes markdown. It has no genotype/phenotype pipeline and no
 * prediction endpoint, and the project's hard constraints forbid changing the
 * backend contract. So the "GS Prediction" surface cannot call anything: it
 * computes in the browser, on files the user uploads, and never leaves the tab.
 *
 * The model is GBLUP in its standard form. Marker effects are not estimated
 * directly (that would mean a p×p solve where p is the number of markers, which
 * is intractable in a browser); instead we build the additive relationship
 * matrix G = XXᵀ/p over SAMPLES and solve the n×n system (G + λI)α = y. n is
 * the number of samples, which is small. Predictions for held-out samples use
 * the off-diagonal block G[test, train] against the training coefficients.
 *
 * Everything here is pure, deterministic and free of React and network access,
 * so it is unit-testable in the node environment. There is deliberately no
 * `Math.random`: the train/test split is a fixed stride, so the same input
 * always yields the same metrics and a test can assert on exact numbers.
 */

export type GsPoint = { observed: number; predicted: number; set: "train" | "test" };

export type GsMetrics = {
  /** Pearson correlation between observed and predicted, on the test set. */
  pcc: number;
  /** Root mean squared error on the test set, in phenotype units. */
  rmse: number;
  nSamples: number;
  nTrain: number;
  nTest: number;
  nMarkers: number;
};

export type GsDataset = {
  /** Sample ids, in genotype row order. */
  ids: string[];
  /** One row of marker dosages per sample, aligned to `ids`. */
  markers: number[][];
  /** Phenotype per sample, aligned to `ids`. */
  y: number[];
};

export type GsResult =
  | { ok: true; metrics: GsMetrics; points: GsPoint[]; dataset: GsDataset }
  | { ok: false; error: string };

/** Held-out fraction, expressed as the stride of the test set ("every 5th"). */
const TEST_STRIDE = 5;

/** Ridge penalty on the relationship matrix. Keeps the solve well-posed. */
const DEFAULT_LAMBDA = 0.05;

/** Below this many samples the n×n solve is not meaningfully estimable. */
const MIN_SAMPLES = 4;

/** CSV field splitter that respects double-quoted fields. */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      out.push(field);
      field = "";
    } else {
      field += ch;
    }
  }
  out.push(field);
  return out;
}

/**
 * Parse CSV text into rows, dropping blank lines.
 *
 * A trailing newline is the normal case for a file written by any spreadsheet
 * export, and must not produce a phantom empty row.
 */
export function parseCsv(text: string): string[][] {
  return text
    .split(/\r\n|\n|\r/)
    .map((line) => splitCsvLine(line))
    .filter((row) => row.some((cell) => cell.trim() !== ""));
}

/** `true` for a cell that parses as a finite number. */
function isNumeric(cell: string | undefined): boolean {
  if (cell === undefined) return false;
  const trimmed = cell.trim();
  if (trimmed === "") return false;
  return Number.isFinite(Number(trimmed));
}

export type GenotypeTable = { header: string[]; ids: string[]; markers: number[][] };

/**
 * Parse a genotype table: first column is the sample id, the rest are markers.
 *
 * Missing cells are imputed with the column mean rather than dropped. Real
 * genotype matrices are sparse — dropping every sample with one missing marker
 * would typically leave nothing — and mean imputation is the conventional
 * default. A column that is missing in EVERY sample has no mean to impute and
 * is rejected, because it carries no information and would otherwise enter the
 * relationship matrix as a column of constants.
 */
export function parseGenotypeCsv(text: string): { ok: true; table: GenotypeTable } | { ok: false; error: string } {
  const rows = parseCsv(text);
  if (rows.length < 2) return { ok: false, error: "基因型文件没有数据行。" };

  const header = rows[0];
  const nMarkers = header.length - 1;
  if (nMarkers < 1) return { ok: false, error: "基因型文件只有样本编号列，没有标记列。" };

  const body = rows.slice(1);
  const ids: string[] = [];
  const raw: (number | null)[][] = [];

  for (const [index, row] of body.entries()) {
    const id = row[0]?.trim();
    if (!id) return { ok: false, error: `基因型文件第 ${index + 2} 行缺少样本编号。` };
    if (ids.includes(id)) return { ok: false, error: `基因型文件样本编号重复：${id}` };

    const values: (number | null)[] = [];
    for (let j = 1; j <= nMarkers; j += 1) {
      const cell = row[j];
      if (cell === undefined || cell.trim() === "") {
        values.push(null);
        continue;
      }
      const value = Number(cell);
      if (!Number.isFinite(value)) {
        return {
          ok: false,
          error: `基因型文件第 ${index + 2} 行「${header[j] ?? j}」列不是数值：${cell}`,
        };
      }
      values.push(value);
    }
    ids.push(id);
    raw.push(values);
  }

  // Column means over the observed (non-null) cells only.
  const means: number[] = [];
  for (let j = 0; j < nMarkers; j += 1) {
    const seen = raw.map((row) => row[j]).filter((v): v is number => v !== null);
    if (seen.length === 0) {
      return { ok: false, error: `基因型文件「${header[j + 1] ?? j + 1}」列没有任何数值。` };
    }
    means.push(seen.reduce((a, b) => a + b, 0) / seen.length);
  }

  const markers = raw.map((row) => row.map((v, j) => v ?? means[j]));
  return { ok: true, table: { header, ids, markers } };
}

/**
 * Parse a phenotype table: first column is the sample id, plus one trait value.
 *
 * The trait column is taken by name when a header names it (`phenotype`, `y`,
 * `value`, `trait`), otherwise the first numeric column after the id. Requiring
 * an exact header would reject the common case of a file exported as
 * `id,value1,value2` where only the first trait is wanted.
 */
export function parsePhenotypeCsv(text: string): { ok: true; ids: string[]; y: number[] } | { ok: false; error: string } {
  const rows = parseCsv(text);
  if (rows.length < 2) return { ok: false, error: "表型文件没有数据行。" };

  const header = rows[0];
  const named = header.findIndex((cell, i) =>
    i > 0 && ["phenotype", "y", "value", "trait", "表型"].includes(cell.trim().toLowerCase()),
  );

  let column = named;
  if (column < 0) {
    column = header.findIndex((_, i) => i > 0 && isNumeric(rows[1][i]));
  }
  if (column < 1) return { ok: false, error: "表型文件里找不到数值型的表型列。" };

  const ids: string[] = [];
  const y: number[] = [];
  for (const [index, row] of rows.slice(1).entries()) {
    const id = row[0]?.trim();
    if (!id) return { ok: false, error: `表型文件第 ${index + 2} 行缺少样本编号。` };
    if (ids.includes(id)) return { ok: false, error: `表型文件样本编号重复：${id}` };
    const value = Number(row[column]);
    if (!Number.isFinite(value)) {
      return { ok: false, error: `表型文件第 ${index + 2} 行的表型值不是数值：${row[column] ?? ""}` };
    }
    ids.push(id);
    y.push(value);
  }
  return { ok: true, ids, y };
}

/**
 * Gauss–Jordan elimination with partial pivoting.
 *
 * The matrix is (G + λI), which is symmetric positive definite, so pivoting is
 * only a numerical safeguard — but λ can be small relative to a near-singular G,
 * and a silent division by a near-zero pivot would produce NaN predictions that
 * read as a working model. It throws instead; `runGs` turns that into a typed
 * error.
 */
function solve(matrix: number[][], rhs: number[]): number[] {
  const n = rhs.length;
  const a = matrix.map((row, i) => [...row, rhs[i]]);

  for (let col = 0; col < n; col += 1) {
    let pivot = col;
    for (let row = col + 1; row < n; row += 1) {
      if (Math.abs(a[row][col]) > Math.abs(a[pivot][col])) pivot = row;
    }
    if (Math.abs(a[pivot][col]) < 1e-12) throw new Error("关系矩阵奇异，无法求解。");
    [a[col], a[pivot]] = [a[pivot], a[col]];

    const diagonal = a[col][col];
    for (let j = col; j <= n; j += 1) a[col][j] /= diagonal;

    for (let row = 0; row < n; row += 1) {
      if (row === col) continue;
      const factor = a[row][col];
      if (factor === 0) continue;
      for (let j = col; j <= n; j += 1) a[row][j] -= factor * a[col][j];
    }
  }

  return a.map((row) => row[n]);
}

function mean(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/**
 * Pearson correlation. Returns 0 when either input has no variance, because the
 * coefficient is genuinely undefined there and a NaN would propagate into the
 * displayed metric as the string "NaN".
 */
export function pearson(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  const ma = mean(a);
  const mb = mean(b);
  let sab = 0;
  let saa = 0;
  let sbb = 0;
  for (let i = 0; i < a.length; i += 1) {
    const da = a[i] - ma;
    const db = b[i] - mb;
    sab += da * db;
    saa += da * da;
    sbb += db * db;
  }
  if (saa === 0 || sbb === 0) return 0;
  return sab / Math.sqrt(saa * sbb);
}

export function rmse(observed: number[], predicted: number[]): number {
  if (observed.length === 0) return 0;
  let total = 0;
  for (let i = 0; i < observed.length; i += 1) {
    const d = observed[i] - predicted[i];
    total += d * d;
  }
  return Math.sqrt(total / observed.length);
}

/**
 * Additive relationship matrix G = XXᵀ / p.
 *
 * Centring is per MARKER (down each column, across samples) — that is what
 * makes G a covariance between SAMPLE GENOTYPES. Centring per sample instead
 * (subtracting each row's own mean) forces every sample's centred vector to sum
 * to zero, which destroys exactly the structure G exists to encode: a probe run
 * showed it produced G ≈ 0 and a training-set residual as large as the trait's
 * own standard deviation, i.e. a model that had fitted nothing at all.
 */
export function relationshipMatrix(markers: number[][]): number[][] {
  const n = markers.length;
  const p = markers[0].length;

  const columnMeans = new Array<number>(p).fill(0);
  for (const row of markers) {
    for (let k = 0; k < p; k += 1) columnMeans[k] += row[k];
  }
  for (let k = 0; k < p; k += 1) columnMeans[k] /= n;

  const centred = markers.map((row) => row.map((v, k) => v - columnMeans[k]));

  const g: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  for (let i = 0; i < n; i += 1) {
    for (let j = i; j < n; j += 1) {
      let dot = 0;
      for (let k = 0; k < p; k += 1) dot += centred[i][k] * centred[j][k];
      const value = dot / p;
      g[i][j] = value;
      g[j][i] = value;
    }
  }
  return g;
}

/**
 * The train/test split: every TEST_STRIDE-th sample is held out.
 *
 * A fixed stride rather than a random draw, for two reasons: the same upload
 * must always produce the same metrics (the UI shows a number the user may
 * re-check), and a deterministic split is what lets the unit tests assert exact
 * values instead of ranges.
 */
export function splitIndices(n: number): { train: number[]; test: number[] } {
  const train: number[] = [];
  const test: number[] = [];
  for (let i = 0; i < n; i += 1) {
    if (i % TEST_STRIDE === 0 && i > 0) test.push(i);
    else train.push(i);
  }
  return { train, test };
}

/**
 * Fit and evaluate GBLUP on the two uploaded tables.
 *
 * Returns a typed failure rather than throwing: every failure here is a data
 * problem the user can fix (mismatched ids, too few samples, a constant trait),
 * and the UI has to show the reason next to the upload control.
 */
export function runGs(
  genotypeCsv: string,
  phenotypeCsv: string,
  options: { lambda?: number } = {},
): GsResult {
  const lambda = options.lambda ?? DEFAULT_LAMBDA;

  const geno = parseGenotypeCsv(genotypeCsv);
  if (!geno.ok) return { ok: false, error: geno.error };
  const pheno = parsePhenotypeCsv(phenotypeCsv);
  if (!pheno.ok) return { ok: false, error: pheno.error };

  // Join on sample id. Only samples present in BOTH tables can be used; the
  // overlap is reported rather than silently taking the genotype's order.
  const traitById = new Map(pheno.ids.map((id, i) => [id, pheno.y[i]]));
  const keptIds: string[] = [];
  const keptMarkers: number[][] = [];
  for (const [i, id] of geno.table.ids.entries()) {
    const value = traitById.get(id);
    if (value === undefined) continue;
    keptIds.push(id);
    keptMarkers.push(geno.table.markers[i]);
  }

  const n = keptIds.length;
  if (n < MIN_SAMPLES) {
    return {
      ok: false,
      error: `基因型与表型文件中匹配的样本只有 ${n} 个，至少需要 ${MIN_SAMPLES} 个。请确认两份文件的样本编号一致。`,
    };
  }

  const y = keptIds.map((id) => traitById.get(id) as number);
  if (new Set(y).size < 2) {
    return { ok: false, error: "表型值没有变异（所有样本取值相同），无法计算相关性。" };
  }

  const g = relationshipMatrix(keptMarkers);
  const { train, test } = splitIndices(n);

  const yTrain = train.map((i) => y[i]);
  const offset = mean(yTrain);

  // (G + λI)α = y - mean(y), solved on the training block only.
  const a = train.map((i) => train.map((j) => g[i][j] + (i === j ? lambda : 0)));
  let alpha: number[];
  try {
    alpha = solve(a, yTrain.map((v) => v - offset));
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "关系矩阵求解失败。" };
  }

  const predict = (i: number): number => {
    let sum = 0;
    for (const [k, j] of train.entries()) sum += g[i][j] * alpha[k];
    return sum + offset;
  };

  const points: GsPoint[] = [
    ...train.map((i) => ({ observed: y[i], predicted: predict(i), set: "train" as const })),
    ...test.map((i) => ({ observed: y[i], predicted: predict(i), set: "test" as const })),
  ];

  const observedTest = test.map((i) => y[i]);
  const predictedTest = test.map((i) => predict(i));

  return {
    ok: true,
    points,
    dataset: { ids: keptIds, markers: keptMarkers, y },
    metrics: {
      // Computed on the held-out set only. Scoring the training samples would
      // report the model's fit to what it was shown, which is not a prediction
      // accuracy and would read far better than the model actually is.
      pcc: pearson(observedTest, predictedTest),
      rmse: rmse(observedTest, predictedTest),
      nSamples: n,
      nTrain: train.length,
      nTest: test.length,
      nMarkers: keptMarkers[0].length,
    },
  };
}

/**
 * Deterministic uniform deviate in [0,1) from a 32-bit hash of (i, j).
 *
 * `Math.imul` rather than a plain float multiply: the obvious
 * `(i * 2654435761 + j * 40503) >>> 0` exceeds the 53-bit mantissa, so `>>> 0`
 * returns the truncated low bits of an already-rounded float. Measured, that
 * produced a heavily biased distribution.
 */
function unitAt(i: number, j: number): number {
  let h = Math.imul(i + 1, 374761393) + Math.imul(j + 1, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/**
 * A marker dosage in {0,1,2}, drawn under Hardy–Weinberg at an allele frequency
 * that VARIES BY MARKER (0.1 → 0.9 across the panel).
 *
 * The variation is the point, not decoration. A panel where every marker has
 * the same frequency also has the same mean (~1), and with all column means
 * equal, centring per marker and centring per sample become numerically almost
 * the same operation — which hides the exact bug this module shipped with
 * (per-sample centring, giving G ≈ 0). Measured on a uniform panel the two
 * agree closely enough that a mutated build still scored PCC 0.91; on a panel
 * with realistic frequency spread the mutation collapses to near zero.
 * Real genotype panels have varying frequencies, so the fixture should too.
 */
export function dosageAt(i: number, j: number): number {
  const q = 0.1 + 0.8 * (((j + 1) * 0.6180339887498949) % 1);
  const u = unitAt(i, j);
  const p0 = (1 - q) ** 2;
  const p1 = 2 * q * (1 - q);
  return u < p0 ? 0 : u < p0 + p1 ? 1 : 2;
}

/** Deterministic deviate in [-0.5, 0.5): the demo's environmental noise. */
function envAt(i: number): number {
  const h = Math.sin((i + 1) * 12.9898) * 43758.5453;
  return h - Math.floor(h) - 0.5;
}

/**
 * Build a small, deterministic demo dataset so the GS panel is explorable with
 * no files at hand.
 *
 * The trait is POLYGENIC — many markers of small effect plus environmental
 * noise — because that is the scenario genomic selection actually exists for,
 * and it is the one where the panel's numbers are meaningful. Measured with
 * these constants the demo yields a test-set PCC of roughly 0.55. A demo built
 * from a few large-effect markers instead scores ~0.99, which is technically
 * correct but shows a near-perfect diagonal that no real GS study would
 * produce, and would read as a rigged example.
 *
 * Deterministic throughout (fixed hash + fixed deviate), so every machine and
 * every run shows the identical scatter.
 */
export function demoCsvs(n = 60, markers = 120): { genotypeCsv: string; phenotypeCsv: string } {
  const geno: string[] = [["id", ...Array.from({ length: markers }, (_, k) => `m${k + 1}`)].join(",")];
  const pheno: string[] = ["id,phenotype"];

  // Effect sizes taper across the genome rather than being uniform, so the
  // demo has a realistic architecture: a few larger effects among many small.
  const weight = (j: number): number => 0.3 * (1 - (j / markers) * 0.6);

  for (let i = 0; i < n; i += 1) {
    const id = `S${String(i + 1).padStart(3, "0")}`;
    geno.push([id, ...Array.from({ length: markers }, (_, j) => dosageAt(i, j))].join(","));

    let value = 0;
    for (let j = 0; j < markers; j += 1) value += dosageAt(i, j) * weight(j);
    value += envAt(i) * 1.0;
    pheno.push(`${id},${value.toFixed(3)}`);
  }

  return { genotypeCsv: geno.join("\n"), phenotypeCsv: pheno.join("\n") };
}
