/**
 * Shown while spec §4.5.3's pin is disengaged, so the user can see that the
 * conversation is no longer following and return in one action.
 */
export function ScrollToLatest({
  show,
  onClick,
}: {
  show: boolean;
  onClick: () => void;
}) {
  if (!show) return null;

  return (
    <button
      type="button"
      onClick={onClick}
      className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full border px-3 py-1 text-xs shadow"
      style={{
        background: "var(--panel)",
        borderColor: "var(--border)",
        color: "var(--fg)",
      }}
    >
      回到最新
    </button>
  );
}
