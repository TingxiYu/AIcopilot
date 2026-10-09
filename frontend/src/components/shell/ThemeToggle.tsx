import type { Theme } from "../../hooks/useTheme";

/**
 * The visible control for the theme state `useTheme` owns.
 *
 * Colours are tokens only (`--fg` / `--muted`), so the button restyles itself
 * with the very theme it switches — a hardcoded colour here would be the one
 * surface that does not follow the toggle.
 */
export function ThemeToggle({ theme, onToggle }: { theme: Theme; onToggle: () => void }) {
  const next = theme === "dark" ? "light" : "dark";

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={theme === "dark"}
      // An explicit name, so the control is addressable regardless of which
      // glyph/label it happens to show in the current theme.
      aria-label={`切换到${next === "dark" ? "深色" : "浅色"}主题`}
      title={`切换到${next === "dark" ? "深色" : "浅色"}主题`}
      className="flex w-full items-center gap-2 border-t px-3 py-2 text-left text-xs"
      style={{ borderColor: "var(--border)", color: "var(--muted)" }}
    >
      <span aria-hidden>{theme === "dark" ? "◐" : "◑"}</span>
      <span>{theme === "dark" ? "深色" : "浅色"}</span>
    </button>
  );
}
