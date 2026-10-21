// The worker's side of a plug-in run apart from the host (editor spec §54, TRUST-14). The worker holds the plug-in and
// nothing of the host's:
// - `lockDown` takes the web's network and storage away from the worker before the plug-in's code runs;
// - `servePlugin` registers the plug-in and tells the host, as data, what it added and to which point;
// - each later call comes in as a message and its answer goes back as one. So the host can stop the worker at any time.
// A host ability the manifest names is reached by asking the host, which answers through the registry's own checks.
// The host's side is plugin-isolated.ts.
import type { ExtensionPoint, ThoughtKnotPlugin } from './plugins.ts';
import type { HostAbilities } from './plugin-points.ts';
import type { NoteStorage } from './note-storage.ts';
import type { ThemeToken } from './theme-tokens.ts';
import { pointOf } from './plugin-versions.ts';

/** One thing a plug-in added, as data: its point, its own fields, and the handle its calls go to. */
export interface Added {
  point: ExtensionPoint;
  fields: Record<string, unknown>;
  handle: number;
}

/** What the worker says. First the plug-in's manifest and all it added, or why it could not register. Then answers. */
export type FromPlugin =
  | { manifest: Omit<ThoughtKnotPlugin, 'register'>; added: Added[] }
  | { failed: string }
  | { reply: number; value?: unknown; error?: string }
  | { ask: number; ability: string; method: string; args: unknown[] };

/** What the host says: a call to a handle, or the answer to something the worker asked. */
export type ToPlugin =
  { call: number; handle: number; args: unknown[] } | { answered: number; value?: unknown; error?: string };

/** The worker's own end, shaped as a Web Worker's `self` is. */
export interface PluginScope {
  postMessage(message: FromPlugin): void;
  onmessage: ((event: { data: ToPlugin }) => void) | null;
}

/** The points a plug-in run apart may add to: none that needs the page, or an answer at once. */
export const ISOLATED_POINTS: readonly ExtensionPoint[] = [
  'theme',
  'storage',
  'commands',
  'sources',
  'steps',
  'diagrams',
];

/** The web's ways out: the network, storage that outlives the worker, and more workers. */
export const LOCKED_AWAY = [
  'fetch',
  'XMLHttpRequest',
  'WebSocket',
  'WebTransport',
  'EventSource',
  'RTCPeerConnection',
  'BroadcastChannel',
  'importScripts',
  'indexedDB',
  'caches',
  'Worker',
  'SharedWorker',
] as const;

/**
 * Takes each of `LOCKED_AWAY` from `scope`. A name cannot take away `import()`, which loads code from the network. So a
 * host also starts the worker under a content security policy that allows no network at all.
 *
 * It takes each from `scope` and every object it inherits from, so the plug-in's code cannot reach it.
 * Gives back the names it could not take. A host runs the plug-in only when that is none.
 */
export function lockDown(scope: object): string[] {
  const kept: string[] = [];
  for (const name of LOCKED_AWAY) {
    for (let o: object | null = scope; o; o = Object.getPrototypeOf(o) as object | null)
      if (Object.hasOwn(o, name)) Reflect.deleteProperty(o, name);
    if (name in scope) kept.push(name);
  }
  return kept;
}

const said = (e: unknown) => (e instanceof Error ? e.message : String(e));
type Call = (...args: unknown[]) => unknown;
const NOTE_METHODS = ['list', 'read', 'write', 'remove'] as const;

