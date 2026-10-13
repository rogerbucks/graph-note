// Export (spec §16): what the Export form asks for, carried out — the scope read from the note as it is now, the plan
// made (nothing to export, a question to ask first, or go), then the files: the image drawn in fixed colours with its
// frame (image.ts), on pages when one PNG cannot be sharp (big_export), or the data written as a GQL block, CSV or
// GraphML (export_data_formats), with no layout asked for, so a graph too large to draw is still exported whole, and a
// view's faded context marked as outside it when asked for (view_export_stays_view). Then either offered to a phone's
// share sheet by a tap of its own (export_share_sheet), or written safely into the vault under names of their own, all
// of them or none, with the companion note when set (export_companion_note). Each outcome is said once.
import { Notice, Platform, TFile } from 'obsidian';
import {
  companionNote,
  dataText,
  exportPlan,
  exportScope,
  exportedData,
  gqlBlocks,
  isDataFormat,
  readNote,
  readStyle,
  writeSafely,
} from '@graph-note/core';
import type {
  CompanionInfo,
  DataFormat,
  ExportFormat,
  ExportScope,
  ExportTheme,
  ViewSpec,
  WriteOps,
} from '@graph-note/core';
import type GraphNotePlugin from '../main';
import { exportRefusalWords } from '../layout-worker/refusal-words';
import { classificationOf } from './classification';
import { imageFiles } from './image';
import type { ExportFile } from './image';
import { freePaths, vaultOps } from './vault-write';

/** What the Export form asks for: the note, the graph or view, whether with its faded context, the format and colours. */
export interface ExportAsk {
  path: string;
  graph: string;
  view?: { name: string; spec: ViewSpec };
  /** A view's faded context: drawn faded in an image, marked as outside the view in the data. */
  context?: boolean;
  format: ExportFormat | DataFormat;
  theme: ExportTheme;
  /** Set once the person has said yes to the question asked. */
  confirmed?: boolean;
}

/**
 * How an export went: done or stopped (each said in a notice), a question to ask before it goes on, or files ready
 * to share, which the share sheet opens when the person taps Share — a phone allows it only from a tap of their own.
 */
export type ExportOutcome =
  | { done: string }
  | { stopped: string }
  | { ask: string }
  | { share: { name: string; run: () => Promise<ExportOutcome> } };

type Sharing = Navigator & { canShare?: (d: ShareData) => boolean };

/** The media type each format is shared as. */
const TYPES: Record<ExportFormat | DataFormat, string> = {
  svg: 'image/svg+xml',
  png: 'image/png',
  gql: 'text/plain',
  csv: 'text/csv',
  graphml: 'application/graphml+xml',
};

/** The phone's share sheet, when it can share a file of this kind; null when it cannot, and the vault is used instead. */
function shareSheet(format: ExportFormat | DataFormat): Sharing | null {
  const nav = activeWindow.navigator as Sharing | undefined;
  if (!Platform.isMobile || !nav || typeof nav.share !== 'function') return null;
  const probe = new File([''], `probe.${format}`, { type: TYPES[format] });
  return !nav.canShare || nav.canShare({ files: [probe] }) ? nav : null;
}

const said = (outcome: ExportOutcome): ExportOutcome => {
  if ('done' in outcome) new Notice(outcome.done);
  if ('stopped' in outcome) new Notice(outcome.stopped);
  return outcome;
};

/** Carries out an export the form asked for; never rejects: whatever goes wrong is said, and nothing half-done is left. */
export async function exportGraph(plugin: GraphNotePlugin, ask: ExportAsk): Promise<ExportOutcome> {
  try {
    return await exporting(plugin, ask);
  } catch (e) {
    return said({ stopped: `The export could not be made: ${(e as Error).message}` });
  }
}

