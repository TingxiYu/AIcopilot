import { describe, expect, it } from "vitest";
import { buildArtifacts } from "../src/lib/artifacts";

const files = {
  "/final_report.md": { content: "# Report\n\nBody [1] https://a.com", encoding: "utf-8" },
  "/research_request.md": { content: "Find out about GP.", encoding: "utf-8" },
};

describe("buildArtifacts", () => {
  it("reads content from the FileData wrapper", () => {
    const out = buildArtifacts(files);
    expect(out.find((a) => a.name === "final_report.md")?.content).toContain("# Report");
  });

  it("keeps the internal saved request out of user-facing artifacts", () => {
    expect(buildArtifacts(files).map((a) => a.name)).toEqual(["final_report.md"]);
  });

  it("computes line counts", () => {
    const report = buildArtifacts(files).find((a) => a.name === "final_report.md")!;
    expect(report.lines).toBe(3);
  });

  it("counts bytes, not characters, and counts them concretely", () => {
    // Assert a literal, not a recomputation of the implementation's own
    // expression — `bytes: content.length` must fail this test.
    const ascii = buildArtifacts(files).find((a) => a.name === "final_report.md")!;
    expect(ascii.content.length).toBe(32);
    expect(ascii.bytes).toBe(32);

    const cjk = buildArtifacts({ "/a.md": { content: "中文", encoding: "utf-8" } });
    expect(cjk[0].content.length).toBe(2);
    expect(cjk[0].bytes).toBe(6); // 3 bytes per CJK codepoint in UTF-8
  });

  it("tolerates missing, empty and malformed state", () => {
    expect(buildArtifacts(undefined)).toEqual([]);
    expect(buildArtifacts({})).toEqual([]);
    expect(buildArtifacts({ "/x.md": "bare string" })).toEqual([]);
  });

  it("skips binary files", () => {
    const out = buildArtifacts({
      "/img.png": { content: "AAAA", encoding: "base64" },
      "/a.md": { content: "hi", encoding: "utf-8" },
    });
    expect(out.map((a) => a.name)).toEqual(["a.md"]);
  });

  it("hides deepagents' spilled tool results", () => {
    const out = buildArtifacts({
      "/large_tool_results/call_01_abc": { content: "x".repeat(1000), encoding: "utf-8" },
      "/final_report.md": { content: "# Report", encoding: "utf-8" },
    });
    expect(out.map((a) => a.name)).toEqual(["final_report.md"]);
  });

  it("still shows an unknown artifact in a normal path", () => {
    const out = buildArtifacts({
      "/charts/summary.csv": { content: "a,b", encoding: "utf-8" },
    });
    expect(out.map((a) => a.name)).toEqual(["summary.csv"]);
  });
});
