import { useCallback, useEffect, useRef, useState } from "react";

/**
 * How close to the bottom still counts as "at the bottom", in pixels.
 *
 * Not 0: sub-pixel layout and fractional line heights leave the browser's
 * `scrollHeight - scrollTop - clientHeight` a pixel or two short of zero at the
 * true bottom, and a 0 tolerance would repeatedly disengage the pin there.
 */
const BOTTOM_TOLERANCE = 8;

const distanceFromBottom = (el: HTMLElement): number =>
  el.scrollHeight - el.scrollTop - el.clientHeight;

/**
 * Scroll container behaviour for spec §4.5.3: the conversation follows new
 * content while the user is at the bottom, and stops the instant they scroll up
 * so a long stream cannot yank them back down.
 *
 * The pinned state is a number rather than a boolean so the effect re-runs when
 * the content grows, not only when the boolean flips: `deps` (the row array and
 * the running flag) is what changes on every token, and `pinned` decides whether
 * that change results in a scroll.
 *
 * The listener is registered once, on mount, and reads `pinnedRef` — re-binding
 * it when `pinned` changes would miss the very event that changes it, since a
 * scroll event between render and effect re-attach can arrive with the old
 * handler already torn down.
 */
export function useStickToBottom<T extends HTMLElement>(
  deps: readonly unknown[],
): { ref: React.RefObject<T>; pinned: boolean; scrollToBottom: () => void } {
  const ref = useRef<T | null>(null);
  const [pinned, setPinned] = useState(true);
  const pinnedRef = useRef(pinned);
  pinnedRef.current = pinned;

  const scrollToBottom = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    setPinned(true);
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const onScroll = () => {
      const atBottom = distanceFromBottom(el) <= BOTTOM_TOLERANCE;
      // Only the disengage is unconditional: re-engaging while already pinned
      // would set state on every scroll event at the bottom.
      if (!atBottom) setPinned(false);
      else if (!pinnedRef.current) setPinned(true);
    };

    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!pinned) return;
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
    // `deps` is intentionally spread: it is the caller's content signal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pinned, ...deps]);

  return { ref, pinned, scrollToBottom };
}
