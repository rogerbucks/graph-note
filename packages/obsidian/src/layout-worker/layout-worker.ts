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
import { LayoutRunner, PAGE_LIMITS, inThreadPort, serveLayouts } from '@thoughtknot/core';
import type { Drawn, Engine, GraphDrawing, LayoutLimits, LayoutPort, LayoutReply, Refusal } from '@thoughtknot/core';
import type { ExportTheme, Told } from '@thoughtknot/core';
import { layoutWorker } from 'thoughtknot:layout-worker';

/** What is said once in the console, for each thing the runner tells. */
const SAID: Record<Told, string> = {
  'on-the-page':
    'Thoughtknot: web workers cannot run here, so graphs are laid out on the main thread, with lower size limits. A slow layout cannot be stopped there.',
  stopped:
    'Thoughtknot: several layouts in a row took too long or failed, so drawing is paused until the plugin is reloaded.',
};

/** Whether this host can start a worker from a Blob: every Obsidian can, desktop and phone; a test may not. */
const workersRun = () =>
  typeof Worker === 'function' && typeof Blob === 'function' && typeof URL.createObjectURL === 'function';

/** The engine run on the page's own thread, from the same bundle the worker runs. */
export function engineOnThePage(): Promise<Engine> {
  return layoutWorker(undefined).loadEngine();
}

/**
 * The tighter of two sets of limits, field by field, so a setting that lowers a limit lowers it on the page too; but the
 * longer of the two start times, as starting the engine is no layout to hold back.
 */
const tighter = (a: LayoutLimits, b: LayoutLimits): LayoutLimits => ({
  things: Math.min(a.things, b.things),
  links: Math.min(a.links, b.links),
  sourceBytes: Math.min(a.sourceBytes, b.sourceBytes),
  word: Math.min(a.word, b.word),
  ms: Math.min(a.ms, b.ms),
  startMs: Math.max(a.startMs, b.startMs),
});

/** The plugin's layouts: one worker, started on the first drawing, replaced when a layout overruns, closed on unload. */
export class Layouts {
  private readonly runner: LayoutRunner;
  private url: string | null = null;

  /** `limits` is read for each drawing, so a setting can change it; `engine` starts the engine on the page's thread. */
  constructor(limits: () => LayoutLimits, engine: () => Promise<Engine>) {
    // the plugin's own window, kept: a layout asked for as a popout closes still has its timer
    const w = window;
    this.runner = new LayoutRunner({
      ...(workersRun() ? { worker: () => this.worker() } : {}),
      page: () => inThreadPort((scope) => serveLayouts(scope, engine)),
      clock: {
        setTimeout: (run: () => void, ms: number) => w.setTimeout(run, ms),
        clearTimeout: (t: unknown) => w.clearTimeout(t as number),
      },
      limits,
      pageLimits: () => tighter(limits(), PAGE_LIMITS),
      told: (what, why) => console.warn(SAID[what], why ?? ''),
    });
  }

  /**
   * The drawing laid out and themed, or why it is shown as text; null when it is no longer wanted, superseded by a newer
   * drawing for the same `owner` or put away on unload. Rejects when the engine cannot start. With a `theme` it is themed
   * in that fixed palette, as an export is: an export is laid out here too, under the same limits (spec §16).
   */
  draw(drawing: GraphDrawing, owner?: object, theme?: ExportTheme): Promise<Drawn | Refusal | null> {
    return this.runner.draw(drawing, owner, theme);
  }

  /** Stops the worker, answers what waits on it with null, and lets its source go. */
  close(): void {
    this.runner.close();
    if (this.url) URL.revokeObjectURL(this.url);
    this.url = null;
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
}
