/**
 * Spec §5.4 — when the backend cannot be reached the user sees a banner, not a
 * blank screen, and the banner names the address actually in use.
 *
 * Rendered ABOVE the middle column while the inline banner remains the place a
 * mid-run `stream.error` lands: a failure after the run started must not clear
 * or cover content the run already produced.
 */
export function ConnectionBanner({
  url,
  detail,
  onRetry,
}: {
  /** The exact base URL the stream hook connects to. */
  url: string;
  /** Set when a request failed; absent while merely still connecting. */
  detail?: string;
  /** Re-runs the reachability probe. Omitted while merely connecting. */
  onRetry?: () => void;
}) {
  return (
    <div
      className="flex items-center gap-2 border-b px-4 py-2 text-sm"
      style={{
        borderColor: "var(--border)",
        background: "var(--panel-2)",
        color: detail ? "var(--danger)" : "var(--muted)",
      }}
      role="alert"
    >
      <span>{detail ? "无法连接后端" : "正在连接后端"}：</span>
      <code className="font-mono">{url}</code>
      {detail ? <span className="truncate"> · {detail}</span> : null}
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="ml-auto shrink-0 rounded border px-2 py-0.5 text-xs"
          style={{ borderColor: "var(--border)", color: "var(--fg)" }}
        >
          重试
        </button>
      ) : null}
    </div>
  );
}
