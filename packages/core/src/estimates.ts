// Estimated links (spec §3). A link that names a thing not in the graph, one or two letters from a thing that is, is
// drawn to that thing as a guess; so is a relationship type one or two letters from a type of the graph. A guess is never
// written to the note, never made between equals, and always explained. Only near misses are guessed — never a link
// from the pattern of the graph.
import gs from '@graph-note/graph-spec';
import type { Graph } from '@graph-note/graph-spec';
import { graphOf } from './blocks.ts';
import type { GraphDrawing, Problem } from './note-reading.ts';
import { S } from './whitespace.ts';
import { blankText } from './block-items.ts';
import { BlockPlaces } from './estimate-places.ts';
import type { Place } from './estimate-places.ts';

/** A guess the drawing makes for a near miss (spec §3): what was written, what it was taken to mean, and the fix. */
export interface Estimate {
  /** A near miss of a thing's name, or of a relationship type. */
  kind: 'name' | 'type';
  /** Where it was written: the block (index in the note) and the line in it. */
  block: number;
  line: number;
  /** The link drawn: its ends, its type and its reading, as taken. */
  from: string;
  type: string;
  reading: string;
  to: string;
  /** What was written, and what it was taken to mean. */
  written: string;
  taken: string;
  /** In a sentence: what was written, what it was taken to mean, and the fix. */
  explain: string;
  /** For a type: which of the drawing's links it is. */
  index?: number;
  /**
   * Where the word its problem's fix changes is written: a 0-based line of the block and the characters it spans, the
   * place of that problem's `span`. Unset when it could not be found whole, as for a path written over a budget's cut.
   */
  span?: Place;
}

/** Edit distance: letters added, removed or changed. */
export function distance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0] ?? 0;
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const t = row[j] ?? 0;
      row[j] = Math.min(t + 1, (row[j - 1] ?? 0) + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = t;
    }
  }
  return row[b.length] ?? 0;
}

/** A name as the graph library compares near duplicates: case and underscores ignored. */
const plain = (s: string) => s.replace(/_/g, '').toLowerCase();

/**
 * The nearest of `among` to `name`, by the rule decided 7 Oct 2026: near is one letter for names under eight characters
 * and two from eight, ignoring case and underscores, as the graph library counts near duplicates; a name under three
 * characters is never estimated. The one, or the several equally near, or none.
 */
export function nearest(
  name: string,
  among: Iterable<string>,
): { one: string; d: number } | { several: string[] } | null {
  if (name.length < 3) return null;
  let best = Infinity,
    found: string[] = [];
  for (const c of among) {
    if (c === name) continue;
    const a = plain(name),
      b = plain(c),
      d = distance(a, b);
    if (d > (Math.min(a.length, b.length) >= 8 ? 2 : 1)) continue;
    if (d < best) {
      best = d;
      found = [c];
    } else if (d === best) found.push(c);
  }
  if (!found.length) return null;
  return found.length === 1 ? { one: found[0] ?? '', d: best } : { several: found.sort() };
}

const away = (d: number) =>
  d === 0 ? 'which differs only in case or underscores' : d === 1 ? 'one letter away' : 'two letters away';
const either = (xs: string[]) =>
  xs.length === 2 ? `${xs[0]} and ${xs[1]}` : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;
const andList = (xs: string[]) =>
  xs.length < 2 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;
const orList = (xs: string[]) =>
  xs.length === 2 ? `${xs[0]} or ${xs[1]}` : `${xs.slice(0, -1).join(', ')} or ${xs[xs.length - 1]}`;

/** One near miss: what was written, what it was taken to mean, and how many letters apart. */
export interface Correction {
  written: string;
  taken: string;
  d: number;
}

