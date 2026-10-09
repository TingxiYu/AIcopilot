import { Client } from "@langchain/langgraph-sdk";
import { useCallback, useEffect, useState } from "react";
import { threadTitle } from "../lib/title";
import { messageText, type RawMessage } from "../lib/rows";

/**
 * The thread list, and the operations the sidebar offers on it.
 *
 * Rename and archive are persisted into the thread's own `metadata` through
 * `client.threads.update`, which is an existing endpoint — the backend contract
 * is untouched. The backend stores no title of its own, so a renamed thread
 * keeps its name in `metadata.title` and an un-renamed one falls back to the
 * first human message, which is what the app already displayed.
 */

const PAGE_SIZE = 100;
/** A title the user typed. Authoritative — never overwritten by the summariser. */
const TITLE_KEY = "title";
/**
 * A title the app derived from the conversation once a run finished.
 *
 * Kept in its own key so the two cannot collide: a rename must survive the next
 * completed run, and the summariser must not treat its own earlier output as a
 * user's choice and stop updating.
 */
const AUTO_TITLE_KEY = "autoTitle";
const ARCHIVED_KEY = "archived";
/** Pinned threads are hoisted into their own group at the top of the list. */
const PINNED_KEY = "pinned";

export type ThreadSummary = {
  id: string;
  title: string;
  updatedAt: string;
  archived: boolean;
  /** Hoisted to the top of the list; persisted in thread metadata. */
  pinned: boolean;
  /** The backend reports a thread with an in-flight run as busy. */
  running: boolean;
};

/** The subset of the SDK's `Thread` this hook reads. */
type RawThread = {
  thread_id: string;
  updated_at: string;
  metadata?: Record<string, unknown> | null;
  status?: string;
  values?: unknown;
};

function messagesOf(values: unknown): RawMessage[] | undefined {
  const messages = (values as { messages?: unknown })?.messages;
  return Array.isArray(messages) ? (messages as RawMessage[]) : undefined;
}

/** First non-blank string among the candidates, or null. */
function firstText(...candidates: unknown[]): string | null {
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim() !== "") return candidate;
  }
  return null;
}

/**
 * Project a backend thread into what the sidebar renders.
 *
 * Title precedence is deliberate, best first:
 *   1. `title`      — the user renamed it; a rename the sidebar then ignored
 *                     would look like the rename silently failed.
 *   2. `autoTitle`  — the summariser's output, kept so the sidebar does not
 *                     flicker between it and the raw opening question.
 *   3. the first human message — what there is before a run has finished.
 */
export function summarizeThread(thread: RawThread): ThreadSummary {
  const metadata = thread.metadata ?? {};

  return {
    id: thread.thread_id,
    title:
      firstText(metadata[TITLE_KEY], metadata[AUTO_TITLE_KEY]) ??
      threadTitle(messagesOf(thread.values)),
    updatedAt: thread.updated_at,
    archived: metadata[ARCHIVED_KEY] === true,
    pinned: metadata[PINNED_KEY] === true,
    running: /busy|running/i.test(thread.status ?? ""),
  };
}

const DAY_MS = 86_400_000;

/** Which bucket a thread belongs in. `now` is injected so this stays testable. */
export function groupOf(iso: string, now: number): "今天" | "最近 7 天" | "更早" {
  const age = now - new Date(iso).getTime();
  if (age < DAY_MS) return "今天";
  if (age < 7 * DAY_MS) return "最近 7 天";
  return "更早";
}

export const GROUP_ORDER = ["今天", "最近 7 天", "更早"] as const;

/** Leading group for threads the user pinned, regardless of age. */
export const PINNED_GROUP = "置顶";

/**
 * Bucket threads for display, dropping empty groups.
 *
 * Pinned threads ignore the date buckets entirely and get their own group at
 * the top — pinning something into the middle of "最近 7 天" would not be
 * pinning it anywhere in particular.
 */
export function groupThreads(
  threads: ThreadSummary[],
  now: number,
): { label: string; items: ThreadSummary[] }[] {
  const pinned = threads.filter((thread) => thread.pinned);
  const rest = threads.filter((thread) => !thread.pinned);

  const dated = GROUP_ORDER.map((label) => ({
    label,
    items: rest.filter((thread) => groupOf(thread.updatedAt, now) === label),
  })).filter((group) => group.items.length > 0);

  return pinned.length === 0 ? dated : [{ label: PINNED_GROUP, items: pinned }, ...dated];
}

export function matchesQuery(thread: ThreadSummary, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (needle === "") return true;
  return thread.title.toLowerCase().includes(needle);
}

