// Plug-ins from outside ThoughtKnot (spec §54, plugin_outside_file; API-10). A person puts a plug-in's file in the vault
// folder `ThoughtKnot plug-ins`, or adds one from a link, which is fetched once and kept there. Each stays off until the
// person turns it on:
// - turning one on keeps the file's SHA-256. A file that changes after is turned off and said, so the code that runs is
//   only ever the code the person turned on;
// - each runs in a worker of its own, sealed before the file's first line runs (packages/core/src/plugin-outside.ts);
// - its commands join Obsidian's, named as the plug-in names them. Today a plug-in from outside adds commands; its
//   other points join as the host draws them.
import { Notice, TFile } from 'obsidian';
import type { Plugin } from 'obsidian';
import { outsidePlugin, outsideProblem, pluginRegistry, word } from '@thoughtknot/core';
import type { IsolatedPlugin, PluginPort, PluginRegistry } from '@thoughtknot/core';
import { pluginWorker } from 'thoughtknot:plugin-worker';
import { fetchPluginFile } from './outside-link';

/** The vault folder plug-in files are kept in. */
export const OUTSIDE_FOLDER = 'ThoughtKnot plug-ins';

/** A file the person turned on: the SHA-256 of its text when they did. */
export interface TurnedOn {
  sha: string;
}

/** Where the plugin keeps which files are on. */
export interface TurnedOnStore {
  read: () => Record<string, TurnedOn>;
  write: (on: Record<string, TurnedOn>) => Promise<void>;
}

const said = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** The SHA-256 of `text`, as hex. */
async function sha256(text: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** A worker started from main.js's own copy of the sealing bundle, then the plug-in's file. */
function blobWorker(body: string): PluginPort {
  const url = URL.createObjectURL(
    new Blob([`const thoughtknotServe = (${pluginWorker.toString()})(self);\n${body}`], { type: 'text/javascript' }),
  );
  const w = new Worker(url);
  const port: PluginPort = {
    onmessage: null,
    onerror: null,
    postMessage: (m) => w.postMessage(m),
    terminate: () => {
      w.terminate();
      URL.revokeObjectURL(url);
    },
  };
  w.onmessage = (e: MessageEvent) => port.onmessage?.(e as Parameters<NonNullable<PluginPort['onmessage']>>[0]);
  w.onerror = (e) => port.onerror?.(e.message || e);
  return port;
}

/** The plug-ins from outside: the files found, which are on, and the ones running. */
export class OutsidePlugins {
  /** Each file running: its plug-in, the registry it is installed in, and the commands it added. */
  private readonly running = new Map<string, { iso: IsolatedPlugin; registry: PluginRegistry; commands: string[] }>();

  constructor(
    private readonly owner: Plugin,
    private readonly store: TurnedOnStore,
    private readonly start: (body: string) => PluginPort = blobWorker,
  ) {}

  /** The plug-in files in the folder, by name. */
  files(): string[] {
    return this.owner.app.vault
      .getFiles()
      .filter((f) => f.path.startsWith(`${OUTSIDE_FOLDER}/`) && f.extension === 'js')
      .map((f) => f.name)
      .sort();
  }

  /** Whether the file `name` is on. */
  isOn(name: string): boolean {
    return Object.hasOwn(this.store.read(), name);
  }

  /** Turns `name` on or off. On, it is checked, its SHA-256 kept, and it starts; off, it stops. */
  async turn(name: string, on: boolean): Promise<void> {
    const kept = { ...this.store.read() };
    if (!on) {
      delete kept[name];
      await this.store.write(kept);
      return this.stop(name);
    }
    const code = await this.read(name);
    const problem = code === null ? word('outside.gone') : outsideProblem(code);
    if (problem || code === null) return void new Notice(word('outside.not-on', { name, why: problem ?? '' }));
    await this.store.write({ ...kept, [name]: { sha: await sha256(code) } });
    await this.run(name, code);
  }

  /** Starts each file that is on, once the vault is read. One that changed since it was turned on is turned off. */
  async startAll(): Promise<void> {
    for (const [name, { sha }] of Object.entries(this.store.read())) {
      const code = await this.read(name);
      if (code !== null && (await sha256(code)) === sha) await this.run(name, code);
      else {
        const kept = { ...this.store.read() };
        delete kept[name];
        await this.store.write(kept);
        new Notice(word('outside.changed', { name }));
      }
    }
  }

  /** Fetches the plug-in file at `link` once, checks it, and keeps it in the folder, off. */
  async addFromLink(link: string): Promise<void> {
    const fail = (why: string) => void new Notice(word('outside.not-added', { why }));
    let url: URL;
    try {
      url = new URL(link.trim());
    } catch {
      return fail(word('outside.not-a-link'));
    }
    if (url.protocol !== 'https:') return fail(word('outside.not-a-link'));
    const name = decodeURIComponent(url.pathname.split('/').pop() ?? '').replace(/[^\w.-]/g, '-');
    if (!name.endsWith('.js')) return fail(word('outside.not-js'));
    let text: string;
    try {
      text = await fetchPluginFile(url.href);
    } catch (e) {
      return fail(said(e));
    }
    const problem = outsideProblem(text);
    if (problem) return fail(problem);
    const vault = this.owner.app.vault;
    if (!vault.getFolderByPath(OUTSIDE_FOLDER)) await vault.createFolder(OUTSIDE_FOLDER);
    try {
      await vault.create(`${OUTSIDE_FOLDER}/${name}`, text);
    } catch (e) {
      return fail(said(e));
    }
    new Notice(word('outside.added', { name }));
  }

  /** Stops every plug-in running. */
  stopAll(): void {
    for (const name of [...this.running.keys()]) this.stop(name);
  }

  private async read(name: string): Promise<string | null> {
    const f = this.owner.app.vault.getFileByPath(`${OUTSIDE_FOLDER}/${name}`);
    return f instanceof TFile ? this.owner.app.vault.read(f) : null;
  }

  /** Runs the plug-in in `code` and adds its commands to Obsidian's. */
  private async run(name: string, code: string): Promise<void> {
    this.stop(name);
    let iso: IsolatedPlugin;
    try {
      iso = await outsidePlugin(code, this.start, {
        clock: {
          setTimeout: (run: () => void, ms: number) => window.setTimeout(run, ms),
          clearTimeout: (t: unknown) => window.clearTimeout(t as number),
        },
      });
    } catch (e) {
      return void new Notice(word('outside.not-on', { name, why: said(e) }));
    }
    const registry = pluginRegistry();
    try {
      registry.register(iso.plugin);
    } catch (e) {
      iso.stop();
      return void new Notice(word('outside.not-on', { name, why: said(e) }));
    }
    const commands = registry.commands().map((c) => c.id);
    for (const c of registry.commands())
      this.owner.addCommand({ id: c.id, name: c.title, callback: () => void registry.runCommand(c.id) });
    this.running.set(name, { iso, registry, commands });
  }

  /** The commands of the plug-in in file `name`, while it runs. */
  commandsOf(name: string): string[] {
    return this.running.get(name)?.commands ?? [];
  }

  private stop(name: string): void {
    const r = this.running.get(name);
    if (!r) return;
    r.iso.stop();
    for (const id of r.commands) this.owner.removeCommand(id);
    this.running.delete(name);
  }
}
