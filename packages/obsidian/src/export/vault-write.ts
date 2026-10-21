// Writing an export into the vault (spec §16, failed_export).
// - It goes through the vault's own API, never the file system.
// - The plugin's own temporary file is removed when a write fails, so none is left among the notes. It goes where the
//   person's deleted files go, as Obsidian's guidelines require.
// - Each export gets a name of its own, so an earlier one is never overwritten.
import { word } from '@thoughtknot/core';
import { TFile } from 'obsidian';
import type { WriteOps } from '@thoughtknot/core';
import type ThoughtKnotPlugin from '../main';

/** The vault's ways of writing a file, as the core's safe write needs them. A file is never replaced: see `freePath`. */
export function vaultOps(plugin: ThoughtKnotPlugin): WriteOps {
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
      if (!(source instanceof TFile)) throw new Error(word('write.no-source', { name: from }));
      await vault.rename(source, to);
    },
    remove: async (path) => {
      const f = at(path);
      // the plugin's own half-written temporary file goes where the person's deleted files go, as they have set it.
      // Obsidian's guidelines require this of any file a plugin removes. It is never left among their notes
      if (f instanceof TFile) await plugin.app.fileManager.trashFile(f);
    },
  };
}

/**
 * `paths`, as they are. Or, when a file is already at any of them, each as `<name>-2.<ext>`, or `-3`…. It takes the first
 * number free for all of them: the pages of one export keep one number between them.
 */
export function freePaths(plugin: ThoughtKnotPlugin, paths: string[]): string[] {
  const taken = (p: string) => !!plugin.app.vault.getAbstractFileByPath(p);
  const numbered = (path: string, n: number) => {
    const dot = path.lastIndexOf('.');
    return `${path.slice(0, dot)}-${n}${path.slice(dot)}`;
  };
  if (!paths.some(taken)) return paths;
  for (let n = 2; ; n++) {
    const these = paths.map((p) => numbered(p, n));
    if (!these.some(taken)) return these;
  }
}

/** `path`, or, when a file is already there, the first of `<name>-2.<ext>`, `<name>-3.<ext>`… that is free. */
export const freePath = (plugin: ThoughtKnotPlugin, path: string): string => freePaths(plugin, [path])[0] ?? path;
