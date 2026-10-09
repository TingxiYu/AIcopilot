// @vitest-environment jsdom
//
// Right preview panel state: auto-open on content, latch on manual close.
// The two rules conflict, so both directions are pinned here.
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  DEFAULT_PANEL_WIDTH,
  MAX_PANEL_WIDTH,
  shouldAutoOpen,
  useRightPanel,
} from "../src/hooks/useRightPanel";

afterEach(cleanup);

function pressCtrlB() {
  act(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "b", ctrlKey: true }));
  });
}

describe("shouldAutoOpen", () => {
  const base = { dismissed: false, show: false, hasArtifacts: false, hasToolResult: false };

  it("opens for an artifact or for any analysis tool's result", () => {
    expect(shouldAutoOpen({ ...base, hasArtifacts: true })).toBe(true);
    expect(shouldAutoOpen({ ...base, hasToolResult: true })).toBe(true);
  });

  it("stays shut with nothing to show", () => {
    expect(shouldAutoOpen(base)).toBe(false);
  });

  it("stays shut once the user has dismissed it", () => {
    // The whole point of the latch: a dismissed panel must not come back on the
    // next artifact.
    expect(shouldAutoOpen({ ...base, hasArtifacts: true, dismissed: true })).toBe(false);
  });

  it("is a no-op when already open", () => {
    expect(shouldAutoOpen({ ...base, hasArtifacts: true, show: true })).toBe(false);
  });
});

describe("useRightPanel", () => {
  it("opens itself when an artifact arrives and lands on the report tab", () => {
    const { result, rerender } = renderHook(
      (props: { hasArtifacts: boolean; hasToolResult: boolean }) => useRightPanel(props),
      { initialProps: { hasArtifacts: false, hasToolResult: false } },
    );
    expect(result.current.show).toBe(false);

    rerender({ hasArtifacts: true, hasToolResult: false });
    expect(result.current.show).toBe(true);
    expect(result.current.tab).toBe("report");
  });

  it("lands on the Result View tab when a tool result arrives", () => {
    // The tab key is the generic "result", not a tool id: the panel must not
    // know which tool produced it.
    const { result, rerender } = renderHook(
      (props: { hasArtifacts: boolean; hasToolResult: boolean }) => useRightPanel(props),
      { initialProps: { hasArtifacts: false, hasToolResult: false } },
    );
    rerender({ hasArtifacts: false, hasToolResult: true });
    expect(result.current.show).toBe(true);
    expect(result.current.tab).toBe("result");
  });

  it("does not reopen for a NEW artifact once the user closed it", () => {
    const { result, rerender } = renderHook(
      (props: { hasArtifacts: boolean; hasToolResult: boolean }) => useRightPanel(props),
      { initialProps: { hasArtifacts: true, hasToolResult: false } },
    );
    expect(result.current.show).toBe(true);

    act(() => result.current.close());
    expect(result.current.show).toBe(false);

    // A second artifact completes while the panel is dismissed.
    rerender({ hasArtifacts: false, hasToolResult: false });
    rerender({ hasArtifacts: true, hasToolResult: false });
    expect(result.current.show).toBe(false);
  });

  it("reopens on an explicit click, with the requested tab", () => {
    const { result } = renderHook(() => useRightPanel({ hasArtifacts: true, hasToolResult: false }));
    act(() => result.current.close());
    expect(result.current.show).toBe(false);

    act(() => result.current.open("result"));
    expect(result.current.show).toBe(true);
    expect(result.current.tab).toBe("result");
  });

  it("keeps honouring the user's dismissal after a deliberate re-open", () => {
    // A later artifact must still not steal focus back.
    const { result, rerender } = renderHook(
      (props: { hasArtifacts: boolean; hasToolResult: boolean }) => useRightPanel(props),
      { initialProps: { hasArtifacts: true, hasToolResult: false } },
    );
    act(() => result.current.close());
    act(() => result.current.open("report"));
    rerender({ hasArtifacts: false, hasToolResult: false });
    rerender({ hasArtifacts: true, hasToolResult: false });
    expect(result.current.show).toBe(true); // still open from the click...
    act(() => result.current.close());
    rerender({ hasArtifacts: false, hasToolResult: false });
    rerender({ hasArtifacts: true, hasToolResult: false });
    expect(result.current.show).toBe(false); // ...and still latched
  });

  it("toggles on Ctrl+B, and that close also latches", () => {
    const { result, rerender } = renderHook(
      (props: { hasArtifacts: boolean; hasToolResult: boolean }) => useRightPanel(props),
      { initialProps: { hasArtifacts: true, hasToolResult: false } },
    );
    expect(result.current.show).toBe(true);

    pressCtrlB();
    expect(result.current.show).toBe(false);

    rerender({ hasArtifacts: false, hasToolResult: false });
    rerender({ hasArtifacts: true, hasToolResult: false });
    expect(result.current.show).toBe(false);
  });

  it("records a dragged width, but not the zero it is driven to while hidden", () => {
    const { result } = renderHook(() => useRightPanel({ hasArtifacts: true, hasToolResult: false }));
    expect(result.current.width).toBe(DEFAULT_PANEL_WIDTH);

    act(() => result.current.onWidthChange([800, 500]));
    expect(result.current.width).toBe(500);

    act(() => result.current.close());
    // The Splitter reports the collapsed panel as 0; recording that would make
    // the panel reopen at zero width.
    act(() => result.current.onWidthChange([1300, 0]));
    act(() => result.current.open("report"));
    expect(result.current.width).toBe(500);
  });

  it("clamps a dragged width to the allowed maximum", () => {
    const { result } = renderHook(() => useRightPanel({ hasArtifacts: true, hasToolResult: false }));
    act(() => result.current.onWidthChange([100, 2000]));
    expect(result.current.width).toBe(MAX_PANEL_WIDTH);
  });
});
