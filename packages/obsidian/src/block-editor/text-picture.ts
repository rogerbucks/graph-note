// The coloured picture under the block editor's text field (spec §4): the text in gql-highlight's colours, each problem
// underlined over exactly its words with a sign at the end of its line, and each line read back in plain English.
import { tokenize } from '@graph-note/core';
import type { Diagnostic } from '@graph-note/core';

/** Paints the picture of `text` into the overlay: tokens, problems marked where they are, and the read-back by line. */
export function paintText(overlay: HTMLElement, text: string, problems: Diagnostic[], back: Map<number, string>): void {
  const lines: { c: string | null; s: string }[][] = [[]];
  for (const t of tokenize(text)) {
    t.s.split('\n').forEach((piece, i) => {
      if (i) lines.push([]);
      if (piece) lines[lines.length - 1]?.push({ c: t.c, s: piece });
    });
  }
  overlay.empty();
  lines.forEach((parts, n) => {
    const marks = problems.filter((d) => d.range.start.line <= n && n <= d.range.end.line);
    const cut = (from: number, to: number) =>
      marks.find(
        (d) =>
          (d.range.start.line < n || d.range.start.character <= from) &&
          (d.range.end.line > n || to <= d.range.end.character),
      );
    let col = 0;
    for (const p of parts) {
      // split each token where a problem starts or ends, so the mark covers exactly the problem's words
      const edges = new Set([0, p.s.length]);
      for (const d of marks)
        for (const c of [
          d.range.start.line === n ? d.range.start.character : 0,
          d.range.end.line === n ? d.range.end.character : Infinity,
        ])
          if (c > col && c < col + p.s.length) edges.add(c - col);
      const cuts = [...edges].sort((a, b) => a - b);
      for (let i = 0; i < cuts.length - 1; i++) {
        const a = cuts[i] ?? 0,
          b = cuts[i + 1] ?? 0,
          piece = p.s.slice(a, b),
          d = cut(col + a, col + b);
        const cls = [
          p.c ? `gql-${p.c}` : '',
          d ? `graph-note-problem is-${d.severity === 1 ? 'error' : 'warning'}` : '',
        ]
          .filter(Boolean)
          .join(' ');
        if (cls) overlay.createSpan({ cls, text: piece });
        else overlay.appendText(piece);
      }
      col += p.s.length;
    }
    if (marks.length) overlay.createSpan({ cls: 'graph-note-line-sign', text: ' ⚠' });
    const said = back.get(n);
    if (said) overlay.createSpan({ cls: 'graph-note-readback', text: ` — ${said}` });
    overlay.appendText('\n');
  });
}
