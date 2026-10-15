// Adding, changing and removing a note (editor spec §24, note_add): `setNote` writes the `///` lines directly above a thing
// or link written on a line of its own, or takes them away, and nothing else in the block changes. The result is read back
// by the graph library's own reader, so a note that would belong to none (the line holds more than one thing) is refused
// and never written. Host-free: the details panel and any other host call it and write the block it gives.
import gs from '@graph-note/graph-spec';
import { blankText, items, lineIndex } from './block-items.ts';
import type { Item } from './block-items.ts';
import { hops } from './estimates.ts';
import { literally } from './inspector.ts';
import type { Edit, Target } from './inspector.ts';
import { NOTE, ownedAbove } from './note-lines.ts';
import { isSpace, trim, trimEnd } from './whitespace.ts';

const ALONE = 'put the thing the note is about on a line of its own, directly below the note';

/** A note's text as its lines are written: line ends as LF, each line trimmed at its end, none blank at either end. */
function noteLines(text: string | null): string[] {
  const lines = (text ?? '').replace(/\r\n?/g, '\n').split('\n').map(trimEnd);
  while (lines.length && trim(lines[0] ?? '') === '') lines.shift();
  while (lines.length && trim(lines.at(-1) ?? '') === '') lines.pop();
  return lines;
}

/** The item that writes the target by itself, or why it cannot have a note. */
function itemOf(block: string, t: Target): { item: Item } | { reason: string } {
  const all = items(block);
  if ('thing' in t) {
    const own = new RegExp(`^\\(\\s*${literally(t.thing)}\\s*((?::\\s*\\w+\\s*)*)(\\{[^{}]*\\})?\\s*\\)$`);
    const item = all.find((x) => own.test(trim(blankText(block.slice(x.from, x.to)))));
    if (item) return { item };
    const mentioned = new RegExp(`\\(\\s*${literally(t.thing)}\\s*[):{]`).test(blankText(block));
    return mentioned
      ? { reason: `${t.thing} is not written on a line of its own: ${ALONE}` }
      : { reason: `${t.thing} is not written in this block: add its note where it is written` };
  }
  let before = 0;
  for (const item of all) {
    const n = hops(block.slice(item.from, item.to)).length;
    if (t.link < before + n)
      return n === 1 ? { item } : { reason: `this link is not written on a line of its own: ${ALONE}` };
    before += n;
  }
  return { reason: `this block has no link number ${t.link + 1}` };
}

/** The note the reader reads on the element on `line` (1-based) of `block`; null when none, or the block cannot be read. */
function readAt(block: string, line: number): string | null {
  try {
    return gs.notes(block).notes.find((n) => n.line === line)?.text ?? null;
  } catch (e) {
    if (e instanceof gs.ProfileError) return null;
    throw e;
  }
}

/**
 * The block with the note of a thing or link set to `text` — its `///` lines written directly above the thing or link,
 * with the indent of its line, a blank line of the text as a bare `///` — or taken away when `text` is null or only
 * whitespace. A note already there is replaced where it was, and the `//@` lines among it stay. `t` is a thing, or a link
 * counted among the links written in this block, as `setProperty` counts them. Refused, nothing written, with the reason,
 * when the target is not written in this block or shares its line with another thing or link (its note would belong to
 * none), or when the reader would not read back the note written.
 */
export function setNote(block: string, t: Target, text: string | null): Edit {
  const found = itemOf(block, t);
  if ('reason' in found) return { ok: false, reason: found.reason };
  const { item } = found,
    lineOf = lineIndex(block),
    lines = block.split('\n'),
    index = lineOf(item.from) - 1,
    lead = block.slice(block.lastIndexOf('\n', item.from - 1) + 1, item.from);
  const crowded = items(block).some((x) => x.from !== item.from && lineOf(x.from) === lineOf(item.to - 1));
  if (crowded || ![...lead].every(isSpace))
    return { ok: false, reason: `this thing or link shares its line with another: ${ALONE}` };
  const cr = (lines[index] ?? '').endsWith('\r') ? '\r' : '',
    want = noteLines(text),
    old = ownedAbove(lines, index).filter((i) => NOTE.test(trim(lines[i] ?? '')));
  const at = old[0] ?? index,
    next = lines.filter((_, i) => !old.includes(i));
  next.splice(at, 0, ...want.map((l) => `${lead}///${l === '' ? '' : ` ${l}`}${cr}`));
  const out = next.join('\n');
  // read back: the note must be the one asked for, on the thing or link, and a removed note gone
  const placed = readAt(out, index - old.length + want.length + 1);
  if (placed !== (want.length ? want.join('\n') : null))
    return { ok: false, reason: `this note could not be written so that it is read back as it is: ${ALONE}` };
  return { ok: true, text: out };
}
