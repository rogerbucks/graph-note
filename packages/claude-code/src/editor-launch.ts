// The browser editor's server as the mod runs it (spec §26, workstream C2): `/graph edit <note>` starts the session's
// one server on the shipped process through the host's `$.process.spawn`, reads the address it prints, and keeps that
// address to itself: the one place it can be read is `link`, which the pane draws, so it never enters a command's
// answer, a log line, state or the conversation (cc_transcript_clean). A start that fails says why (cc_start_failure);
// a session has one server, reused for the same note and replaced for another (cc_one_server); and it ends when the
// session does, on `/graph stop`, or by itself when the server stops (cc_server_stops). No Node module is imported here:
// the host's calls are handed in, so the tests run the launcher over real processes and the mod over the host's own.
import { claudeGate, sha256 } from '@graph-note/core';
import type { Gate, GateSettings } from '@graph-note/core';
import { notePath } from './graph-view.ts';

/** One piece of what a started process wrote, as `$.process.spawn` hands it over. */
export interface SpawnedPiece {
  stream: 'stdout' | 'stderr';
  text: string;
}

/** How a started process ended. */
export interface SpawnedEnd {
  code: number | null;
  signal: string | null;
}

/** What `$.process.spawn` returns: the pieces, then how it ended; leaving the loop (`return`) kills the child. */
export interface Spawned {
  [Symbol.asyncIterator](): AsyncIterator<SpawnedPiece, SpawnedEnd>;
}

/** What the launcher is handed by the code that runs it. */
export interface EditorPorts {
  /** `$.process.spawn`, narrowed to what the launcher asks of it: a command by its arguments, and its environment. */
  spawn: (request: { argv: readonly string[]; env?: Record<string, string> }) => Spawned;
  /** `$.fs.exists`. */
  exists: (path: string) => Promise<boolean>;
  /** `$.fs.read`: the note's text, read for its classification before anything is opened, and never kept. */
  read: (path: string) => Promise<string>;
  /** The settings the gate reads (classifications, the level for unlabelled notes, the models): read at each use. */
  settings: () => Promise<GateSettings>;
  /** The session's working folder: a note named by a relative path is found from it. */
  cwd: string;
  /** The command that runs the shipped server, with no argument after it: it takes none. */
  server: readonly string[];
  /** The mod's own data folder for drafts, outside every vault. */
  drafts: string;
  /** Called when a server that was running ends by itself, so the pane can say so; it is handed nothing. */
  changed?: () => void;
  /** `$.clock.after`: calls the function once after the milliseconds, unless cancelled; a test drives it by hand. */
  after: (ms: number, fn: () => void) => { cancel: () => void };
}

/**
 * What `/graph edit` came to: the note it opened, or why it could not. A note held back by the gate says so in `held`:
 * `asks` waits for `confirm` (a yes), `refused` has no yes (the highest classification, a credential, or a note or
 * settings that could not be read), and neither is drawn in its place.
 */
export type EditOutcome =
  { ok: true; title: string; reused: boolean } | { ok: false; why: string; held?: 'asks' | 'refused' };

/** A server running: what it was started for, and how its life is ended and awaited. */
interface Running {
  note: string;
  title: string;
  link: string;
  iterator: AsyncIterator<SpawnedPiece, SpawnedEnd>;
  done: Promise<void>;
  stopping: string | null;
}

/** What the gate made of a note: its word, the digest of the text it read, and the settings it used; none if unreadable. */
interface Checked {
  gate: Gate;
  digest: string | null;
  settings: GateSettings | null;
}

const NOT_THE_PERSON =
  'Only the person typing can say yes to opening a note above the level set for Claude: a command from anything else is refused.';
const NOT_THE_PERSON_ASKING =
  'Only the person typing can say yes to that, and this command did not come from them, so it is not opened.';

/**
 * Whether a command came from the person typing in the composer: the host's `origin.kind` is exactly `composer`. A
 * plugin, a peer, a channel, a coordinator, a schedule, a bridge, an origin not known and none at all are not them.
 */
export function fromPerson(origin: unknown): boolean {
  return typeof origin === 'object' && origin !== null && (origin as { kind?: unknown }).kind === 'composer';
}

/** How long a server has to hand over its address before it is killed and the start said to have failed. */
export const START_TIMEOUT_MS = 15_000;

const NO_NODE =
  'Node could not be started, and the editor needs it. Install Node.js, make sure `node` is on the path, then try again.';

