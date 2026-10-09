// @vitest-environment jsdom
//
// Finding 2: `ThreadHeader` and `RunIndicator` are named by spec §4.3 and were
// never implemented. These cover the components themselves; `app-smoke.test.tsx`
// covers the wiring that puts them in `App`.
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ThreadHeader } from "../src/components/thread/ThreadHeader";
import { RunIndicator } from "../src/components/thread/RunIndicator";
import { threadTitle } from "../src/lib/title";
import type { RawMessage } from "../src/lib/rows";

afterEach(cleanup);

describe("ThreadHeader", () => {
  it("shows the title and the citation count", () => {
    render(<ThreadHeader title="研究 GXE 预测模型" citationCount={16} />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("研究 GXE 预测模型");
    expect(screen.getByText("16 来源")).toBeTruthy();
  });

  it("omits the count entirely when there are no citations", () => {
    // "0 来源" would be noise on every fresh thread; the title stands alone.
    const { container } = render(<ThreadHeader title="新会话" citationCount={0} />);
    expect(container.textContent).toBe("新会话");
  });
});

describe("RunIndicator", () => {
  it("renders nothing when not running", () => {
    const { container } = render(<RunIndicator running={false} />);
    expect(container.innerHTML).toBe("");
  });

  it("announces the running state and carries the pulse", () => {
    const { container } = render(<RunIndicator running />);
    expect(screen.getByRole("status").textContent).toContain("研究中");
    // The animated element is the token-coloured dot, not a hardcoded colour.
    const dot = container.querySelector(".animate-pulse");
    expect(dot).not.toBeNull();
    expect((dot as HTMLElement).style.background).toContain("var(--accent)");
  });
});

describe("threadTitle", () => {
  function msg(over: Partial<RawMessage>): RawMessage {
    return { id: "m1", type: "ai", content: "", ...over };
  }

  it("takes the first human message", () => {
    expect(
      threadTitle([msg({ type: "ai", content: "hi" }), msg({ type: "human", content: "研究玉米" })]),
    ).toBe("研究玉米");
  });

  it("truncates to 40 characters", () => {
    const long = "研".repeat(80);
    expect(threadTitle([msg({ type: "human", content: long })]).length).toBe(40);
  });

  it("reads content blocks, not just plain strings", () => {
    // A human message may arrive as blocks; it renders in the conversation
    // either way, so the title must not fall back to the empty placeholder.
    expect(threadTitle([msg({ type: "human", content: [{ text: "分块问题" }] })])).toBe("分块问题");
  });

  it("falls back for an empty thread", () => {
    expect(threadTitle(undefined)).toBe("(空会话)");
    expect(threadTitle([])).toBe("(空会话)");
  });
});
