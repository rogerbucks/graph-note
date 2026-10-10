// Editing a walked path's steps as text (editor spec §7, path_missing_step; graph spec §22, rule 2: a path's steps are
// numbered 1 to n): the edit that takes a step out of its block, with its comma, or the comma before it when it is the
// block's last item; and the later steps of the same path, in the same block, each numbered one lower, so the path still
// reads 1 to n. Host-free. A step written over several lines, or with seq after another property, is not renumbered.
import { blankText, items, lineIndex } from './block-items.ts';
import type { Problem } from './note-reading.ts';

type Edit = { span: { line: number; character: number; end: number }; text: string };

const STEP = /\(\s*([A-Za-z_][A-Za-z0-9_]*)\s*\)\s*-\s*\[\s*:\s*STEP\s*\{\s*seq\s*:\s*(\d+)/g;

/**
 * The edits that number again the steps of a path after one taken out: for the step written `removed` (a STEP pattern,
 * such as `(tour)-[:STEP {seq: 2}]->(gone)`), each later step of the same path in `block` gets its seq one lower, as
 * an edit at a 0-based line and characters of the block. None when `removed` is not a STEP pattern.
 */
export function stepsAfter(block: string, removed: string): Edit[] {
  STEP.lastIndex = 0;
  const gone = STEP.exec(removed);
  STEP.lastIndex = 0; // matchAll below starts from where the pattern was left
  if (!gone) return [];
  const [, path, seq] = gone;
  const out: Edit[] = [];
  block.split('\n').forEach((line, i) => {
    if (line.trimStart().startsWith('//')) return;
    for (const m of line.matchAll(STEP)) {
      const n = Number(m[2]);
      if (m[1] !== path || n <= Number(seq)) continue;
      const end = (m.index ?? 0) + m[0].length;
      out.push({ span: { line: i, character: end - (m[2] ?? '').length, end }, text: String(n - 1) });
    }
  });
  return out;
}

/**
 * The fix that takes the step written `dropped`, on 1-based `line` of the block `text`, out of it, when the step sits on
 * one line of it: the step and its own comma; for the block's last item, which has none, the comma before it instead, so
 * none is left with nothing after it; and the later steps numbered again. Nothing when the step cannot be found so.
 */
export function removal(
  text: string,
  line: number,
  dropped: string,
): Pick<Problem, 'replace' | 'span' | 'fixTitle' | 'also'> {
  const want = blankText(dropped),
    lineOf = lineIndex(text),
    all = items(text);
  const at = all.findIndex(
    (x) => lineOf(x.from) <= line && line <= lineOf(x.to - 1) && blankText(text.slice(x.from, x.to)) === want,
  );
  const it = all[at];
  if (!it || lineOf(it.from) !== lineOf(it.to - 1)) return {};
  const lineStart = (pos: number) => text.lastIndexOf('\n', pos - 1) + 1;
  const end = it.comma !== -1 && lineOf(it.comma) === lineOf(it.from) ? it.comma + 1 : it.to;
  const start = lineStart(it.from);
  const prev = it.comma === -1 ? all[at - 1] : undefined;
  const before = prev && prev.comma !== -1 ? prev.comma : -1;
  const comma: Edit[] =
    before === -1
      ? []
      : [
          {
            span: {
              line: lineOf(before) - 1,
              character: before - lineStart(before),
              end: before - lineStart(before) + 1,
            },
            text: '',
          },
        ];
  return {
    replace: { written: text.slice(it.from, end), with: [''] },
    span: { line: lineOf(it.from) - 1, character: it.from - start, end: end - start },
    fixTitle: 'Remove the step',
    also: [...comma, ...stepsAfter(text, dropped)],
  };
}
