// The layout worker's bundle, as main.js holds it (spec §9, layout_contained): made at build time by esbuild.config.mjs
// from worker-entry.ts, never written as a file.
declare module 'graph-note:layout-worker' {
  import type { Engine, LayoutScope } from '@graph-note/core';

  /**
   * Runs the layout worker's bundle. Given a scope (`self`, in a worker), it answers layout requests on it; given none,
   * it only hands back its engine, for the page's own thread. Its text, from toString(), is the worker's whole source.
   */
  export function layoutWorker(scope: LayoutScope | undefined): { loadEngine(): Promise<Engine> };
}
