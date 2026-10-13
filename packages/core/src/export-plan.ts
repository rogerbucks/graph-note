// The one decision before an export is written (editor spec §16, empty_export, classified_export, failed_export): there is
// nothing to export; or the note is classified above the configured level, so the host asks first; or go, with the file's
// name and place and, as configured, its companion note. Nothing is written here; the host writes only on a go, and only
// by `writeSafely`. A file name is made from the note, the graph or view and the day, safe on every platform. The data
// (export_data_formats) is named as an image is, with its own ending, and gets no companion note, which is an image's;
// a PNG split across pages (big_export) names each page after the one name, in order.
import type { ExportFormat } from './export.ts';
import { isDataFormat } from './export-data.ts';
import type { DataFormat } from './export-data.ts';
import type { ExportScope } from './export-scope.ts';
import { vaultFolder } from './settings.ts';
import type { Settings } from './settings.ts';

/** What the plan is made from. */
export interface ExportPlanInput {
  scope: ExportScope;
  format: ExportFormat | DataFormat;
  /** How many pages a PNG is split across (big_export); one, or none given, is one file. */
  pages?: number;
  /** The note's path in the vault. */
  note: string;
  /** The day, `YYYY-MM-DD`. */
  date: string;
  /** The note's classification (its front matter `classification:`) as the host read it; null when it has none. */
  noteClassification: string | null;
  settings: Pick<Settings, 'classifications' | 'exportAsksAbove' | 'exportFolder' | 'companionNote'>;
  /** Set once the user has said yes to the question the plan asked. */
  confirmed?: boolean;
  /** Whether the export is saved into the vault, as it is unless it is shared elsewhere; a companion note is for one that is. */
  toVault?: boolean;
}

/** Where an export is written: the image, and its companion note when the settings give one. */
export interface ExportGo {
  fileName: string;
  /** The vault folder, empty for the top of the vault. */
  folder: string;
  /** The folder and the file name. */
  path: string;
  format: ExportFormat | DataFormat;
  companion: { fileName: string; path: string } | null;
  /** For a PNG split across pages: each page's file, in reading order, named after `fileName`. */
  pages?: { fileName: string; path: string }[];
}

/** The plan: nothing to export (a sentence), a question to ask first (a sentence), or go. */
export type ExportDecision = { nothing: string } | { ask: string } | { go: ExportGo };

// characters no platform lets a file be named with, and the marks that would break a link to it
const UNSAFE_IN_A_NAME = '/\\:*?"<>|#^[]';
// Each part of a name is cut to this many UTF-8 bytes, as file systems count: with the day (10), `with-context` (12), four
// hyphens and the ending (4) the whole is at most 194 bytes, so it and its `.part` stay within 200. A longer ending, or a
// page's `-page-1-of-36`, takes its extra bytes from the note's part.
const MOST = { note: 80, graph: 44, view: 40, date: 10 };
const ENDING = 4;

/** The bytes of one character in UTF-8. */
const bytesOf = (c: string) => {
  const code = c.codePointAt(0) ?? 0;
  return code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4;
};

/** The start of `text` that fits in `most` UTF-8 bytes, cut between characters. */
function cut(text: string, most: number): string {
  let used = 0,
    out = '';
  for (const c of text) {
    used += bytesOf(c);
    if (used > most) break;
    out += c;
  }
  return out;
}

/** One part of a file name: unsafe characters and spaces made hyphens, no leading or trailing dot or hyphen, cut short. */
function part(text: string, most: number): string {
  const tidy = (s: string) => s.replace(/-{2,}/g, '-').replace(/^[-.]+|[-.]+$/g, '');
  const safe = [...text].map((c) => (c.charCodeAt(0) < 32 || UNSAFE_IN_A_NAME.includes(c) || /\s/.test(c) ? '-' : c));
  return tidy(cut(tidy(safe.join('')), most));
}

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** The question to ask before exporting a note of this classification, or null when it is not above the configured level. */
function question(input: ExportPlanInput): string | null {
  const given = (input.noteClassification ?? '').trim();
  if (!given) return null;
  const { classifications: levels, exportAsksAbove: level } = input.settings;
  const at = levels.findIndex((l) => same(l, given)),
    limit = levels.findIndex((l) => same(l, level));
  const ask = 'Export it anyway?';
  if (at === -1)
    return `${input.note} is classified "${given}", which is not one of the classifications set (${levels.join(', ')}), so it counts as above every level, ${level} included. ${ask}`;
  if (limit === -1)
    return `${input.note} is classified ${given}, and the level set for asking before an export, ${level}, is no longer one of the classifications, so every classified note is asked about. ${ask}`;
  return at > limit
    ? `${input.note} is classified ${given}, above ${level}, the level set for asking before an export. ${ask}`
    : null;
}

/**
 * What to do about an export. An empty scope says there is nothing to export, whatever else is true. Otherwise a note
 * whose classification is above the configured level is asked about, naming both, until the user has said yes
 * (`confirmed`); a classification that is not one of those set counts as above every level, and a note with none is not
 * asked about. Level and classification are compared whatever their case or spaces.
 */
export function exportPlan(input: ExportPlanInput): ExportDecision {
  const { scope, format, settings } = input;
  if (scope.empty) return { nothing: `There is nothing to export: ${lowerFirst(scope.why ?? 'the scope is empty')}` };
  const ask = input.confirmed ? null : question(input);
  if (ask) return { ask };
  const parts = input.note.split('/'),
    stem = (parts.pop() ?? '').replace(/\.md$/i, '');
  const pages = format === 'png' && input.pages !== undefined && input.pages > 1 ? Math.floor(input.pages) : 1;
  const pageOf = (n: number) => (pages > 1 ? `-page-${n}-of-${pages}` : '');
  const extra = Math.max(0, `.${format}`.length - ENDING) + pageOf(pages).length;
  const name = [
    part(stem, MOST.note - extra) || 'export',
    part(scope.graph, MOST.graph),
    part(scope.view ?? '', MOST.view),
    scope.context ? 'with-context' : '',
    part(input.date, MOST.date),
  ]
    .filter(Boolean)
    .join('-');
  // the folder set for exports if it can be used; else the note's own, exactly as given: it is where the note already is
  const folder = settings.exportFolder ? (vaultFolder(settings.exportFolder) ?? '') : '';
  const where = folder || parts.join('/');
  const at = (file: string) => (where ? `${where}/${file}` : file);
  const companion =
    settings.companionNote === 'on' && input.toVault !== false && !isDataFormat(format)
      ? { fileName: `${name}.md`, path: at(`${name}.md`) }
      : null;
  const go: ExportGo = {
    fileName: `${name}.${format}`,
    folder: where,
    path: at(`${name}.${format}`),
    format,
    companion,
  };
  if (pages > 1)
    go.pages = Array.from({ length: pages }, (_, i) => {
      const fileName = `${name}${pageOf(i + 1)}.${format}`;
      return { fileName, path: at(fileName) };
    });
  return { go };
}