/** The words of the pane's answer: which note, and nothing of the address, the token or the note's text. */
export function sayEdit(outcome: EditOutcome): string {
  if (outcome.ok) {
    const open = outcome.reused ? 'The editor is already open for' : 'The editor is ready for';
    return `${open} ${outcome.title}. The link to open in the browser pane is in the Graph editor pane, and is not shown here.`;
  }
  const why = /[.!?]$/.test(outcome.why) ? outcome.why : `${outcome.why}.`;
  if (outcome.held === 'asks')
    return `${why} Nothing was opened or shown. Say /graph confirm to open it anyway; anything else leaves it closed.`;
  if (outcome.held === 'refused') return `${why} Nothing was opened or shown.`;
  return `The editor was not started: ${why} The drawing /graph gives is shown instead.`;
}

/** Whether the arguments are `/graph confirm`, the user's yes to the question the last `/graph edit` asked. */
export function confirmArgs(args: string): boolean {
  return args.trim() === 'confirm';
}

/** The words for a server that has stopped, with the reason. */
export function sayStopped(reason: string): string {
  return `The editor stopped: ${reason}.`;
}

/** The note named after `/graph edit`, or null when the arguments are not that command; '' when no note was named. */
export function editArgs(args: string): string | null {
  const m = /^edit(?:\s+([\s\S]*))?$/.exec(args.trim());
  return m ? notePath(m[1] ?? '') : null;
}

/** Whether a path is a full one, on either kind of system. */
const isFull = (path: string) => /^([\\/]|[A-Za-z]:[\\/])/.test(path);

/** `given` as a full path from `cwd`, with `.` and `..` settled and the separator of `cwd` kept. */
function fullPath(cwd: string, given: string): string {
  const sep = cwd.includes('\\') && !cwd.includes('/') ? '\\' : '/';
  const full = isFull(given) ? given : `${cwd}${sep}${given}`;
  const drive = /^[A-Za-z]:/.exec(full)?.[0] ?? '';
  const parts: string[] = [];
  for (const part of full.slice(drive.length).split(/[\\/]+/)) {
    if (part === '' || part === '.') continue;
    if (part === '..') parts.pop();
    else parts.push(part);
  }
  return `${drive}${sep}${parts.join(sep)}`;
}

/** The folder holding a path. */
function folderOf(path: string): string {
  const cut = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  return cut <= 0 ? path.slice(0, 1) : path.slice(0, cut);
}

