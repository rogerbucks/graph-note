// Lock the graph (spec §8). A draft's kinds and relationship types are worked out from its data and written as its
// schema, with each relationship read both ways. The schema is a block written last, as the graph spec's §5 asks. The
// reverse readings are guesses, and the block says so, for the writer to check.
import gs from '@thoughtknot/graph-spec';
import { dataKind, graphOf } from './blocks.ts';
import type { NoteReading } from './note-reading.ts';
import { trim } from './whitespace.ts';

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

/**
 * A string quoted as GQL writes it, by the graph library's own quoting. It is in single quotes, with a backslash and a
 * quote each led by a backslash. A line break, tab or other control character is written as its escape, so it stays on
 * its line.
 */
export const quoted = (s: string): string => gs.quote(s);
const q = quoted;

/** The lines that declare a kind of thing as Lock writes it, ending `}),` for the line after to follow; later lines indented by `indent`. */
export const kindLines = (id: string, name: string, indent: string): string[] => [
  `(${id}:Meta:ElementType {`,
  `${indent}name: ${q(name)}, kind: 'node', origin: 'source'}),`,
];

/** The lines that declare a relationship type as Lock writes it, with its reading both ways, ending `}),` for the line after to follow. */
export const typeLines = (id: string, name: string, reading: string, reverse: string, indent: string): string[] => [
  `(${id}:Meta:ElementType {`,
  `${indent}name: ${q(name)}, kind: 'edge', origin: 'source',`,
  ...fit(
    `${indent}reading: ${q(reading)}, reverse_name: ${q(reverse)}}),`,
    `${indent}reading: ${q(reading)},`,
    `${indent}reverse_name: ${q(reverse)}}),`,
  ),
];

/**
 * The schema block that locks a draft. It holds every kind and relationship type of the whole graph, across all its
 * blocks in the note, whichever block it is locked from. Each comes with its readings, dated, and each is declared by
 * the graph's GraphMeta. Laid out as the guide lays a locked schema out: a long thing split over lines, a "// ──" line
 * before each part. A thing's later lines are indented by `indent`, the text the settings choose (spec §21,
 * settings_formatting).
 */
export function lockBlock(reading: NoteReading, graph: string, today: string, indent = '    '): string {
  const g = reading.whole[graph] ?? reading.world[graph];
  if (!g) throw new Error(`there is no graph ${graph} to lock`);
  // the graph line of a block of the graph's data or schema as written, read with whitespace as GQL names it (graph
  // spec §3). Never a view's, which would make the schema a second view
  const header =
    reading.texts
      .filter((t) => typeof dataKind(t) === 'string')
      .map((t) => t.split('\n').find((l) => trim(l)) ?? '')
      .map((l) => trim(l))
      .find((l) => graphOf(l) === graph) ?? `// graph: ${graph}`;
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
    ...(own ? [] : [`(${meta}:GraphMeta {`, `${indent}graph: ${q(graph)}, schema: ${q(`${graph}@1`)}}),`]),
    '',
    '// ── Kinds of thing ──',
    ...kinds.flatMap((k) => kindLines(declare(`kind_${k.toLowerCase()}`), k, indent)),
    '',
    '// ── Relationship types, with their readings both ways ──',
    ...types.flatMap(([t, r, back]) => typeLines(declare(`link_${t.toLowerCase()}`), t, r, back, indent)),
    '',
    '// ── The graph declares each one ──',
    ...declared.map((d) => `(${meta})-[:DECLARES]->(${d}),`),
  ]
    .join('\n')
    .replace(/,$/, '');
}
