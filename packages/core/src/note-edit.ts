// Adding, changing and removing a note (editor spec §24, note_add). `setNote` writes the `///` lines directly above a
// thing or link written on a line of its own, or takes them away. Nothing else in the block changes. The result is read
// back by the graph library's own reader. So a note that would belong to none (the line holds more than one thing) is
// refused and never written. Host-free: the details panel and any other host call it and write the block it gives.
import gs from '@thoughtknot/graph-spec';
import { blankText, items, lineIndex } from './block-items.ts';
import type { Item } from './block-items.ts';
import { hops } from './estimates.ts';
import { literally } from './inspector.ts';
import type { Edit, Target } from './inspector.ts';
import { NOTE, ownedAbove } from './note-lines.ts';
import { isSpace, trim, trimEnd } from './whitespace.ts';
import { word } from './words.ts';

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
      ? { reason: word('editing.note.not-alone', { thing: t.thing }) }
      : { reason: word('editing.note.not-here', { thing: t.thing }) };
  }
  let before = 0;
  for (const item of all) {
    const n = hops(block.slice(item.from, item.to)).length;
    if (t.link < before + n) return n === 1 ? { item } : { reason: word('editing.note.link-not-alone') };
    before += n;
  }
  return { reason: word('editing.no-link-number', { number: String(t.link + 1) }) };
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
 * The block with the note of a thing or link set to `text`, or taken away when `text` is null or only whitespace. Its
 * `///` lines are written directly above the thing or link, with the indent of its line. A blank line of the text is a
 * bare `///`. A note already there is replaced where it was, and the `//@` lines among it stay. `t` is a thing, or a
 * link counted among the links written in this block, as `setProperty` counts them. Refused, nothing written, with the
 * reason, in three cases. The target is not written in this block. Or it shares its line with another thing or link, so
 * its note would belong to none. Or the reader would not read back the note written.
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
  if (crowded || ![...lead].every(isSpace)) return { ok: false, reason: word('editing.note.shares-line') };
  const want = noteLines(text),
    old = ownedAbove(lines, index).filter((i) => NOTE.test(trim(lines[i] ?? '')));
  // the line ends as the note's own lines end, else the thing's line, else the line above it (the last line has none)
  const ends = [old[0], index, index - 1].find((i) => i !== undefined && i >= 0 && i < lines.length - 1);
  const cr = ends !== undefined && (lines[ends] ?? '').endsWith('\r') ? '\r' : '';
  const at = old[0] ?? index,
    next = lines.filter((_, i) => !old.includes(i));
  next.splice(at, 0, ...want.map((l) => `${lead}///${l === '' ? '' : ` ${l}`}${cr}`));
  const out = next.join('\n');
  // read back: the note must be the one asked for, on the thing or link, and a removed note gone
  const placed = readAt(out, index - old.length + want.length + 1);
  if (placed !== (want.length ? want.join('\n') : null))
    return { ok: false, reason: word('editing.note.not-read-back') };
  return { ok: true, text: out };
}
