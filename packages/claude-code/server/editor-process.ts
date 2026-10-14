// The editor server run as a process (spec §26, slice 4): what `mod/bin/editor-server.mjs` does, and what the tests'
// own process does with their API handed in. It takes no argument, so nothing can make it listen anywhere but
// 127.0.0.1 or on a port of its own choosing, and it will not start orphaned, with no session to stop it. It hands its
// address over once, as one line of JSON on stdout, `{"url":"http://127.0.0.1:<port>/#token=<token>"}`: the token in
// the fragment, which a browser never sends, and written nowhere else. It stops on the first of an idle period, its
// input closing, its parent exiting or a stop signal, says why on stderr, and exits.
import { startEditorServer, type ApiHandler } from './start-server.ts';
import { watchSession } from './session-watch.ts';

/** What a process may be handed by the code that runs it, never by its arguments. */
export interface EditorProcessOptions {
  /** What answers the API; none until the note store (C1). */
  api?: ApiHandler;
}

/** Exits with code 2, saying why on stderr, before anything is started. */
function refuse(why: string): never {
  process.stderr.write(`editor server: ${why}\n`);
  process.exit(2);
}

/** Runs the server as this process, with its command-line arguments, until something stops it. */
export async function runEditorProcess(args: string[], options: EditorProcessOptions = {}): Promise<void> {
  process.stdout.on('error', () => {});
  process.stderr.on('error', () => {});
  if (process.ppid === 1) refuse('the process that started it has already exited, so nothing would stop it');
  if (args.length) refuse(`it takes no argument, and was given ${args[0]}`);
  const server = await startEditorServer(options.api ? { api: options.api } : {});
  const finish = (reason: string) => {
    void server.stop(reason).then(() => {
      // exits once what it says is written, or soon after if no one is left to read it
      process.stderr.write(`editor server stopped: ${reason}\n`, () => process.exit(0));
      setTimeout(() => process.exit(0), 2000);
    });
  };
  void server.closed.then((reason) => reason === 'idle' && finish(reason));
  watchSession(finish);
  process.stdout.write(`${JSON.stringify({ url: `${server.origin}/#token=${server.token}` })}\n`);
}
