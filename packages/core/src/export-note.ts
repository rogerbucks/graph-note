// The companion note of an export saved into the vault (editor spec §16, export_companion_note). It is a short Markdown
// note that links the export. It names the note it came from, the graph or view, the day and the scope. Of an image it
// shows the image, and holds nothing of the data beyond what the image shows. That means the names the image carries,
// and no property, text or count the image does not. Of the data it links the file and shows nothing. It says how many
// things and links it holds, and how many of them are a view's faded context.
import { saidDate } from './export-frame.ts';
import type { ExportScope } from './export-scope.ts';

/** What the companion note says. */
export interface CompanionInfo {
  /** The exported file's name, as the vault finds it: the image, or the data. */
  image: string;
  /** For an image split across pages (big_export): each page's file name, in reading order, shown in place of `image`. */
  pages?: string[];
  /** For the data (export_data_formats): how many things and links it holds, and of them how many are faded context. */
  data?: { things: number; links: number; faded?: { things: number; links: number } };
  /** The note it came from, by its path in the vault. */
  note: string;
  /** The day exported, `YYYY-MM-DD`. */
  date: string;
  scope: ExportScope;
}

/** A name safe inside `[[ ]]`: the marks that end or divide a link are made hyphens, and a line break a space. */
const linked = (name: string) =>
  name
    .replace(/[[\]|#^]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();

/** One line of text: no line break can start another line of the note. */
const oneLine = (text: string) => text.replace(/\s+/g, ' ').trim();

/** A count and its word, `1 thing`, `2 things`. */
const counted = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** How much the data holds, in words. */
function holds(data: NonNullable<CompanionInfo['data']>): string {
  const both = (c: { things: number; links: number }) =>
    `${counted(c.things, 'thing')} and ${counted(c.links, 'link')}`;
  const outside = data.faded ? `, ${both(data.faded)} of them outside the view, marked as faded` : '';
  return `${both(data)}${outside}`;
}

/** The text of the companion note: a title, the image or a link to the data, then what it is and where it came from. */
export function companionNote(info: CompanionInfo): string {
  const { scope, data } = info;
  const view = scope.view !== undefined;
  const shown = view
    ? scope.context
      ? data
        ? 'the view, with the rest of the graph as its faded context'
        : 'the view, with the rest of the graph faded'
      : 'only the view'
    : 'the whole diagram';
  const pages = info.pages && info.pages.length > 1 ? info.pages : null;
  const shownFiles = data ? [] : [...(pages ?? [info.image]).map((image) => `![[${linked(image)}]]`), ''];
  return [
    `# Export of ${oneLine(scope.graph)}${view ? `, view ${oneLine(scope.view ?? '')}` : ''}`,
    '',
    ...shownFiles,
    ...(data ? [`- File: [[${linked(info.image)}]]`] : []),
    `- From: [[${linked(info.note.replace(/\.md$/i, ''))}]]`,
    `- Graph: ${oneLine(scope.graph)}`,
    ...(view ? [`- View: ${oneLine(scope.view ?? '')}, ${oneLine(scope.reading ?? '')}`] : []),
    `- Scope: ${shown}`,
    ...(data ? [`- Holds: ${holds(data)}`] : []),
    ...(pages ? [`- Pages: ${pages.length}, in reading order: along each row, then down`] : []),
    `- Exported: ${saidDate(info.date)}`,
    '',
  ].join('\n');
}
