// Export (spec §16): what the Export form asks for, carried out — the scope read from the note as it is now, the plan
// made (nothing to export, a question to ask first, or go), the image drawn in fixed colours with its frame, and then
// either offered to a phone's share sheet by a tap of its own (export_share_sheet), or written safely into the vault
// under a name of its own with its companion note when set. Each outcome is said once, in words.
import { Notice, Platform, TFile } from 'obsidian';
import {
  companionNote,
  exportPlan,
  exportScope,
  exportWithLayout,
  gqlBlocks,
  pngSize,
  readNote,
  readStyle,
  writeSafely,
} from '@graph-note/core';
import type { ExportFormat, ExportLayout, ExportTheme, ViewSpec } from '@graph-note/core';
import type GraphNotePlugin from '../main';
import { exportFailureWords, exportRefusalWords } from '../layout-worker/refusal-words';
import { classificationOf } from './classification';
import { freePath, vaultOps } from './vault-write';

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

/**
 * How an export went: done or stopped (each said in a notice), a question to ask before it goes on, or an image ready
 * to share, which the share sheet opens when the person taps Share — a phone allows it only from a tap of their own.
 */
export type ExportOutcome =
  | { done: string }
  | { stopped: string }
  | { ask: string }
  | { share: { name: string; run: () => Promise<ExportOutcome> } };

type Sharing = Navigator & { canShare?: (d: ShareData) => boolean };

/** The phone's share sheet, when it can share a file of this kind; null when it cannot, and the vault is used instead. */
function shareSheet(format: ExportFormat): Sharing | null {
  const nav = activeWindow.navigator as Sharing | undefined;
  if (!Platform.isMobile || !nav || typeof nav.share !== 'function') return null;
  const type = format === 'png' ? 'image/png' : 'image/svg+xml';
  const probe = new File([''], `probe.${format}`, { type });
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
  const plan = exportPlan({
    scope,
    format: ask.format,
    note: ask.path,
    date,
    noteClassification: classificationOf(plugin.app, file, text, plugin.settings.classifications),
    settings: plugin.settings,
    confirmed: !!ask.confirmed,
    toVault: !sheet,
  });
  if ('nothing' in plan) return said({ stopped: plan.nothing });
  if ('ask' in plan) return { ask: plan.ask };
  const { go } = plan;
  const style = readStyle(texts, ask.graph, reading).style;
  // laid out where a drawing is, apart from the interface and under the same limits (layout_contained): one over a limit
  // writes nothing, and says why
  let layoutFailed = false;
  const layout: ExportLayout = (d, theme) =>
    plugin.layoutForExport(d, theme).catch((e: unknown) => {
      layoutFailed = true;
      throw e;
    });
  let image;
  try {
    image = await exportWithLayout(scope, layout, {
      note: ask.path,
      date,
      theme: ask.theme,
      style,
      data: reading.world[ask.graph],
    });
  } catch (e) {
    // the layout worker or its engine failed: told as a limit is, with what to do; any other failure is the caller's
    if (!layoutFailed) throw e;
    return said({ stopped: exportFailureWords(e) });
  }
  if (!image)
    return said({
      stopped:
        'The export was stopped: Graph Note was unloaded before the layout finished. Nothing was saved. Try again once Graph Note is enabled again.',
    });
  if ('reason' in image) return said({ stopped: exportRefusalWords(image) });
  let bytes: Uint8Array | string = image.svg;
  if (ask.format === 'png') {
    const size = pngSize(image.width, image.height);
    if (size.width * size.height > plugin.pngPixelLimit)
      return said({
        stopped: `The drawing is too large to draw as a PNG on this device (${size.width} by ${size.height}); export it as SVG.`,
      });
    bytes = await plugin.rasterise(image.svg, size);
  }
  if (sheet) {
    const type = go.format === 'png' ? 'image/png' : 'image/svg+xml';
    const data: BlobPart = typeof bytes === 'string' ? bytes : bytes.slice().buffer;
    const shared = new File([data], go.fileName, { type });
    const run = async (): Promise<ExportOutcome> => {
      try {
        await sheet.share({ files: [shared], title: go.fileName });
        return said({ done: `Shared ${go.fileName}.` });
      } catch (e) {
        const cancelled = e instanceof Error && e.name === 'AbortError';
        return said({
          stopped: cancelled
            ? 'Not shared: the share sheet was closed. Nothing was saved.'
            : `Not shared: ${(e as Error).message}. Nothing was saved.`,
        });
      }
    };
    return { share: { name: go.fileName, run } };
  }
  // a name of its own: an earlier export is never overwritten
  const path = freePath(plugin, go.path);
  const written = await writeSafely(path, bytes, vaultOps(plugin));
  if (!written.ok) return said({ stopped: written.why });
  const kept = path === go.path ? '' : ` An earlier export of that name was kept.`;
  const where = Platform.isMobile ? ' in the vault, as this phone cannot share a file' : '';
  if (go.companion) {
    const notePath = path.replace(/\.[^./]+$/, '.md');
    const note = await writeSafely(
      freePath(plugin, notePath),
      companionNote({ image: path, note: ask.path, date, scope }),
      vaultOps(plugin),
    );
    if (!note.ok) {
      const why = note.why.replace(/^The export could not be written: /, '').replace(/\. Nothing was saved\.$/, '');
      return said({
        done: `The image was saved at ${path}${where}, but its companion note could not be written: ${why}.`,
      });
    }
  }
  return said({ done: `Exported ${path}${where ? `, saved${where}` : ''}.${kept}` });
}
