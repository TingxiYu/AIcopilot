/**
 * Clipboard writes, for the sidebar's copy actions.
 *
 * `navigator.clipboard` is unavailable outside a secure context and is absent
 * from jsdom, so the call is guarded and reports success rather than throwing.
 * Callers use the boolean to decide whether to claim the copy happened — a
 * silent failure here would leave the user pasting stale content.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    const clipboard = globalThis.navigator?.clipboard;
    if (!clipboard?.writeText) return false;
    await clipboard.writeText(text);
    return true;
  } catch {
    // Denied permission, a non-secure origin, or a jsdom stub that throws.
    return false;
  }
}

/** The shareable URL for a thread: the app's own address plus `?thread=`. */
export function shareUrlFor(threadId: string, href: string): string {
  const url = new URL(href);
  url.searchParams.set("thread", threadId);
  return url.toString();
}
