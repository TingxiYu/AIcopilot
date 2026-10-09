import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Tab keys the preview panel knows how to build.
 *
 * A string rather than a union: the strip is extensible, and an artifact adds
 * its own tab keyed `artifact:<path>`. A closed union here would mean editing
 * this file every time an analysis tool gained a surface.
 */
export const BASE_TABS = ["context", "datasets", "tasks", "report", "result"] as const;
export type BaseTab = (typeof BASE_TABS)[number];

export const DEFAULT_PANEL_WIDTH = 400;
export const MIN_PANEL_WIDTH = 320;
export const MAX_PANEL_WIDTH = 600;

/** Whether the panel should open itself, given what the session now holds. */
export function shouldAutoOpen(state: {
  dismissed: boolean;
  show: boolean;
  hasArtifacts: boolean;
  hasToolResult: boolean;
}): boolean {
  if (state.dismissed || state.show) return false;
  return state.hasArtifacts || state.hasToolResult;
}

/**
 * Open/close state for the right preview panel.
 *
 * Two rules, and they pull against each other:
 *
 *  1. The panel should appear on its own once there is something to show — the
 *     user should not have to notice that a report finished and go find it.
 *  2. Once the user has closed it, it must STAY closed. Re-opening it on the
 *     next artifact would mean the panel they just dismissed keeps coming back,
 *     which is the behaviour that makes an auto-panel infuriating. So a manual
 *     close latches, and from then on only an explicit "view in right panel"
 *     click opens it again.
 *
 * The latch is deliberately not cleared by a manual re-open: the user's
 * preference is "do not interrupt me", and honouring it after they open
 * something deliberately still leaves them in control.
 *
 * `hasToolResult` is deliberately tool-agnostic — the panel auto-opens for any
 * analysis tool's output, not for GS specifically.
 */
export function useRightPanel(options: { hasArtifacts: boolean; hasToolResult: boolean }) {
  const [show, setShow] = useState(false);
  const [tab, setTab] = useState<string>("context");
  const [width, setWidth] = useState(DEFAULT_PANEL_WIDTH);

  // A ref rather than state: the latch is read inside an effect and must not
  // itself trigger a render, and nothing renders differently because of it.
  const dismissed = useRef(false);

  const open = useCallback((next?: string) => {
    setShow(true);
    if (next) setTab(next);
  }, []);

  const close = useCallback(() => {
    dismissed.current = true;
    setShow(false);
  }, []);

  const toggle = useCallback(() => {
    // Ctrl+B is an explicit request, so it opens without clearing the latch and
    // closes like the × button (latching).
    setShow((current) => {
      if (current) dismissed.current = true;
      return !current;
    });
  }, []);

  const { hasArtifacts, hasToolResult } = options;

  useEffect(() => {
    if (
      shouldAutoOpen({
        dismissed: dismissed.current,
        show,
        hasArtifacts,
        hasToolResult,
      })
    ) {
      setShow(true);
      // Land on the more specific thing when both arrive at once.
      setTab(hasToolResult ? "result" : "report");
    }
  }, [hasArtifacts, hasToolResult, show]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "b") {
        event.preventDefault();
        toggle();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [toggle]);

  /**
   * Splitter resize handler.
   *
   * The panel only exists while it is shown, so this should not see a collapsed
   * size — but a drag can land mid-toggle, and recording a zero or a sub-minimum
   * width would reopen the panel collapsed. Anything implausible is ignored.
   */
  const onWidthChange = useCallback(
    (sizes: number[]) => {
      if (!show) return;
      const next = sizes[sizes.length - 1];
      if (typeof next === "number" && next >= MIN_PANEL_WIDTH) {
        setWidth(Math.min(next, MAX_PANEL_WIDTH));
      }
    },
    [show],
  );

  return { show, tab, setTab, open, close, toggle, width, onWidthChange };
}
