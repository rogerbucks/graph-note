// The editor server as a process (spec §26, slice 4): node runs it, built into mod/bin/editor-server.mjs. It takes no
// argument but `--test-note` (TEST ONLY: the in-memory note route of test-note.ts), so nothing can make it listen
// anywhere but 127.0.0.1 or on a port of its own choosing. It hands its address over once, as one line of JSON on
// stdout, `{"url":"http://127.0.0.1:<port>/#token=<token>"}`: the token in the fragment, which a browser never sends,
// and written nowhere else. It stops on the first of an idle period, its input closing, its parent exiting or a stop
// signal, says why on stderr, and exits.
import { startEditorServer } from './start-server.ts';
import { watchSession } from './session-watch.ts';

const args = process.argv.slice(2);
const unknown = args.find((a) => a !== '--test-note');
process.stdout.on('error', () => {});
process.stderr.on('error', () => {});
if (unknown !== undefined) {
  process.stderr.write(`editor server: it takes no argument but --test-note, and was given ${unknown}\n`);
  process.exit(2);
}

const server = await startEditorServer(
  args.includes('--test-note') ? { testNotes: { sample: 'A test note, held in memory.' } } : {},
);
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
