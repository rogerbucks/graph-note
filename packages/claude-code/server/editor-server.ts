// The editor server's process as it ships (spec §26, slice 4): node runs it, built into mod/bin/editor-server.mjs. It
// takes no argument. The mod hands it the vault, the note and the folder for drafts in its environment
// (editor-main.ts). It serves the note store. With none it serves no API. editor-process.ts says how it starts, hands
// its address over and stops. A note or folder it is refused says why on stderr and exits with code 2, before it
// listens anywhere.
import { runEditorProcess, type EditorProcessOptions } from './editor-process.ts';
import { EDITOR_ENVIRONMENT, optionsFromEnvironment } from './editor-main.ts';

/** The first line of standard input: where the mod hands over the key for Claude's proposals, never in the environment. */
function firstLine(): Promise<string> {
  return new Promise((resolve) => {
    let held = '';
    const done = () => {
      process.stdin.off('data', onData).off('end', done).off('error', done).pause();
      resolve(held.split('\n')[0]?.trim() ?? '');
    };
    const onData = (d: string) => {
      held += d;
      if (held.includes('\n') || held.length > 512) done();
    };
    process.stdin.setEncoding('utf8').on('data', onData).on('end', done).on('error', done);
  });
}

let options: EditorProcessOptions | undefined;
try {
  // the environment says only that a key is coming on standard input (`stdin`); the key is never in it
  const key = process.env[EDITOR_ENVIRONMENT.proposer] === 'stdin' ? await firstLine() : undefined;
  options = await optionsFromEnvironment(process.env, key);
} catch (err) {
  process.stderr.write(`editor server: ${err instanceof Error ? err.message : String(err)}\n`, () => process.exit(2));
}
if (options) await runEditorProcess(process.argv.slice(2), options);
