// The page's layouts (spec §9, layout_contained; §26, cc_worker_same_origin): one worker, started from the file the server
// serves at `/layout-worker.js` from its own origin, never from text made in the page or another site, under the limits
// the core's LayoutRunner keeps. The page itself carries no Graphviz engine, so where no worker can start a layout is
// refused in words (`NO_WORKER`), never run on the page's thread and never left blank.
// (the core's module by its own path, not its entry: the entry also names the engine, which the page never carries)
import { inThreadPort, LayoutRunner, serveLayouts } from '../../core/src/layout-worker.ts';
import type { LayoutPort, LayoutReply } from '../../core/src/layout-worker.ts';

/** Where the worker's file is: the server's own, by a path from its root. */
export const WORKER_PATH = '/layout-worker.js';

/** What is said when a layout cannot run because no worker can be started. */
export const NO_WORKER = 'The layout worker could not be started, so the graph is shown as text.';

/** A port to the worker file, shaped as the core's runner takes it. */
export function workerPort(win: Window & { Worker: typeof Worker }): LayoutPort {
  const worker = new win.Worker(WORKER_PATH);
  const port: LayoutPort = {
    onmessage: null,
    onerror: null,
    postMessage: (request) => worker.postMessage(request),
    terminate: () => worker.terminate(),
  };
  worker.onmessage = (e: MessageEvent<LayoutReply>) => port.onmessage?.(e);
  worker.onerror = (e) => port.onerror?.(e.message || e);
  return port;
}

/** The page's layouts: the runner over the worker, with timers from the window it runs in. */
export function pageLayouts(win: Window & { Worker: typeof Worker }): LayoutRunner {
  return new LayoutRunner({
    worker: () => workerPort(win),
    // the page's own thread has no engine here: the runner's fallback says why instead of drawing
    page: () => inThreadPort((scope) => serveLayouts(scope, () => Promise.reject(new Error(NO_WORKER)))),
    clock: {
      setTimeout: (run, ms) => win.setTimeout(run, ms),
      clearTimeout: (t) => win.clearTimeout(t as number),
    },
  });
}
