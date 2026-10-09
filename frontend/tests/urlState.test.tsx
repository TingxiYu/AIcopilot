// @vitest-environment jsdom
//
// Spec §5.3: the URL is the single source of truth for thread state (`?thread=`).
//
// This file exists because the final re-review claimed the `?thread=` write had
// regressed in `useThreadStream`'s `onThreadId`. It had not — these tests pin
// the behaviour so the claim can be settled by running code rather than by
// reading it.
//
// `useStream` is mocked so the hook's own option wiring is observable without a
// backend; the transport is out of scope here.
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const captured = vi.hoisted(() => ({
  options: null as Record<string, unknown> | null,
}));

vi.mock("@langchain/react", () => ({
  useStream: (options: Record<string, unknown>) => {
    captured.options = options;
    return {
      messages: [],
      values: {},
      isLoading: false,
      error: null,
      submit: () => undefined,
      subagents: new Map(),
    };
  },
}));

import { useThreadStream } from "../src/hooks/useThreadStream";

const threadParam = () => new URLSearchParams(window.location.search).get("thread");

afterEach(cleanup);

beforeEach(() => {
  window.history.replaceState({}, "", "/");
});

describe("?thread= persistence", () => {
  it("publishes the id the backend minted (onThreadId)", () => {
    renderHook(() => useThreadStream());

    const onThreadId = captured.options?.onThreadId;
    expect(typeof onThreadId).toBe("function");

    act(() => (onThreadId as (id: string) => void)("t-42"));
    expect(threadParam()).toBe("t-42");
  });

  it("reads the thread back out of the URL on mount", () => {
    window.history.replaceState({}, "", "/?thread=from-url");
    const { result } = renderHook(() => useThreadStream());
    expect(result.current.threadId).toBe("from-url");
  });
});

describe("selectThread", () => {
  it("adopts a selected thread into the URL", () => {
    const { result } = renderHook(() => useThreadStream());
    act(() => result.current.selectThread("t-7"));
    expect(result.current.threadId).toBe("t-7");
    expect(threadParam()).toBe("t-7");
  });

  it("REMOVES ?thread= for a new thread", () => {
    // Without this the click looks like a no-op and a refresh resurrects the
    // thread the user just left.
    window.history.replaceState({}, "", "/?thread=old");
    const { result } = renderHook(() => useThreadStream());
    expect(threadParam()).toBe("old");

    act(() => result.current.selectThread(undefined));
    expect(result.current.threadId).toBeUndefined();
    expect(threadParam()).toBeNull();
  });
});
