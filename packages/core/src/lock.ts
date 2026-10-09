// Lock the graph (spec §8): a draft's kinds and relationship types, worked out from its data, written as its schema — a
// block written last, as the graph spec's §5 asks — with each relationship read both ways. The reverse readings are
// guesses, and the block says so, for the writer to check.
import gs from '@graph-note/graph-spec';
import type { NoteReading } from './drawing.ts';

/** A graph with no schema of its own, none written later in its note, and none it names, is a draft (§5). */
export function isDraft(reading: NoteReading, graph: string): boolean {
  const g = reading.whole[graph] ?? reading.world[graph];
  if (!g) return false;
  const named = (reading.whole as { __named?: Record<string, string> }).__named?.[graph];
  return !g.labelled('ElementType').length && !named;
}

/** A guess at a reading the other way, as the libraries guess it: "favours" is "is favoured by"; "is part of" is "contains". */
export function reverseGuess(reading: string): string {
  return gs.reverseReading(reading);
}

/** A line kept under 70 characters, as the guide asks: as one line if it fits, otherwise as the two given. */
const fit = (one: string, first: string, second: string) => (one.length < 70 ? [one] : [first, second]);

const q = (s: string) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

/**
 * The schema block that locks a draft: every kind and relationship type of the whole graph — across all its blocks in the
 * note, whichever block it is locked from — each with its readings, dated, and each declared by the graph's GraphMeta.
 * Laid out as the guide lays a locked schema out: a long thing split over lines, a "// ──" line before each part.
 */
export function lockBlock(reading: NoteReading, graph: string, today: string): string {
  const g = reading.whole[graph] ?? reading.world[graph];
  if (!g) throw new Error(`there is no graph ${graph} to lock`);
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
  const hidden = new Set(gs.SCHEMA_LABELS);
  const kinds = [
    ...new Set([...g.nodes.values()].flatMap(([labels]) => [...labels].filter((l) => !hidden.has(l)))),
  ].sort(byCode);
  const readings = gs.readings(g);
  // a type the graph already words keeps its words; any other is guessed, as the libraries guess it
  const types = [...new Set(g.edges.map(([, t]) => t))].sort(byCode).map((t): [string, string, string] => {
    const [reading, reverse] = readings.get(t) ?? [];
    const [r, back] = reading ? [reading, reverse ?? gs.reverseReading(reading)] : gs.guessReadings(t);
    return [t, r, back];
  });
  // a draft that has its GraphMeta already keeps it, and the types are declared from it
  const own = g.labelled('GraphMeta').find((m) => /^[A-Za-z_]\w*$/.test(m));
  const meta = own ?? id(`${graph}_schema`);
  const declared: string[] = [];
  const declare = (want: string) => {
    const v = id(want);
    declared.push(v);
    return v;
  };
  return [
    header,
    `// ── The schema: locked ${today} from the data above ──`,
    '// The reverse readings are guesses — check each one.',
    ...(own ? [] : [`(${meta}:GraphMeta {`, `    graph: ${q(graph)}, schema: ${q(`${graph}@1`)}}),`]),
    '',
    '// ── Kinds of thing ──',
    ...kinds.flatMap((k) => [
      `(${declare(`kind_${k.toLowerCase()}`)}:Meta:ElementType {`,
      `    name: ${q(k)}, kind: 'node', origin: 'source'}),`,
    ]),
    '',
    '// ── Relationship types, with their readings both ways ──',
    ...types.flatMap(([t, r, back]) => [
      `(${declare(`link_${t.toLowerCase()}`)}:Meta:ElementType {`,
      `    name: ${q(t)}, kind: 'edge', origin: 'source',`,
      ...fit(
        `    reading: ${q(r)}, reverse_name: ${q(back)}}),`,
        `    reading: ${q(r)},`,
        `    reverse_name: ${q(back)}}),`,
      ),
    ]),
    '',
    '// ── The graph declares each one ──',
    ...declared.map((d) => `(${meta})-[:DECLARES]->(${d}),`),
  ]
    .join('\n')
    .replace(/,$/, '');
}
