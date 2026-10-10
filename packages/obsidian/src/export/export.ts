// Export (spec §16): what the Export form asks for, carried out — the scope read from the note as it is now, the plan
// made (nothing to export, a question to ask first, or go), the image drawn in fixed colours with its frame, and the file
// written safely into the vault with its companion note when set; on a phone, offered to the share sheet instead.
import { Notice, Platform, TFile } from 'obsidian';
import {
  companionNote,
  exportPlan,
  exportScope,
  exportSvg,
  gqlBlocks,
  pngSize,
  readNote,
  readStyle,
  writeSafely,
} from '@graph-note/core';
import type { ExportFormat, ExportTheme, ViewSpec, WriteOps } from '@graph-note/core';
import type GraphNotePlugin from '../main';

/** What the Export form asks for: the note, the graph or view, whether with its faded context, the format and colours. */
export interface ExportAsk {
  path: string;
  graph: string;
  view?: { name: string; spec: ViewSpec };
  context?: boolean;
  format: ExportFormat;
  theme: ExportTheme;
  /** Set once the person has said yes to the question asked. */
  confirmed?: boolean;
}

/** How an export went: done, stopped (said in a notice), or a question to ask before it goes on. */
export type ExportOutcome = { done: string } | { stopped: string } | { ask: string };

/** The vault's own ways of writing a file, as the safe write needs them: through its API, never the file system. */
function vaultOps(plugin: GraphNotePlugin): WriteOps {
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
      const source = at(from),
        target = at(to);
      if (!(source instanceof TFile)) throw new Error(`there is no ${from} to move`);
      // an earlier export of the same name goes where the person's deleted files go, as they have set it
      if (target instanceof TFile) await plugin.app.fileManager.trashFile(target);
      await vault.rename(source, to);
    },
    remove: async (path) => {
      const f = at(path);
      if (f instanceof TFile) await plugin.app.fileManager.trashFile(f);
    },
  };
}

/** Offers the image to the phone's share sheet; false when the phone cannot share a file, so it is saved instead. */
async function shared(name: string, bytes: Uint8Array | string, format: ExportFormat): Promise<boolean> {
  const nav = activeWindow.navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (!Platform.isMobile || typeof nav.share !== 'function') return false;
  const type = format === 'png' ? 'image/png' : 'image/svg+xml';
  const data: BlobPart = typeof bytes === 'string' ? bytes : bytes.slice().buffer;
  const file = new File([data], name, { type });
  if (nav.canShare && !nav.canShare({ files: [file] })) return false;
  await nav.share({ files: [file], title: name });
  return true;
}

/** Carries out an export the form asked for; what it says is also said in a notice. */
export async function exportGraph(plugin: GraphNotePlugin, ask: ExportAsk): Promise<ExportOutcome> {
  const stop = (why: string): ExportOutcome => {
    new Notice(why);
    return { stopped: why };
  };
  const file = plugin.app.vault.getAbstractFileByPath(ask.path);
  if (!(file instanceof TFile)) return stop('The note is not there any more, so nothing was exported.');
  const texts = gqlBlocks(await plugin.app.vault.read(file)).map((b) => b.text);
  const reading = readNote(texts);
  const scope = exportScope(reading, {
    graph: ask.graph,
    ...(ask.view ? { view: ask.view } : {}),
    context: !!ask.context,
  });
  // the day where the person is, as the footer and the file name say it, never the day in UTC
  const now = new Date(),
    two = (n: number) => String(n).padStart(2, '0');
  const date = `${now.getFullYear()}-${two(now.getMonth() + 1)}-${two(now.getDate())}`;
  const raw: unknown = plugin.app.metadataCache.getFileCache(file)?.frontmatter?.classification;
  const plan = exportPlan({
    scope,
    format: ask.format,
    note: ask.path,
    date,
    noteClassification: typeof raw === 'string' ? raw : null,
    settings: plugin.settings,
    confirmed: !!ask.confirmed,
    toVault: !Platform.isMobile,
  });
  if ('nothing' in plan) return stop(plan.nothing);
  if ('ask' in plan) return { ask: plan.ask };
  const { go } = plan;
  let bytes: Uint8Array | string;
  try {
    const style = readStyle(texts, ask.graph, reading).style;
    const image = exportSvg(scope, await plugin.graphviz(), { note: ask.path, date, theme: ask.theme, style });
    bytes = ask.format === 'png' ? await plugin.rasterise(image.svg, pngSize(image.width, image.height)) : image.svg;
  } catch (e) {
    return stop(`The export could not be drawn: ${(e as Error).message}`);
  }
  try {
    if (await shared(go.fileName, bytes, go.format)) return { done: `Shared ${go.fileName}.` };
  } catch {
    // the share sheet closed without sharing: the file is saved in the vault instead
  }
  const written = await writeSafely(go.path, bytes, vaultOps(plugin));
  if (!written.ok) return stop(`The export could not be written: ${written.why}`);
  if (go.companion) {
    const text = companionNote({ image: go.path, note: ask.path, date, scope });
    const note = await writeSafely(go.companion.path, text, vaultOps(plugin));
    if (!note.ok) new Notice(`The companion note could not be written: ${note.why}`);
  }
  const done = `Exported ${go.path}.`;
  new Notice(done);
  return { done };
}