export function useThreads(apiUrl: string, activeId: string | undefined) {
  const [all, setAll] = useState<ThreadSummary[]>([]);
  const [query, setQuery] = useState("");

  const reload = useCallback(async () => {
    const client = new Client({ apiUrl });
    try {
      const list = await client.threads.search({
        metadata: { graph_id: "research" },
        limit: PAGE_SIZE,
      });
      setAll((list as unknown as RawThread[]).map(summarizeThread));
    } catch {
      // No backend, a refused connection and a CORS failure all land here. The
      // list is a convenience; an unreachable backend must leave the app usable
      // rather than throw during render.
      setAll([]);
    }
  }, [apiUrl]);

  // Re-running on `activeId` keeps the list fresh after the first submit of a
  // new thread mints an id, without needing a polling loop.
  useEffect(() => {
    void reload();
  }, [reload, activeId]);

  /**
   * Apply a metadata patch, preserving whatever else the thread carries.
   *
   * The current metadata is read back first rather than sent blind: whether
   * `threads.update` merges or replaces is a server-side detail, and a replace
   * would drop `graph_id` — which is the key `search` filters on, so the thread
   * would vanish from its own list.
   */
  const patch = useCallback(
    async (id: string, patchMetadata: Record<string, unknown>) => {
      const client = new Client({ apiUrl });
      try {
        const thread = (await client.threads.get(id)) as unknown as RawThread;
        await client.threads.update(id, {
          metadata: { ...(thread.metadata ?? {}), ...patchMetadata },
        });
      } catch {
        // Nothing useful to do here; `reload` below reconciles the list with
        // whatever the backend actually holds, so a failed patch simply does
        // not appear rather than leaving the UI asserting it succeeded.
      }
      await reload();
    },
    [apiUrl, reload],
  );

  const rename = useCallback(
    (id: string, title: string) => patch(id, { [TITLE_KEY]: title.trim() }),
    [patch],
  );

  /**
   * Store a title the app derived from the conversation.
   *
   * Two guards, both about not doing needless work on a hook that runs after
   * every completed run:
   *   - a manual `title` wins, so a rename is never clobbered;
   *   - an unchanged value is not written, so a re-render or a repeated run does
   *     not issue a redundant backend write.
   */
  const setAutoTitle = useCallback(
    async (id: string, title: string) => {
      const trimmed = title.trim();
      if (trimmed === "") return;
      try {
        const client = new Client({ apiUrl });
        const thread = (await client.threads.get(id)) as unknown as RawThread;
        const metadata = thread.metadata ?? {};
        if (firstText(metadata[TITLE_KEY])) return;
        if (metadata[AUTO_TITLE_KEY] === trimmed) return;
      } catch {
        // If the thread cannot be read there is nothing safe to update; the
        // sidebar keeps whatever it was showing.
        return;
      }
      await patch(id, { [AUTO_TITLE_KEY]: trimmed });
    },
    [apiUrl, patch],
  );

  const archive = useCallback((id: string) => patch(id, { [ARCHIVED_KEY]: true }), [patch]);

  const setPinned = useCallback(
    (id: string, pinned: boolean) => patch(id, { [PINNED_KEY]: pinned }),
    [patch],
  );

  /**
   * The last thing the user asked in a thread, for "continue in a new
   * conversation".
   *
   * The list projection carries only what the sidebar renders, so the message
   * body has to be fetched. Returns "" when the thread has no human message or
   * cannot be read — the caller then just opens an empty new conversation,
   * which is still a truthful outcome.
   */
  const lastQuestionIn = useCallback(
    async (id: string): Promise<string> => {
      try {
        const client = new Client({ apiUrl });
        const thread = (await client.threads.get(id)) as unknown as RawThread;
        const messages = messagesOf(thread.values) ?? [];
        for (let i = messages.length - 1; i >= 0; i -= 1) {
          if (messages[i].type !== "human") continue;
          const text = messageText(messages[i].content).trim();
          if (text !== "") return text;
        }
      } catch {
        // Falls through to "".
      }
      return "";
    },
    [apiUrl],
  );

  const remove = useCallback(
    async (id: string) => {
      const client = new Client({ apiUrl });
      try {
        await client.threads.delete(id);
      } catch {
        // Same reasoning as `reload`.
      }
      await reload();
    },
    [apiUrl, reload],
  );

  const visible = all.filter((thread) => !thread.archived && matchesQuery(thread, query));

  return {
    threads: visible,
    query,
    setQuery,
    reload,
    rename,
    setAutoTitle,
    setPinned,
    lastQuestionIn,
    archive,
    remove,
  };
}
