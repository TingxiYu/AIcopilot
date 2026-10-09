import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { parseCitations } from "../src/lib/citations";

// The real report shape, taken verbatim from the research prompt in
// src/aicopilot/prompts.py: the title comes FIRST and the URL LAST.
const REAL_SHAPE = [
  "Genomic prediction uses markers [1] to estimate breeding values.",
  "",
  "### Sources",
  "[1] Genomic Selection in Plant Breeding: https://www.cd-genomics.com/agri/resource-gen",
  "[2] Polygenic Risk Score — NHGRI Glossary: https://www.genome.gov/genetics-glossary/Polygenic-Risk-Score",
].join("\n");

describe("parseCitations", () => {
  it("extracts sources written in the format the prompt mandates", () => {
    expect(parseCitations(REAL_SHAPE)).toEqual([
      {
        n: 1,
        url: "https://www.cd-genomics.com/agri/resource-gen",
        title: "Genomic Selection in Plant Breeding",
      },
      {
        n: 2,
        url: "https://www.genome.gov/genetics-glossary/Polygenic-Risk-Score",
        title: "Polygenic Risk Score — NHGRI Glossary",
      },
    ]);
  });

  it("ignores inline markers that carry no URL", () => {
    // `[1]` mid-sentence is a reference marker, not a source line.
    expect(parseCitations("Some finding [1]. Another insight [2].")).toEqual([]);
  });

  it("returns sources in numeric order even when listed out of order", () => {
    const md = [
      "[3] Third source: https://c.example/x",
      "[1] First source: https://a.example/y",
      "[2] Second source: https://b.example/z",
    ].join("\n");
    expect(parseCitations(md).map((c) => c.n)).toEqual([1, 2, 3]);
  });

  it("keeps the first URL for a repeated number", () => {
    const md = "[1] First: https://first.example/a\n[1] Second: https://second.example/b";
    const got = parseCitations(md);
    expect(got).toHaveLength(1);
    expect(got[0].url).toBe("https://first.example/a");
  });

  it("falls back to the hostname when a source line has no title", () => {
    expect(parseCitations("[7] : https://bare.example/page")[0].title).toBe("bare.example");
  });

  it("strips trailing punctuation from the URL", () => {
    expect(parseCitations("[3] Trailing: https://a.example/b.")[0].url).toBe("https://a.example/b");
  });

  it("parses the real captured report", () => {
    // Guards the whole class of defect this test exists for: an earlier
    // revision of this parser matched `[n] URL` and returned ZERO citations
    // against a real report, while its unit tests passed against the same
    // invented format it encoded.
    const fixture = JSON.parse(
      readFileSync(new URL("./fixtures/research-run.json", import.meta.url), "utf8"),
    );
    const report: string = fixture.finalValues.files["/final_report.md"].content;
    const citations = parseCitations(report);
    expect(citations.length).toBeGreaterThanOrEqual(5);
    for (const citation of citations) {
      expect(citation.url).toMatch(/^https?:\/\//);
      expect(citation.title.length).toBeGreaterThan(0);
    }
    expect(citations.map((c) => c.n)).toEqual([...citations].map((c) => c.n).sort((a, b) => a - b));
  });
});
