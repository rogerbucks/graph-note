// Exporting the data (editor spec §16, export_data_formats, export_lossless): the things an export holds and the links
// written between them, as the reader read them, and that data written as a GQL block, as CSV or as GraphML, each of
// which reads back into the very things and links exported. Only what is written is data: a schema's own things are
// never drawn and never exported, and a guess (an estimated link) is the drawing's, never the note's. No layout is
// asked for, so a graph too large to draw is still exported whole.
import type { Graph } from '@graph-note/graph-spec';
import { csvText } from './export-data-csv.ts';
import { gqlBlock } from './export-data-gql.ts';
import { graphmlText } from './export-data-graphml.ts';
import type { DataInfo, DataLink, DataThing, ExportedData } from './export-data-model.ts';
import type { ExportScope } from './export-scope.ts';
import type { NoteReading } from './note-reading.ts';

/** The formats the data is offered in (export_data_formats): a GQL block, CSV and GraphML. */
export const DATA_FORMATS = ['gql', 'csv', 'graphml'] as const;

/** One of the formats the data is offered in. */
export type DataFormat = (typeof DATA_FORMATS)[number];

/** Whether `format` is one the data is offered in, rather than an image's. */
export const isDataFormat = (format: string): format is DataFormat =>
  (DATA_FORMATS as readonly string[]).includes(format);

/**
 * The data `scope` holds, from the note as read: the things it draws, in the order written, and the links written
 * between them, in theirs, with every kind and property. A view holds its things and its links; with its faded context
 * asked for, still only those: the faded rest is a picture's aid, never data.
 */
export function exportedData(reading: NoteReading, scope: ExportScope): ExportedData {
  const g: Graph | undefined = reading.world[scope.graph];
  const view = scope.view === undefined ? {} : { view: scope.view };
  if (!g || scope.empty) return { graph: scope.graph, ...view, things: [], links: [] };
  const fadedThings = new Set(scope.faded.things),
    fadedLinks = new Set(scope.faded.links);
  const things: DataThing[] = scope.drawing.boxes.flatMap(({ key }): DataThing[] => {
    const node = g.nodes.get(key);
    return node && !fadedThings.has(key) ? [[key, [...node[0]], { ...node[1] }]] : [];
  });
  // the links the whole drawing holds are the graph's links between things it draws, in order (drawing.ts); a view's
  // are some of them, by their number there
  const base = reading.graphs.get(scope.graph);
  const drawn = new Set((base ?? scope.drawing).boxes.map((b) => b.key));
  const written = g.edges.filter(([from, , to]) => drawn.has(from) && drawn.has(to));
  const numbers = scope.linksAt ?? written.map((_, i) => i);
  const links: DataLink[] = numbers.flatMap((i): DataLink[] => {
    const e = written[i];
    return e && !fadedLinks.has(i) ? [[e[0], e[1], e[2], { ...e[3] }]] : [];
  });
  return { graph: scope.graph, ...view, things, links };
}

/** The data written in `format`: a GQL block, a CSV table or a GraphML document. Throws, saying why, where it cannot be. */
export function dataText(data: ExportedData, format: DataFormat, info: DataInfo): string {
  if (format === 'gql') return gqlBlock(data, info);
  if (format === 'csv') return csvText(data);
  if (format === 'graphml') return graphmlText(data, info);
  throw new Error(`${String(format)} is not a format the data is exported in: ${DATA_FORMATS.join(', ')}`);
}
