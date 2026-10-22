// Export (spec §16): what the Export form asks for, carried out.
// - The scope is read from the note as it is now.
// - The plan is made: nothing to export, a question to ask first, or go.
// - Then the files are made. One of these:
//   - the image drawn in fixed colours with its frame (image.ts), on pages when one PNG cannot be sharp (big_export);
//   - the data written as a GQL block, CSV or GraphML (export_data_formats), with no layout asked for. So a graph too
//     large to draw is still exported whole. A view's faded context is marked as outside it when asked for
//     (view_export_stays_view);
//   - a path played into an animated SVG. It is refused before anything is laid out when too large for the device
//     (animation_export_fits).
// - Then the files are offered to a phone's share sheet by a tap of its own (export_share_sheet). Or they are written
//   safely into the vault under names of their own, all of them or none. The companion note comes with them when set
//   (export_companion_note).
// Each outcome is said once.
import { Notice, Platform, TFile } from 'obsidian';
import {
  PATH_PACES,
  PathPlayer,
  animationFits,
  companionNote,
  dataText,
  exportPlan,
  exportScope,
  exportedData,
  formatCount,
  formatSize,
  gqlBlocks,
  isDataFormat,
  pathsOf,
  readNote,
  readStyle,
  word,
  writeSafely,
} from '@thoughtknot/core';
import type {
  CompanionInfo,
  DataFormat,
  ExportFormat,
  ExportScope,
  ExportWalk,
  NoteReading,
  WriteOps,
} from '@thoughtknot/core';
import { paceOffered } from '@thoughtknot/core/display/export/export-form';
import type { ExportAsk, ExportOutcome } from '@thoughtknot/core/display/export/export-types';
import { exportRefusalWords } from '@thoughtknot/core/hosts/refusal-words';
import type ThoughtKnotPlugin from '../main';
import { classificationOf } from './classification';
import { deviceOf, imageFiles, tooLargeWords } from './image';
import type { ExportFile } from './image';
import { freePaths, vaultOps } from './vault-write';
import { noteText } from '../storage/plugin-notes';

export type { ExportAsk, ExportOutcome };

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

/**
 * The path an export plays (§7), found in the note as it is now. Or why it is not made, said before anything is laid
 * out. It is not made when:
 * - the path is gone or has no steps;
 * - it is asked for as anything but an SVG, or at a pace Play does not step at;
 * - it is too large for the device (animation_export_fits), saying why and what would make it fit.
 */
function playedWalk(
  reading: NoteReading,
  graph: string,
  asked: { id: string; pace: number },
  format: ExportFormat | DataFormat,
  scope: ExportScope,
): ExportWalk | { stopped: string } {
  const path = pathsOf(reading, graph).find((p) => p.id === asked.id);
  if (!path || PathPlayer.refusal(path)) return { stopped: word('exporting.no-path', { id: asked.id }) };
  if (format !== 'svg') return { stopped: word('exporting.svg-only') };
  if (!(PATH_PACES as readonly number[]).includes(asked.pace))
    return {
      stopped: word('exporting.bad-pace', {
        pace: asked.pace,
        paces: PATH_PACES.map(paceOffered).join(', ').toLowerCase(),
      }),
    };
  const large = animationFits(
    { steps: path.steps.length, things: scope.drawing.boxes.length, links: scope.drawing.links.length },
    deviceOf(),
  );
  return large ? { stopped: tooLargeWords(large) } : { path, pace: asked.pace };
}

/** Carries out an export the form asked for; never rejects: whatever goes wrong is said, and nothing half-done is left. */
export async function exportGraph(plugin: ThoughtKnotPlugin, ask: ExportAsk): Promise<ExportOutcome> {
  try {
    return await exporting(plugin, ask);
  } catch (e) {
    return said({ stopped: word('exporting.failed', { why: (e as Error).message }) });
  }
}

