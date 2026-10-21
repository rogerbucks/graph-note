// Strictness (spec §21):
// - the departures from standard GQL that the reader reads as meant;
// - what each of the three levels makes of them;
// - converting a note back to standard GQL, checked before it is written;
// - the standard text an engine or an export is given, whatever the level.
// A comment after code and a thing without a name are the note format's own rules, not departures from GQL, so no
// level changes them.
import { gqlSpans } from './blocks.ts';
import { readNote } from './drawing.ts';
import type { Departure, Problem } from './note-reading.ts';
import { replaceBlock } from './store.ts';
import { word } from './words.ts';

export type { Departure } from './note-reading.ts';

/** How strictly a note is read: every departure an error, read and reported (the default), or the chosen ones allowed. */
export type Strictness = 'standard' | 'forgiving' | 'simplified';

/** What strictness needs of the settings: the level, and the departures Simplified allows as written. */
export interface StrictnessSettings {
  strictness: Strictness;
  allowed: Departure[];
}

/**
 * Each departure the reader reads as meant, with its name and a sentence saying what allowing it means. In UK English:
 * their translation comes from the settings words (settings-source-words.ts), held equal by settings-words.test.js.
 */
export const DEPARTURES: { id: Departure; name: string; sentence: string }[] = [
  {
    id: 'missing-comma',
    name: 'A missing comma',
    sentence: 'A pattern may end its line without the comma standard GQL needs before the next one.',
  },
  {
    id: 'trailing-comma',
    name: 'A comma with nothing after it',
    sentence: 'The last pattern of a block may end with a comma, as while the next one is being typed.',
  },
  {
    id: 'bare-type',
    name: 'A link type without its colon',
    sentence: 'A link may name its type without the colon, such as [KNOWS], when the graph has one type of that name.',
  },
];

/** The problems as a level reports them: Standard makes each departure an error, Simplified drops those it allows. */
export function underStrictness(problems: Problem[], settings: StrictnessSettings): Problem[] {
  if (settings.strictness === 'standard')
    return problems.map((p) =>
      p.departure ? { ...p, severity: 'error', message: word('reading.not-standard', { message: p.message }) } : p,
    );
  if (settings.strictness === 'simplified') {
    const allowed = new Set(settings.allowed);
    return problems.filter((p) => !p.departure || !allowed.has(p.departure));
  }
  return problems;
}

/** A block with each departure the reading found in it written as standard GQL; null when one has no edit to make. */
function blockAsStandard(text: string, departures: Problem[]): string | null {
  const starts = [0];
  for (let i = text.indexOf('\n'); i !== -1; i = text.indexOf('\n', i + 1)) starts.push(i + 1);
  const at = (line: number, character: number) => (starts[line] ?? text.length) + character;
  const edits: [number, number, string][] = [];
  for (const p of departures) {
    if (p.insert) edits.push([at(p.insert.line, p.insert.character), 0, p.insert.text]);
    else if (p.span && p.replace?.with[0] !== undefined)
      edits.push([at(p.span.line, p.span.character), p.span.end - p.span.character, p.replace.with[0]]);
    else return null;
  }
  let out = text;
  for (const [from, cut, put] of edits.sort((a, b) => b[0] - a[0]))
    out = out.slice(0, from) + put + out.slice(from + cut);
  return out;
}

/** Each block as standard GQL, with what could not be made so: the index of a block with a departure left in it. */
function asStandard(blocks: string[]): { blocks: string[]; changed: number; left: number[] } {
  const problems = readNote(blocks).problems.filter((p) => p.departure);
  const left: number[] = [];
  const out = blocks.map((text, i) => {
    const mine = problems.filter((p) => p.block === i);
    if (!mine.length) return text;
    const next = blockAsStandard(text, mine);
    if (next === null) left.push(i);
    return next ?? text;
  });
  return { blocks: out, changed: problems.length, left };
}

/**
 * What an engine or an export is given (spec §21, engines_get_standard): each block as standard GQL. The level is never
 * asked: it decides only what is reported. No line is added or taken away. `left` names, by index, any block a
 * departure could not be written out of. So a caller never hands one over as if it were standard.
 */
export function standardBlocks(blocks: string[]): { blocks: string[]; left: number[] } {
  const { blocks: out, left } = asStandard(blocks);
  return { blocks: out, left };
}

/** A note converted to standard GQL, and how many departures were written; or why it was not, the note left as it is. */
export type Converted = { ok: true; note: string; changed: number } | { ok: false; reason: string };

/** The graphs a set of blocks reads as, to compare before and after. */
function graphsOf(blocks: string[]): string {
  const world = readNote(blocks).world;
  return JSON.stringify(
    Object.keys(world)
      .sort()
      .map((g) => [
        g,
        [...(world[g]?.nodes ?? [])].map(([k, [labels, props]]) => [k, [...labels], props]),
        world[g]?.edges,
      ]),
  );
}

/**
 * The note converted back to standard GQL in one action (spec §21, simplified_back_to_standard). The standard checker
 * checks it before it is written: the converted note must read with no departure and no error, as the same graphs.
 * Otherwise nothing is converted, and the reason says what stands in the way.
 */
export function toStandard(note: string): Converted {
  const spans = gqlSpans(note);
  const blocks = spans.map((s) => s.text);
  const errors = readNote(blocks).problems.filter((p) => p.severity === 'error');
  const first = errors[0];
  if (first)
    return {
      ok: false,
      reason: word('reading.standard.unreadable', {
        block: String(first.block + 1),
        line: String(first.line),
        message: first.message,
      }),
    };
  const { blocks: next, changed, left } = asStandard(blocks);
  if (left.length) return { ok: false, reason: word('reading.standard.no-fix', { block: String((left[0] ?? 0) + 1) }) };
  const check = underStrictness(readNote(next).problems, { strictness: 'standard', allowed: [] });
  const wrong = check.find((p) => p.severity === 'error');
  if (wrong)
    return {
      ok: false,
      reason: word('reading.standard.still-departs', { block: String(wrong.block + 1), message: wrong.message }),
    };
  if (graphsOf(next) !== graphsOf(blocks)) return { ok: false, reason: word('reading.standard.other-graph') };
  let out = note;
  for (const [i, s] of spans.entries()) {
    const text = next[i] ?? s.text;
    if (text === s.text) continue;
    const r = replaceBlock(out, { line: s.open, text: s.text }, text);
    if (!r.ok)
      return { ok: false, reason: word('reading.standard.unwritten', { block: String(i + 1), why: r.reason }) };
    out = r.note;
  }
  // the note as it would be written, checked whole: its blocks are exactly those checked above
  const written = gqlSpans(out).map((s) => s.text);
  if (written.length !== next.length || written.some((t, i) => t !== next[i]))
    return { ok: false, reason: word('reading.standard.other-blocks') };
  return { ok: true, note: out, changed };
}
