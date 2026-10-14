// The Markdown a host renders for a thing's details (editor spec §18, rich_details, safe_to_click; §13): as written, but
// for what could load something remote, run a script or put HTML on the page. An image from outside the vault, written as
// Markdown or as HTML, becomes a link showing its address, so nothing is fetched until the user asks
// (remote_images_asked, slice 5); a Markdown link or a reference definition the user may not open is shown as text; any
// other raw HTML is shown as text, never rendered, inside maths too; and a note embedded is cut out for the host to read
// itself and render made safe, so nothing the note holds loads either (offline_and_mobile_apis). Code is left exactly as
// written, and is told apart as CommonMark tells it: a backtick escaped by a backslash opens no span, and a backtick fence
// with a backtick in its words is no fence, closed only by a line of its marks alone.
import { attachmentType, destinationRefused, linkKind, linksIn } from './link-scan.ts';
import type { FoundLink } from './link-scan.ts';

const FENCE = /^ {0,3}(`{3,}|~{3,})(.*)$/;
const REFERENCE = /^( {0,3})\[([^\]]{1,999})\]:[ \t]*(<[^>]*>|\S+)/;
/** A reference definition whose destination is on the next line, and that line's first word, the destination. */
const REFERENCE_OPEN = /^( {0,3})\[([^\]]{1,999})\]:[ \t]*$/;
const NEXT_DESTINATION = /^[ \t]*(<[^>]*>|\S+)/;
const SRC = /\ssrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/i;
const HEADING = /^ {0,3}(#{1,6})(?:[ \t]+(.*))?$/;
/** The files shown in place, which load nothing but themselves; a canvas, a base or any other file embedded is a link. */
const SHOWN_IN_PLACE = new Set(['image', 'audio', 'video', 'PDF']);

/** How many backslashes come directly before `at`: an odd number escapes what is there. */
function backslashesBefore(line: string, at: number): number {
  let n = 0;
  while (line[at - 1 - n] === '\\') n++;
  return n;
}

/**
 * Where each code span of a line is: a run of backticks closed by the next run of the same length, as Markdown pairs
 * them; a run's first backtick after an odd number of backslashes is escaped, so is no part of the run. Each run is
 * looked at once.
 */
function guarded(line: string): Uint8Array {
  const marks = new Uint8Array(line.length);
  const runs: { at: number; len: number }[] = [];
  for (let i = 0; i < line.length;) {
    if (line[i] !== '`') {
      i++;
      continue;
    }
    let j = i;
    while (line[j] === '`') j++;
    const escaped = backslashesBefore(line, i) % 2 === 1 ? 1 : 0;
    if (j - i - escaped > 0) runs.push({ at: i + escaped, len: j - i - escaped });
    i = j;
  }
  const byLength = new Map<number, number[]>();
  runs.forEach((r, n) => {
    const list = byLength.get(r.len);
    if (list) list.push(n);
    else byLength.set(r.len, [n]);
  });
  const next = new Map<number, number>();
  for (let n = 0; n < runs.length; n++) {
    const r = runs[n];
    if (!r) continue;
    const same = byLength.get(r.len) ?? [];
    let k = next.get(r.len) ?? 0;
    while (k < same.length && (same[k] ?? 0) <= n) k++;
    next.set(r.len, k);
    const closer = runs[same[k] ?? -1];
    if (!closer) continue;
    marks.fill(1, r.at, closer.at + closer.len);
    n = same[k] ?? n;
  }
  return marks;
}

/** A link's destination as a Markdown link writes it: percent signs first, then spaces and brackets, percent-encoded. */
const destination = (address: string) =>
  address.replaceAll('%', '%25').replaceAll(' ', '%20').replaceAll('(', '%28').replaceAll(')', '%29');

