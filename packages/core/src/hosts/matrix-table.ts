// The destination matrix note's table read into plain rows (editor spec §19, model_ceiling), for the hosts that read the
// note: Obsidian from the vault, the Claude Code mod from the file. It is host-side code, reached as
// `@graph-note/core/hosts/matrix-table` and imported by no gate or other core module: a host reads the note and hands
// the gates plain rows, so they never see the note's layout; this is the one reader, so both hosts read a note alike. The matrix is the
// first Markdown table with an empty top-left cell and at least one column named for a class the vault knows (a
// classification, or a name mapped in the settings). A cell is a mark only when it is exactly ✅ (yes), ❌ (no), or ⚠️ with
// the words after it as the condition (conditional); anything else, blank included, is unknown, which refuses. A bar
// written `\|` stays inside its cell.
import type { MatrixCell, MatrixRow } from '../ai-matrix.ts';

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

const MARKS = ['yes', 'conditional', 'no', 'unknown'];

/** Rows handed over as data, such as a mod's to its server: checked, and none at all if anything in them is not a row. */
export function matrixRowsFrom(given: unknown): MatrixRow[] {
  if (!Array.isArray(given)) return [];
  const rows: MatrixRow[] = [];
  for (const r of given as unknown[]) {
    const row = r && typeof r === 'object' ? (r as Record<string, unknown>) : {};
    if (typeof row.name !== 'string' || !Array.isArray(row.cells)) return [];
    const out: MatrixCell[] = [];
    for (const c of row.cells as unknown[]) {
      const cell = c && typeof c === 'object' ? (c as Record<string, unknown>) : {};
      if (typeof cell.class !== 'string' || typeof cell.mark !== 'string' || !MARKS.includes(cell.mark)) return [];
      out.push({
        class: cell.class,
        mark: cell.mark as MatrixCell['mark'],
        ...(typeof cell.condition === 'string' && cell.condition ? { condition: cell.condition } : {}),
      });
    }
    rows.push({ name: row.name, cells: out });
  }
  return rows;
}
