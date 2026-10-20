// Links and attachments (editor spec §18). This covers:
// - the links a thing or a relationship holds in its properties (links_shown);
// - a thing's attachments by name and type (attachments_at_a_glance);
// - a thing that stands for a note (node_is_a_note);
// - each link to a note or file the vault does not hold, reported where it is written with its fix
//   (broken_links_problems). The fix is to create the note, or pick the one it most likely meant.
// The core decides. The host says which files the vault holds. It opens, previews and renders through its own handlers
// (host_opens_links). The scan, the safe Markdown and renames live in their own modules and are re-exported here. So a
// host imports §18 from one place.
import { dataKind, graphOf } from './blocks.ts';
import { distance } from './estimates.ts';
import { propertiesOf } from './inspector.ts';
import type { Target } from './inspector.ts';
import type { NoteReading, Problem } from './note-reading.ts';
import { attachmentType, linkTo, linksIn } from './link-scan.ts';
import type { FoundLink } from './link-scan.ts';

export { attachmentType, leavingWords, linkKind, linkTo, linksIn, refusedWords } from './link-scan.ts';
export type { FoundLink, LinkKind } from './link-scan.ts';
export { embedParts, embeddedMarkdown, embeddedRemoteImages, remoteImagesIn, safeMarkdown } from './link-markdown.ts';
export type { EmbedPart } from './link-markdown.ts';
export { applyChanges, renamedLinks } from './link-renames.ts';

/** A link held in a property of a thing or a relationship. */
export interface PlacedLink {
  property: string;
  link: FoundLink;
}

/** Every link held in the text properties of a thing or a relationship, by property name, each in the order written. */
export function linksHeld(reading: NoteReading, graph: string, t: Target): PlacedLink[] {
  return propertiesOf(reading, graph, t)
    .filter((p) => p.type === 'text')
    .flatMap((p) => linksIn(p.value).map((link) => ({ property: p.key, link })));
}

/** One attachment of a thing: a file in the vault it links to, by its name and type. */
export interface Attachment {
  name: string;
  type: string;
  target: string;
}

/** A thing's attachments (attachments_at_a_glance): every file of the vault its properties link to, each once. */
export function attachmentsOf(reading: NoteReading, graph: string, key: string): Attachment[] {
  const seen = new Set<string>();
  return linksHeld(reading, graph, { thing: key }).flatMap(({ link }) => {
    if (link.kind !== 'file' || seen.has(link.target)) return [];
    seen.add(link.target);
    const name = link.target.slice(link.target.lastIndexOf('/') + 1);
    return [{ name, type: attachmentType(link.target) ?? 'file', target: link.target }];
  });
}

/** How a global note id begins (graph spec §10, Identity): `note:` and the note's file name. */
const NOTE_ID = 'note:';

/**
 * The note a thing stands for (node_is_a_note). It is its id, when the id is a global note id: `note:` and the note's
 * name. `(m:Doc {id: 'note:Graph spec model'})` writes it so (graph spec §10). It is also its id when the id is a link
 * to a note and nothing else, `{id: '[[Trip plan]]'}`. Null for any other thing, a file named after `note:` among them.
 */
export function noteOf(_reading: NoteReading, _graph: string, key: string): FoundLink | null {
  if (key.startsWith(NOTE_ID)) {
    const name = linkTo(key.slice(NOTE_ID.length));
    if (!name.target || name.kind !== 'note') return null;
    const at = NOTE_ID.length;
    return {
      ...name,
      written: key,
      end: key.length,
      targetAt: { start: name.targetAt.start + at, end: name.targetAt.end + at },
      label: name.opens,
    };
  }
  const [only, ...more] = linksIn(key);
  return only && !more.length && only.start === 0 && only.end === key.length && only.kind === 'note' && !only.embed
    ? only
    : null;
}

/** What a host says of its vault: whether a link finds a note or file, and the names it holds (notes without `.md`). */
export interface LinkVault {
  found(target: string): boolean;
  names: readonly string[];
}

/** A link that names nothing in the vault: where it is held, what it most likely meant, and its problem. */
export interface BrokenLink {
  at: Target;
  property: string;
  link: FoundLink;
  /** The names in the vault it most likely meant, nearest first: a fix each. */
  meant: string[];
  problem: Problem;
}

const nameOf = (target: string) => target.slice(target.lastIndexOf('/') + 1);
const stemOf = (name: string) => (attachmentType(name) ? name.slice(0, name.lastIndexOf('.')) : name).toLowerCase();

/**
 * What a broken link most likely meant. First, a file of the same name with another extension. Else the names nearest
 * in spelling, within a quarter of the name's letters (two at least). They are of the same kind (a note for a note, a
 * file for a file).
 */
function likelyMeant(link: FoundLink, names: readonly string[]): string[] {
  const name = nameOf(link.target),
    stem = stemOf(name),
    file = link.kind === 'file';
  const kin = names.filter((n) => !!attachmentType(n) === file && n !== name);
  const same = kin.filter((n) => file && stemOf(n) === stem);
  if (same.length) return same;
  const most = Math.max(2, Math.floor(name.length / 4));
  let best = Infinity,
    found: string[] = [];
  for (const n of kin) {
    if (Math.abs(n.length - name.length) > most) continue;
    const d = distance(n.toLowerCase(), name.toLowerCase());
    if (d > most || d > best) continue;
    if (d < best) found = [];
    best = d;
    found.push(n);
  }
  return found.sort();
}

