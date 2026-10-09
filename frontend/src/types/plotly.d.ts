/**
 * Ambient declaration for the Plotly browser bundle.
 *
 * `plotly.js-basic-dist-min` ships no types and has no `exports` map — its
 * package.json names only `main`. `skipLibCheck` does not help here: that
 * setting skips checking the `.d.ts` files it finds, not the resolution failure
 * you get from importing a module that has none. Without this, `tsc -b` (the
 * first half of `npm run build`) fails on the dynamic import in `ScatterPlot`.
 *
 * Deliberately loose. The full `@types/plotly.js` package targets the unbundled
 * `plotly.js` package at a different major version, and the only API this app
 * touches is `newPlot` plus `react`/`purge`, so a hand-written narrow shape
 * would be more fiction than the `any` it replaces.
 */
declare module "plotly.js-basic-dist-min" {
  const Plotly: {
    newPlot(
      root: HTMLElement,
      data: unknown[],
      layout?: unknown,
      config?: unknown,
    ): Promise<unknown>;
    react(
      root: HTMLElement,
      data: unknown[],
      layout?: unknown,
      config?: unknown,
    ): Promise<unknown>;
    purge(root: HTMLElement): void;
  };
  export default Plotly;
}
