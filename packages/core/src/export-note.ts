// The companion note of an export saved into the vault (editor spec §16, export_companion_note): a short Markdown note that
// links the image, names the note it came from, the graph or view, the day and the scope. It holds nothing of the data
// beyond what the image shows: the names the image carries, and no property, text or count the image does not.
import { saidDate } from './export-frame.ts';
import type { ExportScope } from './export-scope.ts';

/** What the companion note says. */
export interface CompanionInfo {
  /** The image's file name, as the vault finds it. */
  image: string;
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

/** The text of the companion note: a title, the image, then what it shows and where it came from. */
export function companionNote(info: CompanionInfo): string {
  const { scope } = info;
  const view = scope.view !== undefined;
  const shown = view
    ? scope.context
      ? 'the view, with the rest of the graph faded'
      : 'only the view'
    : 'the whole diagram';
  return [
    `# Export of ${oneLine(scope.graph)}${view ? `, view ${oneLine(scope.view ?? '')}` : ''}`,
    '',
    `![[${linked(info.image)}]]`,
    '',
    `- From: [[${linked(info.note.replace(/\.md$/i, ''))}]]`,
    `- Graph: ${oneLine(scope.graph)}`,
    ...(view ? [`- View: ${oneLine(scope.view ?? '')}, ${oneLine(scope.reading ?? '')}`] : []),
    `- Scope: ${shown}`,
    `- Exported: ${saidDate(info.date)}`,
    '',
  ].join('\n');
}