/** Serves `plugin` on `scope`: registers it at once, then answers each call the host makes. */
export function servePlugin(scope: PluginScope, plugin: ThoughtKnotPlugin): void {
  const handles = new Map<number, Call>();
  const asked = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  let next = 1;
  const ask = (ability: string, method: string, args: unknown[]) =>
    new Promise((resolve, reject) => {
      const n = next++;
      asked.set(n, { resolve, reject });
      scope.postMessage({ ask: n, ability, method, args });
    });
  const host: Partial<HostAbilities> = {};
  const named = plugin.abilities ?? [];
  if (named.includes('notice')) host.notice = (m) => void ask('notice', '', [m]);
  if (named.includes('settings'))
    host.settings = {
      load: () => ask('settings', 'load', []),
      save: (v) => ask('settings', 'save', [v]).then(() => {}),
    };
  if (named.includes('secrets')) host.secrets = { get: (n) => ask('secrets', 'get', [n]) as Promise<string | null> };
  if (named.includes('files'))
    host.files = Object.fromEntries(
      NOTE_METHODS.map((m) => [m, (...args: unknown[]) => ask('files', m, args)]),
    ) as unknown as NoteStorage;
  const added: Added[] = [];
  /** A point that keeps what is added as data, with a handle for its one call, `run`. */
  const point = (p: ExtensionPoint, run: string) => ({
    add: (t: Record<string, unknown>) => {
      const fields = Object.fromEntries(Object.entries(t).filter(([, v]) => typeof v !== 'function'));
      const handle = next++;
      const call = t[run];
      if (typeof call === 'function') handles.set(handle, (...args) => (call as Call).apply(t, args));
      added.push({ point: p, fields, handle });
    },
  });
  const points: Record<string, unknown> = {};
  const used = plugin.uses.map((u) => pointOf(u).point as ExtensionPoint);
  for (const p of used) {
    if (p === 'theme')
      points.theme = { core: [], add: (t: ThemeToken) => added.push({ point: p, fields: { ...t }, handle: 0 }) };
    else if (p === 'storage') {
      // a store is opened in the worker on its first call, and each call names the store it is for
      const stores = new Map<number, NoteStorage>();
      points.storage = {
        add: (b: { open: () => NoteStorage } & Record<string, unknown>) => {
          point(p, 'open').add({
            ...b,
            open: (store: number, method: string, args: unknown[]) => {
              if (!(NOTE_METHODS as readonly string[]).includes(method)) throw new Error(`no such call: ${method}`);
              const s = stores.get(store) ?? b.open();
              stores.set(store, s);
              return (s[method as keyof NoteStorage] as Call).apply(s, args);
            },
          });
        },
      };
    } else if (p === 'commands') points.commands = point(p, 'run');
    else if (p === 'sources') points.sources = point(p, 'read');
    else if (p === 'steps') points.steps = point(p, 'run');
    else if (p === 'diagrams') points.diagrams = point(p, 'draw');
  }
  if (named.length) points.host = Object.freeze(host);
  const { id, version, api, uses, abilities } = plugin;
  const manifest = { id, version, api, uses: [...uses], ...(abilities ? { abilities: [...abilities] } : {}) };
  const refused = used.filter((p) => !ISOLATED_POINTS.includes(p));
  try {
    if (refused.length) throw new Error(`a plug-in run apart cannot add to ${refused.join(', ')} yet`);
    plugin.register(Object.freeze(points));
  } catch (e) {
    scope.postMessage({ failed: said(e) });
    return;
  }
  scope.onmessage = ({ data }) => {
    if ('answered' in data) {
      const a = asked.get(data.answered);
      asked.delete(data.answered);
      if (data.error === undefined) a?.resolve(data.value);
      else a?.reject(new Error(data.error));
      return;
    }
    const { call, handle, args } = data;
    const reply = (m: FromPlugin) => {
      try {
        scope.postMessage(m);
      } catch (e) {
        scope.postMessage({ reply: call, error: `its answer could not be sent as data: ${said(e)}` });
      }
    };
    void Promise.resolve()
      .then(() => {
        const run = handles.get(handle);
        if (!run) throw new Error('it has no such call');
        return run(...args);
      })
      .then(
        (value) => reply({ reply: call, value }),
        (e: unknown) => reply({ reply: call, error: said(e) }),
      );
  };
  scope.postMessage({ manifest, added });
}