async function exporting(plugin: ThoughtKnotPlugin, ask: ExportAsk): Promise<ExportOutcome> {
  const file = plugin.app.vault.getAbstractFileByPath(ask.path);
  if (!(file instanceof TFile)) return said({ stopped: word('exporting.no-note') });
  const text = (await noteText(plugin.app, file.path)) ?? '';
  const texts = gqlBlocks(text).map((b) => b.text);
  const reading = readNote(texts);
  // a note over the text limit is never read (layout_contained), so there is nothing to draw: say why, never "nothing to export"
  if (reading.tooLarge)
    return said({ stopped: exportRefusalWords(reading.tooLarge, { word, formatCount, formatSize }) });
  const scope = exportScope(reading, {
    graph: ask.graph,
    ...(ask.view ? { view: ask.view } : {}),
    context: !!ask.context,
  });
  // the day where the person is, as the footer and the file name say it, never the day in UTC
  const now = new Date(),
    two = (n: number) => String(n).padStart(2, '0');
  const date = `${now.getFullYear()}-${two(now.getMonth() + 1)}-${two(now.getDate())}`;
  // a path played as an animated SVG: refused before it starts when it is gone, or too large for the device
  const walk = ask.walk && playedWalk(reading, ask.graph, ask.walk, ask.format, scope);
  if (walk && 'stopped' in walk) return said(walk);
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
  /** What was done with each animated image, said after the outcome (export_animation_stated); none for data. */
  let animation = '';
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
      ...(walk ? { walk } : {}),
      note: ask.path,
      date,
      go,
      paged: (pages) => {
        const again = planned(pages, true);
        if (!('go' in again)) throw new Error(word('exporting.plan-changed'));
        return again.go;
      },
    });
    if ('stopped' in made) return said(made);
    files = made.files;
    animation = made.animation ? ` ${made.animation}` : '';
  }
  // stopped while it was made: nothing is written or shared, and the form has said so (§44, progress_shown)
  if (ask.signal?.aborted) return { stopped: word('progress.export-stopped') };
  const name =
    files.length === 1 ? go.fileName : word('exporting.on-pages', { name: go.fileName, count: files.length });
  if (sheet) {
    const shared = files.map(
      (f) =>
        new File([typeof f.bytes === 'string' ? f.bytes : f.bytes.slice().buffer], f.name, { type: TYPES[go.format] }),
    );
    const run = async (): Promise<ExportOutcome> => {
      try {
        await sheet.share({ files: shared, title: go.fileName });
        return said({ done: `${word('exporting.shared', { name })}${animation}` });
      } catch (e) {
        const cancelled = e instanceof Error && e.name === 'AbortError';
        return said({
          stopped: cancelled
            ? word('exporting.share-closed')
            : word('exporting.share-failed', { why: (e as Error).message }),
        });
      }
    };
    return { share: { name, run } };
  }
  const outcome = await intoVault(plugin, {
    note: ask.path,
    files,
    scope,
    date,
    companion: go.companion?.path ?? null,
    ...(held ? { data: held } : {}),
  });
  return said('done' in outcome ? { done: `${outcome.done}${animation}` } : outcome);
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
  if (!left.length) return ` ${word(paths.length ? 'exporting.no-page-kept' : 'exporting.nothing-saved')}`;
  return ` ${word(left.length === 1 ? 'exporting.left' : 'exporting.left-many', { paths: left.join(', ') })}`;
}

/**
 * The files written into the vault under names of their own, so no earlier export is overwritten. All of them or none:
 * when one cannot be written, those written before it are taken away again. Any that cannot be is named. Then the
 * companion note, when set: an image's shows it, the data's links it and says how much it holds.
 */
async function intoVault(plugin: ThoughtKnotPlugin, x: VaultExport): Promise<ExportOutcome> {
  const { files } = x;
  const paths = freePaths(
    plugin,
    files.map((f) => f.path),
  );
  const ops = vaultOps(plugin);
  for (const [i, f] of files.entries()) {
    const written = await writeSafely(paths[i] ?? f.path, f.bytes, ops);
    if (!written.ok) {
      const before = written.left ? written.why : word('write.failed', { cause: written.cause });
      return { stopped: `${before}${await takenAway(ops, paths.slice(0, i))}` };
    }
  }
  const [first = ''] = paths;
  const kept = first === files[0]?.path ? '' : ` ${word('exporting.earlier-kept')}`;
  const inVault = Platform.isMobile;
  const what =
    files.length === 1 ? first : word('exporting.pages', { count: files.length, first, last: paths.at(-1) ?? '' });
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
      const saved = x.data ? 'data' : files.length === 1 ? 'image' : 'pages';
      return { done: word(`exporting.note-failed.${saved}${inVault ? '-vault' : ''}`, { what, cause: note.cause }) };
    }
  }
  return { done: `${word(inVault ? 'exporting.done-in-vault' : 'exporting.done', { what })}${kept}` };
}
