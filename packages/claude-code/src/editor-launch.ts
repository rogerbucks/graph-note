// The browser editor's server as the mod runs it (spec §26, workstream C2): `/graph edit <note>` starts the session's
// one server on the shipped process through the host's `$.process.spawn`, reads the address it prints, and keeps that
// address to itself: the one place it can be read is `link`, which the pane draws, so it never enters a command's
// answer, a log line, state or the conversation (cc_transcript_clean). A start that fails says why (cc_start_failure);
// a session has one server, reused for the same note and replaced for another (cc_one_server); and it ends when the
// session does, on `/graph stop`, or by itself when the server stops (cc_server_stops). No Node module is imported here:
// the host's calls are handed in, so the tests run the launcher over real processes and the mod over the host's own.
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

/** What `/graph edit` came to: the note it opened, or why it could not. */
export type EditOutcome = { ok: true; title: string; reused: boolean } | { ok: false; why: string };

/** A server running: what it was started for, and how its life is ended and awaited. */
interface Running {
  note: string;
  title: string;
  link: string;
  iterator: AsyncIterator<SpawnedPiece, SpawnedEnd>;
  done: Promise<void>;
  stopping: string | null;
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
  return `The editor was not started: ${why} The drawing /graph gives is shown instead.`;
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

  /** Opens `given` in the session's server: the one running when it is for this note, else a new one in its place. */
  edit(given: string, cwd: string = this.#ports.cwd): Promise<EditOutcome> {
    return this.#inTurn(() => this.#edit(given, cwd));
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

  async #edit(given: string, cwd: string): Promise<EditOutcome> {
    if (given === '')
      return { ok: false, why: 'Name a note to edit: /graph edit <path to a note>, quoted if it has spaces.' };
    const note = fullPath(cwd, given);
    const title = nameOf(note);
    if (this.#running?.note === note) return { ok: true, title, reused: true };
    await this.#stop('another note was opened');
    const started = await this.#start(note);
    return started.ok ? { ok: true, title, reused: false } : started;
  }

  async #stop(reason: string): Promise<boolean> {
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
  async #start(note: string): Promise<{ ok: true } | { ok: false; why: string }> {
    const [command, ...rest] = this.#ports.server;
    if (command === undefined) return { ok: false, why: NO_NODE };
    const env = {
      GRAPH_NOTE_EDITOR_VAULT: await this.#vaultOf(note),
      GRAPH_NOTE_EDITOR_NOTE: note,
      GRAPH_NOTE_EDITOR_DRAFTS: this.#ports.drafts,
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
