import { useState } from "react";
import { Button, Card, Input, Tag } from "antd";
import { ExclamationCircleOutlined } from "@ant-design/icons";

/**
 * The human-confirmation card — a run paused on `interrupt()`.
 *
 * A fourth card kind alongside the user message, the tool-call card and the
 * result card, and visually the most insistent of the four: this is the only
 * one that is waiting on the person reading it.
 *
 * Resuming goes through the SAME `submit` the composer uses, with a
 * `command.resume` payload — a second, parallel channel into the run would be
 * a second thing to keep in sync with the stream. `resume: true` / `false` are
 * the conventional approve/reject values; the free-text box sends a string for
 * tools that interrupt to ask a question.
 *
 * HONEST LIMITATION: the current research graph never calls `interrupt()`, so
 * this path is unreachable in practice today — it exists because the card kinds
 * are part of the design, and it is written against the SDK's real API rather
 * than a placeholder so it works when a tool starts using it.
 */
export function InterruptCard({
  value,
  onResume,
  disabled = false,
}: {
  /** The payload the interrupting tool passed. Shape is tool-defined. */
  value: unknown;
  onResume: (resume: unknown) => void;
  disabled?: boolean;
}) {
  const [text, setText] = useState("");

  // The payload is arbitrary, so it is shown as text rather than mapped onto
  // fields the tool may not have. A wrong guess at a field name would render
  // "undefined" where a question should be.
  const body =
    typeof value === "string"
      ? value
      : typeof (value as { message?: unknown } | null)?.message === "string"
        ? String((value as { message: string }).message)
        : JSON.stringify(value ?? null, null, 2);

  return (
    <Card
      size="small"
      className="rounded-lg shadow-sm"
      styles={{ body: { padding: 12 } }}
      style={{ borderColor: "var(--warn)" }}
      title={
        <span className="flex items-center gap-2 text-sm">
          <ExclamationCircleOutlined style={{ color: "var(--warn)" }} />
          <span>需要你确认</span>
          <Tag color="orange">等待中</Tag>
        </span>
      }
    >
      <pre
        className="m-0 overflow-auto text-xs whitespace-pre-wrap"
        style={{ color: "var(--fg)" }}
      >
        {body}
      </pre>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {/* Explicit accessible names: antd's `autoInsertSpace` renders a
            two-character Chinese label as "拒 绝", so the accessible name would
            otherwise depend on a typographic setting rather than on the action.
            The label identifies the action; the spacing is cosmetic. */}
        <Button
          type="primary"
          size="small"
          disabled={disabled}
          aria-label="确认继续"
          onClick={() => onResume(true)}
        >
          确认继续
        </Button>
        <Button size="small" disabled={disabled} aria-label="拒绝" onClick={() => onResume(false)}>
          拒绝
        </Button>
        <Input
          size="small"
          className="min-w-40 flex-1"
          placeholder="或输入要回传给工具的内容"
          aria-label="回传内容"
          value={text}
          disabled={disabled}
          onChange={(event) => setText(event.target.value)}
          onPressEnter={() => {
            if (text.trim() !== "") onResume(text.trim());
          }}
        />
      </div>
    </Card>
  );
}
