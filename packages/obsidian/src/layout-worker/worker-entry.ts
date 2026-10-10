// What runs inside the layout worker (spec §9, layout_contained): the core's side of the talk, with the bundled Graphviz
// engine. The build bundles this file on its own, Graphviz WebAssembly and all, and puts it in main.js once, as the body
// of the function `layoutWorker` (see layout-worker.ts): a worker is started from that function's text, and the page
// calls the function itself where no worker can run.
// The core's two modules the worker needs, by their own paths rather than through the core's entry: the entry would bring
// in the whole graph library, which is written as CommonJS, so it cannot be shaken out, and main.js would carry it twice.
import { serveLayouts } from '../../../core/src/layout-worker.ts';
import type { LayoutScope } from '../../../core/src/layout-worker.ts';
import { loadEngine } from '../../../core/src/engine.ts';

/** The worker's own scope, handed in by the function wrapped round this bundle: `self` in a worker; none on the page. */
declare const scope: LayoutScope | undefined;

if (scope) serveLayouts(scope, loadEngine);

/** The engine, started on the page's own thread, for where no worker can run. */
export { loadEngine };
