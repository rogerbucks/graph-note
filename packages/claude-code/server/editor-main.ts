// What the shipped editor server is handed by the mod that runs it (spec §26, workstream C2): its vault, its note and the
// folder for drafts, in its environment, never in an argument (it takes none). From them it makes the note store, opens
// the one note for the session by the path the mod names, and hands the process its API and the note's id for the
// address. With no vault in its environment it serves no API, as before. A note that cannot be opened, or a folder that
// is refused, is thrown as plain words, which the process says on stderr before it listens anywhere.
import type { EditorProcessOptions } from './editor-process.ts';
import { NoteStore } from './editor-store.ts';

/** The variables the mod sets; the process reads these and no others. */
export const EDITOR_ENVIRONMENT = {
  vault: 'GRAPH_NOTE_EDITOR_VAULT',
  note: 'GRAPH_NOTE_EDITOR_NOTE',
  drafts: 'GRAPH_NOTE_EDITOR_DRAFTS',
  input: 'GRAPH_NOTE_EDITOR_INPUT',
} as const;

/** The process's options from its environment: the store for the vault, with the note opened, and how it is stopped. */
export async function optionsFromEnvironment(env: Record<string, string | undefined>): Promise<EditorProcessOptions> {
  const vault = env[EDITOR_ENVIRONMENT.vault];
  if (!vault) return {};
  const note = env[EDITOR_ENVIRONMENT.note];
  const drafts = env[EDITOR_ENVIRONMENT.drafts];
  if (!note || !drafts) throw new Error('It was given a vault but not the note to open, or the folder for drafts.');
  const store = await NoteStore.create({ vault, drafts });
  const opened = await store.open(note);
  if (!opened.ok) {
    await store.stop();
    throw new Error(opened.why);
  }
  return {
    api: store.api,
    drain: () => store.stop(),
    note: opened.id,
    ignoreInput: env[EDITOR_ENVIRONMENT.input] === 'ignore',
  };
}
