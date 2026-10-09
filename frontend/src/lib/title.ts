import { messageText, type RawMessage } from "./rows";

/**
 * Spec §4.2 — the backend stores no thread title, so it is derived from the
 * first human message, truncated.
 *
 * Shares `Sidebar.titleOf`'s approach on purpose (40 chars, same fallback) so
 * the header and the sidebar entry for one thread never disagree. It lives in
 * `lib/` rather than in `Sidebar` because `App` needs it for the header and
 * importing a component to reach a private helper would be the wrong direction.
 *
 * `messageText` is used rather than a `typeof content === "string"` check so a
 * message delivered as content blocks still titles correctly — that path already
 * exists in the row projection, and a human message that renders in the
 * conversation but titles as "(空会话)" would be a visible inconsistency.
 */
export function threadTitle(messages: RawMessage[] | undefined, max = 40): string {
  const first = messages?.find((m) => m.type === "human");
  return (first ? messageText(first.content) : "").slice(0, max) || "(空会话)";
}
