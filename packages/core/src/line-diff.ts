// The lines changed between two texts (editor spec §41, github_review_items): the deepest level of a review. Every line
// is kept, added or removed, found by Myers' shortest edit script. So a change is shown in the fewest lines added and
// removed. Lines end at LF only, as every reader here reads them. Past `DIFF_LIMIT` lines of edits the rest is said to
// be too large to compare line by line, never left to run without end.
import { THRESHOLDS, thresholdValue } from './thresholds.ts';

/** One line of a comparison: kept, added or removed, with its number in the older and the newer text. */
export interface DiffLine {
  kind: 'keep' | 'add' | 'remove';
  text: string;
  /** Its line in the older text (1-based), for a line kept or removed. */
  old?: number;
  /** Its line in the newer text (1-based), for a line kept or added. */
  new?: number;
}

/** The most edits (lines added plus removed) compared line by line, unless a caller sets another (`diff_limit`). */
export const DIFF_LIMIT = THRESHOLDS.diff_limit.value;

/** The lines of a text, split at LF; an empty text has none. */
const linesOf = (t: string) => (t === '' ? [] : t.replace(/\n$/, '').split('\n'));

/**
 * The lines of `before` and `after`, each kept, added or removed, in order. Null when more than `limit` lines changed
 * (`DIFF_LIMIT` unless set within its range), which a host says is too large to show line by line.
 */
export function lineDiff(before: string, after: string, limit: number = DIFF_LIMIT): DiffLine[] | null {
  const a = linesOf(before),
    b = linesOf(after);
  const n = a.length,
    m = b.length,
    max = Math.min(n + m, thresholdValue('diff_limit', limit));
  const offset = max + 1;
  const v = new Array<number>(2 * max + 3).fill(0);
  // each step keeps only the furthest points it started from, k = -d-1 … d+1, so memory grows with the edits squared
  const trace: number[][] = [];
  let found = -1;
  for (let d = 0; d <= max && found < 0; d++) {
    trace.push(v.slice(offset - d - 1, offset + d + 2));
    for (let k = -d; k <= d; k += 2) {
      const down = k === -d || (k !== d && (v[offset + k - 1] ?? 0) < (v[offset + k + 1] ?? 0));
      let x = down ? (v[offset + k + 1] ?? 0) : (v[offset + k - 1] ?? 0) + 1;
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) {
        x++;
        y++;
      }
      v[offset + k] = x;
      if (x >= n && y >= m) {
        found = d;
        break;
      }
    }
  }
  if (found < 0) return null;
  // walk back from the end through each step's furthest points
  const out: DiffLine[] = [];
  let x = n,
    y = m;
  for (let d = found; d > 0; d--) {
    const row = trace[d] as number[];
    const w = (k: number) => row[k + d + 1] ?? 0;
    const k = x - y;
    const down = k === -d || (k !== d && w(k - 1) < w(k + 1));
    const pk = down ? k + 1 : k - 1;
    const px = w(pk),
      py = px - pk;
    while (x > px && y > py) out.push({ kind: 'keep', text: a[--x] as string, old: x + 1, new: --y + 1 });
    if (down) out.push({ kind: 'add', text: b[--y] as string, new: y + 1 });
    else out.push({ kind: 'remove', text: a[--x] as string, old: x + 1 });
  }
  while (x > 0 && y > 0) out.push({ kind: 'keep', text: a[--x] as string, old: x + 1, new: --y + 1 });
  return out.reverse();
}
