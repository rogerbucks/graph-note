// What runs inside the page's layout worker (spec §9, layout_contained; §26, cc_worker_same_origin). It is the core's
// side of the talk with the bundled Graphviz engine. It is built on its own into `layout-worker.js`. The server serves
// that file from its own origin. The worker takes the core's two modules it needs by their own paths. The Obsidian
// plugin's worker takes them the same way. So the graph library the core's entry gathers is not carried a second time.
import { serveLayouts } from '../../core/src/layout-worker.ts';
import type { LayoutScope } from '../../core/src/layout-worker.ts';
import { loadEngine } from '../../core/src/engine.ts';

serveLayouts(self as unknown as LayoutScope, loadEngine);
