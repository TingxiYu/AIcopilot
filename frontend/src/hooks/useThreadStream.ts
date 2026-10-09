import { useStream } from "@langchain/react";
import type { SubagentApi } from "@langchain/langgraph-sdk/ui";
import { useCallback, useRef, useState } from "react";
import type { RawMessage, SubagentLike } from "../lib/rows";

export type StreamState = {
  messages: unknown[];
  todos?: { content: string; status: "pending" | "in_progress" | "completed" }[];
  files?: Record<string, unknown>;
};

/**
 * The configured backend base URL, single-sourced here.
 *
 * Exported so the connection banner (spec §5.4: "show the actual API address in
 * use") renders exactly the URL this hook connects to, rather than a copy of the
 * fallback that could drift from it.
 */
export const API_URL: string =
  import.meta.env.VITE_LANGGRAPH_API_URL ?? "http://127.0.0.1:2026";

// `research` is registered in langgraph.json and is the deepagents research
// graph — the only graph this UI targets.
const ASSISTANT_ID = "research";

function readThreadFromUrl(): string | undefined {
  return new URLSearchParams(window.location.search).get("thread") ?? undefined;
}

/**
 * Length of a message's content, without allocating it.
 *
 * Used only as a change signal, so it needs to move whenever the rendered text
 * would — not to be an exact measure. `String.prototype.length` is O(1) and
 * array/part walks are O(parts), so this stays cheap enough to run every
 * render, which is the point: it must run on every render to detect change.
 */
function contentLength(content: unknown): number {
  if (typeof content === "string") return content.length;
  if (Array.isArray(content)) {
    let total = 0;
    for (const part of content) total += contentLength(part);
    return total;
  }
  if (content !== null && typeof content === "object" && "text" in content) {
    return contentLength((content as { text: unknown }).text);
  }
  return 0;
}

function sameToolCall(
  a: { name?: string; args?: unknown } | undefined,
  b: { name?: string; args?: unknown } | undefined,
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.name !== b.name) return false;
  if (a.args === b.args) return true;
  try {
    // Tool args are JSON-derived, so this cannot cycle in practice. On the
    // (impossible) throw, report "changed": rebuilding is the safe direction.
    return JSON.stringify(a.args ?? null) === JSON.stringify(b.args ?? null);
  } catch {
    return false;
  }
}

function sameSubagent(a: SubagentLike, b: SubagentLike): boolean {
  if (a === b) return true;
  return (
    a.id === b.id &&
    a.status === b.status &&
    a.result === b.result &&
    sameToolCall(a.toolCall, b.toolCall) &&
    sameMessages(a.messages, b.messages)
  );
}

/**
 * Value-equality for two subagent maps, covering exactly what `buildRows`
 * reads: `id`, `status`, `result`, `toolCall` and the subagent's messages.
 *
 * Identity cannot be used: `stream.subagents` is a getter that rebuilds a fresh
 * Map of freshly-built entry objects on every access (the SDK's
 * `SubagentManager.getSubagents()` constructs a new Map and calls
 * `buildExecution()`, which spreads a new object per entry), so `Object.is` on
 * it never holds across renders.
 */
export function sameSubagentSet(
  a: Map<string, SubagentLike>,
  b: Map<string, SubagentLike>,
): boolean {
  if (a === b) return true;
  if (a.size !== b.size) return false;
  for (const [id, subagent] of a) {
    const other = b.get(id);
    if (!other || !sameSubagent(subagent, other)) return false;
  }
  return true;
}

/**
 * Reuse `previous` when it still describes the same subagents, else take a
 * shallow copy of `next`.
 *
 * Exported so the identity contract can be tested directly against the map the
 * hook actually returns, rather than against a copy of this expression.
 */
export function stabilizeSubagents(
  previous: Map<string, SubagentLike> | null,
  next: Map<string, SubagentLike>,
): Map<string, SubagentLike> {
  return previous && sameSubagentSet(previous, next) ? previous : new Map(next);
}

