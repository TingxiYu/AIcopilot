import { extractHeadings } from "./outline";
import { messageText, type RawMessage } from "./rows";

/**
 * Derive a short conversation title from what the run produced.
 *
 * This is the client-side stand-in for the title generation a chat product does
 * server-side. There is no model call behind it and there cannot be one: the
 * backend contract is fixed, and the only endpoint the app may use is the
 * thread-metadata update it already calls for rename/archive. So the summary is
 * EXTRACTIVE — it picks the best phrase already present in the conversation
 * rather than inventing one, because a fabricated title would be the one piece
 * of text in the UI that no part of the run actually supports.
 *
 * Preference order, best first:
 *   1. The report's own heading — the agent's own one-line statement of the
 *      topic, and usually the cleanest.
 *   2. The first human message, with the request framing stripped ("请帮我研究
 *      一下玉米 GS" → "玉米 GS").
 *
 * Deterministic: the same conversation always yields the same title, which is
 * what keeps the sidebar from rewriting itself on every re-render.
 */

/** Long enough to be specific, short enough to sit on one sidebar row. */
export const MAX_TITLE_LENGTH = 20;

/**
 * Request framing that carries no topic.
 *
 * Longest alternatives first: the regex is ordered, so `研究一下` must be tried
 * before `研究` or it would strip only the shorter prefix and leave `一下玉米`.
 */
const LEADING_FRAMING =
  /^(请|帮我|帮忙|麻烦|我想|我要|我需要|请问|关于|介绍一下|介绍|说明一下|说明|解释一下|解释|解读一下|解读|调研一下|调研|研究一下|研究|总结一下|总结|分析一下|分析|检索一下|检索|查一下|查询|想|要)+[，,、：:\s]*/;

/** Trailing punctuation and question particles. */
const TRAILING = /[。．.？?！!，,、；;：:\s]+$/;

function tidy(text: string): string {
  return text.replace(/\s+/g, " ").replace(TRAILING, "").trim();
}

export function autoTitle(input: { messages?: RawMessage[]; report?: string }): string {
  const heading = input.report ? extractHeadings(input.report)[0]?.text : undefined;
  const firstHuman = input.messages?.find((message) => message.type === "human");

  // The report heading wins when there is one: it is the agent's own summary of
  // the whole run, where the opening message is only the request.
  const fromHeading = heading ? tidy(heading) : "";
  const fromQuestion = firstHuman ? tidy(messageText(firstHuman.content)) : "";

  const base = fromHeading.length > 2 ? fromHeading : fromQuestion;
  if (base === "") return "";

  const stripped = tidy(base.replace(LEADING_FRAMING, ""));
  // Stripping can consume a whole short title ("请研究" → ""). An empty result
  // is worse than a redundant prefix, so fall back to what we started with.
  const chosen = stripped.length > 0 ? stripped : base;

  return chosen.slice(0, MAX_TITLE_LENGTH);
}
