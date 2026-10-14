// The editor server's process as it ships (spec §26, slice 4): node runs it, built into mod/bin/editor-server.mjs. It
// takes no argument and serves no API of its own until the note store (C1) is handed in; editor-process.ts says how it
// starts, hands its address over and stops.
import { runEditorProcess } from './editor-process.ts';

await runEditorProcess(process.argv.slice(2));
