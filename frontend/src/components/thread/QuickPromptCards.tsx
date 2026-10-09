import { Card } from "antd";
import { QUICK_PROMPTS } from "../../config/quickPrompts";

/**
 * Suggestion cards under the welcome screen's input.
 *
 * Purely a map over `QUICK_PROMPTS` — no card is written out by hand and the
 * page has no per-prompt code, which is what lets a new analysis be added by
 * appending to that config alone.
 */
export function QuickPromptCards({
  onPick,
  blocked = false,
}: {
  /** Sends the prompt as the user's message. */
  onPick: (prompt: string) => void;
  blocked?: boolean;
}) {
  return (
    <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-3">
      {QUICK_PROMPTS.map((item) => (
        <Card
          key={item.id}
          size="small"
          hoverable={!blocked}
          className="rounded-lg text-left"
          // A disabled card must not look clickable; `hoverable` is antd's own
          // affordance for "this responds", so it follows the blocked flag
          // rather than staying on unconditionally.
          onClick={() => {
            if (!blocked) onPick(item.prompt);
          }}
        >
          <p className="m-0 text-sm font-medium">{item.title}</p>
          <p className="m-0 mt-1 text-xs" style={{ color: "var(--muted)" }}>
            {item.description}
          </p>
        </Card>
      ))}
    </div>
  );
}
