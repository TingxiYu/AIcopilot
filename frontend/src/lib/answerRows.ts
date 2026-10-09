import { messageText, type RawMessage, type Row } from "./rows";

/** Public conversation projection. Process messages remain in runtime state. */
export function buildAnswerRows(
  messages: RawMessage[],
  finalReport: string | undefined,
  isRunning: boolean,
): Row[] {
  const rows: Row[] = [];
  let turn: RawMessage[] = [];

  function finishTurn(isLatest: boolean) {
    if (isLatest && isRunning) return;
    const last = turn[turn.length - 1];
    const hasFinalMessage = last?.type === "ai" && (last.tool_calls?.length ?? 0) === 0;
    const finalText = hasFinalMessage ? messageText(last.content).trim() : "";
    const wroteReport = turn.some(
      (message) => message.type === "ai" && message.tool_calls?.some(
        (call) => call.name === "write_file" &&
          (call.args as { file_path?: unknown } | null)?.file_path === "/artifacts/final_report.md",
      ),
    );
    const body = isLatest && wroteReport && finalReport?.trim()
      ? finalReport.trim()
      : finalText;
    if (body) {
      rows.push({ kind: "prose", key: last?.id ?? `answer-${rows.length}`, role: "ai", body });
    }
  }

  for (const message of messages) {
    if (message.type === "human") {
      finishTurn(false);
      rows.push({
        kind: "prose",
        key: message.id ?? `question-${rows.length}`,
        role: "human",
        body: messageText(message.content),
      });
      turn = [];
    } else {
      turn.push(message);
    }
  }
  finishTurn(true);
  return rows;
}
