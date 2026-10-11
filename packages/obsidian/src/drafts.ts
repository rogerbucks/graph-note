// The drafts kept in the plugin's data (spec §9, nothing_typed_lost): what was typed in a graph and could not be written,
// by note and graph. They follow their note when it is renamed or moved, whether or not it is being edited; an editor
// opened on the block offers its draft; and one command writes every draft into a new note, so a draft whose note was
// deleted is never out of reach.
import { Notice } from 'obsidian';
import type GraphNotePlugin from './main';
import type { Drafts } from './main';
import { freePath } from './export/vault-write';

/** The command that recovers every kept draft into a new note. */
export const RECOVER_COMMAND = { id: 'recover-drafts', name: 'Recover kept drafts into a new note' };

/** The note and the graph a draft is kept for, from its key: `<note>#<graph>`, with a mark such as ` (2)` beside it. */
function whose(key: string): { path: string; graph: string } {
  const at = key.lastIndexOf('#');
  return { path: key.slice(0, at), graph: key.slice(at + 1) };
}

/**
 * `key`, or, when a different draft is kept there, the first of `key (2)`, `key (3)`… that is free or already holds
 * `text`: where a draft is kept beside, never over, another kept for the same note and graph.
 */
export function keyBeside(data: Drafts, key: string, text: string): string {
  let at = key;
  for (let n = 2; data[at] && data[at]?.text !== text; n++) at = `${key} (${n})`;
  return at;
}

/**
 * The drafts kept for the note at `old`, or for a note in the folder at `old`, moved to where it now is, under `now`:
 * each beside, never over, a different draft already kept there, as a deleted note's at the name the note now takes.
 */
export async function followRename(plugin: GraphNotePlugin, now: string, old: string): Promise<void> {
  const data = plugin.drafts();
  let moved = false;
  for (const [key, draft] of Object.entries(data)) {
    const { path } = whose(key);
    if (path !== old && !path.startsWith(`${old}/`)) continue;
    delete data[key];
    data[keyBeside(data, (now + key.slice(old.length)).replace(/ \(\d+\)$/, ''), draft.text)] = draft;
    moved = true;
  }
  if (moved) await plugin.saveDrafts(data);
}

/**
 * Writes every kept draft into a new note, each under its note and graph and when it was kept, as plain text so none is
 * drawn or read as part of a graph; and says where. The drafts stay kept, still offered in their editors.
 */
export async function recoverDrafts(plugin: GraphNotePlugin): Promise<void> {
  const kept = Object.entries(plugin.drafts());
  if (!kept.length) {
    new Notice('No drafts are kept.');
    return;
  }
  const parts = kept.map(([key, d]) => {
    const { path, graph } = whose(key),
      when = d.kept.slice(0, 16).replace('T', ' '),
      // a fence longer than any run of backticks in the draft, so the draft is never cut short
      fence = '`'.repeat(Math.max(3, ...(d.text.match(/`+/g) ?? []).map((m) => m.length + 1)));
    return `\n## ${path}, graph ${graph}\n\nKept ${when}.\n\n${fence}\n${d.text}\n${fence}`;
  });
  const intro = 'What was typed in a graph and could not be written, as Graph Note kept it.';
  const path = freePath(plugin, 'Kept drafts.md');
  try {
    await plugin.app.vault.create(path, `# Kept drafts\n\n${intro}\n${parts.join('\n')}\n`);
  } catch (e) {
    // as on a Mac, where a note named only in another case is the same file: said, and the drafts stay kept
    new Notice(`The kept drafts could not be written into ${path}: ${(e as Error).message} They stay kept.`);
    return;
  }
  new Notice(`${kept.length} kept draft${kept.length === 1 ? '' : 's'} written into ${path}.`);
}
