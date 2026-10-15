// The editor server's process as it ships (spec §26, slice 4): node runs it, built into mod/bin/editor-server.mjs. It
// takes no argument. The mod hands it the vault, the note and the folder for drafts in its environment (editor-main.ts),
// and it serves the note store; with none it serves no API. editor-process.ts says how it starts, hands its address over
// and stops. A note or folder it is refused says why on stderr and exits with code 2, before it listens anywhere.
import { runEditorProcess, type EditorProcessOptions } from './editor-process.ts';
import { optionsFromEnvironment } from './editor-main.ts';

let options: EditorProcessOptions | undefined;
try {
  options = await optionsFromEnvironment(process.env);
} catch (err) {
  process.stderr.write(`editor server: ${err instanceof Error ? err.message : String(err)}\n`, () => process.exit(2));
}
if (options) await runEditorProcess(process.argv.slice(2), options);
