// Export on the page (spec §16, §26; cc_export_same). It carries out what the shared Export form asks for. It does so
// as the Obsidian plugin does, with the same core:
// - the scope, read from the note as it is;
// - the plan: nothing to export, a question to ask first for a classified note, or go;
// - the image drawn in fixed colours with its frame, or the data as a GQL block, CSV or GraphML;
// - a PNG the page draws on pages when one cannot be sharp.
// The files are then handed to the server. It writes them only as new files in the export folder (cc_exports_new_only).
// A companion note, when set, follows the image under the name it was saved as. Each outcome is said once. The page has
// no vault images, so a picture on a box is a frame.
import { gqlBlocks } from '../../core/src/blocks.ts';
import { classificationOf } from '../../core/src/claude-gate.ts';
import { readNote } from '../../core/src/drawing.ts';
import { dataText, exportedData, isDataFormat } from '../../core/src/export-data.ts';
import { companionNote } from '../../core/src/export-note.ts';
import type { CompanionInfo } from '../../core/src/export-note.ts';
import { pageSvg, pngPages } from '../../core/src/export-pages.ts';
import { exportPlan } from '../../core/src/export-plan.ts';
import { exportScope } from '../../core/src/export-scope.ts';
import { exportWithLayout, pngSize } from '../../core/src/export.ts';
import type { ExportInfo, ExportLayout, PngSize } from '../../core/src/export.ts';
import { exportFailureWords, exportRefusalWords } from '../../core/src/hosts/refusal-words.ts';
import type { Settings } from '../../core/src/settings.ts';
import { word } from '../../core/src/words.ts';
import { formatCount, formatSize } from '../../core/src/locale-formats.ts';
import { readStyle } from '../../core/src/style.ts';
import type { Exporting } from '../../core/src/display/export/export-form.ts';
import type { ExportAsk, ExportOutcome } from '../../core/src/display/export/export-types.ts';
import type { Saved, SavedFile } from './export-calls.ts';

/** How the refusals are said: the core's words and numbers, in the reader's language. */
const SAY = { word, formatCount, formatSize };

/** What an export on the page is made from. */
export interface PageExport {
  /** The note's path in the vault, as the footer and the file names say it. */
  note: string;
  /** The note's text as the page has it. */
  text: string;
  settings: Pick<Settings, 'classifications' | 'exportAsksAbove' | 'exportFolder' | 'companionNote'>;
  /** The folder the server puts the files in (empty is the top of the vault), as it said. */
  folder: string;
  layout: ExportLayout;
  rasterise: (svg: string, size: PngSize) => Promise<Uint8Array>;
  save: (files: SavedFile[]) => Promise<Saved>;
  /** The most pixels one PNG may have. */
  pixelLimit: number;
  device: 'phone' | 'desktop';
  /** The day where the person is, `YYYY-MM-DD`. */
  today: () => string;
  /** Says an outcome in a notice; none, and the form alone says it. */
  notify?: (message: string) => void;
}

