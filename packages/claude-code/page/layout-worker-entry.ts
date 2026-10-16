// What runs inside the page's layout worker (spec §9, layout_contained; §26, cc_worker_same_origin): the core's side of the
// talk with the bundled Graphviz engine, built on its own into `layout-worker.js`, which the server serves from its own
// origin. The core's two modules the worker needs are taken by their own paths, as the Obsidian plugin's worker takes them,
// so the graph library the core's entry gathers is not carried a second time.
import { serveLayouts } from '../../core/src/layout-worker.ts';
import type { LayoutScope } from '../../core/src/layout-worker.ts';
import { loadEngine } from '../../core/src/engine.ts';

serveLayouts(self as unknown as LayoutScope, loadEngine);
