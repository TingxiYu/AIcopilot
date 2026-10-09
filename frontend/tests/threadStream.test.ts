import { describe, expect, it } from "vitest";
import { sameSubagentSet, stabilizeSubagents } from "../src/hooks/useThreadStream";
import type { SubagentLike } from "../src/lib/rows";

type Spec = {
  id: string;
  status?: string;
  result?: string | null;
  agent?: string;
  /** The subagent's first message content — grows while it streams. */
  content?: string;
  /** Extra messages, to change the message count. */
  extra?: number;
};

/**
 * Rebuild a fresh subagent map from a spec, mimicking what the SDK does on
 * every access: a new Map, new entry objects, new message arrays, new toolCall
 * objects. Nothing is shared between two calls — which is exactly the problem
 * under test.
 */
function freshMap(spec: Spec[]): Map<string, SubagentLike> {
  return new Map(
    spec.map((s) => [
      s.id,
      {
        id: s.id,
        status: s.status ?? "running",
        result: s.result ?? null,
        toolCall: { name: "task", args: { subagent_type: s.agent ?? "research-agent" } },
        messages: [
          { id: `${s.id}-m0`, type: "ai", content: s.content ?? "working" },
          ...Array.from({ length: s.extra ?? 0 }, (_, i) => ({
            id: `${s.id}-x${i}`,
            type: "tool" as const,
            content: "result",
            tool_call_id: `${s.id}-call${i}`,
          })),
        ],
      } satisfies SubagentLike,
    ]),
  );
}

// `stabilizeSubagents` is imported from the hook itself, so these assertions
// cover the exact function the hook calls — not a copy of its expression.
const stabilize = stabilizeSubagents;

const BASE: Spec[] = [{ id: "call_1", content: "searching" }];

describe("subagent map identity", () => {
  it("is unstable by construction — the reason identity keying fails", () => {
    // The premise of the bug: two accesses of `stream.subagents` never share
    // identity, so `useMemo(..., [stream.subagents])` could never hold.
    expect(Object.is(freshMap(BASE), freshMap(BASE))).toBe(false);
  });

  it("holds identity across a rebuild whose values are unchanged", () => {
    const previous = freshMap(BASE);
    const next = freshMap(BASE);
    expect(sameSubagentSet(previous, next)).toBe(true);
    // The load-bearing assertion: downstream memos see the SAME map.
    expect(stabilize(previous, next)).toBe(previous);
  });

  it("holds identity when entries are rebuilt in a different order", () => {
    const previous = freshMap([{ id: "a" }, { id: "b" }]);
    const next = freshMap([{ id: "b" }, { id: "a" }]);
    expect(stabilize(previous, next)).toBe(previous);
  });

  it("breaks identity when a subagent's status settles", () => {
    const previous = freshMap(BASE);
    const next = freshMap([{ ...BASE[0], status: "completed" }]);
    expect(sameSubagentSet(previous, next)).toBe(false);
    expect(stabilize(previous, next)).not.toBe(previous);
  });

  it("breaks identity when a subagent's result arrives", () => {
    const previous = freshMap(BASE);
    const next = freshMap([{ ...BASE[0], result: "findings" }]);
    expect(stabilize(previous, next)).not.toBe(previous);
  });

  it("breaks identity when streamed content grows within one message", () => {
    // The frozen-card guard: the message COUNT is unchanged here, only the
    // content is longer. A count-only fingerprint would wrongly report "same"
    // and freeze the card mid-run.
    const previous = freshMap([{ id: "call_1", content: "search" }]);
    const next = freshMap([{ id: "call_1", content: "searching for genomic prediction" }]);
    expect(previous.get("call_1")?.messages?.length).toBe(next.get("call_1")?.messages?.length);
    expect(sameSubagentSet(previous, next)).toBe(false);
    expect(stabilize(previous, next)).not.toBe(previous);
  });

  it("breaks identity when the tool-call args finish streaming", () => {
    const previous = freshMap([{ id: "call_1", agent: "res" }]);
    const next = freshMap([{ id: "call_1", agent: "research-agent" }]);
    expect(stabilize(previous, next)).not.toBe(previous);
  });

  it("breaks identity when a subagent is added or removed", () => {
    const previous = freshMap([{ id: "a" }]);
    expect(stabilize(previous, freshMap([{ id: "a" }, { id: "b" }]))).not.toBe(previous);
    expect(stabilize(previous, freshMap([]))).not.toBe(previous);
    expect(stabilize(previous, freshMap([{ id: "a" }, { id: "b" }]))).not.toBe(previous);
  });

  it("breaks identity when a subagent gains a message", () => {
    const previous = freshMap([{ id: "call_1" }]);
    const next = freshMap([{ id: "call_1", extra: 1 }]);
    expect(stabilize(previous, next)).not.toBe(previous);
  });

  it("uses the first map when there is no previous one", () => {
    const next = freshMap(BASE);
    expect(stabilize(null, next)).toEqual(next);
  });
});
