// The layout kept apart from the interface (spec §9, layout_contained): every graph is laid out in one Web Worker, reused,
// under the size and time limits the core's LayoutRunner keeps, so a huge or hostile graph never freezes Obsidian.
//
// How the engine gets into the worker. Obsidian installs only main.js, manifest.json and styles.css, so the worker cannot
// be a file of its own, and nothing may be fetched (spec §13). The build bundles worker-entry.ts on its own, the Graphviz
// WebAssembly inside it, and main.js holds that bundle once, as the body of the function `layoutWorker`. A worker is
// started from a Blob URL of that function's own text — Function.prototype.toString gives a function's source exactly,
// in V8 and in JavaScriptCore alike — and where no worker can run, the page calls the same function itself. This is the
// simplest way that works offline in Electron and in the iOS and Android web views: a Blob worker, and WebAssembly in a
// worker, run in all three. Keeping the bundle as a string instead would put the 1.2 MB engine in main.js twice, or leave
// the page able to run it only through eval, which the store's linter refuses.
import { LayoutRunner, inThreadPort, serveLayouts } from '@graph-note/core';
import type { Drawn, Engine, GraphDrawing, LayoutLimits, LayoutPort, LayoutReply, Refusal } from '@graph-note/core';
import { layoutWorker } from 'graph-note:layout-worker';

/** Said once in the console when the layout runs on the page's own thread. */
const ON_THE_PAGE =
  'Graph Note: web workers cannot run here, so graphs are laid out on the main thread. The size limits still apply, but a slow layout cannot be stopped.';

/** Whether this host can start a worker from a Blob: every Obsidian can, desktop and phone; a test may not. */
const workersRun = () =>
  typeof Worker === 'function' && typeof Blob === 'function' && typeof URL.createObjectURL === 'function';

/** The engine run on the page's own thread, from the same bundle the worker runs. */
export function engineOnThePage(): Promise<Engine> {
  return layoutWorker(undefined).loadEngine();
}

/** The plugin's layouts: one worker, started on the first drawing, replaced when a layout overruns, closed on unload. */
export class Layouts {
  private readonly runner: LayoutRunner;
  private readonly engine: () => Promise<Engine>;
  private url: string | null = null;
  private onThePage = false;

  /** `limits` is read for each drawing, so a setting can change it; `engine` starts the engine on the page's thread. */
  constructor(limits: () => LayoutLimits, engine: () => Promise<Engine>) {
    this.engine = engine;
    // the plugin's own window, kept: a layout asked for as a popout closes still has its timer
    const w = window;
    const clock = {
      setTimeout: (run: () => void, ms: number) => w.setTimeout(run, ms),
      clearTimeout: (t: unknown) => w.clearTimeout(t as number),
    };
    this.runner = new LayoutRunner(() => this.spawn(), clock, limits, {
      spawn: () => this.pagePort(),
      told: (why) => this.toPage(why),
    });
  }

  /** The drawing laid out and themed, or why it is shown as text. Rejects when the engine cannot start. */
  draw(drawing: GraphDrawing): Promise<Drawn | Refusal> {
    return this.runner.draw(drawing);
  }

  /** Stops the worker and lets its source go. */
  close(): void {
    this.runner.close();
    if (this.url) URL.revokeObjectURL(this.url);
    this.url = null;
  }

  private spawn(): LayoutPort {
    if (this.onThePage) return this.pagePort();
    if (!workersRun()) {
      this.toPage(null);
      return this.pagePort();
    }
    try {
      return this.worker();
    } catch (e) {
      this.toPage(e);
      return this.pagePort();
    }
  }

  /** A worker started from main.js's own copy of the bundle. */
  private worker(): LayoutPort {
    this.url ??= URL.createObjectURL(new Blob([`(${layoutWorker.toString()})(self);`], { type: 'text/javascript' }));
    const w = new Worker(this.url);
    const port: LayoutPort = {
      onmessage: null,
      onerror: null,
      postMessage: (request) => w.postMessage(request),
      terminate: () => w.terminate(),
    };
    w.onmessage = (e: MessageEvent<LayoutReply>) => port.onmessage?.(e);
    w.onerror = (e) => port.onerror?.(e.message || e);
    return port;
  }

  private pagePort(): LayoutPort {
    return inThreadPort((scope) => serveLayouts(scope, this.engine));
  }

  /** From now on the layout runs on the page's thread; said once. */
  private toPage(why: unknown): void {
    if (this.onThePage) return;
    this.onThePage = true;
    console.warn(ON_THE_PAGE, why ?? '');
  }
}
