// Writing one change of a proposal as text (editor spec §17, accepting_is_an_edit): the text of the graph's blocks is the
// only store of the graph (§2), so an addition is an item written after the last, a change of a property is made in the
// pattern that writes it (or in the SET that gives it), and a removal takes out the item that wrote the thing or the link.
// Each works on the blocks' texts, so the same code shows a proposal laid over a graph without writing anything and
// writes an accepted change; what is written is checked by `proposals-review.ts`, which reads it back and has the pane's
// own session check it. A change that would need more than whole items taken out — a thing written inside a longer path —
// is not guessed at: it is refused, saying to edit it in the text.
import { blankText, items } from './block-items.ts';
import type { Item } from './block-items.ts';
import { graphOfBlock } from './blocks.ts';
import { readNote } from './drawing.ts';
import { hops } from './estimates.ts';
import { literally, setProperty } from './inspector.ts';
import { appended, withoutItem } from './linked-list.ts';
import type { NoteReading, Problem } from './note-reading.ts';
import type { ProposedChange } from './proposals.ts';
import { writtenIn } from './written-things.ts';

/** The blocks' new texts after a change, or why it cannot be written. */
export type Edited = { ok: true; texts: string[] } | { ok: false; reason: string };

const put = (texts: readonly string[], at: number, text: string): Edited => ({
  ok: true,
  texts: texts.map((t, i) => (i === at ? text : t)),
});

/** The names a change writes (the things an addition adds) and the names it needs to be there already. */
export function namesOf(c: ProposedChange): { writes: string[]; needs: string[] } {
  if (c.op === 'add') {
    const writes = writtenIn(c.gql)
      .filter((w) => w.writes && !w.matched)
      .map((w) => w.variable?.name ?? w.props.get('id') ?? '')
      .filter(Boolean);
    const ends = hops(c.gql).flatMap(([from, , to]) => [from, to]);
    return { writes, needs: ends.filter((n) => !writes.includes(n)) };
  }
  if (c.op === 'set' || c.op === 'remove-thing') return { writes: [], needs: [c.thing] };
  return { writes: [], needs: [c.from, c.to] };
}

/** The blocks of the graph that hold data, by index into the note's blocks. */
const dataBlocks = (texts: readonly string[], graph: string) =>
  texts.flatMap((t, i) => (graphOfBlock(t) === graph ? [i] : []));

/** Whether a block is the graph's schema, locked into a block of its own (§5): it declares kinds and relationships. */
const declares = (text: string) => /\b(?:ElementType|GraphMeta)\b/.test(blankText(text));

const BARE_LINK = /^\(\s*\w+\s*\)\s*(?:-\[[^\]]*\]->|<-\[[^\]]*\]-)\s*\(\s*\w+\s*\)$/;
const isSet = (text: string) => /^SET\b/i.test(text.trim());

/** The text of the item `it`, with strings and comments blanked so words in them never match. */
const blankOf = (block: string, it: Item) => blankText(block).slice(it.from, it.to).trim();

/**
 * The block without an item that is a SET, or an assignment of a SET, keeping the one SET a block may end with: when the
 * item that carries the word SET goes and others follow, the first of them takes the word.
 */
function withoutAssignment(block: string, all: Item[], it: Item): string {
  const text = withoutItem(block, all, it);
  if (!isSet(blankOf(block, it))) return text;
  const next = all[all.indexOf(it) + 1];
  if (!next) return text;
  const first = items(text)[all.indexOf(it)];
  if (!first) return text;
  // the word goes where the removed one was: at the start of the line its item began, with that line's indent
  const lead = block.slice(block.lastIndexOf('\n', it.from - 1) + 1, it.from);
  const indent = /^[ \t]*$/.test(lead) ? lead : '';
  const lineStart = text.lastIndexOf('\n', first.from - 1) + 1;
  const own = /^[ \t]*$/.test(text.slice(lineStart, first.from)) ? lineStart : first.from;
  return `${text.slice(0, own)}${own === lineStart ? indent : ''}SET ${text.slice(first.from)}`;
}

