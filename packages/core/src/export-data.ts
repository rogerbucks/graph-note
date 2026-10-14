// Exporting the data (editor spec §16, export_data_formats, export_lossless): the things an export holds and the links
// written between them, as the reader read them, and that data written as a GQL block, as CSV or as GraphML, each of
// which reads back into the very things and links exported. Only what is written is data: a schema's own things are
// never drawn and never exported, and a guess (an estimated link) is the drawing's, never the note's. No layout is
// asked for, so a graph too large to draw is still exported whole. The `///` notes on its things and links are kept
// where the format has comments, a GQL block and GraphML, and left out of CSV, which has none (§24, note_standard).
import type { Graph } from '@graph-note/graph-spec';
import { csvText } from './export-data-csv.ts';
import { gqlBlock } from './export-data-gql.ts';
import { graphmlText } from './export-data-graphml.ts';
import type { DataInfo, DataLink, DataThing, ExportedData } from './export-data-model.ts';
import type { ExportScope } from './export-scope.ts';
import type { GraphDrawing, NoteReading } from './note-reading.ts';

/** The formats the data is offered in (export_data_formats): a GQL block, CSV and GraphML. */
export const DATA_FORMATS = ['gql', 'csv', 'graphml'] as const;

/** One of the formats the data is offered in. */
export type DataFormat = (typeof DATA_FORMATS)[number];

/** Whether `format` is one the data is offered in, rather than an image's. */
export const isDataFormat = (format: string): format is DataFormat =>
  (DATA_FORMATS as readonly string[]).includes(format);

/**
 * The data `scope` holds, from the note as read: the things it draws, in the order written, and the links written
 * between them, in theirs, with every kind and property. A view holds its things and its links, and nothing outside it
 * (view_export_stays_view) unless its faded context is asked for: then the whole graph, with what is outside the view
 * listed in `faded`, for each format to mark. Each thing's and link's note is in `notes` (note_standard), for each
 * format with comments to keep.
 */
export function exportedData(reading: NoteReading, scope: ExportScope): ExportedData {
  const g: Graph | undefined = reading.world[scope.graph];
  const view = scope.view === undefined ? {} : { view: scope.view };
  if (!g || scope.empty) return { graph: scope.graph, ...view, things: [], links: [] };
  const things: DataThing[] = scope.drawing.boxes.flatMap(({ key }): DataThing[] => {
    const node = g.nodes.get(key);
    return node ? [[key, [...node[0]], { ...node[1] }]] : [];
  });
  // the links the whole drawing holds are the graph's links between things it draws, in order (drawing.ts); a view's
  // are some of them, by their number there
  const base = reading.graphs.get(scope.graph);
  const drawn = new Set((base ?? scope.drawing).boxes.map((b) => b.key));
  const written = g.edges.filter(([from, , to]) => drawn.has(from) && drawn.has(to));
  const numbers = (scope.linksAt ?? written.map((_, i) => i)).filter((i) => written[i] !== undefined);
  const links: DataLink[] = numbers.flatMap((i): DataLink[] => {
    const e = written[i];
    return e ? [[e[0], e[1], e[2], { ...e[3] }]] : [];
  });
  const notes = notesOf(things, base ?? scope.drawing, numbers);
  if (!scope.context) return { graph: scope.graph, ...view, things, links, ...notes };
  // the context holds every link written, so a link's number in the scope's faded list is its place here; the numbers
  // past them are the drawing's guesses, never data
  const kept = new Set(things.map(([id]) => id));
  const faded = {
    things: scope.faded.things.filter((id) => kept.has(id)),
    links: scope.faded.links.filter((i) => i < links.length),
  };
  return { graph: scope.graph, ...view, things, links, faded, ...notes };
}

/** The notes of the things and links exported, as the reader put them on the boxes and links of the whole drawing
 * (notes.ts): a written link's note is on the drawn link at its place, `numbers` saying which written link each
 * exported one is. Nothing when none of them has a note. */
function notesOf(things: DataThing[], whole: GraphDrawing, numbers: number[]): Pick<ExportedData, 'notes'> {
  const noted = new Map(whole.boxes.flatMap((b) => (b.note ? [[b.key, b.note.text] as const] : [])));
  const notes = {
    things: things.flatMap(([id]): [string, string][] => {
      const text = noted.get(id);
      return text === undefined ? [] : [[id, text]];
    }),
    links: numbers.flatMap((i, at): [number, string][] => {
      const text = whole.links[i]?.note?.text;
      return text === undefined ? [] : [[at, text]];
    }),
  };
  return notes.things.length || notes.links.length ? { notes } : {};
}

/** The data written in `format`: a GQL block, a CSV table or a GraphML document. Throws, saying why, where it cannot be. */
export function dataText(data: ExportedData, format: DataFormat, info: DataInfo): string {
  if (format === 'gql') return gqlBlock(data, info);
  if (format === 'csv') return csvText(data);
  if (format === 'graphml') return graphmlText(data, info);
  throw new Error(`${String(format)} is not a format the data is exported in: ${DATA_FORMATS.join(', ')}`);
}
