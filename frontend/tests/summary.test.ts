// Node environment: lib/summary.ts is pure and renders nothing.
import { describe, expect, it } from "vitest";

import { MAX_TITLE_LENGTH, autoTitle } from "../src/lib/summary";
import type { RawMessage } from "../src/lib/rows";

function human(content: string): RawMessage {
  return { id: "h1", type: "human", content };
}

describe("autoTitle", () => {
  it("prefers the report's own heading over the opening question", () => {
    // The heading is the agent's summary of the whole run; the question is only
    // the request. The heading is the better title when both exist.
    expect(
      autoTitle({
        messages: [human("请帮我研究一下玉米产量相关的问题")],
        report: "# 玉米 GS 基因组预测\n\n## 方法\n正文",
      }),
    ).toBe("玉米 GS 基因组预测");
  });

  it("strips request framing when there is no report", () => {
    expect(autoTitle({ messages: [human("请帮我研究一下玉米GS基因组预测")] })).toBe(
      "玉米GS基因组预测",
    );
  });

  it("strips a plain 研究一下 opener", () => {
    expect(autoTitle({ messages: [human("研究一下群体PCA分析")] })).toBe("群体PCA分析");
  });

  it("removes trailing question punctuation", () => {
    expect(autoTitle({ messages: [human("解读一下GWAS结果？")] })).toBe("GWAS结果");
  });

  it("falls back to the raw text rather than returning nothing", () => {
    // Stripping can eat a title made entirely of framing words. An empty title
    // is worse than a redundant prefix, so the original survives.
    expect(autoTitle({ messages: [human("请研究")] })).toBe("请研究");
  });

  it("truncates to the sidebar's width", () => {
    const title = autoTitle({ messages: [human("玉米基因组选择与全基因组关联分析在育种中的应用")] });
    expect(title.length).toBe(MAX_TITLE_LENGTH);
  });

  it("ignores a heading that is too short to be a topic", () => {
    // A one- or two-character heading ("引言") names a section, not the run.
    expect(autoTitle({ messages: [human("请研究玉米GS预测")], report: "# 引言\n\n正文" })).toBe(
      "玉米GS预测",
    );
  });

  it("returns an empty string when there is nothing to summarise", () => {
    // The caller treats "" as "no update", so this must not invent a title.
    expect(autoTitle({})).toBe("");
    expect(autoTitle({ messages: [] })).toBe("");
    expect(autoTitle({ messages: [{ id: "a", type: "ai", content: "hi" }] })).toBe("");
  });

  it("reads content blocks, not just plain strings", () => {
    expect(autoTitle({ messages: [human("请分析分块送达的问题")] })).toBe("分块送达的问题");
    expect(
      autoTitle({ messages: [{ id: "h", type: "human", content: [{ text: "请研究块内容" }] }] }),
    ).toBe("块内容");
  });

  it("is deterministic for the same conversation", () => {
    const input = { messages: [human("请帮我研究一下玉米GS")], report: "# 玉米 GS\n正文" };
    expect(autoTitle(input)).toBe(autoTitle(input));
  });
});
