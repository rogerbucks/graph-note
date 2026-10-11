// Writing an export into the vault (spec §16, failed_export): through the vault's own API, never the file system; the
// plugin's own temporary file removed when a write fails, so none is left among the notes (it goes where the person's
// deleted files go, as Obsidian's guidelines require); and a name of its own for each export, so an earlier one is
// never overwritten.
import { TFile } from 'obsidian';
import type { WriteOps } from '@graph-note/core';
import type GraphNotePlugin from '../main';

/** The vault's ways of writing a file, as the core's safe write needs them. A file is never replaced: see `freePath`. */
export function vaultOps(plugin: GraphNotePlugin): WriteOps {
  const { vault } = plugin.app;
  const at = (path: string) => vault.getAbstractFileByPath(path);
  return {
    write: async (path, bytes) => {
      const folder = path.split('/').slice(0, -1).join('/');
      if (folder && !vault.getFolderByPath(folder)) await vault.createFolder(folder);
      const was = at(path);
      if (typeof bytes === 'string') {
        if (was instanceof TFile) await vault.process(was, () => bytes);
        else await vault.create(path, bytes);
      } else {
        const buffer = bytes.slice().buffer;
        if (was instanceof TFile) await vault.modifyBinary(was, buffer);
        else await vault.createBinary(path, buffer);
      }
    },
    rename: async (from, to) => {
      const source = at(from);
      if (!(source instanceof TFile)) throw new Error(`there is no ${from} to move`);
      await vault.rename(source, to);
    },
    remove: async (path) => {
      const f = at(path);
      // the plugin's own half-written temporary file: where the person's deleted files go, as they have set it, as
      // Obsidian's guidelines require of any file a plugin removes; never left among their notes
      if (f instanceof TFile) await plugin.app.fileManager.trashFile(f);
    },
  };
}

/** `path`, or, when a file is already there, the first of `<name>-2.<ext>`, `<name>-3.<ext>`… that is free. */
export function freePath(plugin: GraphNotePlugin, path: string): string {
  const taken = (p: string) => !!plugin.app.vault.getAbstractFileByPath(p);
  if (!taken(path)) return path;
  const dot = path.lastIndexOf('.'),
    stem = path.slice(0, dot),
    ext = path.slice(dot);
  for (let n = 2; ; n++) if (!taken(`${stem}-${n}${ext}`)) return `${stem}-${n}${ext}`;
}
