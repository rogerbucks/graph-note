// A note or file renamed in the host, followed by every link to it inside graph blocks (editor spec §18,
// renames_follow). These are the changes to a note's text that write the new name where each link names the old. Each
// keeps its alias, heading and form (a name alone, or a path; with `.md` or without; percent-encoded in a Markdown
// link). Prose outside the blocks is never touched: it is the host's own to update. A link may still find another file.
// Or a block could not hold its new name as written (a quote, a backslash or a link's own marks in it). Such a link is
// left, and is reported broken instead.
import { gqlSpans } from './blocks.ts';
import type { TextChange } from './commas.ts';
import { linksIn } from './link-scan.ts';
import type { FoundLink } from './link-scan.ts';

/** A name a block cannot hold inside a link as written: it would end the text it is in, or the link itself. */
const UNSAFE = /['"\\|#^[\]\r\n]/;

/** Whether a link's target names the file at `path`, as the host finds one: by its path, or by its name alone. */
function names(target: string, path: string): boolean {
  let t = target.toLowerCase();
  while (t.startsWith('/')) t = t.slice(1);
  const p = path.toLowerCase(),
    note = p.endsWith('.md') ? p.slice(0, -3) : null;
  return t === p || t === note || p.endsWith(`/${t}`) || (note !== null && note.endsWith(`/${t}`));
}

/** The target a link writes for the file now at `to`, in the form it was written; null when it cannot be written. */
function renamed(link: FoundLink, to: string): string | null {
  const withMd = link.target.toLowerCase().endsWith('.md'),
    noteTo = to.toLowerCase().endsWith('.md') ? to.slice(0, -3) : to,
    full = withMd || link.kind === 'file' ? to : noteTo,
    name = full.slice(full.lastIndexOf('/') + 1),
    next = link.target.includes('/') ? full : name;
  if (UNSAFE.test(next)) return null;
  // in a Markdown link's destination, percent signs first, so a name holding one is read back as it is
  return link.markdown
    ? next.replaceAll('%', '%25').replaceAll(' ', '%20').replaceAll('(', '%28').replaceAll(')', '%29')
    : next;
}

/**
 * The changes to `note` that follow the file renamed from `from` to `to` (paths in the vault) in every link inside its
 * graph blocks. `stillFound` says whether a link's old target still finds a file, as one of the same name elsewhere would:
 * such a link is left.
 */
export function renamedLinks(
  note: string,
  from: string,
  to: string,
  stillFound: (target: string) => boolean = () => false,
): TextChange[] {
  const lines = note.split('\n'),
    starts: number[] = [];
  let at = 0;
  for (const l of lines) {
    starts.push(at);
    at += l.length + 1;
  }
  const out: TextChange[] = [];
  for (const span of gqlSpans(note))
    for (let l = span.open + 1; l < span.close && l < lines.length; l++) {
      const line = lines[l] ?? '';
      for (const link of linksIn(line)) {
        if ((link.kind !== 'note' && link.kind !== 'file') || !names(link.target, from) || stillFound(link.target))
          continue;
        const next = renamed(link, to),
          was = line.slice(link.targetAt.start, link.targetAt.end);
        if (next === null || next === was) continue;
        const base = starts[l] ?? 0;
        out.push({ from: base + link.targetAt.start, to: base + link.targetAt.end, text: next });
      }
    }
  return out;
}

/** `text` with `changes` made, each at its place in the text as it was. */
export function applyChanges(text: string, changes: TextChange[]): string {
  let out = text;
  for (const c of [...changes].sort((a, b) => b.from - a.from)) out = out.slice(0, c.from) + c.text + out.slice(c.to);
  return out;
}
