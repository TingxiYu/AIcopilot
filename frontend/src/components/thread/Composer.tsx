import { useState, type FormEvent } from "react";
import { ArrowUpOutlined } from "@ant-design/icons";

/**
 * The action button beside the input: send, or stop while a run is in flight.
 *
 * Both states are icon-only, with no visible label — the button sits in a
 * text-heavy column and a word there is noise. The accessible name therefore
 * has to be explicit rather than derived from the glyph, which also keeps it
 * stable: antd renders its icons as `role="img" aria-label="arrow-up"`, and
 * without an `aria-label` on the button that string would be folded into the
 * name a screen reader announces.
 */
function ActionButton({
  running,
  canSend,
  onStop,
}: {
  running: boolean;
  canSend: boolean;
  onStop: () => void;
}) {
  // A filled circle carrying a white glyph, the shape chat inputs settled on.
  // The inert state falls back to the panel token rather than a faded accent,
  // so "nothing to send yet" reads as empty instead of as a dimmed button.
  const base =
    "grid h-8 w-8 shrink-0 place-items-center rounded-full transition-colors disabled:cursor-not-allowed";
  const style =
    running || canSend
      ? { background: "var(--accent)", color: "#fff" }
      : { background: "var(--panel-2)", color: "var(--muted)" };

  if (running) {
    return (
      // `type="button"` is belt-and-braces: `submit()` already early-returns
      // while running, so this is not what stops a submission today. It is what
      // stops one if that guard is ever relaxed, and it keeps the button's
      // declared purpose honest — it is an action, not a form submission.
      <button
        type="button"
        onClick={onStop}
        aria-label="停止输出"
        title="停止输出"
        className={base}
        style={style}
      >
        {/* A square, drawn rather than taken from the icon set: the closest
            stock glyph is a stop-sign circle, which reads as a different
            action. */}
        <span
          aria-hidden
          className="block h-2.5 w-2.5 rounded-[2px]"
          style={{ background: "currentcolor" }}
        />
      </button>
    );
  }

  return (
    <button
      type="submit"
      disabled={!canSend}
      aria-label="发送"
      title="发送"
      className={base}
      style={style}
    >
      <ArrowUpOutlined aria-hidden />
    </button>
  );
}

export function Composer({
  onSubmit,
  running,
  onStop,
  disabled = false,
  blocked = false,
  initialValue = "",
}: {
  onSubmit: (text: string) => void;
  /** A run is streaming: the action button becomes Stop. */
  running: boolean;
  /** Interrupt the run. Rides the stream's own `stop()`. */
  onStop: () => void;
  /**
   * Inert without a run in flight — e.g. an interrupt is waiting on the user,
   * so there is nothing to send and nothing to stop.
   */
  disabled?: boolean;
  /**
   * Sending is refused but drafting is not (e.g. the backend is unreachable).
   *
   * Deliberately distinct from `disabled`. Removing the composer, or greying
   * the textarea, when the connection fails leaves the user with nowhere to put
   * the question they came to ask, and a reconnect would then have cost them
   * their typing. Letting them compose while refusing to send is the honest
   * state: the input is visible, the reason is on screen, and the draft
   * survives until the backend answers.
   */
  blocked?: boolean;
  /**
   * Text to start the box with — used by "continue in a new conversation",
   * which opens a fresh thread carrying the previous question.
   *
   * Read once, on mount: the composer owns its draft, and seeding it on every
   * render would fight the user's typing. Callers that need to replace the
   * draft re-mount it with a new `key` rather than pushing a value down.
   */
  initialValue?: string;
}) {
  const [value, setValue] = useState(initialValue);
  const canSend = !running && !disabled && !blocked;

  // Enter sends, Shift+Enter inserts a newline. Both paths funnel through here
  // so the guards (empty text, already running, blocked) live in one place.
  function submit() {
    const text = value.trim();
    if (!text || !canSend) return;
    setValue("");
    onSubmit(text);
  }

  return (
    <form
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        submit();
      }}
      className="flex items-end gap-2 border-t p-3"
      style={{ borderColor: "var(--border)" }}
    >
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          // Shift+Enter falls through to the browser's default newline insert.
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
        }}
        rows={2}
        disabled={running || disabled}
        placeholder="提一个研究问题…"
        className="flex-1 resize-none rounded border px-2 py-1 text-sm disabled:opacity-40"
        style={{ borderColor: "var(--border)", background: "var(--bg)", color: "var(--fg)" }}
      />
      <ActionButton
        running={running}
        // An empty box is the only extra reason to disable the send button;
        // running/disabled/blocked are already folded into `canSend`.
        canSend={canSend && value.trim() !== ""}
        onStop={onStop}
      />
    </form>
  );
}
