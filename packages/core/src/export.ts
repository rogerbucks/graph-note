// Exporting a drawing as an image (editor spec §16): an SVG laid out by the layout the host hands in — the one its drawings
// go through, apart from the interface and under its limits (layout_contained) — in the fixed colours of the light or the
// dark theme as chosen, inside a frame that gives its title, its legend, and the note and day it came from
// (export_self_explaining, export_fixed_theme). The host draws the SVG onto a canvas for a PNG, at the size `pngSize`
// gives (export_png_sharp), and writes the file; what to export is in export-scope.ts, whether to is in export-plan.ts.
import GraphLayout from '@graph-note/graph-spec/src/graph-layout.js';
import { marked } from './export-marks.ts';
import type { Marks } from './export-marks.ts';
import { framed, saidDate } from './export-frame.ts';
import type { LegendItem } from './export-frame.ts';
import type { ExportScope } from './export-scope.ts';
import { layoutSource, STYLE } from './layout.ts';
import type { Refusal } from './layout-limits.ts';
import type { GraphDrawing } from './note-reading.ts';
import { PALETTES } from './palette.ts';
import type { Palette } from './palette.ts';
import { chosen, directions } from './render.ts';
import type { Drawn, Engine } from './render.ts';
import type { ExportTheme } from './settings.ts';
import { legendOf, lookOf } from './style.ts';
import type { StyleGraph, ThingLook } from './style-graph.ts';
import { nudgedDrawing } from './style-source.ts';
import { hueColour } from './theme.ts';

/** The formats an image is offered in (export_formats). */
export const EXPORT_FORMATS = ['svg', 'png'] as const;

/** One of the formats an image is offered in. */
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

/** The least scale a PNG is drawn at: twice natural size, so its text stays sharp (export_png_sharp). */
export const PNG_MIN_SCALE = 2;

/** The pixel size a PNG is drawn at, and the scale it comes from. */
export interface PngSize {
  scale: number;
  width: number;
  height: number;
}

/**
 * The size of the PNG for an image `width` by `height` in CSS pixels: the scale asked for, never less than twice natural
 * size (a missing or odd scale is twice), and whole pixels, rounded up so nothing is cut off.
 */
export function pngSize(width: number, height: number, scale: number = PNG_MIN_SCALE): PngSize {
  const s = typeof scale === 'number' && Number.isFinite(scale) ? Math.max(PNG_MIN_SCALE, scale) : PNG_MIN_SCALE;
  return { scale: s, width: Math.ceil(width * s), height: Math.ceil(height * s) };
}

/** What an image says about where it came from, and how it is drawn. */
export interface ExportInfo {
  /** The note's path in the vault, as the footer says it. */
  note: string;
  /** The day exported, `YYYY-MM-DD`. */
  date: string;
  /** The fixed colours it is drawn in. */
  theme: ExportTheme;
  /** The graph's style, for a view's looks and legend and for the nudges that lay the drawing out; none is the locked style. */
  style?: StyleGraph;
}

/** An exported image: the SVG text, and its size in CSS pixels. */
export interface ExportImage {
  svg: string;
  width: number;
  height: number;
}

const chip = (hue: string, p: Palette): Pick<LegendItem, 'fill' | 'stroke'> => ({
  fill: hueColour(hue, 'fill', p),
  stroke: hueColour(hue, 'line', p),
});

/** The legend: each kind as the drawing colours it, then each colour a look uses in the view with what it means. */
function legendItems(scope: ExportScope, style: StyleGraph | undefined, p: Palette): LegendItem[] {
  const kinds = layoutSource(scope.drawing, 'LR').kinds,
    hues = GraphLayout.pick(kinds, STYLE.kind_hues, STYLE.kind_colours);
  const looks = style && scope.view !== undefined ? legendOf(style, { view: scope.view }) : [];
  return [
    ...kinds.map((kind) => ({ label: kind, ...chip(hues[kind] ?? '', p) })),
    ...looks.map((e) => ({
      label: e.means,
      fill: hueColour(e.colour, 'line', p),
      stroke: hueColour(e.colour, 'line', p),
    })),
  ];
}

/** What a view's looks do to the things and links drawn; none outside a view, where the locked style is kept. */
function looksOf(scope: ExportScope, style: StyleGraph | undefined): Marks['looks'] {
  const looks: Marks['looks'] = { things: new Map(), links: new Map() };
  if (!style || scope.view === undefined) return looks;
  const where = { view: scope.view },
    some = (look: ThingLook) => Object.keys(look).length > 0;
  for (const b of scope.drawing.boxes) {
    const look = lookOf(style, where, { thing: b.key, kind: b.kind });
    if (some(look)) looks.things.set(b.key, look);
  }
  scope.drawing.links.forEach((l, i) => {
    const look = lookOf(style, where, { link: { from: l.from, type: l.type, to: l.to } });
    if (some(look)) looks.links.set(i, look);
  });
  return looks;
}

