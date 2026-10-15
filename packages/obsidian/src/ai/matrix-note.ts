// The destination matrix note read into plain rows (editor spec §19, model_ceiling): the one place the note's layout is
// known, so the core is handed rows and never reads a note. The matrix is the first Markdown table whose top-left cell
// is empty: destinations are its rows, classes its columns, and each cell a ✅ (yes), ⚠️ (conditional, the words after
// it being the condition) or ❌ (no); a cell that is blank or none of these is a no, never a yes.
import type { App } from 'obsidian';
import type { MatrixCell, MatrixRow } from '@graph-note/core';

const cells = (line: string): string[] =>
  line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim());
const plain = (s: string) => s.replace(/\*\*/g, '').trim();
const isRule = (line: string) => /^\|?\s*:?-{2,}/.test(line.trim());

/** A cell's mark and, for a conditional one, its condition: the words after the mark, without a leading dash or colon. */
function markOf(cell: string): Pick<MatrixCell, 'mark' | 'condition'> {
  if (cell.startsWith('✅')) return { mark: 'yes' };
  if (cell.startsWith('⚠')) {
    const condition = cell
      .replace(/^⚠️?/, '')
      .replace(/^[\s:—–-]+/, '')
      .trim();
    return { mark: 'conditional', ...(condition ? { condition } : {}) };
  }
  return { mark: 'no' };
}

/** The rows of the note named in the settings, read now, never from a cache; none when no note is named or it is not there. */
export async function readMatrix(host: App, path: string): Promise<MatrixRow[]> {
  const file = path.trim() ? host.vault.getFileByPath(path.trim()) : null;
  return file ? matrixRows(await host.vault.read(file)) : [];
}

/** The rows of the first matrix table in the note's text; none when the note has no such table. */
export function matrixRows(text: string): MatrixRow[] {
  const lines = text.split(/\r?\n/);
  const head = lines.findIndex(
    (l, i) => l.trim().startsWith('|') && cells(l)[0] === '' && cells(l).length > 1 && isRule(lines[i + 1] ?? ''),
  );
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