/** Takes out each item of the block that `drop` accepts (given its blanked text), one at a time; the text and how many went. */
function dropWhere(
  block: string,
  drop: (blank: string, item: Item) => 'item' | 'assignment' | false,
): [string, number] {
  let text = block,
    count = 0;
  for (let again = true; again;) {
    again = false;
    const all = items(text);
    for (const it of all) {
      const how = drop(blankOf(text, it), it);
      if (!how) continue;
      text = how === 'item' ? withoutItem(text, all, it) : withoutAssignment(text, all, it);
      count++;
      again = true;
      break;
    }
  }
  return [text, count];
}

const link = (from: string, type: string, to: string) =>
  new RegExp(
    `^\\(\\s*${literally(from)}\\s*\\)\\s*-\\[\\s*:\\s*${literally(type)}\\s*(\\{[^{}]*\\})?\\s*\\]\\s*->\\s*\\(\\s*${literally(to)}\\s*\\)$|^\\(\\s*${literally(to)}\\s*\\)\\s*<-\\[\\s*:\\s*${literally(type)}\\s*(\\{[^{}]*\\})?\\s*\\]\\s*-\\s*\\(\\s*${literally(from)}\\s*\\)$`,
  );

/**
 * The change of a property written where the thing is: in the SET that already gives the property, else in the map of
 * the pattern that writes the thing (the last such block first, as a later block's word is the last).
 */
function setIn(texts: readonly string[], blocks: number[], c: ProposedChange & { op: 'set' }): Edited {
  const given = new RegExp(`^(SET\\s+)?${literally(c.thing)}\\s*\\.\\s*${literally(c.key)}\\s*=\\s*`);
  for (const i of [...blocks].reverse()) {
    const block = texts[i] ?? '';
    const it = items(block).find((x) => given.test(blankOf(block, x)));
    const head = it && given.exec(block.slice(it.from, it.to))?.[0];
    if (it && head) return put(texts, i, `${block.slice(0, it.from)}${head}${c.value}${block.slice(it.to)}`);
  }
  for (const i of [...blocks].reverse()) {
    const r = setProperty(texts[i] ?? '', '', { thing: c.thing }, c.key, c.value);
    if (r.ok) return put(texts, i, r.text);
  }
  return { ok: false, reason: `${c.thing} is not written in a block of this graph: edit it where it is written` };
}

/** A link taken out: every item of the graph's blocks that is that link alone. A link written in a longer path is not. */
function linkOut(texts: readonly string[], blocks: number[], c: ProposedChange & { op: 'remove-link' }): Edited {
  const same = link(c.from, c.type, c.to);
  let out = [...texts],
    gone = 0;
  for (const i of blocks) {
    const [text, n] = dropWhere(out[i] ?? '', (blank) => (same.test(blank) ? 'item' : false));
    out = out.map((t, j) => (j === i ? text : t));
    gone += n;
  }
  return gone
    ? { ok: true, texts: out }
    : {
        ok: false,
        reason: `the link ${c.from} ${c.type} ${c.to} is not written by itself in a block: edit it in the text`,
      };
}