const orList = (xs: string[]) => (xs.length < 2 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} or ${xs.at(-1)}`);
/** A name written where a Markdown link's destination is: percent signs first, then spaces and brackets, percent-encoded. */
const asWritten = (link: FoundLink, name: string) =>
  link.markdown
    ? name.replaceAll('%', '%25').replaceAll(' ', '%20').replaceAll('(', '%28').replaceAll(')', '%29')
    : name;

/**
 * Every link of a graph to a note or file the vault does not hold (broken_links_problems). Each is a warning, as it is
 * drawn broken and nothing is left out. It is on the line it is written, with its fix in words. The fix is to create
 * the note (or put the file in the vault), or change it to what it most likely meant. Where it is found as written, it
 * gives the place to change.
 */
export function brokenLinks(reading: NoteReading, graph: string, vault: LinkVault): BrokenLink[] {
  const d = reading.graphs.get(graph);
  if (!d) return [];
  const held: { at: Target; property: string; link: FoundLink }[] = [
    ...d.boxes.flatMap((b) => {
      const note = noteOf(reading, graph, b.key);
      const own = note ? [{ at: { thing: b.key }, property: 'id', link: note }] : [];
      return [...own, ...linksHeld(reading, graph, { thing: b.key }).map((p) => ({ at: { thing: b.key }, ...p }))];
    }),
    ...d.links.flatMap((_, i) => linksHeld(reading, graph, { link: i }).map((p) => ({ at: { link: i }, ...p }))),
  ];
  const blocks = reading.texts.map((t, i) => ({ i, lines: t.split('\n') }));
  const ours = blocks.filter(({ i }) => {
    const t = reading.texts[i] ?? '';
    return graphOf(t) === graph && dataKind(t) === 'data';
  });
  // where each written link was last found, so the next of the same is looked for only after it. Also what each target
  // most likely meant, worked out once
  const cursors = new Map<string, { o: number; l: number; at: number }>();
  const meanings = new Map<string, string[]>();
  return held.flatMap((h): BrokenLink[] => {
    const { link } = h;
    if ((link.kind !== 'note' && link.kind !== 'file') || !link.target || vault.found(link.target)) return [];
    const said = `${link.kind}\u0000${link.target}`;
    const meant = meanings.get(said) ?? likelyMeant(link, vault.names);
    meanings.set(said, meant);
    // where it is written: the next place this same link is written, so a link written twice is found twice
    const from = cursors.get(link.written) ?? { o: 0, l: 0, at: 0 };
    let place: { block: number; line: number; col: number } | null = null;
    for (let o = from.o; o < ours.length && !place; o++) {
      const { i, lines } = ours[o] ?? { i: 0, lines: [] };
      for (let l = o === from.o ? from.l : 0; l < lines.length && !place; l++) {
        const at = (lines[l] ?? '').indexOf(link.written, o === from.o && l === from.l ? from.at : 0);
        if (at < 0) continue;
        place = { block: i, line: l, col: at };
        cursors.set(link.written, { o, l, at: at + 1 });
      }
    }
    if (!place) cursors.set(link.written, { o: ours.length, l: 0, at: 0 });
    const what = link.kind === 'note' ? `Create the note ${link.target}` : `Put ${link.target} in the vault`;
    const or = meant.length ? `, or change it to ${orList(meant.map((m) => `[[${m}]]`))}` : '';
    const span = place && {
      line: place.line,
      character: place.col + link.targetAt.start - link.start,
      end: place.col + link.targetAt.end - link.start,
    };
    const written = span && (blocks[place?.block ?? -1]?.lines[span.line] ?? '').slice(span.character, span.end);
    const problem: Problem = {
      graph,
      block: place?.block ?? ours[0]?.i ?? 0,
      line: (place?.line ?? 0) + 1,
      severity: 'warning',
      message: `${link.written} names no note or file in the vault, so it is drawn as broken.`,
      fix: `${what}${or || (link.kind === 'file' ? ', or correct the link' : '')}.`,
      ...(span ? { span } : {}),
      ...(span && written && meant.length ? { replace: { written, with: meant.map((m) => asWritten(link, m)) } } : {}),
    };
    return [{ ...h, meant, problem }];
  });
}

/**
 * The block's text with a broken link changed to `meant`, one of what it most likely meant. The change is at the place
 * its problem gives, and nothing else. Null when the block no longer holds the link there.
 */
export function withMeant(block: string, broken: BrokenLink, meant: string): string | null {
  const { span, replace } = broken.problem;
  if (!span || !replace) return null;
  const lines = block.split('\n'),
    line = lines[span.line] ?? '';
  if (line.slice(span.character, span.end) !== replace.written) return null;
  lines[span.line] = line.slice(0, span.character) + asWritten(broken.link, meant) + line.slice(span.end);
  return lines.join('\n');
}
