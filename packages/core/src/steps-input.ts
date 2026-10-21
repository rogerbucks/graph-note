// What goes in at a graph step's named points (editor spec §20, graph_step_io, step_inputs_checked). It is a whole
// graph of the note, or part of one, a view such as a queried path. It is put to the graph as the note reads it and
// never to a copy. Each input is checked against what its point says it takes before the step runs. The inputs are read
// together as one graph, a thing by its id, for the rule to match.
import type { Graph } from '@thoughtknot/graph-spec';
import { formatList } from './locale-formats.ts';
import type { NoteReading } from './note-reading.ts';
import type { StepGraph } from './steps-match.ts';
import { evaluate } from './view-evaluate.ts';
import { parseView } from './view-profile.ts';
import { viewsOf } from './views.ts';
import { sourceWord, word } from './words.ts';

/** What a step takes at one named point: the kinds of things and the types of links what is given there must hold. */
export interface StepPoint {
  name: string;
  kinds: string[];
  types: string[];
}

/** What is given at a point: a graph of the note, whole, or one of its views by name. */
export interface StepGiven {
  graph: string;
  view?: string;
}

/**
 * An input as the step takes it: its point, and what was given in words. `label` is in the reader's language. `read`
 * is in UK English, as the change set records it in the note. Then comes the graph, or the part of one, it is.
 */
export interface StepInput {
  point: string;
  label: string;
  read: string;
  graph: StepGraph;
}

/** The things and links of `ids` and `links` in a graph of the reading: their kinds and properties as read. */
function partOf(g: Graph, ids: string[], links: [string, string, string][]): StepGraph {
  const things: StepGraph['things'] = new Map();
  for (const id of ids) {
    const [kinds, props] = g.nodes.get(id) ?? [new Set<string>(), {}];
    things.set(id, { kinds: new Set(kinds), props });
  }
  return { things, links };
}

/** What a given graph or view is in words, in the reader's language: "graph team", "view near_ada of team". */
export const givenLabel = (g: StepGiven): string =>
  g.view ? word('steps.given.view', { view: g.view, graph: g.graph }) : word('steps.given.graph', { graph: g.graph });

/** The same words in UK English, whatever the reader's language: they are written into a change set's bytes. */
const givenRead = (g: StepGiven): string =>
  g.view
    ? sourceWord('steps.given.view', { view: g.view, graph: g.graph })
    : sourceWord('steps.given.graph', { graph: g.graph });

/** One input from what was given at a point, as the reading draws it; or why it cannot be one. */
function inputOf(point: string, given: StepGiven, reading: NoteReading, texts: readonly string[]): StepInput | string {
  const label = givenLabel(given),
    read = givenRead(given),
    at = { given: label, point };
  const drawing = reading.graphs.get(given.graph),
    g = reading.world[given.graph];
  if (!drawing || !g) return word('steps.input.not-in-note', at);
  const edges = (indexes: Iterable<number>) =>
    [...indexes].flatMap((i): [string, string, string][] => {
      const l = drawing.links[i];
      return l ? [[l.from, l.type, l.to]] : [];
    });
  if (!given.view)
    return {
      point,
      label,
      read,
      graph: partOf(
        g,
        drawing.boxes.map((b) => b.key),
        edges(drawing.links.keys()),
      ),
    };
  const view = viewsOf([...texts]).find((v) => v.graph === given.graph && v.name === given.view);
  if (!view) return word('steps.input.no-view', { view: given.view, graph: given.graph, point });
  if (view.fault) return word('steps.input.view-fault', { ...at, why: view.fault });
  const spec = parseView(view.query);
  if ('refused' in spec) return word('steps.input.view-refused', { ...at, why: spec.refused });
  const result = evaluate(spec, reading, given.graph);
  if (result.empty) return word('steps.input.view-empty', { ...at, why: result.why ?? '' });
  return { point, label, read, graph: partOf(g, result.things, edges(result.links)) };
}

/**
 * The inputs given at a step's points, from a note's blocks as read (`reading`, of `texts`). Each is a graph of the
 * note, whole, or a view of one. It also says why any cannot be:
 * - a point given nothing, or a point the step does not declare;
 * - a graph the note does not hold;
 * - a view that cannot be used or matches nothing.
 */
export function inputsFrom(
  points: readonly StepPoint[],
  given: Readonly<Record<string, StepGiven>>,
  reading: NoteReading,
  texts: readonly string[],
): { inputs: StepInput[]; refused: string[] } {
  const names = points.map((p) => p.name),
    refused: string[] = [],
    inputs: StepInput[] = [];
  for (const point of Object.keys(given))
    if (!names.includes(point)) refused.push(word('steps.input.not-taken', { point, points: formatList(names) }));
  for (const p of points) {
    const g = given[p.name];
    if (!g) {
      refused.push(word('steps.input.nothing-given', { point: p.name }));
      continue;
    }
    const input = inputOf(p.name, g, reading, texts);
    if (typeof input === 'string') refused.push(input);
    else inputs.push(input);
  }
  return { inputs, refused };
}

/**
 * Each input checked against what its point says it takes (step_inputs_checked), before the step runs. Every kind of
 * thing and every type of link it names must be held by what is given there. And something must be given. Returns the
 * reasons, in the order the points and their words are written; none when every input is as its point says.
 */
export function inputFaults(points: readonly StepPoint[], inputs: readonly StepInput[]): string[] {
  return inputs.flatMap((input) => {
    const p = points.find((x) => x.name === input.point);
    if (!p) return [];
    const { things, links } = input.graph;
    if (!things.size) return [word('steps.input.holds-nothing', { given: input.label, point: p.name })];
    const kinds = new Set([...things.values()].flatMap((t) => [...t.kinds])),
      types = new Set(links.map((l) => l[1]));
    return [
      ...p.kinds
        .filter((k) => !kinds.has(k))
        .map((kind) => word('steps.input.no-kind', { point: p.name, kind, given: input.label })),
      ...p.types
        .filter((t) => !types.has(t))
        .map((type) => word('steps.input.no-type', { point: p.name, type, given: input.label })),
    ];
  });
}

/** The inputs read together as one graph: a thing by its id, its kinds joined, its properties as first given; a link once. */
export function together(inputs: readonly StepInput[]): StepGraph {
  const things: StepGraph['things'] = new Map(),
    links: StepGraph['links'] = [],
    seen = new Set<string>();
  for (const { graph } of inputs) {
    for (const [id, t] of graph.things) {
      const had = things.get(id);
      if (had) for (const k of t.kinds) had.kinds.add(k);
      else things.set(id, { kinds: new Set(t.kinds), props: t.props });
    }
    for (const l of graph.links) {
      const key = l.join('\u0000');
      if (!seen.has(key)) links.push(l);
      seen.add(key);
    }
  }
  return { things, links };
}