/** The last part of a path. */
const nameOf = (path: string) => path.slice(Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\')) + 1);

/** The session's editor: at most one server, started for one note. */
export class EditorLauncher {
  readonly #ports: EditorPorts;
  #running: Running | null = null;
  #ended: string | null = null;
  #pending: { note: string; digest: string } | null = null;
  #queue: Promise<unknown> = Promise.resolve();

  constructor(ports: EditorPorts) {
    this.#ports = ports;
  }

  /** The address to open, token and note in its fragment, for the pane to draw and nothing else; null with no server. */
  get link(): string | null {
    return this.#running?.link ?? null;
  }

  /** Why the last server ended, once it has; null before the first. */
  get ended(): string | null {
    return this.#ended;
  }

  /** Resolves when the server running now has ended, or at once with none. */
  waitForEnd(): Promise<void> {
    return this.#running?.done ?? Promise.resolve();
  }

  /**
   * Opens `given` in the session's server: the one running when it is for this note, else a new one in its place. The
   * `origin` is the host's account of who ran the command: only the person typing (`composer`) is asked a question; for
   * any other, or none given, a note above Claude's level is refused (cc_classified_asks).
   */
  edit(given: string, cwd: string = this.#ports.cwd, origin?: unknown): Promise<EditOutcome> {
    return this.#inTurn(() => this.#edit(given, cwd, fromPerson(origin)));
  }

  /** Stops the server, killing its process; true when one was running. */
  stop(reason: string): Promise<boolean> {
    return this.#inTurn(() => this.#stop(reason));
  }

  /** Runs one call at a time, so two begun together never start two servers. */
  #inTurn<T>(call: () => Promise<T>): Promise<T> {
    const turn = this.#queue.then(call, call);
    this.#queue = turn.catch(() => {});
    return turn;
  }

  /**
   * Whether the note named may open in a pane Claude can read (cc_classified_asks, cc_credential_never): the note is
   * read here, for the gate alone, and its text is neither kept nor said. Settings or a note that cannot be read refuse.
   */
  async gate(given: string, cwd: string = this.#ports.cwd): Promise<Gate> {
    return (await this.#check(fullPath(cwd, given))).gate;
  }

  /**
   * The yes to the question the last `edit` asked: opens that note, once, for the text it was asked about. Only the
   * person typing can say it: a command from any other origin, or none, is refused and leaves the question waiting.
   * The gate is asked again first; a note changed since the question is asked about afresh, never carried over.
   */
  confirm(origin?: unknown): Promise<EditOutcome> {
    return this.#inTurn(async () => {
      if (!fromPerson(origin)) return { ok: false as const, why: NOT_THE_PERSON, held: 'refused' as const };
      const pending = this.#pending;
      this.#pending = null;
      if (pending === null)
        return {
          ok: false as const,
          why: 'Nothing is waiting for a yes: /graph edit <path to a note> asks first.',
          held: 'refused' as const,
        };
      const checked = await this.#check(pending.note);
      if (!('ask' in checked.gate)) return this.#held(pending.note, checked, true);
      if (checked.digest !== pending.digest) return this.#held(pending.note, checked, true);
      return this.#open(pending.note, checked.settings, pending.digest);
    });
  }

  /** The note read and the settings, for the gate alone: the text is neither kept nor said, only its digest. */
  async #check(note: string): Promise<Checked> {
    try {
      const text = await this.#ports.read(note);
      const settings = await this.#ports.settings();
      return { gate: claudeGate(text, settings), digest: sha256(text), settings };
    } catch {
      return {
        gate: {
          refuse:
            'The note or the settings could not be read, so it cannot be checked against the level set for Claude.',
        },
        digest: null,
        settings: null,
      };
    }
  }

  /**
   * The outcome for a note the gate held back. A question is remembered for `confirm` only when the person asked it
   * (`person`); a refusal forgets any, and an open gate passes.
   */
  #held(note: string, checked: Checked, person: boolean): EditOutcome {
    const gate = checked.gate;
    if ('open' in gate) {
      this.#pending = null;
      return { ok: false, why: `${nameOf(note)}: nothing asks about this note now.`, held: 'refused' };
    }
    if ('ask' in gate && person && checked.digest !== null) {
      this.#pending = { note, digest: checked.digest };
      return { ok: false, why: `${nameOf(note)}: ${gate.ask}`, held: 'asks' };
    }
    this.#pending = null;
    const why = 'ask' in gate ? `${gate.ask} ${NOT_THE_PERSON_ASKING}` : gate.refuse;
    return { ok: false, why: `${nameOf(note)}: ${why}`, held: 'refused' };
  }

  async #edit(given: string, cwd: string, person: boolean): Promise<EditOutcome> {
    if (given === '')
      return { ok: false, why: 'Name a note to edit: /graph edit <path to a note>, quoted if it has spaces.' };
    const note = fullPath(cwd, given);
    this.#pending = null;
    const checked = await this.#check(note);
    if (!('open' in checked.gate)) {
      // a note open already and now held back (its classification was raised) is closed, not left readable
      if (this.#running?.note === note) await this.#stop('the note is now above the level set for Claude');
      return this.#held(note, checked, person);
    }
    return this.#open(note, checked.settings, null);
  }

  /** Opens `note`: the server running when it is for this note, else a new one in its place. */
  async #open(note: string, settings: GateSettings | null, confirmed: string | null): Promise<EditOutcome> {
    const title = nameOf(note);
    if (this.#running?.note === note) return { ok: true, title, reused: true };
    await this.#stop('another note was opened');
    const started = await this.#start(note, settings, confirmed);
    return started.ok ? { ok: true, title, reused: false } : started;
  }

  async #stop(reason: string): Promise<boolean> {
    this.#pending = null;
    const running = this.#running;
    if (!running) return false;
    running.stopping = reason;
    void running.iterator.return?.();
    await running.done;
    return true;
  }

  /** The folder holding .obsidian above the note, else the note's own folder. */
  async #vaultOf(note: string): Promise<string> {
    const sep = note.includes('\\') && !note.includes('/') ? '\\' : '/';
    let folder = folderOf(note);
    for (;;) {
      if (await this.#ports.exists(`${folder.replace(/[\\/]$/, '')}${sep}.obsidian`)) return folder;
      const up = folderOf(folder);
      if (up === folder) return folderOf(note);
      folder = up;
    }
  }

  /** Starts the server for `note` and waits for its address, or for why it could not start. */
  async #start(
    note: string,
    settings: GateSettings | null,
    confirmed: string | null,
  ): Promise<{ ok: true } | { ok: false; why: string }> {
    const [command, ...rest] = this.#ports.server;
    if (command === undefined) return { ok: false, why: NO_NODE };
    const env = {
      GRAPH_NOTE_EDITOR_VAULT: await this.#vaultOf(note),
      GRAPH_NOTE_EDITOR_NOTE: note,
      GRAPH_NOTE_EDITOR_DRAFTS: this.#ports.drafts,
      // the server asks the gate again before every send, with the same settings and the digest of the text said yes to
      // (never the text); none given means the defaults, the strictest
      GRAPH_NOTE_EDITOR_SETTINGS: settings
        ? JSON.stringify({
            classifications: settings.classifications,
            aiUnlabelled: settings.aiUnlabelled,
            aiModels: settings.aiModels.map((m) => ({ name: m.name, ceiling: m.ceiling })),
          })
        : '',
      GRAPH_NOTE_EDITOR_CONFIRMED: confirmed ?? '',
      // the host closes a child's input when it starts it, so the input's closing is not the session's end here
      GRAPH_NOTE_EDITOR_INPUT: 'ignore',
    };
    let iterator: AsyncIterator<SpawnedPiece, SpawnedEnd>;
    try {
      iterator = this.#ports.spawn({ argv: [command, ...rest], env })[Symbol.asyncIterator]();
    } catch {
      return { ok: false, why: NO_NODE };
    }
    return new Promise((resolve) => {
      let said = '';
      let line = '';
      let ready = false;
      let running: Running | null = null;
      let reason: string | null = null;
      // a start that gets no address, or none in time, kills its process and says so only once the process is gone
      const giveUp = (why: string) => {
        if (ready || reason !== null) return;
        reason = why;
        void iterator.return?.();
      };
      const timer = this.#ports.after(START_TIMEOUT_MS, () =>
        giveUp(`The editor server did not become ready in ${START_TIMEOUT_MS / 1000} seconds.`),
      );
      const fail = (why: string) => {
        timer.cancel();
        if (!ready) resolve({ ok: false, why: reason ?? why });
      };
      const piece = (p: SpawnedPiece) => {
        if (p.stream === 'stderr') said = (said + p.text).slice(-2000);
        else if (!ready) {
          line += p.text;
          const end = line.indexOf('\n');
          if (end < 0) return;
          const link = this.#linkIn(line.slice(0, end));
          if (!link) return giveUp('The editor server did not hand over an address.');
          timer.cancel();
          ready = true;
          running = { note, title: nameOf(note), link, iterator, done: Promise.resolve(), stopping: null };
          running.done = loop;
          this.#running = running;
          resolve({ ok: true });
        }
        // once it is ready, nothing more it writes on stdout is kept
      };
      const loop: Promise<void> = (async () => {
        try {
          for (;;) {
            const next = await iterator.next();
            if (next.done) return this.#over(running, ready, said, next.value, fail);
            piece(next.value);
          }
        } catch (err) {
          const why = running ? `the editor server failed: ${String(err)}` : NO_NODE;
          this.#over(running, ready, said, { code: null, signal: null }, () => fail(why), why);
        }
      })();
    });
  }

  /** The address in the server's first line, or null when the line is not one. */
  #linkIn(line: string): string | null {
    try {
      const { url } = JSON.parse(line) as { url?: unknown };
      return typeof url === 'string' && url.startsWith('http://127.0.0.1:') ? url : null;
    } catch {
      return null;
    }
  }

  /** The server's process has ended: forget it, and say why when it never became ready. */
  #over(
    running: Running | null,
    ready: boolean,
    said: string,
    end: SpawnedEnd,
    fail: (why: string) => void,
    error?: string,
  ): void {
    const last = said.trim().split('\n').pop()?.trim() ?? '';
    const stopped = /^editor server stopped: (.+)$/.exec(last)?.[1];
    if (!ready) {
      const refused = /^editor server: (.+)$/.exec(last)?.[1];
      const code = end.code === null ? `signal ${end.signal ?? 'unknown'}` : `exit code ${end.code}`;
      fail(refused ?? (last || `The editor server stopped before it was ready (${code}).`));
      return;
    }
    if (this.#running === running) this.#running = null;
    this.#ended =
      running?.stopping ?? stopped ?? error ?? (end.signal ? `ended by ${end.signal}` : `exited with code ${end.code}`);
    this.#ports.changed?.();
  }
}