/** The line at the foot of an exported image, saying which note it is from (its path in the vault) and the day (`YYYY-MM-DD`). */
export const footerText = (note: string, date: string) => `From ${note}, exported ${saidDate(date)}`;

/** The first letter capital, as a reading begins a sentence. */
const sentence = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * A host's layout, the one it draws with: the drawing laid out and themed in the fixed palette of `theme`; or why it is
 * not laid out (over a size limit, or took too long); or null when it is no longer wanted. Rejects when the engine fails.
 */
export type ExportLayout = (drawing: GraphDrawing, theme: ExportTheme) => Promise<Drawn | Refusal | null>;

const refuseEmpty = (scope: ExportScope): void => {
  if (scope.empty) throw new Error(`There is nothing to export: ${scope.why ?? 'the scope is empty'}`);
};

/** The drawing an export lays out: the scope's, with the style's nudges and direction when it has a style. */
const laidOutDrawing = (scope: ExportScope, info: ExportInfo): GraphDrawing =>
  info.style ? { ...nudgedDrawing(scope.drawing, info.style), nudges: info.style.nudges } : scope.drawing;

/**
 * The image of `scope`, laid out by `engine` and drawn in the fixed colours of `info.theme`, in its frame. Refuses an empty
 * scope, which has nothing to draw; an engine that fails raises its failure, so nothing is written (failed_export). It
 * lays out on the thread it is called on, under no limit: a host that draws apart from its interface uses
 * `exportWithLayout`, which lays the export out where its drawings are.
 */
export function exportSvg(scope: ExportScope, engine: Engine, info: ExportInfo): ExportImage {
  refuseEmpty(scope);
  const drawing = laidOutDrawing(scope, info);
  const laid = directions(drawing);
  const drawn = chosen(
    laid,
    laid.map((d) => engine.render(d.dot)),
    info.theme === 'dark' ? PALETTES.dark : PALETTES.light,
  );
  return framedImage(scope, drawing, drawn, info);
}

/**
 * The image of `scope` as `exportSvg` gives it, laid out by the host's `layout` — the one its drawings go through, apart
 * from the interface and under the same size and time limits (layout_contained) — so a huge or hostile graph never holds
 * the page for an export. The limit's refusal is given back whole, for the host to say why and write nothing
 * (failed_export); null when the layout is no longer wanted; an engine that fails raises its failure. Refuses an empty
 * scope before any layout is asked for.
 */
export async function exportWithLayout(
  scope: ExportScope,
  layout: ExportLayout,
  info: ExportInfo,
): Promise<ExportImage | Refusal | null> {
  refuseEmpty(scope);
  const drawing = laidOutDrawing(scope, info);
  const drawn = await layout(drawing, info.theme === 'dark' ? 'dark' : 'light');
  return !drawn || 'reason' in drawn ? drawn : framedImage(scope, drawing, drawn, info);
}

/** The drawn graph marked, in its frame, in the fixed colours of `info.theme`. */
function framedImage(scope: ExportScope, drawing: GraphDrawing, drawn: Drawn, info: ExportInfo): ExportImage {
  const palette = info.theme === 'dark' ? PALETTES.dark : PALETTES.light;
  const body = marked(
    drawn.svg,
    drawing.boxes.map((b) => b.key),
    { faded: scope.faded, looks: looksOf(scope, info.style) },
    palette,
  );
  const view = scope.view !== undefined;
  const subtitle = view
    ? sentence(scope.reading ?? '') + (scope.context ? ' (the rest of the graph is faded)' : '')
    : undefined;
  const image = framed(
    { svg: body, width: drawn.width, height: drawn.height },
    {
      title: view ? `${scope.graph} · view ${scope.view}` : scope.graph,
      ...(subtitle ? { subtitle } : {}),
      legend: legendItems(scope, info.style, palette),
      footer: footerText(info.note, info.date),
    },
    palette,
  );
  // a theme variable or a blend in a colour would read as black or nothing outside Obsidian: never let one out
  if (/(?:style|fill|stroke)="[^"]*(?:var\(--|color-mix\()/.test(image.svg))
    throw new Error(
      'the image still has a theme variable in its colours, so it would not read the same outside Obsidian',
    );
  return image;
}
