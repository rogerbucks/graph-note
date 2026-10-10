// Editing a walked path's steps as text (editor spec §7; graph spec §22, rule 2: a path's steps are numbered 1 to n):
// when a step is taken out, the later steps of the same path, in the same block, are each numbered one lower, so the
// path still reads 1 to n. Host-free.

const STEP = /\(\s*([A-Za-z_][A-Za-z0-9_]*)\s*\)\s*-\s*\[\s*:\s*STEP\s*\{\s*seq\s*:\s*(\d+)/g;

/**
 * The edits that number again the steps of a path after one taken out: for the step written `removed` (a STEP pattern,
 * such as `(tour)-[:STEP {seq: 2}]->(gone)`), each later step of the same path in `block` gets its seq one lower, as
 * an edit at a 0-based line and characters of the block. None when `removed` is not a STEP pattern.
 */
export function stepsAfter(
  block: string,
  removed: string,
): { span: { line: number; character: number; end: number }; text: string }[] {
  STEP.lastIndex = 0;
  const gone = STEP.exec(removed);
  STEP.lastIndex = 0; // matchAll below starts from where the pattern was left
  if (!gone) return [];
  const [, path, seq] = gone;
  const out: { span: { line: number; character: number; end: number }; text: string }[] = [];
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
