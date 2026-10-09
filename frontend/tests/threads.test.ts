// Node environment: the pure helpers in useThreads.ts carry the logic worth
// pinning (projection, grouping, filtering). The hook's network behaviour is
// covered by the Sidebar/App smoke tests, where fetch is stubbed.
import { describe, expect, it } from "vitest";

import {
  GROUP_ORDER,
  groupOf,
  groupThreads,
  matchesQuery,
  summarizeThread,
  type ThreadSummary,
} from "../src/hooks/useThreads";

const HOUR = 3_600_000;
const DAY = 86_400_000;
const NOW = Date.UTC(2026, 8, 16, 12, 0, 0);

function thread(over: Partial<ThreadSummary> = {}): ThreadSummary {
  return {
    id: "t1",
    title: "会话",
    updatedAt: new Date(NOW).toISOString(),
    archived: false,
    pinned: false,
    running: false,
    ...over,
  };
}

describe("summarizeThread", () => {
  it("falls back to the first human message when no title was stored", () => {
    // The backend stores no title, so the derived one is the default.
    const summary = summarizeThread({
      thread_id: "t1",
      updated_at: "2026-09-16T10:00:00Z",
      metadata: { graph_id: "research" },
      values: { messages: [{ type: "human", content: "研究一下 GXE 预测模型" }] },
    });
    expect(summary.title).toBe("研究一下 GXE 预测模型");
  });

  it("prefers a stored title over the derived one", () => {
    // A rename the sidebar then ignored would look like a silent failure.
    const summary = summarizeThread({
      thread_id: "t1",
      updated_at: "2026-09-16T10:00:00Z",
      metadata: { title: "玉米产量研究" },
      values: { messages: [{ type: "human", content: "原始问题" }] },
    });
    expect(summary.title).toBe("玉米产量研究");
  });

  it("ignores a blank stored title and derived title alike", () => {
    expect(
      summarizeThread({ thread_id: "t", updated_at: "x", metadata: { title: "   " }, values: {} }).title,
    ).toBe("(空会话)");
  });

  it("reads the archived flag from metadata", () => {
    expect(summarizeThread({ thread_id: "t", updated_at: "x", metadata: { archived: true } }).archived).toBe(true);
    // Anything other than an explicit true is not archived -- a string "false"
    // or a missing key must not hide the thread.
    expect(summarizeThread({ thread_id: "t", updated_at: "x", metadata: { archived: "true" } }).archived).toBe(false);
    expect(summarizeThread({ thread_id: "t", updated_at: "x" }).archived).toBe(false);
  });

  it("marks a thread running only for a busy status", () => {
    expect(summarizeThread({ thread_id: "t", updated_at: "x", status: "busy" }).running).toBe(true);
    expect(summarizeThread({ thread_id: "t", updated_at: "x", status: "idle" }).running).toBe(false);
    expect(summarizeThread({ thread_id: "t", updated_at: "x" }).running).toBe(false);
  });

  it("survives a thread with no metadata and no values", () => {
    const summary = summarizeThread({ thread_id: "t", updated_at: "x" });
    expect(summary.id).toBe("t");
    expect(summary.title).toBe("(空会话)");
  });
});

describe("groupOf", () => {
  it("buckets by age: today, last 7 days, older", () => {
    expect(groupOf(new Date(NOW - HOUR).toISOString(), NOW)).toBe("今天");
    expect(groupOf(new Date(NOW - 3 * DAY).toISOString(), NOW)).toBe("最近 7 天");
    expect(groupOf(new Date(NOW - 30 * DAY).toISOString(), NOW)).toBe("更早");
  });

  it("treats exactly 7 days as older, not as within the window", () => {
    expect(groupOf(new Date(NOW - 7 * DAY).toISOString(), NOW)).toBe("更早");
    expect(groupOf(new Date(NOW - 7 * DAY + HOUR).toISOString(), NOW)).toBe("最近 7 天");
  });
});

describe("pinned threads", () => {
  it("reads the pinned flag from metadata", () => {
    expect(summarizeThread({ thread_id: "t", updated_at: "x", metadata: { pinned: true } }).pinned).toBe(true);
    // Only an explicit true pins; a string or a missing key must not.
    expect(summarizeThread({ thread_id: "t", updated_at: "x", metadata: { pinned: "true" } }).pinned).toBe(false);
    expect(summarizeThread({ thread_id: "t", updated_at: "x" }).pinned).toBe(false);
  });

  it("hoists pinned threads into their own leading group", () => {
    // Pinning something into the middle of "最近 7 天" would not be pinning it
    // anywhere in particular, so pinned threads ignore the date buckets.
    const groups = groupThreads(
      [
        thread({ id: "old", updatedAt: new Date(NOW - 30 * DAY).toISOString(), pinned: true }),
        thread({ id: "today", updatedAt: new Date(NOW - HOUR).toISOString() }),
      ],
      NOW,
    );
    expect(groups.map((g) => g.label)).toEqual(["置顶", "今天"]);
    expect(groups[0].items.map((t) => t.id)).toEqual(["old"]);
  });

  it("omits the pinned group entirely when nothing is pinned", () => {
    const groups = groupThreads([thread()], NOW);
    expect(groups.map((g) => g.label)).toEqual(["今天"]);
  });
});

describe("groupThreads", () => {
  it("keeps the display order and drops empty groups", () => {
    const groups = groupThreads(
      [
        thread({ id: "old", updatedAt: new Date(NOW - 30 * DAY).toISOString() }),
        thread({ id: "today", updatedAt: new Date(NOW - HOUR).toISOString() }),
      ],
      NOW,
    );
    expect(groups.map((g) => g.label)).toEqual(["今天", "更早"]);
    expect(groups.map((g) => g.label)).toEqual(GROUP_ORDER.filter((l) => l !== "最近 7 天"));
  });

  it("returns nothing for an empty list rather than empty groups", () => {
    // The sidebar renders a <section> per group, so a stub group would show as
    // a stray heading with nothing under it.
    expect(groupThreads([], NOW)).toEqual([]);
  });
});

describe("matchesQuery", () => {
  it("is case-insensitive and matches a substring", () => {
    expect(matchesQuery(thread({ title: "Maize Yield Study" }), "yield")).toBe(true);
    expect(matchesQuery(thread({ title: "玉米产量" }), "产量")).toBe(true);
    expect(matchesQuery(thread({ title: "玉米产量" }), "小麦")).toBe(false);
  });

  it("treats a blank query as 'everything'", () => {
    expect(matchesQuery(thread(), "")).toBe(true);
    expect(matchesQuery(thread(), "   ")).toBe(true);
  });
});
