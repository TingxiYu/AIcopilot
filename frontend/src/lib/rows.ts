export type RawMessage = {
  id?: string;
  type: string;
  content: unknown;
  tool_calls?: { id?: string; name?: string; args?: unknown }[];
  tool_call_id?: string;
  status?: string;
};

/**
 * Minimal shape the UI needs from `stream.subagents` entries. Compatible with
 * the SDK's `SubagentStreamInterface`, which is what `@langchain/react`'s
 * useStream exposes on the classic transport.
 */
export type SubagentLike = {
  /** The tool call id that spawned this subagent. */
  id: string;
  status: string;
  result: string | null;
  toolCall?: { name?: string; args?: unknown };
  /** The subagent's own conversation. */
  messages?: RawMessage[];
};

export type ToolRow = {
  kind: "tool";
  key: string;
  callId: string;
  name: string;
  args: unknown;
  result: string | null;
  status: "pending" | "done" | "failed" | "unknown";
};

export type SubagentRow = {
  kind: "subagent";
  key: string;
  callId: string;
  agent: string;
  status: "running" | "done" | "failed" | "unknown";
  result: string | null;
  /** The subagent's own tool calls and prose, already projected. */
  inner: Row[];
};

export type Row =
  | { kind: "prose"; key: string; role: "human" | "ai"; body: string }
  | ToolRow
  | SubagentRow;

/** Subagent run states that mean "finished", in either direction. */
const SETTLED = new Set(["completed", "complete", "success", "done"]);
const FAILED = new Set(["error", "failed", "failure", "timeout", "timed_out"]);

/** Collapse exact adjacent status repeats, including a partially streamed final copy. */
function collapseRepeatedAiText(text: string): string {
  if (text.length < 64) return text;
  const prefix = Array<number>(text.length).fill(0);
  for (let index = 1; index < text.length; index += 1) {
    let matched = prefix[index - 1];
    while (matched > 0 && text[index] !== text[matched]) matched = prefix[matched - 1];
    if (text[index] === text[matched]) matched += 1;
    prefix[index] = matched;
  }
  const period = text.length - prefix[text.length - 1];
  return period >= 32 && text.length - period >= 32
    ? text.slice(0, period)
    : text;
}

export function messageText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) =>
        typeof part === "string"
          ? part
          : typeof part === "object" && part !== null && "text" in part
            ? String((part as { text: unknown }).text ?? "")
            : "",
      )
      .join("");
  }
  return "";
}

function subagentTypeOf(args: unknown): string | null {
  const value = (args as Record<string, unknown> | undefined)?.subagent_type;
  return typeof value === "string" && value.length > 0 ? value : null;
}

function agentName(call: { args?: unknown }, sub: SubagentLike): string {
  return (
    subagentTypeOf(call.args) ??
    subagentTypeOf(sub.toolCall?.args) ??
    "subagent"
  );
}

function toolRow(callId: string, name: string, args: unknown, isRunning: boolean): ToolRow {
  return {
    kind: "tool",
    key: `c-${callId}`,
    callId,
    name,
    args,
    result: null,
    status: isRunning ? "pending" : "unknown",
  };
}

/**
 * Fold the coordinator's messages into renderable rows.
 *
 * Subagents are NOT discoverable from the message list: their messages stream
 * past but never enter the final state. They arrive separately as
 * `subagentsByCallId`, keyed by the `task` tool call that spawned them, so a
 * `task` call with a matching entry becomes a SubagentRow. Without one it
 * degrades to an ordinary tool row — the hand-off stays visible even if the
 * backend never emits namespaced subgraph events.
 */
export function buildRows(
  messages: RawMessage[],
  subagentsByCallId: Map<string, SubagentLike> = new Map(),
  isRunning = true,
): Row[] {
  const rows: Row[] = [];
  const openByCallId = new Map<string, ToolRow | SubagentRow>();

  for (const message of messages) {
    if (message.type === "tool") {
      const callId = message.tool_call_id;
      if (!callId) continue;
      const open = openByCallId.get(callId);
      if (open) {
        open.result = messageText(message.content);
        open.status = message.status === "error" ? "failed" : "done";
      }
      continue;
    }

    if (message.type === "human") {
      rows.push({
        kind: "prose",
        key: message.id ?? `h-${rows.length}`,
        role: "human",
        body: messageText(message.content),
      });
      continue;
    }

    if (message.type !== "ai") continue;

    const isStatusMessage = (message.tool_calls?.length ?? 0) > 0;
    const rawBody = messageText(message.content).trim();
    const body = isStatusMessage ? collapseRepeatedAiText(rawBody) : rawBody;
    if (body) {
      const previous = rows[rows.length - 1];
      if (!(isStatusMessage && previous?.kind === "prose" && previous.role === "ai" && previous.body === body)) {
        rows.push({
          kind: "prose",
          key: message.id ?? `a-${rows.length}`,
          role: "ai",
          body,
        });
      }
    }

    for (const [index, call] of (message.tool_calls ?? []).entries()) {
      const callId = call.id ?? `${message.id ?? "a"}-${call.name ?? "tool"}-${index}`;
      const sub = subagentsByCallId.get(callId);

      if (sub) {
        const row: SubagentRow = {
          kind: "subagent",
          key: `sub-${callId}`,
          callId,
          agent: agentName(call, sub),
          status: FAILED.has(sub.status)
            ? "failed"
            : SETTLED.has(sub.status)
              ? "done"
              : isRunning ? "running" : "unknown",
          result: sub.result ?? null,
          inner: buildRows(sub.messages ?? [], new Map(), isRunning),
        };
        openByCallId.set(callId, row);
        rows.push(row);
        continue;
      }

      const row = toolRow(callId, call.name ?? "tool", call.args ?? {}, isRunning);
      openByCallId.set(callId, row);
      rows.push(row);
    }
  }

  return rows;
}