/** The day where the person is, as the footer and file name say it, never the day in UTC. */
export function localDay(now: Date = new Date()): string {
  const two = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${two(now.getMonth() + 1)}-${two(now.getDate())}`;
}

/** What the form shows for the first graph of the note, and how it is carried out. */
export function exportingOf(x: PageExport, graph: string, theme: 'light' | 'dark'): Exporting {
  return { path: x.note, graph, theme, run: (ask) => runExport(x, ask) };
}

/** Carries out an export the form asked for; never rejects: whatever goes wrong is said, and nothing half-done is left. */
export async function runExport(x: PageExport, ask: ExportAsk): Promise<ExportOutcome> {
  const said = (outcome: ExportOutcome): ExportOutcome => {
    if ('done' in outcome) x.notify?.(outcome.done);
    if ('stopped' in outcome) x.notify?.(outcome.stopped);
    return outcome;
  };
  try {
    return said(await exporting(x, ask));
  } catch (e) {
    return said({ stopped: word('exporting.failed', { why: (e as Error).message }) });
  }
}

const inFolder = (folder: string, name: string) => (folder ? `${folder}/${name}` : name);

/** The note's classification as an export reads it: none, the level, or a word that is no level, so it is asked about. */
function classification(text: string): string | null {
  const c = classificationOf(text);
  return c.kind === 'none' ? null : c.kind === 'given' ? c.level : 'unreadable';
}

async function exporting(x: PageExport, ask: ExportAsk): Promise<ExportOutcome> {
  const texts = gqlBlocks(x.text).map((b) => b.text);
  const reading = readNote(texts);
  if (reading.tooLarge) return { stopped: exportRefusalWords(reading.tooLarge, SAY) };
  const scope = exportScope(reading, {
    graph: ask.graph,
    ...(ask.view ? { view: ask.view } : {}),
    context: !!ask.context,
  });
  const date = x.today();
  const planned = (pages?: number, confirmed = !!ask.confirmed) =>
    exportPlan({
      scope,
      format: ask.format,
      note: ask.path,
      date,
      noteClassification: classification(x.text),
      settings: { ...x.settings, exportFolder: x.folder },
      confirmed,
      toVault: true,
      ...(pages ? { pages } : {}),
    });
  const plan = planned();
  if ('nothing' in plan) return { stopped: plan.nothing };
  if ('ask' in plan) return { ask: plan.ask };
  const { go } = plan;
  let files: SavedFile[];
  let held: CompanionInfo['data'] | undefined;
  let animation = '';
  if (isDataFormat(ask.format)) {
    const data = exportedData(reading, scope);
    files = [{ name: go.fileName, text: dataText(data, ask.format, { note: ask.path, date }) }];
    held = {
      things: data.things.length,
      links: data.links.length,
      ...(data.faded ? { faded: { things: data.faded.things.length, links: data.faded.links.length } } : {}),
    };
  } else {
    const format = ask.format;
    const graph = reading.world[ask.graph];
    const styling = graph ? { style: readStyle(texts, ask.graph, reading).style, data: graph } : {};
    let layoutFailed = false;
    const layout: ExportLayout = (d, theme) =>
      x.layout(d, theme).catch((e: unknown) => {
        layoutFailed = true;
        throw e;
      });
    const info: ExportInfo = {
      note: ask.path,
      date,
      theme: ask.theme,
      motion: format === 'svg',
      device: x.device,
      ...styling,
    };
    let image;
    try {
      image = await exportWithLayout(scope, layout, info);
    } catch (e) {
      if (!layoutFailed) throw e;
      return { stopped: exportFailureWords(e, SAY) };
    }
    if (!image) return { stopped: word('page.export-stopped') };
    if ('reason' in image) return { stopped: exportRefusalWords(image, SAY) };
    if ('why' in image) return { stopped: word('page.export-not-made', { why: image.why }) };
    if (image.animation?.length) animation = ` ${image.animation.join(' ')}`;
    if (format === 'svg') files = [{ name: go.fileName, text: image.svg }];
    else {
      const pages = pngPages(image.width, image.height, x.pixelLimit);
      if (!pages) {
        const size = pngSize(image.width, image.height);
        return {
          stopped: word('page.too-large-png', { width: size.width, height: size.height }),
        };
      }
      if (pages.length === 1)
        files = [{ name: go.fileName, bytes: await x.rasterise(image.svg, pngSize(image.width, image.height)) }];
      else {
        const named = planned(pages.length, true);
        if (!('go' in named)) throw new Error(word('exporting.plan-changed'));
        files = [];
        // every page is drawn before any is saved, so one that cannot be drawn leaves nothing behind
        for (const [i, page] of pages.entries()) {
          const at = named.go.pages?.[i];
          if (!at) throw new Error(word('exporting.page-unnamed', { number: i + 1 }));
          files.push({
            name: at.fileName,
            bytes: await x.rasterise(pageSvg(image.svg, page), pngSize(page.width, page.height)),
          });
        }
      }
    }
  }
  // stopped while it was made: nothing is saved, and the form has said so (§44, progress_shown)
  if (ask.signal?.aborted) return { stopped: word('progress.export-stopped') };
  const saved = await x.save(files);
  if ('stopped' in saved) return { stopped: saved.stopped };
  const names = saved.written;
  const [first = ''] = names;
  const kept = first === files[0]?.name ? '' : ` ${word('exporting.earlier-kept')}`;
  const what =
    names.length === 1
      ? inFolder(x.folder, first)
      : word('exporting.pages', {
          count: names.length,
          first: inFolder(x.folder, first),
          last: inFolder(x.folder, names.at(-1) ?? ''),
        });
  if (go.companion) {
    // beside the file, under its name: a single file's own as saved; a paged image's, the name the pages share
    const noteName = names.length === 1 ? first.replace(/\.[^./]+$/, '.md') : go.companion.fileName;
    const text = companionNote({
      image: inFolder(x.folder, first),
      ...(names.length > 1 ? { pages: names.map((n) => inFolder(x.folder, n)) } : {}),
      ...(held ? { data: held } : {}),
      note: ask.path,
      date,
      scope,
    });
    const note = await x.save([{ name: noteName, text }]);
    if ('stopped' in note) {
      const saved = held ? 'data' : names.length === 1 ? 'image' : 'pages';
      const cause = note.stopped.replace(/\.$/, '');
      return { done: word(`exporting.note-failed.${saved}`, { what, cause }) };
    }
  }
  return { done: `${word('exporting.done', { what })}${kept}${animation}` };
}
