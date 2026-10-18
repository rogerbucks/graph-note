// The coloured picture under the block editor's text field (spec §4): the text in gql-highlight's colours, each problem
// underlined over exactly its words with a sign at the end of its line, each link in a text or a comment marked as a
// link (§18, links_shown), and each line read back in plain English after it, wrapping as the field wraps.
import { linksIn, tokenize } from '@graph-note/core';
import type { Diagnostic } from '@graph-note/core';
import type { Ghost } from './inline-completion';

/** A piece of the text in the picture: its class, its words, and whether it is ghost text, which is no part of the text. */
interface Piece {
  c: string | null;
  s: string;
  ghost?: boolean;
}

/** The text's tokens with the ghost text among them, at the place it goes. */
function withGhost(text: string, ghost: Ghost | null): Piece[] {
  const out: Piece[] = [];
  let at = 0,
    placed = !ghost;
  for (const t of tokenize(text)) {
    const cut = ghost && !placed && ghost.at <= at + t.s.length ? ghost.at - at : -1;
    if (cut < 0) out.push(t);
    else {
      if (cut) out.push({ c: t.c, s: t.s.slice(0, cut) });
      out.push({ c: null, s: ghost?.text ?? '', ghost: true });
      if (cut < t.s.length) out.push({ c: t.c, s: t.s.slice(cut) });
      placed = true;
    }
    at += t.s.length;
  }
  if (ghost && !placed) out.push({ c: null, s: ghost.text, ghost: true });
  return out;
}

/** Paints the picture of `text` into the overlay: tokens, problems marked where they are, and the read-back by line. */
export function paintText(
  overlay: HTMLElement,
  text: string,
  problems: Diagnostic[],
  back: Map<number, string>,
  ghost: Ghost | null = null,
): void {
  const lines: Piece[][] = [[]];
  for (const t of withGhost(text, ghost)) {
    t.s.split('\n').forEach((piece, i) => {
      if (i) lines.push([]);
      if (piece) lines[lines.length - 1]?.push({ ...t, s: piece });
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
    // the links written in its texts and comments, each marked as a link (§18, links_shown)
    const links = linksIn(parts.flatMap((p) => (p.ghost ? [] : [p.s])).join(''));
    const inLink = (from: number, to: number) => links.some((l) => l.start <= from && to <= l.end);
    let col = 0;
    for (const p of parts) {
      if (p.ghost) {
        overlay.createSpan({ cls: 'graph-note-ghost', text: p.s });
        continue;
      }
      // split each token where a problem or a link starts or ends, so the mark covers exactly its words
      const edges = new Set([0, p.s.length]);
      for (const d of marks)
        for (const c of [
          d.range.start.line === n ? d.range.start.character : 0,
          d.range.end.line === n ? d.range.end.character : Infinity,
        ])
          if (c > col && c < col + p.s.length) edges.add(c - col);
      if (p.c === 'string' || p.c === 'comment')
        for (const l of links)
          for (const c of [l.start, l.end]) if (c > col && c < col + p.s.length) edges.add(c - col);
      const cuts = [...edges].sort((a, b) => a - b);
      for (let i = 0; i < cuts.length - 1; i++) {
        const a = cuts[i] ?? 0,
          b = cuts[i + 1] ?? 0,
          piece = p.s.slice(a, b),
          d = cut(col + a, col + b);
        const cls = [
          p.c ? `gql-${p.c}` : '',
          (p.c === 'string' || p.c === 'comment') && inLink(col + a, col + b) ? 'graph-note-text-link' : '',
          d ? `graph-note-problem is-${d.severity === 1 ? 'error' : d.severity === 4 ? 'hint' : 'warning'}` : '',
        ]
          .filter(Boolean)
          .join(' ');
        if (cls) overlay.createSpan({ cls, text: piece });
        else overlay.appendText(piece);
      }
      col += p.s.length;
    }
    // the sign and the note after the line, out of the flow of the text: the line wraps as the field's does (long_lines_wrap)
    const sign = marks.some((d) => d.severity !== 4);
    const said = parts.some((p) => p.ghost) ? undefined : back.get(n); // the ghost has the end of its line
    if (sign || said) {
      const end = overlay.createSpan({ cls: 'graph-note-line-end' });
      if (sign) end.createSpan({ cls: 'graph-note-line-sign', text: ' ⚠' });
      if (said) end.createSpan({ cls: 'graph-note-readback', text: ` — ${said}` });
    }
    overlay.appendText('\n');
  });
}