/**
 * Value-equality for two message arrays, covering exactly what `buildRows`
 * reads: `id`, `type`, `content` (by length), `tool_calls` and `tool_call_id`.
 *
 * Identity is doubly unusable here. `stream.messages` is a getter that calls
 * `ensureMessageInstances(values.messages)` on every access, and that helper is
 * `messages.map(msg => isBaseMessage(msg) ? msg : coerce(msg))` — so the ARRAY
 * is new every access, AND every element that came in as a plain object is
 * coerced fresh. Measured against the SDK in this repo (task 10): both the
 * array and each element fail `Object.is` between two consecutive reads of an
 * unchanged state. There is no identity signal to key on; only values.
 *
 * Length-only keying is the trap from task 8: while an AI message streams, the
 * array length is constant and only the content grows, so a count key reports
 * "same" and freezes the card mid-run. `contentLength` is what detects that.
 *
 * Tool calls are compared per-call, not just counted: an AI message mid-stream
 * carries `tool_calls` whose `args` grow as `tool_call_chunks` accumulate, and
 * that can happen while the message's own content stays empty (the caller gets
 * the call before any prose). A length-only comparison of `tool_calls` would
 * report "same" and freeze a card that is actively building its arguments.
 */
export function sameMessages(a: RawMessage[] | undefined, b: RawMessage[] | undefined): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    const x = a[i];
    const y = b[i];
    if (x === y) continue;
    if (x.id !== y.id || x.type !== y.type || x.tool_call_id !== y.tool_call_id) return false;
    if (contentLength(x.content) !== contentLength(y.content)) return false;

    const xc = x.tool_calls ?? [];
    const yc = y.tool_calls ?? [];
    if (xc.length !== yc.length) return false;
    for (let j = 0; j < xc.length; j += 1) {
      const xCall = xc[j];
      const yCall = yc[j];
      if (xCall === yCall) continue;
      if (xCall.id !== yCall.id || xCall.name !== yCall.name) return false;
      if (!sameToolCall(xCall, yCall)) return false;
    }
  }
  return true;
}

/**
 * Reuse `previous` when it still describes the same messages, else take the
 * fresh array as-is.
 *
 * The counterpart of `stabilizeSubagents` for the other unstable half of the
 * SDK surface: `useMemo(..., [stream.messages, subagentsByCallId])` in `App`
 * never caches while `stream.messages` is a new array per render.
 */
export function stabilizeMessages(
  previous: RawMessage[] | null,
  next: RawMessage[],
): RawMessage[] {
  return previous && sameMessages(previous, next) ? previous : next;
}

/**
 * True when `error` looks like "the backend could not be reached" rather than a
 * run that started and failed.
 *
 * The classic transport wraps its fetch failures in `Error("Failed to fetch")
 * (${API_URL})`; the SDK's own client throws `Error("Failed to fetch")` with no
 * URL, and Node/undici phrases the same condition differently. Matching the
 * message is unavoidable here: the wrapped error is a plain `Error`, so there is
 * no cause/status to key on.
 */
export function isConnectionError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return /failed to fetch|fetch failed|networkerror|load failed|econnrefused|enotfound/i.test(
    error.message,
  );
}

