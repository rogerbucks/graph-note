// Lock the graph (spec §8): a draft's kinds and relationship types, worked out from its data, written as its schema — a
// block written last, as the graph spec's §5 asks — with each relationship read both ways. The reverse readings are
// guesses, and the block says so, for the writer to check.
import type { NoteReading } from './drawing.ts';

/** A graph with no schema of its own, none written later in its note, and none it names, is a draft (§5). */
export function isDraft(reading: NoteReading, graph: string): boolean {
  const g = reading.whole[graph] ?? reading.world[graph];
  if (!g) return false;
  const named = (reading.whole as { __named?: Record<string, string> }).__named?.[graph];
  return !g.labelled('ElementType').length && !named;
}

/** A guess at a reading the other way: "favours" is "is favoured by"; "is part of" is "has part". */
export function reverseGuess(reading: string): string {
  const of = /^is (\w+) of$/.exec(reading);
  if (of) return `has ${of[1]}`;
  const [verb = '', ...rest] = reading.split(' ');
  if (!/s$/.test(verb) || verb.length < 3) return `inverse of ${reading}`;
  const base = verb.slice(0, -1),
    done = /e$/.test(base) ? `${base}d` : `${base}ed`;
  return ['is', done, ...rest, 'by'].join(' ');
}

const q = (s: string) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

/** The schema block that locks a draft: its kinds and relationship types, each with its readings, dated. */
export function lockBlock(reading: NoteReading, graph: string, today: string): string {
  const d = reading.graphs.get(graph);
  if (!d) throw new Error(`there is no graph ${graph} to lock`);
  const header =
    reading.texts
      .map((t) => t.split('\n').find((l) => l.trim()) ?? '')
      .find((l) => new RegExp(`^\\s*//\\s*graph:\\s*${graph}(\\s|$)`).test(l))
      ?.trim() ?? `// graph: ${graph}`;
  const taken = new Set([...(reading.whole[graph]?.nodes.keys() ?? []), ...(reading.world[graph]?.nodes.keys() ?? [])]);
  const id = (want: string) => {
    let v = want,
      n = 1;
    while (taken.has(v)) v = `${want}_${++n}`;
    taken.add(v);
    return v;
  };
  const byCode = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  const kinds = [...new Set(d.boxes.flatMap((b) => b.kind.split(' · ').filter(Boolean)))].sort(byCode);
  const types = [...new Map(d.links.map((l) => [l.type, l.reading])).entries()].sort((a, b) => byCode(a[0], b[0]));
  return [
    header,
    `// ── The schema: locked ${today} from the data above ──`,
    '// The reverse readings are guesses — check each one.',
    `(${id(`${graph}_schema`)}:GraphMeta {graph: ${q(graph)}, schema: ${q(`${graph}@1`)}}),`,
    '',
    '// ── Kinds of thing ──',
    ...kinds.map(
      (k) => `(${id(`kind_${k.toLowerCase()}`)}:Meta:ElementType {name: ${q(k)}, kind: 'node', origin: 'source'}),`,
    ),
    '',
    '// ── Relationship types, with their readings both ways ──',
    ...types.map(
      ([t, r]) =>
        `(${id(`link_${t.toLowerCase()}`)}:Meta:ElementType {name: ${q(t)}, kind: 'edge', origin: 'source', reading: ${q(r)}, reverse_name: ${q(reverseGuess(r))}}),`,
    ),
  ]
    .join('\n')
    .replace(/,$/, '');
}
