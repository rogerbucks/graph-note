// The data as GraphML (editor spec §16, export_data_formats, export_lossless): one directed graph, named as the graph is,
// a node for each thing and an edge for each link, in the order written. GraphML names a node by an NMTOKEN, so a node
// is named by its place (`n1`…) and the thing's id is data, under the key `:id`; its kinds are `:labels`, joined by `;`,
// and a link's type `:type`. Each property has a key for each kind its values come in: a text is a string, a number a
// double, a truth value a boolean, and a day or an instant a string whose key's own description says which, `gn:date`
// or `gn:datetime`, so the file keeps to GraphML's schema with no attribute of its own. A view's faded context, when
// asked for, is marked by the key `:faded`, for nodes and edges alike, false unless a node or edge says true. A text is
// escaped so XML reads it back as written: its marks, a carriage return, and anything in an attribute that XML would
// make a space. A character XML 1.0 cannot hold at all, as a control character, is refused, naming where it is, for
// the GQL block or CSV, which hold it: never written as something else. A note (§24, note_standard) is kept as an XML
// comment on the line directly before its node or edge, escaped by xml-comment.ts so it reads back as written and can
// never end its comment; a comment, not a key, so a tool reading the file takes it for a comment, as GQL's engines do.
import type { Value } from '@graph-note/graph-spec';
import { saidDate } from './export-frame.ts';
import { kindOf, numberText, oneLine, timeText } from './export-data-model.ts';
import type { DataInfo, ExportedData, ValueKind } from './export-data-model.ts';
import { notXml, noteComment } from './xml-comment.ts';

/** What a key's description says of a day or an instant, which GraphML's types have no word for. */
const DESC_KINDS: Partial<Record<ValueKind, string>> = { date: 'gn:date', datetime: 'gn:datetime' };

const ATTR_TYPES: Record<ValueKind, string> = {
  text: 'string',
  number: 'double',
  boolean: 'boolean',
  date: 'string',
  datetime: 'string',
};
const MARKS: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\r': '&#13;' };
const IN_ATTRIBUTE: Record<string, string> = { ...MARKS, '\t': '&#9;', '\n': '&#10;' };

/** Text inside an element, escaped so XML reads it back as written. */
const escaped = (s: string) => s.replace(/[&<>"\r]/g, (c) => MARKS[c] ?? c);
/** Text in an attribute, escaped so XML neither ends it nor makes its whitespace spaces. */
const attribute = (s: string) => s.replace(/[&<>"\r\t\n]/g, (c) => IN_ATTRIBUTE[c] ?? c);

/** Refuses a text XML cannot hold, saying where it is and what to export instead. */
function holdable(text: string, where: string): string {
  const bad = [...text].find(notXml);
  if (bad !== undefined) {
    const code = (bad.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, '0');
    throw new Error(
      `${where} holds a character GraphML cannot hold (U+${code}), so it cannot be exported as GraphML without losing it: export it as a GQL block or as CSV, which hold it`,
    );
  }
  return text;
}

/** A value as the text of a data element. */
function valueText(v: Value, kind: ValueKind, where: string): string {
  if (kind === 'text') return escaped(holdable(v as string, where));
  if (kind === 'number') return numberText(v as number);
  if (kind === 'boolean') return v ? 'true' : 'false';
  return timeText(v as { kind: 'date' | 'datetime'; s: string });
}

/** The data as a GraphML document. */
export function graphmlText(data: ExportedData, info: DataInfo): string {
  const keys = new Map<string, { id: string; domain: string; name: string; kind: ValueKind }>();
  const keyOf = (domain: 'node' | 'edge', name: string, kind: ValueKind) => {
    const k = `${domain} ${name} ${kind}`;
    if (!keys.has(k)) keys.set(k, { id: `p${keys.size}`, domain, name, kind });
    return keys.get(k)?.id ?? '';
  };
  const datum = (key: string, text: string) => `<data key="${key}">${text}</data>`;
  const propsOf = (domain: 'node' | 'edge', props: Record<string, Value>, whose: string) =>
    Object.entries(props).flatMap(([name, v]) => {
      if (domain === 'node' && name === 'id') return [];
      const kind = kindOf(v);
      return [datum(keyOf(domain, name, kind), valueText(v, kind, `${whose}’s ${name}`))];
    });
  const place = new Map(data.things.map(([id], i) => [id, `n${i + 1}`]));
  const fadedThings = new Set(data.faded?.things ?? []),
    fadedLinks = new Set(data.faded?.links ?? []);
  const faded = (yes: boolean) => (yes ? [datum('faded', 'true')] : []);
  // a note is the XML comment on the line directly before its node or edge (xml-comment.ts)
  const thingNotes = new Map(data.notes?.things ?? []),
    linkNotes = new Map(data.notes?.links ?? []);
  const noted = (note: string | undefined, line: string) =>
    note === undefined ? line : `    ${noteComment(note)}\n${line}`;
  const nodes = data.things.map(([id, kinds, props]) => {
    const whose = `Thing ${holdable(id, `A thing’s id, ${JSON.stringify(id)},`)}`;
    const own = [datum('id', escaped(id)), datum('labels', kinds.join(';')), ...faded(fadedThings.has(id))];
    const line = `    <node id="${place.get(id)}">${[...own, ...propsOf('node', props, whose)].join('')}</node>`;
    return noted(thingNotes.get(id), line);
  });
  const edges = data.links.map(([from, type, to, props], i) => {
    const own = [datum('type', type), ...faded(fadedLinks.has(i))];
    const whose = `The link ${from} ${type} ${to}`;
    const line = `    <edge source="${place.get(from)}" target="${place.get(to)}">${[...own, ...propsOf('edge', props, whose)].join('')}</edge>`;
    return noted(linkNotes.get(i), line);
  });
  const what = data.view === undefined ? `graph ${data.graph}` : `view ${data.view} of graph ${data.graph}`;
  const desc = `Exported from ${oneLine(info.note)}, ${oneLine(what)}, ${saidDate(info.date)}`;
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<graphml xmlns="http://graphml.graphdrawing.org/xmlns">',
    '  <key id="id" for="node" attr.name=":id" attr.type="string"/>',
    '  <key id="labels" for="node" attr.name=":labels" attr.type="string"/>',
    '  <key id="type" for="edge" attr.name=":type" attr.type="string"/>',
    ...(data.faded
      ? ['  <key id="faded" for="all" attr.name=":faded" attr.type="boolean"><default>false</default></key>']
      : []),
    ...[...keys.values()].map((k) => {
      const head = `  <key id="${k.id}" for="${k.domain}" attr.name="${attribute(k.name)}" attr.type="${ATTR_TYPES[k.kind]}"`;
      const said = DESC_KINDS[k.kind];
      return said ? `${head}><desc>${said}</desc></key>` : `${head}/>`;
    }),
    `  <graph id="${attribute(data.graph)}" edgedefault="directed">`,
    `    <desc>${escaped([...desc].map((c) => (notXml(c) ? ' ' : c)).join(''))}</desc>`,
    ...nodes,
    ...edges,
    '  </graph>',
    '</graphml>',
    '',
  ].join('\n');
}
