// What is sent to an AI (editor spec §19, user_chooses_what). The user chooses the whole graph, a view, or the things
// selected. Nothing else from the vault is sent: not the note's prose, not another graph, not a comment. What is chosen
// is written out again as GQL from the graph as read. That is each thing with its kinds and properties, and each link
// between the things chosen.
import gs from '@thoughtknot/graph-spec';
import type { Graph, Value } from '@thoughtknot/graph-spec';
import { gqlBlocks } from './blocks.ts';
import { readNote } from './drawing.ts';
import type { Link, NoteReading } from './note-reading.ts';
import { evaluate } from './view-evaluate.ts';
import { parseView } from './view-profile.ts';
import { readingOf, viewsOf } from './views.ts';

/** What the user chose to send: a graph whole, one of its views by name, or some of its things by name. */
export type ScopeChoice =
  | { graph: string; what: 'graph' }
  | { graph: string; what: 'view'; view: string }
  | { graph: string; what: 'things'; things: string[] };

/** What is sent: the graph, what was chosen in words, the things in it, how many links, and the GQL that writes them. */
export interface AiScope {
  graph: string;
  /** Which choice it was: the whole graph, a view, or things ticked. */
  kind: 'whole' | 'view' | 'ticked';
  said: string;
  things: string[];
  links: number;
  gql: string;
}

/** A value as the profile writes it; none for what the profile has no way to write. */
function valueText(v: Value): string | null {
  if (typeof v === 'string') return gs.quote(v);
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (v && typeof v === 'object' && 'kind' in v) return `${v.kind === 'date' ? 'DATE' : 'DATETIME'} ${gs.quote(v.s)}`;
  return null;
}

/** A map of properties as GQL writes it, empty for none; a thing's id is its name, never one of them. */
function mapText(props: Record<string, Value>): string {
  const parts = Object.entries(props).flatMap(([k, v]) => {
    const t = k === 'id' ? null : valueText(v);
    return t === null ? [] : [`${k}: ${t}`];
  });
  return parts.length ? ` {${parts.join(', ')}}` : '';
}

/** A thing as GQL writes it, from the graph as read, or from its box when the graph does not hold it. */
function thingText(key: string, g: Graph, kind: string, text: string): string {
  const node = g.nodes.get(key);
  if (!node) return `(${key}:${kind.split('.').join(':')} {name: ${gs.quote(text)}})`;
  const labels = [...node[0]].filter((l) => !gs.SCHEMA_LABELS.includes(l));
  return `(${key}${labels.map((l) => `:${l}`).join('')}${mapText(node[1])})`;
}

/** Each link as GQL writes it, with its properties: the n-th link of a type between two things is the n-th edge so. */
function linkTexts(links: Link[], g: Graph): string[] {
  const seen = new Map<string, number>();
  return links.map((l) => {
    const key = `${l.from} ${l.type} ${l.to}`,
      n = seen.get(key) ?? 0;
    seen.set(key, n + 1);
    const edge = g.edges.filter(([f, t, d]) => f === l.from && t === l.type && d === l.to)[n];
    return `(${l.from})-[:${l.type}${mapText(edge?.[3] ?? {})}]->(${l.to})`;
  });
}

/** The things and links of a view, and the view in words; or why it cannot be sent. */
function viewPart(
  reading: NoteReading,
  graph: string,
  name: string,
): { keys: string[]; links: number[]; said: string } | string {
  const view = viewsOf(reading.texts).find((v) => v.graph === graph && v.name === name);
  if (!view) return `Graph ${graph} has no view named ${name} in this note.`;
  if (view.fault) return `View ${name} cannot be sent: ${view.fault}`;
  const spec = parseView(view.query);
  if ('refused' in spec) return `View ${name} cannot be sent: ${spec.refused}`;
  const result = evaluate(spec, reading, graph);
  if (result.empty)
    return `View ${name} matches nothing, so there is nothing to send: ${result.why ?? 'change the view'}`;
  const text = new Map((reading.graphs.get(graph)?.boxes ?? []).map((b) => [b.key, b.text]));
  return {
    keys: result.things,
    links: result.links,
    said: `view ${name} of graph ${graph}: ${readingOf(spec, (id) => text.get(id) ?? id)}`,
  };
}

/**
 * What would be sent of `note` for the user's choice, read as the editor reads the note (`shared` are the vault's
 * shared schemas). Or why it cannot be sent: a graph, view or thing the note does not hold, or nothing chosen.
 */
export function aiScope(note: string, choice: ScopeChoice, shared: string[] = []): AiScope | { refused: string } {
  const reading = readNote(
    gqlBlocks(note).map((b) => b.text),
    undefined,
    shared,
  );
  const { graph } = choice;
  const base = reading.graphs.get(graph),
    g = reading.world[graph];
  if (reading.tooLarge) return { refused: 'This note is too large to read, so nothing of it is sent.' };
  if (!base || !g || !base.boxes.length)
    return { refused: `Graph ${graph} has no things in this note, so there is nothing to send.` };
  let keys: string[], links: Link[], said: string;
  if (choice.what === 'graph') {
    keys = base.boxes.map((b) => b.key);
    links = base.links;
    said = `the whole graph ${graph}`;
  } else if (choice.what === 'view') {
    const part = viewPart(reading, graph, choice.view);
    if (typeof part === 'string') return { refused: part };
    keys = part.keys;
    links = part.links.flatMap((i) => base.links[i] ?? []);
    said = part.said;
  } else {
    if (!choice.things.length) return { refused: 'Choose at least one thing to send.' };
    const known = new Set(base.boxes.map((b) => b.key));
    const missing = choice.things.filter((t) => !known.has(t));
    if (missing.length)
      return { refused: `${missing.join(', ')} ${missing.length === 1 ? 'is' : 'are'} not a thing of graph ${graph}.` };
    keys = choice.things;
    links = base.links.filter((l) => keys.includes(l.from) && keys.includes(l.to));
    said = `${keys.length} thing${keys.length === 1 ? '' : 's'} chosen from graph ${graph}: ${keys.join(', ')}`;
  }
  const chosen = new Set(keys);
  const things = base.boxes.filter((b) => chosen.has(b.key));
  const lines = [...things.map((b) => thingText(b.key, g, b.kind, b.text)), ...linkTexts(links, g)];
  const kind = choice.what === 'graph' ? 'whole' : choice.what === 'view' ? 'view' : 'ticked';
  return {
    graph,
    kind,
    said,
    things: things.map((b) => b.key),
    links: links.length,
    gql: `// graph: ${graph}\n${lines.join(',\n')}`,
  };
}
