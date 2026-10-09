/**
 * Shared test setup. Deliberately NOT a global jsdom environment — each test
 * file still opts in with a `// @vitest-environment jsdom` docblock, because a
 * global one silently breaks the node-side tests (see the note in
 * vite.config.ts about jsdom's URL rejecting the `file:` scheme).
 *
 * This file only fills gaps in jsdom that antd needs, and it assigns them
 * DIRECTLY rather than through `vi.stubGlobal`. That distinction matters:
 * several test files call `vi.unstubAllGlobals()` in `afterEach`, which would
 * tear down anything this file had stubbed and break the next test in the file.
 *
 * `ResizeObserver` is deliberately absent from this list — antd's
 * `rc-resize-observer` bundles `resize-observer-polyfill`, so Splitter, Tabs and
 * friends work under jsdom without a global.
 *
 * `matchMedia` IS needed, which is worth recording because it was predicted not
 * to be: the reasoning was that only antd's Row/Col reach `responsiveObserver`,
 * and this app uses neither. Running the panel tests proved otherwise — antd's
 * Tabs reaches it and threw "window.matchMedia is not a function" from six
 * tests. It is defined here as a non-matching default; `app-smoke.test.tsx`
 * overrides it per test (it needs `matches` to vary for the theme-persistence
 * case), and because that override goes through `vi.stubGlobal`, its
 * `unstubAllGlobals()` restores this one rather than leaving the window bare.
 */

if (typeof window !== "undefined") {
  // jsdom implements neither, and rc-virtual-list (behind antd's List and
  // Select) calls them. Without these a component that scrolls throws
  // "scrollTo is not a function" rather than failing an assertion.
  if (!HTMLElement.prototype.scrollTo) {
    HTMLElement.prototype.scrollTo = () => {};
  }
  if (!HTMLElement.prototype.scrollIntoView) {
    HTMLElement.prototype.scrollIntoView = () => {};
  }

  if (typeof window.matchMedia !== "function") {
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener() {},
      removeListener() {},
      addEventListener() {},
      removeEventListener() {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
  }
}
