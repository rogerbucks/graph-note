// The Markdown a host renders for a thing's details (editor spec §18, rich_details, safe_to_click; §13): as written, but
// for what could load something remote, run a script or put HTML on the page. An image from outside the vault becomes a
// link to it, so nothing is fetched until the user asks (remote_images_asked, slice 5); a Markdown link the user may not
// open is shown as text; and raw HTML is shown as text, never rendered. Code and maths are left exactly as written.
import { linksIn } from './link-scan.ts';
import type { FoundLink } from './link-scan.ts';

const FENCE = /^ {0,3}(`{3,}|~{3,})/;

/**
 * Where each code span and inline maths of a line is: a run of backticks (or of `$`) closed by the next run of the same
 * length, as Markdown pairs them. Each run is looked at once.
 */
function guarded(line: string): Uint8Array {
  const marks = new Uint8Array(line.length);
  const runs: { at: number; len: number; mark: string }[] = [];
  for (let i = 0; i < line.length;) {
    const mark = line[i] ?? '';
    if (mark !== '`' && mark !== '$') {
      i++;
      continue;
    }
    let j = i;
    while (line[j] === mark) j++;
    runs.push({ at: i, len: j - i, mark });
    i = j;
  }
  const byKind = new Map<string, number[]>();
  runs.forEach((r, n) => {
    const key = `${r.mark}${r.len}`,
      list = byKind.get(key);
    if (list) list.push(n);
    else byKind.set(key, [n]);
  });
  const next = new Map<string, number>();
  for (let n = 0; n < runs.length; n++) {
    const r = runs[n];
    if (!r) continue;
    const key = `${r.mark}${r.len}`,
      same = byKind.get(key) ?? [];
    let k = next.get(key) ?? 0;
    while (k < same.length && (same[k] ?? 0) <= n) k++;
    next.set(key, k);
    const m = same[k];
    if (m === undefined) continue;
    const closer = runs[m];
    if (!closer) continue;
    marks.fill(1, r.at, closer.at + closer.len);
    n = m;
  }
  return marks;
}

/** One line outside a fence, made safe. */
function safeLine(line: string): string {
  const code = guarded(line);
  const starts = new Map<number, FoundLink>(linksIn(line).map((l) => [l.start, l]));
  let out = '';
  for (let i = 0; i < line.length; i++) {
    const c = line[i] ?? '';
    if (code[i]) {
      out += c;
      continue;
    }
    const link = starts.get(i);
    if (c === '!' && line[i + 1] === '[') {
      // an embed of a note or file in the vault is shown in place; anything else is a link, never loaded
      if (link?.embed && (link.kind === 'note' || link.kind === 'file')) out += c;
      else if (link?.markdown && link.kind === 'refused') out += '\\';
      continue;
    }
    if (c === '[' && link?.markdown && link.kind === 'refused') out += '\\[';
    else if (c === '<' && /[A-Za-z/!?]/.test(line[i + 1] ?? '')) out += '&lt;';
    else out += c;
  }
  return out;
}

/** `markdown` with nothing remote loaded, no link the user may not open, and no HTML: for the host's renderer. */
export function safeMarkdown(markdown: string): string {
  let fence: string | null = null;
  return markdown
    .split('\n')
    .map((line) => {
      const opens = FENCE.exec(line)?.[1];
      if (fence) {
        if (opens && opens[0] === fence[0] && opens.length >= fence.length) fence = null;
        return line;
      }
      if (opens) {
        fence = opens;
        return line;
      }
      return safeLine(line);
    })
    .join('\n');
}