/** A thing taken out: the item that writes it, the links that are items of their own, and the SET lines that give it properties. */
function thingOut(texts: readonly string[], blocks: number[], c: ProposedChange & { op: 'remove-thing' }): Edited {
  const name = literally(c.thing);
  const own = new RegExp(`^\\(\\s*${name}\\s*((?::\\s*\\w+\\s*)*)(\\{[^{}]*\\})?\\s*\\)$`);
  const mentions = new RegExp(`(?<![\\w.])${name}(?!\\w)`);
  const assignment = new RegExp(`^(SET\\s+)?${name}\\s*\\.`);
  let out = [...texts],
    wrote = false;
  for (const i of blocks) {
    const block = out[i] ?? '';
    wrote = wrote || items(block).some((x) => own.test(blankOf(block, x)));
    const [text] = dropWhere(block, (blank) => {
      if (own.test(blank)) return 'item';
      if (!mentions.test(blank)) return false;
      if (assignment.test(blank)) return 'assignment';
      return BARE_LINK.test(blank) ? 'item' : false;
    });
    out = out.map((t, j) => (j === i ? text : t));
  }
  if (!wrote) return { ok: false, reason: `${c.thing} is not written by itself in a block: edit it in the text` };
  const left = blocks.find((i) => {
    const block = out[i] ?? '';
    return items(block).some((x) => mentions.test(blankOf(block, x)));
  });
  return left === undefined
    ? { ok: true, texts: out }
    : { ok: false, reason: `${c.thing} is also named in a longer path: edit it in the text` };
}

/** The blocks' texts after one change is written, or why it cannot be. */
export function applyChange(texts: readonly string[], graph: string, c: ProposedChange): Edited {
  const blocks = dataBlocks(texts, graph);
  // an addition goes after the last block that is data, never into the schema locked after it
  const last = blocks.filter((i) => !declares(texts[i] ?? '')).at(-1) ?? blocks.at(-1);
  if (last === undefined) return { ok: false, reason: `graph ${graph} has no block to write into` };
  if (c.op === 'add') return put(texts, last, appended(texts[last] ?? '', [c.gql]));
  if (c.op === 'set') return setIn(texts, blocks, c);
  return c.op === 'remove-link' ? linkOut(texts, blocks, c) : thingOut(texts, blocks, c);
}

/** The value of a property as the reader reads it, from the text a change gives. */
function valueRead(value: string): string {
  const r = readNote([`// graph: v\n(v:T {k: ${value}})`]);
  return JSON.stringify(r.world.v?.p('v').k);
}

/**
 * Whether a change took effect in the reading of the note it was written into: null when it did, else what did not
 * happen. A change is read back, never assumed.
 */
export function notTaken(reading: NoteReading, graph: string, c: ProposedChange): string | null {
  const g = reading.world[graph];
  if (!g) return `graph ${graph} was not read`;
  const edge = (from: string, type: string, to: string) =>
    g.edges.some((e) => e[0] === from && e[1] === type && e[2] === to);
  if (c.op === 'add') {
    const missing = namesOf(c).writes.find((n) => !g.nodes.has(n));
    if (missing) return `${missing} is not in the graph after it was written`;
    const gone = hops(c.gql).find(([from, type, to]) => !edge(from, type, to));
    return gone ? `the link ${gone[0]} ${gone[1]} ${gone[2]} is not in the graph after it was written` : null;
  }
  if (c.op === 'set')
    return g.nodes.has(c.thing) && JSON.stringify(g.p(c.thing)[c.key]) === valueRead(c.value)
      ? null
      : `${c.thing}.${c.key} is not ${c.value} after it was written`;
  if (c.op === 'remove-thing') return g.nodes.has(c.thing) ? `${c.thing} is still in the graph` : null;
  return edge(c.from, c.type, c.to) ? `the link ${c.from} ${c.type} ${c.to} is still in the graph` : null;
}

/** The problems of a graph that `after` has and `before` did not (hints are no problem), each once for each time it is new. */
export function newProblems(before: NoteReading, after: NoteReading, graph: string): Problem[] {
  const had = new Map<string, number>();
  const key = (p: Problem) => `${p.severity}\u0000${p.message}`;
  for (const p of before.problems)
    if (p.graph === graph && p.severity !== 'hint') had.set(key(p), (had.get(key(p)) ?? 0) + 1);
  return after.problems.filter((p) => {
    if (p.graph !== graph || p.severity === 'hint') return false;
    const n = had.get(key(p)) ?? 0;
    had.set(key(p), n - 1);
    return n <= 0;
  });
}