/** Words shown as a link's text, every mark Markdown would read escaped, so they show as written. */
const asLabel = (words: string) => words.replace(/[\\[\]*_`<>$~|!]/g, '\\$&');

/** One line outside a fence, made safe. */
function safeLine(written: string, next = ''): string {
  // a reference definition of an address the user may not open defines nothing: its bracket is escaped; its address
  // is on its own line, or on the next
  const reference = REFERENCE.exec(written),
    open = reference ? null : REFERENCE_OPEN.exec(written);
  const raw = (reference?.[3] ?? (open ? NEXT_DESTINATION.exec(next)?.[1] : '') ?? '').replace(/^<|>$/g, '');
  const indent = (reference ?? open)?.[1]?.length ?? 0;
  const line = raw && destinationRefused(raw) ? `${written.slice(0, indent)}\\${written.slice(indent)}` : written;
  const code = guarded(line);
  const starts = new Map<number, FoundLink>(linksIn(line).map((l) => [l.start, l]));
  let out = '',
    closer = -1; // the next `>`, looked for only from where the last search stopped
  for (let i = 0; i < line.length; i++) {
    const c = line[i] ?? '';
    if (code[i]) {
      out += c;
      continue;
    }
    const link = starts.get(i);
    if (c === '!' && line[i + 1] === '[') {
      // an image, a sound, a video or a PDF of the vault is shown in place; an embedded note is a link here, as a host
      // reads one itself (embedParts); anything else, a canvas, a base or an image from outside the vault among it, is
      // a link to it, never loaded
      if (link?.embed && link.kind === 'file' && SHOWN_IN_PLACE.has(attachmentType(link.target) ?? '')) out += c;
      else if (link?.markdown && link.kind === 'refused') out += '\\';
      else if (link?.markdown && !link.label) {
        // an image with no words: a link showing where it is, never an empty one
        out += `[${asLabel(link.kind === 'note' ? link.target : link.opens)}]${link.written.slice(3)}`;
        i = link.end - 1;
      }
      continue;
    }
    if (c === '[' && link?.markdown && link.kind === 'refused') {
      out += '\\[';
      continue;
    }
    if (c !== '<' || !/[A-Za-z/!?]/.test(line[i + 1] ?? '')) {
      out += c;
      continue;
    }
    // an HTML image is a link showing what it would load, never loaded; any other HTML is shown as its text
    if (closer < i) closer = line.indexOf('>', i);
    if (closer < 0) closer = line.length;
    const tag = line.slice(i, closer + 1),
      src = /^<img[\s/]/i.test(tag) && closer < line.length ? SRC.exec(tag) : null,
      address = src ? (src[1] ?? src[2] ?? src[3] ?? '') : '';
    if (address && linkKind(address) !== 'refused') {
      out += `[${asLabel(address)}](${destination(address)})`;
      i = closer;
    } else out += '&lt;';
  }
  return out;
}

/**
 * Each line of `markdown` given to `outside` when it is outside a fenced code block, else kept as it is. A fence opens
 * as CommonMark opens one (a backtick fence's words hold no backtick) and closes only on a line of at least as many of
 * its marks and nothing else, so no line is taken for code that the renderer would not take for code.
 */
function outsideFences(markdown: string, outside: (line: string, at: number, next: string) => string): string {
  let fence: string | null = null,
    at = 0;
  return markdown
    .split('\n')
    .map((line, i, lines) => {
      const start = at;
      at += line.length + 1;
      const [, marks, words] = FENCE.exec(line) ?? [];
      if (fence) {
        if (marks && marks[0] === fence[0] && marks.length >= fence.length && !(words ?? '').trim()) fence = null;
        return line;
      }
      if (marks && !(marks[0] === '`' && (words ?? '').includes('`'))) {
        fence = marks;
        return line;
      }
      return outside(line, start, lines[i + 1] ?? '');
    })
    .join('\n');
}

/**
 * `markdown` with nothing remote loaded, no link the user may not open, no HTML and no note embedded: for the host's
 * renderer. A note embedded is made a link to it; a host shows one through `embedParts` and `embeddedMarkdown`.
 */
export function safeMarkdown(markdown: string): string {
  return outsideFences(markdown, (line, _at, next) => safeLine(line, next));
}

/** A piece of Markdown: text to make safe and render, or a note embedded in it, for the host to read itself. */
export type EmbedPart = { text: string } | { embed: FoundLink };

/**
 * `markdown` cut at each note it embeds (`![[Note]]`, or a Markdown image of a note), outside code: so a host reads each
 * note itself and renders it made safe (`embeddedMarkdown`), and never hands its renderer an embed that would load
 * what the note holds, a remote image among it (offline_and_mobile_apis). An embedded file stays in the text.
 */
export function embedParts(markdown: string): EmbedPart[] {
  const cuts: { from: number; to: number; embed: FoundLink }[] = [];
  outsideFences(markdown, (line, at) => {
    const code = guarded(line);
    for (const l of linksIn(line))
      if (l.embed && l.kind === 'note' && !code[l.start]) cuts.push({ from: at + l.start, to: at + l.end, embed: l });
    return line;
  });
  const parts: EmbedPart[] = [];
  let from = 0;
  for (const c of cuts) {
    if (c.from > from) parts.push({ text: markdown.slice(from, c.from) });
    parts.push({ embed: c.embed });
    from = c.to;
  }
  if (from < markdown.length || !parts.length) parts.push({ text: markdown.slice(from) });
  return parts;
}

/** A heading's words as Obsidian finds a heading by them: its closing marks and the spaces round it left off, any case. */
function headingWords(words: string): string {
  let end = words.length;
  while (end > 0 && (words[end - 1] === '#' || words[end - 1] === ' ' || words[end - 1] === '\t')) end--;
  return words.slice(0, end).trim().toLowerCase();
}

/**
 * The lines of the section headed `heading`, outside code: its heading down to the next heading of its level or higher,
 * or the end; a nested heading (`A#B`) found by its last part. Null when there is no such heading.
 */
function sectionOf(lines: string[], heading: string): string[] | null {
  const want = headingWords(heading.slice(heading.lastIndexOf('#') + 1));
  let fence: string | null = null,
    from = -1,
    level = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const [, marks, words] = FENCE.exec(line) ?? [];
    if (fence) {
      if (marks && marks[0] === fence[0] && marks.length >= fence.length && !(words ?? '').trim()) fence = null;
      continue;
    }
    if (marks && !(marks[0] === '`' && (words ?? '').includes('`'))) {
      fence = marks;
      continue;
    }
    const h = HEADING.exec(line);
    if (!h) continue;
    const depth = h[1]?.length ?? 0;
    if (from >= 0 && depth <= level) return lines.slice(from, i);
    if (from < 0 && headingWords(h[2] ?? '') === want) {
      from = i;
      level = depth;
    }
  }
  return from >= 0 ? lines.slice(from) : null;
}

/**
 * An embedded note's text as a host renders it in the details: its front matter left out, only the section a heading
 * names when the embed names one (`![[Note#Heading]]`; the whole note when there is no such heading), then made safe as
 * `safeMarkdown` makes it, so every remote image in it is a link to the image, and a note it embeds in turn a link.
 */
export function embeddedMarkdown(note: string, heading?: string): string {
  const lines = note.split('\n');
  let body = 0;
  if (lines[0]?.trimEnd() === '---') {
    const end = lines.findIndex((l, i) => i > 0 && (l.trimEnd() === '---' || l.trimEnd() === '...'));
    if (end > 0) body = end + 1;
  }
  const text = lines.slice(body);
  return safeMarkdown((heading ? (sectionOf(text, heading) ?? text) : text).join('\n'));
}
