// The built-in diagram types as a plug-in (editor spec §43, plugin_interface; §15). Each one registers through the
// plug-in interface, as a plug-in's type does. Each gives back drawing marks (drawing-marks.ts) for a graph's shape:
// - Graphviz lays the shape out as the type, and the engine reads that layout as marks (`engine.marks`).
// - A type the shape does not fit is drawn as a network, as a drawing is (type_stops_fitting), never drawn wrongly.
// - The direction that fits the space best is kept. The marks are shrunk to fit it, never grown.
// - A table is a row for each thing: its text, then its kinds.
// The view still shows Graphviz's own SVG (render.ts). These marks are for a host that draws marks itself.
import { scaledMarks } from './drawing-marks.ts';
import type { DrawMark } from './drawing-marks.ts';
import type { LaidMarks } from './graphviz-marks.ts';
import type { GraphDrawing } from './note-reading.ts';
import type { DiagramGiven, DiagramSpace, PluginDiagram } from './plugin-diagrams.ts';
import { PLUGIN_API } from './plugins.ts';
import type { ThoughtKnotPlugin } from './plugins.ts';
import { directions } from './render.ts';
import { DIAGRAM_TYPES } from './style-graph.ts';
import type { DiagramType } from './style-graph.ts';
import { typePlan } from './types.ts';
import type { GraphShape } from './types-shape.ts';
import { word } from './words.ts';

/** The id the built-in diagram types are added under. */
export const CORE_DIAGRAMS_ID = 'thoughtknot.diagrams';

/** The name a built-in type is drawn by through the plug-in interface, such as `thoughtknot.diagrams.tree`. */
export const coreDiagramType = (type: DiagramType): string => `${CORE_DIAGRAMS_ID}.${type}`;

/** What lays a drawing's source out as marks: the engine (engine.ts). */
export interface MarksEngine {
  marks(source: string): LaidMarks;
}

/** How tall a table's row is, in CSS pixels, when the space has room. */
const ROW = 24;

/** A drawing of `shape` alone, laid out as `plan`: each thing a box, each link read as its type. */
function drawingOf(shape: GraphShape, plan: GraphDrawing['diagram']): GraphDrawing {
  return {
    graph: 'diagram',
    boxes: shape.things.map((t) => ({ key: t.key, kind: t.kinds.join('.'), text: t.text })),
    links: shape.links.map((l) => ({ from: l.from, type: l.type, reading: l.type, to: l.to })),
    estimates: [],
    ...(plan ? { diagram: plan } : {}),
  };
}

/** How much `laid` is shrunk to fit `space`: never more than its own size. */
const fitOf = (laid: DiagramSpace, space: DiagramSpace) =>
  Math.min(1, space.width / Math.max(laid.width, 1), space.height / Math.max(laid.height, 1));

/** The marks Graphviz lays `shape` out with as `type`, in the direction that fits `space` best, shrunk to fit it. */
function laidOut(engine: MarksEngine, type: DiagramType, { shape, space }: DiagramGiven): DrawMark[] {
  const fit = typePlan(type, shape);
  const drawing = drawingOf(shape, 'plan' in fit ? fit.plan : undefined);
  const laid = directions(drawing).map((d) => engine.marks(d.dot));
  const best = laid.reduce((a, b) => (fitOf(b.space, space) > fitOf(a.space, space) ? b : a));
  // a little under the fit, so rounding never puts a mark a hair outside the space
  const k = fitOf(best.space, space) * (1 - 1e-9);
  return k < 1 ? scaledMarks(best.marks, k) : best.marks;
}

/** A table of `shape`: a row for each thing, its text then its kinds, each row a box in its kind's colour. */
function tableMarks({ shape, space }: DiagramGiven): DrawMark[] {
  const kinds = [...new Set(shape.things.map((t) => t.kinds.join('.')))];
  const h = Math.min(ROW, space.height / Math.max(shape.things.length, 1));
  const half = space.width / 2;
  return shape.things.flatMap((t, i): DrawMark[] => {
    const kind = kinds.indexOf(t.kinds.join('.'));
    const y = i * h,
      size = h / 2;
    const cell = {
      kind: 'label' as const,
      y: y + h * 0.65,
      size,
      anchor: 'start' as const,
      maxWidth: half - 8,
      of: t.key,
    };
    return [
      {
        id: t.key,
        of: t.key,
        style: `kind.${kind}`,
        kind: 'box',
        x: 0,
        y,
        width: space.width,
        height: h,
        role: 'thing',
      },
      { ...cell, id: `${t.key}.label`, style: 'text', x: 4, text: t.text },
      { ...cell, id: `${t.key}.kinds`, style: 'text.muted', x: half + 4, text: t.kinds.join(', ') },
    ];
  });
}

/**
 * The built-in diagram types, added through the plug-in interface as any plug-in's are (plugin_interface). `engine`
 * lays the Graphviz types out. Each type's title is said in the reader's language as it is added.
 */
export function coreDiagrams(engine: MarksEngine): ThoughtKnotPlugin {
  const drawer = (type: DiagramType): PluginDiagram['draw'] =>
    type === 'table' ? tableMarks : (given) => laidOut(engine, type, given);
  return {
    id: CORE_DIAGRAMS_ID,
    version: '1.0.0',
    api: PLUGIN_API,
    uses: ['diagrams'],
    register: (points) => {
      for (const type of DIAGRAM_TYPES)
        points.diagrams?.add({ type: coreDiagramType(type), title: word(`type.${type}`), draw: drawer(type) });
    },
  };
}
