// The outside plug-ins' worker bundle, as main.js holds it (spec §54, plugin_outside_file). It is made at build time by
// esbuild.config.mjs from plugin-worker-entry.ts, never written as a file.
declare module 'thoughtknot:plugin-worker' {
  import type { PluginScope } from '@thoughtknot/core';

  /**
   * Seals `scope` (`self`, in a worker) and gives back the call that serves a plug-in. Its text, from toString(), is
   * the start of the worker's script.
   */
  export function pluginWorker(scope: PluginScope & object): (plugin: unknown) => void;
}
