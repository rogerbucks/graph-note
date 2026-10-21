// The host's side of a plug-in run apart from it, in a worker (editor spec §54, TRUST-14). The host is handed the port
// to a worker that serves one plug-in (plugin-serve.ts), so the core stays host-free. From what the worker says it
// added, it makes a plug-in the registry installs as any other. Every call into it goes over the port, as data:
// - a call has the time limit, read by the host's own clock, so one that never answers is stopped too;
// - a plug-in that runs over it is stopped for good: its worker is ended, whatever it was doing;
// - the worker reaches only the host abilities its manifest names, each through the registry's own checks.
import type { Clock } from './layout-worker.ts';
import type { ExtensionPoints, ThoughtKnotPlugin } from './plugins.ts';
import type { HostAbilities } from './plugin-points.ts';
import type { NoteStorage } from './note-storage.ts';
import type { Added, FromPlugin, ToPlugin } from './plugin-serve.ts';

/** The host's end of a worker, shaped as a browser's Worker is. */
export interface PluginPort {
  postMessage(message: ToPlugin): void;
  terminate(): void;
  onmessage: ((event: { data: FromPlugin }) => void) | null;
  onerror: ((event: unknown) => void) | null;
}

/** How a plug-in run apart is set up: the host's clock, and how long a call and the start may take. */
export interface IsolatedOptions {
  clock: Clock;
  /** In milliseconds, for each call; 2 seconds unless set. */
  timeLimit?: number;
  /** In milliseconds, for the worker to say what its plug-in added; 10 seconds unless set. */
  startLimit?: number;
}

/** A plug-in run apart: the plug-in a registry installs, and its stop. */
export interface IsolatedPlugin {
  plugin: ThoughtKnotPlugin;
  /** Why it was stopped, or null while it runs. */
  stopped: () => string | null;
  /** Ends its worker; every call waiting on it fails, and none is made again. */
  stop: (why?: string) => void;
}

/** The host abilities a worker may ask for, and the calls of each; anything else is refused. */
const ASKABLE: Record<string, readonly string[]> = {
  notice: [''],
  settings: ['load', 'save'],
  secrets: ['get'],
  files: ['list', 'read', 'write', 'remove'],
};

const said = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** The plug-in served on `port`, once its worker says what it added; rejects, saying why, when it cannot start. */
export function isolatedPlugin(port: PluginPort, options: IsolatedOptions): Promise<IsolatedPlugin> {
  const { clock, timeLimit = 2000, startLimit = 10_000 } = options;
  const waiting = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: unknown }>();
  const asks: Extract<FromPlugin, { ask: number }>[] = [];
  let host: Partial<HostAbilities> | null = null;
  let why: string | null = null;
  let next = 1;
  const stop = (reason = 'it was stopped by the host') => {
    if (why !== null) return;
    why = reason;
    port.onmessage = null;
    port.terminate();
    for (const w of waiting.values()) {
      clock.clearTimeout(w.timer);
      w.reject(new Error(`the plug-in was stopped, as ${reason}`));
    }
    waiting.clear();
  };
  /** The answer of the call to `handle`, timed by the host's clock; the plug-in is stopped when it is too late. */
  const call = (handle: number, args: unknown[]): Promise<unknown> => {
    if (why !== null) return Promise.reject(new Error(`the plug-in was stopped, as ${why}`));
    const n = next++;
    return new Promise((resolve, reject) => {
      const timer = clock.setTimeout(() => stop(`a call ran over the ${timeLimit} ms allowed`), timeLimit);
      waiting.set(n, { resolve, reject, timer });
      port.postMessage({ call: n, handle, args });
    });
  };
  /** Answers what the worker asked of the host, once the registry has given the abilities. */
  const answer = (a: Extract<FromPlugin, { ask: number }>) => {
    if (!host) return void asks.push(a);
    const given = (host as Record<string, unknown>)[a.ability];
    const allowed = Object.hasOwn(ASKABLE, a.ability) && ASKABLE[a.ability]?.includes(a.method);
    const fn = a.method === '' ? given : (given as Record<string, unknown> | undefined)?.[a.method];
    void Promise.resolve()
      .then(() => {
        if (!allowed || typeof fn !== 'function') throw new Error(`the host ability ${a.ability} was not given`);
        return Reflect.apply(fn, given, a.args) as unknown;
      })
      .then(
        (value) => why === null && port.postMessage({ answered: a.ask, value: a.method === '' ? undefined : value }),
        (e: unknown) => why === null && port.postMessage({ answered: a.ask, error: said(e) }),
      );
  };
  return new Promise((resolve, reject) => {
    const startTimer = clock.setTimeout(() => {
      stop(`it did not start within the ${startLimit} ms allowed`);
      reject(new Error(`The plug-in did not start within the ${startLimit} ms allowed.`));
    }, startLimit);
    port.onerror = (e) => {
      clock.clearTimeout(startTimer);
      stop(`its worker failed: ${said(e)}`);
      reject(new Error(`The plug-in's worker failed: ${said(e)}`));
    };
    port.onmessage = ({ data }) => {
      if ('reply' in data) {
        const w = waiting.get(data.reply);
        if (!w) return;
        waiting.delete(data.reply);
        clock.clearTimeout(w.timer);
        if (data.error === undefined) w.resolve(data.value);
        else w.reject(new Error(data.error));
      } else if ('ask' in data) answer(data);
      else if ('failed' in data) {
        clock.clearTimeout(startTimer);
        stop(`it could not register: ${data.failed}`);
        reject(new Error(`The plug-in could not register: ${data.failed}.`));
      } else {
        clock.clearTimeout(startTimer);
        resolve({ plugin: proxied(data.manifest, data.added), stopped: () => why, stop });
      }
    };
  });

  /** The plug-in the registry installs: each thing it added, its calls made over the port. */
  function proxied(manifest: Omit<ThoughtKnotPlugin, 'register'>, added: Added[]): ThoughtKnotPlugin {
    return {
      ...manifest,
      register(points: ExtensionPoints) {
        host = points.host ?? {};
        for (const a of asks.splice(0)) answer(a);
        let stores = 0;
        for (const { point, fields, handle } of added) {
          const to = (point as string) !== 'host' && Object.hasOwn(points, point) ? points[point] : undefined;
          if (!to || !('add' in to)) throw new Error(`it adds to ${point}, which its manifest does not name`);
          const run = (...args: unknown[]) => call(handle, args);
          const own = { ...fields } as Record<string, unknown>;
          const add = to.add as (t: unknown) => void;
          if (point === 'theme') add(own);
          else if (point === 'storage') {
            const open = (): NoteStorage => {
              const store = ++stores;
              const at =
                (method: string) =>
                (...args: unknown[]) =>
                  run(store, method, args);
              return { list: at('list'), read: at('read'), write: at('write'), remove: at('remove') } as NoteStorage;
            };
            add({ ...own, open });
          } else if (point === 'commands') add({ ...own, run: () => void run().catch(() => {}) });
          else if (point === 'sources') add({ ...own, read: run });
          else if (point === 'steps' || point === 'diagrams')
            add({ ...own, [point === 'steps' ? 'run' : 'draw']: run });
          else throw new Error(`a plug-in run apart cannot add to ${point} yet`);
        }
      },
    };
  }
}
