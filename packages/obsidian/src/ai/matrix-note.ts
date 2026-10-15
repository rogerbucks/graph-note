// The destination matrix note read into plain rows (editor spec §19, model_ceiling): the one place the note's layout is
// known, so the core is handed rows and never reads a note. The matrix is the first Markdown table with an empty
// top-left cell and at least one column named for a class the vault knows (a classification, or a name mapped in the
// settings): destinations are its rows, classes its columns. A cell is a mark only when it is exactly ✅ (yes), ❌ (no),
// or ⚠️ with the words after it as the condition (conditional); anything else, blank included, is unknown, which refuses.
// A bar written `\|` stays inside its cell.
import type { App } from 'obsidian';
import type { MatrixCell, MatrixRow } from '@graph-note/core';

const ESCAPED_BAR = '\u0000';
const cells = (line: string): string[] =>
  line
    .trim()
    .replaceAll('\\|', ESCAPED_BAR)
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim().replaceAll(ESCAPED_BAR, '|'));
const plain = (s: string) => s.replace(/\*\*/g, '').trim();
const isRule = (line: string) => /^\|?\s*:?-{2,}/.test(line.trim());

/** A cell's mark and, for a conditional one, its condition: the words after the mark, without a leading dash or colon. */
function markOf(cell: string): Pick<MatrixCell, 'mark' | 'condition'> {
  if (/^✅️?$/.test(cell)) return { mark: 'yes' };
  if (/^❌️?$/.test(cell)) return { mark: 'no' };
  const conditional = /^⚠️?([\s\S]*)$/.exec(cell);
  if (!conditional) return { mark: 'unknown' };
  const condition = (conditional[1] ?? '').replace(/^[\s:—–-]+/, '').trim();
  return { mark: 'conditional', ...(condition ? { condition } : {}) };
}

/** The rows of the note named in the settings, read now, never from a cache; none when no note is named or it is not there. */
export async function readMatrix(host: App, path: string, known: (name: string) => boolean): Promise<MatrixRow[]> {
  const file = path.trim() ? host.vault.getFileByPath(path.trim()) : null;
  return file ? matrixRows(await host.vault.read(file), known) : [];
}

/** The rows of the first matrix table in the note's text, found by its header; none when the note has no such table. */
export function matrixRows(text: string, known: (name: string) => boolean): MatrixRow[] {
  const lines = text.split(/\r?\n/);
  const head = lines.findIndex((l, i) => {
    const top = cells(l);
    return (
      l.trim().startsWith('|') &&
      top[0] === '' &&
      isRule(lines[i + 1] ?? '') &&
      top.slice(1).some((c) => known(plain(c)))
    );
  });
  if (head === -1) return [];
  const classes = cells(lines[head] ?? '')
    .slice(1)
    .map(plain);
  const rows: MatrixRow[] = [];
  for (const line of lines.slice(head + 2)) {
    if (!line.trim().startsWith('|')) break;
    const [name = '', ...marks] = cells(line);
    rows.push({ name: plain(name), cells: classes.map((c, i) => ({ class: c, ...markOf(marks[i] ?? '') })) });
  }
  return rows;
}