export function useThreadStream() {
  const [threadId, setThreadId] = useState<string | undefined>(readThreadFromUrl);
  // True from the moment a run is submitted until this run's data has arrived
  // (or its error has). Used by the "waiting for the backend" banner so a
  // request that never resolves does not leave the user looking at a blank
  // column. Deliberately NOT derived from `stream.isLoading`: the SDK only
  // flips that once the run has actually started, which is precisely the moment
  // that never comes when the backend is unreachable.
  const [awaitingFirstResponse, setAwaitingFirstResponse] = useState(false);

  /**
   * Navigate to a thread, keeping `?thread=` in step (spec §5.3: the URL is the
   * single source of truth, so refresh and back/forward keep working).
   *
   * An undefined id means "new thread", and that must REMOVE the parameter. Only
   * writing it on the way in would leave the old id in the URL, so a refresh —
   * or a shared link — would resurrect the thread the user just left, which is
   * precisely what "new thread" was meant to get away from.
   */
  const selectThread = useCallback((id: string | undefined) => {
    setThreadId(id);
    const url = new URL(window.location.href);
    if (id) url.searchParams.set("thread", id);
    else url.searchParams.delete("thread");
    window.history.replaceState({}, "", url);
  }, []);

  const stream = useStream<StreamState>({
    apiUrl: API_URL,
    assistantId: ASSISTANT_ID,
    threadId,
    onCreated: () => setAwaitingFirstResponse(false),
    onError: () => setAwaitingFirstResponse(false),
    // The backend minted the id; adopt it and publish it to the URL.
    onThreadId: selectThread,
  });

  // `stream.error` is an `unknown` and is `readonly`, so it cannot be
  // narrowed and the hook cannot clear it. A reachability check is the only
  // signal available for "the backend is not there", which is the state
  // spec §5.4 asks to surface with the URL.
  const connectionError = isConnectionError(stream.error);
  const isConnecting = awaitingFirstResponse && !stream.error;

  const submit = useCallback(
    (...args: Parameters<typeof stream.submit>) => {
      setAwaitingFirstResponse(true);
      return stream.submit(...args);
    },
    [stream.submit],
  );

  // Subagents are not discoverable from `stream.messages` — their messages
  // stream past but never enter the final state. The hook exposes them
  // separately, keyed by the `task` tool call that spawned each one, which is
  // exactly the key `buildRows` needs.
  //
  // Why this reaches around the return type: `UseStreamOptions` accepts
  // `subagentToolNames` / `filterSubagentMessages`, and the implementation
  // always wires up a `SubagentManager`, so `subagents` is populated at
  // runtime for any run that streams subgraph namespaces (verified against
  // the backend — see the task-8 report). But `useStream<StateType>`'s return
  // type resolves to `BaseStream`, which omits the subagent API: the SDK only
  // types it for DeepAgent/ReactAgent values. Passing the state type is what
  // the hook needs (it reads `messages`/`todos`/`files`), so the subagent
  // surface comes from the SDK's own `SubagentApi` rather than from here.
  const subagents = (stream as unknown as SubagentApi<SubagentLike>).subagents;

  // `stream.subagents` cannot be a `useMemo` dependency — it is a new Map every
  // access (see `sameSubagentSet`), so `[stream.subagents]` re-runs the memo on
  // every render and hands consumers a new identity each time, which silently
  // defeats their own memoisation of `buildRows`. Reuse the previous map while
  // it is value-equal to the current one; build a new one as soon as anything
  // `buildRows` can read has changed.
  //
  // The comparison runs every render by necessity (that is how change is
  // detected), but it only walks existing subagents and reads O(1) lengths —
  // it never allocates or copies message content.
  const previousRef = useRef<Map<string, SubagentLike> | null>(null);
  const subagentsByCallId = stabilizeSubagents(previousRef.current, subagents);
  previousRef.current = subagentsByCallId;

  // The other half of the same problem, stabilised the same way. `stream` is a
  // fresh object literal per render (its getters close over that render's
  // state), so `stream.messages` cannot be a `useMemo` dependency either.
  // `App` keys `buildRows` on this value; without this it rebuilds every
  // render, and — worse — hands `MessageList` a new row array each time.
  const previousMessagesRef = useRef<RawMessage[] | null>(null);
  const messages = stabilizeMessages(
    previousMessagesRef.current,
    stream.messages as RawMessage[],
  );
  previousMessagesRef.current = messages;

  return {
    stream,
    threadId,
    setThreadId,
    selectThread,
    subagentsByCallId,
    messages,
    apiUrl: API_URL,
    connectionError,
    isConnecting,
    submit,
  };
}
