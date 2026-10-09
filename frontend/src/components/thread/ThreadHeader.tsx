/**
 * The conversation summary, centred at the top of the middle column.
 *
 * It used to sit at the window's top-left, where it read as a page heading for
 * the whole application rather than as a property of this conversation. Centred
 * over the message band, it reads as the thread's title.
 *
 * Rendered from `stream.messages` and the parsed artifacts in `App`, both
 * derived from the same stream handle as every other panel (§5.1), so no extra
 * fetch happens here.
 */
export function ThreadHeader({
  title,
  citationCount,
}: {
  title: string;
  citationCount: number;
}) {
  return (
    <header
      className="flex items-baseline justify-center gap-2 border-b px-4 py-2"
      style={{ borderColor: "var(--border)" }}
    >
      <h1 className="truncate text-center text-sm font-medium">{title}</h1>
      {citationCount > 0 ? (
        <span className="shrink-0 text-xs" style={{ color: "var(--muted)" }}>
          {citationCount} 来源
        </span>
      ) : null}
    </header>
  );
}
