// What runs first in the worker an outside plug-in runs in (spec §54, plugin_outside_file). The build bundles this file
// on its own and puts it in main.js once, as the body of the function `pluginWorker` (see outside-plugins.ts). The
// worker's script is that function, run on `self`, and then the plug-in's file. So the worker is sealed before the
// file's first line runs: no network, and no way to make code from text.
// The core's module by its own path, not through the core's entry, so the worker carries only what it needs.
import { sealOutside } from '../../../core/src/plugin-outside.ts';
import type { PluginScope } from '../../../core/src/plugin-serve.ts';

/** The worker's own scope, handed in by the function wrapped round this bundle: `self`. */
declare const scope: PluginScope & object;

/** The call that serves the file's plug-in, which the script names `thoughtknotServe`. */
export const serve = sealOutside(scope);
