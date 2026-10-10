// Deferred things (spec §5 and §8): marking a thing for later writes a Deferred saying what is needed and why it waits
// (park_for_later); reading says which things are parked, and which of those are past their revisit date, counted apart
// from problems (parked_not_broken); and a parked thing's box is told apart so the host can draw it dashed with a later
// mark (deferred_drawn). The Deferred is the graph spec's (§25): `(d:Deferred {what, why, revisit_by, rule})` with
// `(d)-[:DEFERS]->(thing)`, and it is counted as completeness.js counts it.
import gs from '@graph-note/graph-spec';
import type { Graph } from '@graph-note/graph-spec';
import { graphOf } from './blocks.ts';
import { quoted as q } from './lock.ts';
import type { NoteReading } from './note-reading.ts';
import { readBlocks } from './partial-read.ts';
import { S, isSpace, trim, trimEnd } from './whitespace.ts';

/** What marking a thing for later says: what is needed and why it waits, and optionally the day to look again and the completeness rule parked. */
export interface Park {
  what: string;
  why: string;
  /** The day to look again, `YYYY-MM-DD`: written as `revisit_by: DATE '…'`, and left out when not given. */
  revisitBy?: string;
  /** The completeness rule this parks (the id of a Cardinality), when it parks one. */
  rule?: string;
}

/** A thing some Deferred defers, as the badge and the drawing need it. */
export interface Parked {
  /** What is needed, as the first Deferred on the thing (by id) says it; '' for a Deferred written without it. */
  what: string;
  /** Why it waits, from the same Deferred; '' for a Deferred written without it. */
  why: string;
  /** The day after which the thing is overdue: the latest `revisit_by` of its Deferreds, or null when any has none. */
  revisitBy: string | null;
  /** True when every Deferred on the thing has a revisit date before today, as completeness counts it. */
  overdue: boolean;
  /** The ids of the Deferreds on the thing, in code order. */
  by: string[];
}

/** How many things are parked, and how many of those are overdue: shown apart from the problems (spec §8). */
export interface ParkedCount {
  parked: number;
  overdue: number;
}

const byCode = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** A property's day as `YYYY-MM-DD`: a DATE or text read as one, else ''. */
function dayOf(v: unknown): string {
  const s = typeof v === 'object' && v !== null && !Array.isArray(v) && 's' in v ? v.s : v;
  return typeof s === 'string' ? s.slice(0, 10) : '';
}

/** A property that should be text, as text: anything else is ''. */
const textOf = (v: unknown): string => (typeof v === 'string' ? v : '');

/**
 * Each thing in a graph that some Deferred defers (§25), as of `today` (YYYY-MM-DD). Read from the graph itself, so a
 * Deferred written without its `what` or `why` still parks its thing, as completeness counts it.
 */
export function parkedIn(g: Graph, today: string): Map<string, Parked> {
  const on = new Map<string, string[]>();
  for (const d of g.labelled('Deferred'))
    for (const [, , thing] of g.out(d, 'DEFERS')) {
      const list = on.get(thing) ?? [];
      if (!list.includes(d)) list.push(d);
      on.set(thing, list);
    }
  const out = new Map<string, Parked>();
  for (const thing of [...on.keys()].sort(byCode)) {
    const by = (on.get(thing) ?? []).sort(byCode);
    const days = by.map((d) => dayOf(g.p(d).revisit_by));
    const first = g.p(by[0] ?? '');
    out.set(thing, {
      what: textOf(first.what),
      why: textOf(first.why),
      revisitBy: days.every(Boolean) ? days.reduce((a, b) => (a > b ? a : b), '') : null,
      overdue: days.every((day) => day && day < today),
      by,
    });
  }
  return out;
}

/** Each thing of a graph that some Deferred defers, as of `today` (YYYY-MM-DD); empty when the graph is not in the reading. */
export function parked(reading: NoteReading, graph: string, today: string): Map<string, Parked> {
  const g = reading.world[graph];
  return g ? parkedIn(g, today) : new Map<string, Parked>();
}

