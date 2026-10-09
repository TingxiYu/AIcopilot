// @vitest-environment jsdom
//
// The persistence half of auto-titling: what `setAutoTitle` is allowed to write.
// The derivation itself is covered in summary.test.ts; this covers the two
// guards that protect a user's own rename and stop redundant backend writes.
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useThreads } from "../src/hooks/useThreads";

type Call = { url: string; method: string; body: string };

const calls: Call[] = [];
let threadMetadata: Record<string, unknown> = {};

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  calls.length = 0;
  threadMetadata = {};
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = (init?.method ?? "GET").toUpperCase();
      calls.push({ url, method, body: String(init?.body ?? "") });

      if (url.includes("/threads/search")) return jsonResponse([]);
      // `threads.get` — the guard reads current metadata through this.
      if (method === "GET" && /\/threads\/[^/?]+$/.test(url)) {
        return jsonResponse({ thread_id: "t1", updated_at: "2026-09-16T00:00:00Z", metadata: threadMetadata, values: {} });
      }
      return jsonResponse({ thread_id: "t1", updated_at: "2026-09-16T00:00:00Z", metadata: {}, values: {} });
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/**
 * Writes to a specific thread. `threads.search` is itself a POST, so filtering
 * on the method alone would count the list fetch as an update.
 */
const updates = () =>
  calls.filter(
    (call) =>
      (call.method === "PATCH" || call.method === "POST") &&
      !call.url.includes("/search") &&
      /\/threads\/[^/?]+/.test(call.url),
  );

describe("setAutoTitle", () => {
  it("writes the derived title into its own metadata key", async () => {
    const { result } = renderHook(() => useThreads("http://api", undefined));
    await waitFor(() => expect(calls.some((c) => c.url.includes("/threads/search"))).toBe(true));

    await act(async () => {
      await result.current.setAutoTitle("t1", "玉米 GS 基因组预测");
    });

    const written = updates().find((call) => call.body.includes("autoTitle"));
    expect(written).toBeDefined();
    // Its own key, not `title` — otherwise the next run could not tell its own
    // earlier output from a choice the user made.
    expect(written?.body).toContain("autoTitle");
    expect(written?.body).not.toContain('"title"');
  });

  it("never overwrites a title the user set", async () => {
    threadMetadata = { title: "我自己的名字" };
    const { result } = renderHook(() => useThreads("http://api", undefined));
    await waitFor(() => expect(calls.some((c) => c.url.includes("/threads/search"))).toBe(true));

    await act(async () => {
      await result.current.setAutoTitle("t1", "自动摘要");
    });

    expect(updates().some((call) => call.body.includes("autoTitle"))).toBe(false);
  });

  it("does not rewrite an unchanged value", async () => {
    // The effect that calls this runs after every completed run; without this
    // guard a re-run of the same conversation would issue a redundant write.
    threadMetadata = { autoTitle: "玉米 GS 基因组预测" };
    const { result } = renderHook(() => useThreads("http://api", undefined));
    await waitFor(() => expect(calls.some((c) => c.url.includes("/threads/search"))).toBe(true));

    await act(async () => {
      await result.current.setAutoTitle("t1", "玉米 GS 基因组预测");
    });

    expect(updates().some((call) => call.body.includes("autoTitle"))).toBe(false);
  });

  it("does nothing for an empty title", async () => {
    // `autoTitle` returns "" when there is nothing to summarise; the caller
    // relies on this being a no-op rather than writing a blank title.
    const { result } = renderHook(() => useThreads("http://api", undefined));
    await waitFor(() => expect(calls.some((c) => c.url.includes("/threads/search"))).toBe(true));

    await act(async () => {
      await result.current.setAutoTitle("t1", "   ");
    });

    expect(updates().length).toBe(0);
  });
});
