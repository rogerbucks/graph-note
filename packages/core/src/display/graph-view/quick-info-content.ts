// What the quick-info tooltip says of a thing or a link (editor spec §24, quick_info): its name, its kind, its first few
// properties, how many problems it has, and the first paragraph of its note — all of it found by the core, as the details
// find it, so the tooltip and the details never disagree.
import { details, linkDetails, propertiesOf } from '@graph-note/core';
import type { NoteReading } from '@graph-note/core';

/** How many properties the tooltip lists. */
export const FIRST_PROPERTIES = 3;

/** One thing's or link's tooltip, as words. */
export interface Info {
  name: string;
  kind: string;
  /** The first properties, each as `name: value`. */
  properties: string[];
  problems: number;
  /** The first paragraph of its note, as Markdown. */
  note?: string;
}

/** The tooltip of a thing (`key`) or a link (`link`, its place among the drawing's links); null when it is not drawn. */
export function infoOf(reading: NoteReading, graph: string, target: { key: string } | { link: number }): Info | null {
  const drawing = reading.graphs.get(graph);
  if ('key' in target) {
    const d = details(reading, graph, target.key);
    if (!d) return null;
    const note = drawing?.boxes.find((b) => b.key === d.key)?.note?.summary;
    return {
      name: d.text,
      kind: d.kind,
      properties: propertiesOf(reading, graph, { thing: d.key })
        .slice(0, FIRST_PROPERTIES)
        .map((p) => `${p.key}: ${p.value}`),
      problems: d.problems.length,
      ...(note ? { note } : {}),
    };
  }
  const d = linkDetails(reading, graph, target.link);
  if (!d) return null;
  const note = drawing?.links[target.link]?.note?.summary;
  return {
    name: `${d.from.text} ${d.reading} ${d.to.text}`,
    kind: d.type,
    properties: d.properties.slice(0, FIRST_PROPERTIES).map(([k, v]) => `${k}: ${v}`),
    problems: d.problems.length,
    ...(note ? { note } : {}),
  };
}