/** The sentence an estimate explains itself with, on a given line: what was written, what it was taken to mean, the fix. */
export function explain(kind: 'name' | 'type', graph: string, fixes: Correction[], line: number): string {
  const and = (xs: string[]) =>
    xs.length < 2 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;
  const many = fixes.length > 1,
    written = and(fixes.map((f) => f.written));
  const what =
    kind === 'name'
      ? `links to ${written}, which ${many ? 'are' : 'is'} not in graph ${graph}`
      : `uses the relationship ${written}, which is not in graph ${graph}`;
  const taken = many
    ? fixes.map((f) => `${f.taken}, ${away(f.d)}`).join(', and ')
    : `${fixes[0]?.taken}, ${away(fixes[0]?.d ?? 1)}`;
  return `Line ${line} ${what}. ${many ? 'They were' : 'It was'} taken to mean ${taken}. To fix it, change ${and(fixes.map((f) => `${f.written} to ${f.taken}`))}.`;
}

/**
 * The hops of a path as written: [from name, type, to name], each turned the way its arrow points. Strings are blanked
 * before comments, as the reader reads them, so a // inside a text (a web address) never hides the rest of the path.
 */
export function hops(text: string): [string, string, string][] {
  const src = blankText(text);
  const out: [string, string, string][] = [];
  const re = /\(\s*([A-Za-z_]\w*)[^()]*\)|(<?)-\[\s*:\s*([A-Za-z_]\w*)[^\]]*\]-(>?)/g;
  let last: string | null = null,
    arrow: { type: string; back: boolean } | null = null;
  for (const m of src.matchAll(re)) {
    if (m[1] !== undefined) {
      if (last !== null && arrow) out.push(arrow.back ? [m[1], arrow.type, last] : [last, arrow.type, m[1]]);
      last = m[1];
      arrow = null;
    } else arrow = { type: m[3] ?? '', back: m[2] === '<' && m[4] !== '>' };
  }
  return out;
}

/**
 * Where the k-th link of a type was written in a graph's blocks: the block, the 1-based line in it, and the place of the
 * type's name in its brackets. Strings and comments are blanked first, so a word in them is never taken for it.
 */
function whereType(
  texts: string[],
  graph: string,
  type: string,
  k: number,
): { block: number; line: number; span?: Place } {
  let seen = 0;
  for (let b = 0; b < texts.length; b++) {
    const t = texts[b] ?? '';
    if (graphOf(t) !== graph) continue;
    const blank = blankText(t);
    for (const m of blank.matchAll(new RegExp(`\\[${S}*:${S}*${type}\\b`, 'g'))) {
      if (seen++ !== k) continue;
      const pos = (m.index ?? 0) + m[0].length - type.length,
        character = pos - (blank.lastIndexOf('\n', pos - 1) + 1),
        at = blank.slice(0, pos).split('\n').length - 1;
      const span = { line: at, character, end: character + type.length };
      return { block: b, line: blank.slice(0, m.index).split('\n').length, span };
    }
  }
  return { block: -1, line: 0 };
}

/**
 * The estimates of one graph, and their problems rewritten to say what was guessed. `problems` (the note's) is updated
 * in place: a missing name that is estimated becomes a warning; one between equals lists them; a near-miss type adds one.
 */