async function exporting(plugin: GraphNotePlugin, ask: ExportAsk): Promise<ExportOutcome> {
  const file = plugin.app.vault.getAbstractFileByPath(ask.path);
  if (!(file instanceof TFile)) return said({ stopped: 'The note is not there any more, so nothing was exported.' });
  const text = await plugin.app.vault.read(file);
  const texts = gqlBlocks(text).map((b) => b.text);
  const reading = readNote(texts);
  // a note over the text limit is never read (layout_contained), so there is nothing to draw: say why, never "nothing to export"
  if (reading.tooLarge) return said({ stopped: exportRefusalWords(reading.tooLarge) });
  const scope = exportScope(reading, {
    graph: ask.graph,
    ...(ask.view ? { view: ask.view } : {}),
    context: !!ask.context,
  });
  // the day where the person is, as the footer and the file name say it, never the day in UTC
  const now = new Date(),
    two = (n: number) => String(n).padStart(2, '0');
  const date = `${now.getFullYear()}-${two(now.getMonth() + 1)}-${two(now.getDate())}`;
  const sheet = shareSheet(ask.format);
  const planned = (pages?: number, confirmed = !!ask.confirmed) =>
    exportPlan({
      scope,
      format: ask.format,
      note: ask.path,
      date,
      noteClassification: classificationOf(plugin.app, file, text, plugin.settings.classifications),
      settings: plugin.settings,
      confirmed,
      toVault: !sheet,
      ...(pages ? { pages } : {}),
    });
  const plan = planned();
  if ('nothing' in plan) return said({ stopped: plan.nothing });
  if ('ask' in plan) return { ask: plan.ask };
  const { go } = plan;
  let files: ExportFile[];
  let held: CompanionInfo['data'] | undefined;
  if (isDataFormat(ask.format)) {
    const data = exportedData(reading, scope);
    files = [{ name: go.fileName, path: go.path, bytes: dataText(data, ask.format, { note: ask.path, date }) }];
    held = {
      things: data.things.length,
      links: data.links.length,
      ...(data.faded ? { faded: { things: data.faded.things.length, links: data.faded.links.length } } : {}),
    };
  } else {
    // the style goes with the graph as read, whose values the properties it shows inline are drawn with
    const data = reading.world[ask.graph];
    const styling = data ? { style: readStyle(texts, ask.graph, reading).style, data } : {};
    const made = await imageFiles(plugin, {
      scope,
      format: ask.format,
      theme: ask.theme,
      ...styling,
      note: ask.path,
      date,
      go,
      paged: (pages) => {
        const again = planned(pages, true);
        if (!('go' in again)) throw new Error('the plan changed while the pages were drawn');
        return again.go;
      },
    });
    if ('stopped' in made) return said(made);
    files = made.files;
  }
  const name = files.length === 1 ? go.fileName : `${go.fileName} on ${files.length} pages`;
  if (sheet) {
    const shared = files.map(
      (f) =>
        new File([typeof f.bytes === 'string' ? f.bytes : f.bytes.slice().buffer], f.name, { type: TYPES[go.format] }),
    );
    const run = async (): Promise<ExportOutcome> => {
      try {
        await sheet.share({ files: shared, title: go.fileName });
        return said({ done: `Shared ${name}.` });
      } catch (e) {
        const cancelled = e instanceof Error && e.name === 'AbortError';
        return said({
          stopped: cancelled
            ? 'Not shared: the share sheet was closed. Nothing was saved.'
            : `Not shared: ${(e as Error).message}. Nothing was saved.`,
        });
      }
    };
    return { share: { name, run } };
  }
  return said(
    await intoVault(plugin, {
      note: ask.path,
      files,
      scope,
      date,
      companion: go.companion?.path ?? null,
      ...(held ? { data: held } : {}),
    }),
  );
}

/** What is written into the vault: the files, and what their companion note, when set, is made from. */
interface VaultExport {
  note: string;
  files: ExportFile[];
  scope: ExportScope;
  date: string;
  /** The companion note's path from the plan, or null when none is set. */
  companion: string | null;
  /** For the data: how much it holds, for the companion note to say. */
  data?: CompanionInfo['data'];
}

/** Takes away the files `paths` written before a failure, carrying on past any that cannot be: those are named. */
async function takenAway(ops: WriteOps, paths: string[]): Promise<string> {
  const left: string[] = [];
  for (const path of paths) {
    try {
      await ops.remove(path);
    } catch {
      left.push(path);
    }
  }
  if (!left.length) return paths.length ? ' None of its pages was kept.' : ' Nothing was saved.';
  const them = left.length === 1 ? 'it' : 'them';
  return ` ${left.join(', ')} could not be taken away again: delete ${them} by hand.`;
}

/**
 * The files written into the vault under names of their own, so no earlier export is overwritten; all of them or none:
 * when one cannot be written, those written before it are taken away again, and any that cannot be is named. Then the
 * companion note, when set: an image's shows it, the data's links it and says how much it holds.
 */
async function intoVault(plugin: GraphNotePlugin, x: VaultExport): Promise<ExportOutcome> {
  const { files } = x;
  const paths = freePaths(
    plugin,
    files.map((f) => f.path),
  );
  const ops = vaultOps(plugin);
  for (const [i, f] of files.entries()) {
    const written = await writeSafely(paths[i] ?? f.path, f.bytes, ops);
    if (!written.ok) {
      const before = written.why.replace(/ Nothing was saved\.$/, '');
      return { stopped: `${before}${await takenAway(ops, paths.slice(0, i))}` };
    }
  }
  const [first = ''] = paths;
  const kept = first === files[0]?.path ? '' : ` An earlier export of that name was kept.`;
  const where = Platform.isMobile ? ' in the vault, as this phone cannot share a file of this kind' : '';
  const what = files.length === 1 ? first : `${files.length} pages, ${first} to ${paths.at(-1) ?? ''}`;
  if (x.companion) {
    // beside the file, under its name: a single file's own, as written; a paged image's, the name the pages share
    const notePath = files.length === 1 ? first.replace(/\.[^./]+$/, '.md') : x.companion;
    const text = companionNote({
      image: first,
      ...(files.length > 1 ? { pages: paths } : {}),
      ...(x.data ? { data: x.data } : {}),
      note: x.note,
      date: x.date,
      scope: x.scope,
    });
    const note = await writeSafely(freePaths(plugin, [notePath])[0] ?? notePath, text, ops);
    if (!note.ok) {
      const why = note.why.replace(/^The export could not be written: /, '').replace(/\. Nothing was saved\.$/, '');
      const saved = x.data ? 'data was' : files.length === 1 ? 'image was' : 'pages were';
      return { done: `The ${saved} saved at ${what}${where}, but its companion note could not be written: ${why}.` };
    }
  }
  return { done: `Exported ${what}${where ? `, saved${where}` : ''}.${kept}` };
}
