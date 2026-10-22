// What runs first in the worker a plug-in from outside runs in on the page (spec §54, plugin_outside_file; API-10). The
// page's build bundles this file on its own, into `plugin-start.txt`, as the body of one function. The server puts that
// function, run on `self`, before each plug-in file it serves (server/page-plugins.ts). So the worker is sealed before
// the file's first line runs: no network, and no way to make code from text. It is the Obsidian host's start, built
// from the same core module.
import { sealOutside } from '../../core/src/plugin-outside.ts';
import type { PluginScope } from '../../core/src/plugin-serve.ts';

/** The worker's own scope, handed in by the function wrapped round this bundle: `self`. */
declare const scope: PluginScope & object;

/** The call that serves the file's plug-in, which the script names `thoughtknotServe`. */
export const serve = sealOutside(scope);
