// A note or attachment renamed in Obsidian, followed in graph blocks (editor spec §18, renames_follow): every link to it
// inside a graph block of any note is rewritten in the same step, through the note's editor when it is open in the
// editing view, as one ordinary change its undo takes back, or else atomically through the vault. Obsidian does not
// update links inside code blocks, so the plugin does; prose is Obsidian's own, and left to it. A link that cannot be
// rewritten is left, and its card reports it broken.
import { TFile } from 'obsidian';
import type { TAbstractFile } from 'obsidian';
import { applyChanges, renamedLinks } from '@thoughtknot/core';
import type ThoughtknotPlugin from '../main';

/** Follows the file renamed from `old` to where `file` now is, in every graph block of every note of the vault. */
export async function followLinks(plugin: ThoughtknotPlugin, file: TAbstractFile, old: string): Promise<void> {
  if (!(file instanceof TFile)) return;
  const { vault, metadataCache } = plugin.app;
  for (const note of vault.getMarkdownFiles()) {
    // a note the index says holds no code block holds no graph block: it is never read (one not indexed yet is)
    const sections = metadataCache.getFileCache(note)?.sections;
    if (sections && !sections.some((s) => s.type === 'code')) continue;
    // a link that still finds a file, as one of the same name elsewhere would, is left as it is
    const stillFound = (target: string) => !!metadataCache.getFirstLinkpathDest(target, note.path);
    const changes = (text: string) => (text.includes('gql') ? renamedLinks(text, old, file.path, stillFound) : []);
    const editor = plugin.editorFor(note.path);
    if (editor) {
      // the note as its editor holds it, typing not yet saved among it
      const now = changes(editor.state.doc.toString());
      if (now.length)
        editor.dispatch({
          changes: now.map((c) => ({ from: c.from, to: c.to, insert: c.text })),
          userEvent: 'input.thoughtknot',
        });
      continue;
    }
    if (changes(await vault.cachedRead(note)).length)
      await vault.process(note, (data) => applyChanges(data, changes(data)));
  }
}
