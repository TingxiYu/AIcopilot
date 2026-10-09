import { useEffect } from "react";

/**
 * Spec §4.3 — the running affordance for the middle column.
 *
 * Restrained by design: a small pulsing dot plus a label, no spinner animation
 * that would need a keyframe outside the theme. The pulse comes from Tailwind's
 * `animate-pulse` (opacity only) and every colour is a token, so it reads
 * correctly in both themes.
 *
 * The interval does not write state — a re-render on every tick would defeat the
 * memoisation the stream hook works to preserve. It exists only to force a
 * reflow, which restarts the CSS animation and makes the "still alive" pulse
 * visibly continue for the whole run rather than fading once after 2s.
 */
export function RunIndicator({ running }: { running: boolean }) {
  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => {
      const dot = document.getElementById("run-indicator-dot");
      if (dot) void dot.offsetWidth;
    }, 2000);
    return () => window.clearInterval(id);
  }, [running]);

  if (!running) return null;

  return (
    <p
      className="flex items-center gap-2 text-sm"
      style={{ color: "var(--muted)" }}
      role="status"
      aria-live="polite"
    >
      <span
        id="run-indicator-dot"
        className="inline-block h-1.5 w-1.5 animate-pulse rounded-full"
        style={{ background: "var(--accent)" }}
      />
      研究中…
    </p>
  );
}
