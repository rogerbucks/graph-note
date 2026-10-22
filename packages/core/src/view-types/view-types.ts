// The view types drawn straight as marks (editor spec §36, view_types_offered; workstream V2). Each is a pure function
// from a graph's shape and a space to drawing marks (drawing-marks.ts). None is laid out by Graphviz, so none is a
// style graph's diagram type (style-graph.ts). The core adds each through the plug-in interface (core-diagrams.ts).
import type { DrawMark } from '../drawing-marks.ts';
import type { DiagramGiven } from '../plugin-diagrams.ts';
import { blockMarks } from './block-view.ts';
import { centroidMarks } from './centroid-view.ts';
import { chordMarks } from './chord-view.ts';
import { containmentMarks } from './containment-view.ts';
import { densityMarks } from './density-view.ts';
import { egoMarks } from './ego-view.ts';
import { forceMarks } from './force-view.ts';
import { matrixMarks } from './matrix-view.ts';
import { planMarks } from './plan-view.ts';
import { treemapMarks } from './treemap-view.ts';

/** The view types drawn as marks, in the order they are offered. */
export const VIEW_TYPES = [
  'matrix',
  'treemap',
  'chord',
  'ego',
  'force',
  'density',
  'block',
  'plan',
  'centroid',
  'containment',
] as const;
/** One view type drawn as marks. */
export type ViewType = (typeof VIEW_TYPES)[number];

/** What draws each view type. */
export const VIEW_DRAWERS: Record<ViewType, (given: DiagramGiven) => DrawMark[]> = {
  matrix: matrixMarks,
  treemap: treemapMarks,
  chord: chordMarks,
  ego: (given) => egoMarks(given),
  force: (given) => forceMarks(given),
  density: (given) => densityMarks(given),
  block: blockMarks,
  plan: planMarks,
  centroid: centroidMarks,
  containment: containmentMarks,
};