export function estimate(
  g: Graph,
  graph: string,
  d: GraphDrawing,
  shared: Graph | undefined,
  problems: Problem[],
  texts: string[],
): Estimate[] {
  const out: Estimate[] = [],
    ids = new Set(g.nodes.keys()),
    // a thing drawn under a suggested name is a name nobody wrote: a near miss is never changed to it, which would write
    // it without its fix (§4); a link naming it exactly still links to it
    unnamed = new Set(d.boxes.filter((b) => b.suggested).map((b) => b.key)),
    guessable = new Set([...ids].filter((i) => !unnamed.has(i))),
    readings = gs.readings(g, shared);
  const reading = (t: string) => gs.word(readings, t);
  const placesOf = new Map<number, BlockPlaces>(); // each block's items, found once

  // names: each path left out because it names a thing not in the graph
  for (const p of problems) {
    if (p.graph !== graph || !p.dropped) continue;
    const missing = /^no thing called (\S+) in graph /.exec(p.message)?.[1];
    if (!missing) continue;
    const near = nearest(missing, guessable);
    if (!near) continue;
    if ('several' in near) {
      p.message = `no thing called ${missing} in graph ${graph}; ${either(near.several)} are equally close, so it is not drawn`;
      p.fix = `change ${missing} to the one you mean: ${orList(near.several)}`;
      p.replace = { written: missing, with: near.several };
      continue;
    }
    const resolve = (n: string) =>
      ids.has(n)
        ? { id: n, d: 0, guessed: false }
        : (() => {
            const x = nearest(n, guessable);
            return x && 'one' in x ? { id: x.one, d: x.d, guessed: true } : null;
          })();
    const drawn = hops(p.dropped).map(([s, t, e]) => [resolve(s), t, resolve(e), s, e] as const);
    if (!drawn.length || drawn.some(([s, , e]) => !s || !e)) continue;
    const mine: Estimate[] = [],
      words: Correction[] = []; // every name of the path taken to mean another, once each
    for (const [s, t, e, ws, we] of drawn) {
      if (!s || !e || (!s.guessed && !e.guessed)) continue;
      const fixes: Correction[] = [];
      if (s.guessed) fixes.push({ written: ws, taken: s.id, d: s.d });
      if (e.guessed) fixes.push({ written: we, taken: e.id, d: e.d });
      for (const f of fixes) if (!words.some((w) => w.written === f.written)) words.push(f);
      mine.push({
        kind: 'name',
        block: p.block,
        line: p.line,
        from: s.id,
        type: t,
        reading: reading(t),
        to: e.id,
        written: fixes.map((f) => f.written).join(', '),
        taken: fixes.map((f) => f.taken).join(', '),
        explain: explain('name', graph, fixes, p.line),
      });
    }
    p.message = `${missing} is not in graph ${graph}; it is drawn as an estimate of ${near.one}`;
    p.fix = `change ${missing} to ${near.one}`;
    p.replace = { written: missing, with: [near.one] };
    p.severity = 'warning';
    // the fix acts where the path names each word, never on the same word in a text or another link on its line; and
    // one press changes every name the sentence says to change
    const places = placesOf.get(p.block) ?? placesOf.set(p.block, new BlockPlaces(texts[p.block] ?? '')).get(p.block);
    const at = places?.names(p.line, p.dropped, missing, words);
    if (at) {
      p.span = at.place;
      if (at.also.length) p.also = at.also;
      for (const e of mine) e.span = at.place;
      if (words.length > 1) {
        p.fix = `change ${andList(words.map((w) => `${w.written} to ${w.taken}`))}`;
        p.fixTitle = `C${p.fix.slice(1)}`;
      }
    }
    out.push(...mine);
  }

  // types: a link whose type is a near miss of one the graph has — declared by its schema, or, in a draft, written more often
  const declared = [...readings.keys()];
  const count = new Map<string, number>();
  for (const l of d.links) count.set(l.type, (count.get(l.type) ?? 0) + 1);
  const seenOf = new Map<string, number>();
  d.links.forEach((l, index) => {
    const k = seenOf.get(l.type) ?? 0;
    seenOf.set(l.type, k + 1);
    let near: ReturnType<typeof nearest>;
    if (declared.length) near = declared.includes(l.type) ? null : nearest(l.type, declared);
    else
      near = nearest(
        l.type,
        [...count.keys()].filter((t) => (count.get(t) ?? 0) > (count.get(l.type) ?? 0)),
      );
    if (!near || !('one' in near)) return;
    const at = whereType(texts, graph, l.type, k);
    out.push({
      kind: 'type',
      block: at.block,
      line: at.line,
      from: l.from,
      type: near.one,
      reading: reading(near.one),
      to: l.to,
      written: l.type,
      taken: near.one,
      index,
      explain: explain('type', graph, [{ written: l.type, taken: near.one, d: near.d }], at.line),
      ...(at.span ? { span: at.span } : {}),
    });
    problems.push({
      graph,
      block: at.block,
      line: at.line,
      severity: 'warning',
      message: `${l.type} is not a relationship in graph ${graph}; it is drawn as an estimate of ${near.one}`,
      fix: `change ${l.type} to ${near.one}`,
      replace: { written: l.type, with: [near.one] },
      ...(at.span ? { span: at.span } : {}),
    });
  });
  problems.sort((a, b) => a.block - b.block || a.line - b.line);
  return out;
}