/** How many of the parked things there are and how many are overdue, for the badge, counted apart from the problems. */
export function parkedCount(things: Map<string, Parked>): ParkedCount {
  const all = [...things.values()];
  return { parked: all.length, overdue: all.filter((p) => p.overdue).length };
}

/** Where the last character of code is in a block: not whitespace, not in a `//` comment, a closing quote counted. -1 if none. */
function lastCode(text: string): number {
  let last = -1;
  for (let i = 0; i < text.length; i++) {
    const c = text[i] ?? '';
    if (c === "'") {
      let j = i + 1;
      while (j < text.length && text[j] !== "'" && text[j] !== '\n') j += text[j] === '\\' ? 2 : 1;
      i = Math.min(j, text.length - 1);
      last = i;
    } else if (c === '/' && text[i + 1] === '/') {
      const end = text.indexOf('\n', i);
      i = end === -1 ? text.length : end;
    } else if (!isSpace(c)) last = i;
  }
  return last;
}

/** Words as one line of text: each run of whitespace, line breaks included, becomes one space. */
const oneLine = (s: string): string => trim(s.replace(new RegExp(`${S}+`, 'g'), ' '));

/** Whether a text is a real day, `YYYY-MM-DD`. */
function isDay(s: string): boolean {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T00:00:00Z`) : null;
  return !!date && !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === s;
}

/**
 * The block's text with a Deferred for `thing` written as its last items (park_for_later): `(later_<thing>:Deferred {…})`
 * and `(later_<thing>)-[:DEFERS]->(thing)`. The id is the first of `later_<thing>`, `later_<thing>_2`… not taken in the
 * block's graph. A comma is added after the block's last item unless it already ends in one (never two), and any comment
 * after it is kept. The words are quoted as locking quotes them, with each run of whitespace made one space so a string
 * never spans lines; a long Deferred is split over lines, indented by `indent` (the settings' choice). Throws an Error
 * saying why when `what` or `why` is empty, `revisitBy` is not a `YYYY-MM-DD` day, the block names no graph, or `thing` is
 * not in the block's graph. Only the block itself is read: a thing written in another block of the graph is not found.
 */
export function parkForLater(block: string, thing: string, park: Park, indent = '    '): string {
  const what = oneLine(park.what),
    why = oneLine(park.why),
    rule = oneLine(park.rule ?? ''),
    day = park.revisitBy ?? '';
  if (!what) throw new Error('say what is needed: a Deferred must have a what');
  if (!why) throw new Error('say why it waits: a Deferred must have a why');
  if (day && !isDay(day)) throw new Error(`the revisit date must be a day like 2026-11-01, not ${day}`);
  const graph = graphOf(block);
  if (!graph) throw new Error('the block names no graph: start it with // graph: <name>');
  const g = gs.worldFromStore(readBlocks([block], []).store)[graph];
  if (!g?.nodes.has(thing)) throw new Error(`there is no ${thing} in graph ${graph} to park`);
  let id = `later_${thing}`;
  for (let n = 2; g.nodes.has(id); n++) id = `later_${thing}_${n}`;
  const props = [
    `what: ${q(what)}`,
    `why: ${q(why)}`,
    ...(day ? [`revisit_by: DATE '${day}'`] : []),
    ...(rule ? [`rule: ${q(rule)}`] : []),
  ];
  const oneLined = `(${id}:Deferred {${props.join(', ')}}),`;
  const written =
    oneLined.length < 70
      ? [oneLined]
      : [`(${id}:Deferred {`, ...props.map((p, i) => `${indent}${p}${i < props.length - 1 ? ',' : '}),'}`)];
  const text = trimEnd(block);
  const at = lastCode(text);
  const comma = at >= 0 && text[at] !== ',' ? `${text.slice(0, at + 1)},${text.slice(at + 1)}` : text;
  return [comma, ...written, `(${id})-[:DEFERS]->(${thing})`].join('\n');
}
