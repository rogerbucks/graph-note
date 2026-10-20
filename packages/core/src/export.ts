// Exporting a drawing as an image (editor spec §16). It is an SVG laid out by the layout the host hands in. That is the
// one its drawings go through, apart from the interface and under its limits (layout_contained). It is drawn in the
// fixed colours of the light or the dark theme as chosen (export_fixed_theme). A frame gives its title, its legend, and
// the note and day it came from (export_self_explaining). The host draws the SVG onto a canvas for a PNG. It uses the
// size `pngSize` gives (export_png_sharp), and writes the file. What to export is in export-scope.ts. Whether to is in
// export-plan.ts.
import GraphLayout from '@thoughtknot/graph-spec/src/graph-layout.js';
import type { Graph } from '@thoughtknot/graph-spec';
import { marked } from './export-marks.ts';
import type { Marks } from './export-marks.ts';
import { withFlow, withRunners } from './export-motion.ts';
import { animationSaid, withPictures, withStillPictures } from './export-pictures.ts';
import type { PictureLoad, PictureLoaded } from './export-pictures.ts';
import { flowLegend, reversedLinks } from './link-flow.ts';
import { PATH_LEGEND, animationFits, pathBody, pathPlan, pathSubtitle, withPath } from './path-animation.ts';
import type { Device, ExportWalk, TooLargeToAnimate } from './path-animation.ts';
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
import { lookTag, lookTags } from './look-tags.ts';
import { legendOf, lookOf } from './style.ts';
import type { StyleGraph, ThingLook } from './style-graph.ts';
import { styledDrawing } from './style-source.ts';
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
 * The size of the PNG for an image `width` by `height` in CSS pixels. It is the scale asked for, never less than twice
 * natural size. A missing or odd scale is twice. It is whole pixels, rounded up so nothing is cut off.
 */
export function pngSize(width: number, height: number, scale: number = PNG_MIN_SCALE): PngSize {
  const s = typeof scale === 'number' && Number.isFinite(scale) ? Math.max(PNG_MIN_SCALE, scale) : PNG_MIN_SCALE;
  return { scale: s, width: Math.ceil(width * s), height: Math.ceil(height * s) };
}

/**
 * What an image says about where it came from, and how it is drawn. A style comes with the graph as read. So the
 * properties it shows inline always have their values. One without the other is a type error. It is never a drawing
 * that quietly leaves its properties out.
 */
export type ExportInfo = {
  /** The note's path in the vault, as the footer says it. */
  note: string;
  /** The day exported, `YYYY-MM-DD`. */
  date: string;
  /** The fixed colours it is drawn in. */
  theme: ExportTheme;
  /**
   * Whether the image may move (§7). An SVG moves the links its style moves, and is still under reduced motion. A PNG
   * is drawn from a still image. Still unless set.
   */
  motion?: boolean;
  /**
   * A path played into the image (§7, path_animation_export). It is an animated SVG. Its heavier outline moves from
   * step to step at its pace, every step numbered, still under reduced motion.
   */
  walk?: ExportWalk;
  /** Where it is made, for the size an animated SVG may be (animation_export_fits); a computer when not said. */
  device?: Device;
  /**
   * The host's loader of the images on boxes (§18, export-pictures.ts), each embedded in the file; without it each picture
   * is a frame. Only `exportWithLayout` loads them.
   */
  pictures?: PictureLoad;
} & (
  | { style?: undefined; data?: undefined }
  | {
      /** The graph's style, for a view's looks and legend, the nudges, arrowheads and properties it draws with. */
      style: StyleGraph;
      /** The graph as read (`reading.world[graph]`), for the values of the properties its style shows inline. */
      data: Graph;
    }
);

/** An exported image: the SVG text, and its size in CSS pixels. */
export interface ExportImage {
  svg: string;
  width: number;
  height: number;
  /** What was done with each animated image on a box, and why a picture was not drawn, a line each (export_animation_stated). */
  animation?: string[];
}

const chip = (hue: string, p: Palette): Pick<LegendItem, 'fill' | 'stroke'> => ({
  fill: hueColour(hue, 'fill', p),
  stroke: hueColour(hue, 'line', p),
});

/**
 * The legend. First comes each kind as the drawing colours it. Then each colour a look uses in the view, with what it
 * means. Then each way a link moves, with its icon and what it means, so a still image says it too (motion_not_alone).
 */
function legendItems(scope: ExportScope, drawing: GraphDrawing, info: ExportInfo, p: Palette) {
  const { style, walk } = info;
  const kinds = layoutSource(scope.drawing, 'LR').kinds,
    hues = GraphLayout.pick(kinds, STYLE.kind_hues, STYLE.kind_colours);
  const looks = style && scope.view !== undefined ? legendOf(style, { view: scope.view }) : [];
  const items: LegendItem[] = [
    ...kinds.map((kind) => ({ label: kind, ...chip(hues[kind] ?? '', p) })),
    ...looks.map((e, i) => ({
      label: `${lookTag(i)} ${e.means}`,
      fill: hueColour(e.colour, 'line', p),
      stroke: hueColour(e.colour, 'line', p),
    })),
    ...flowLegend(drawing.flow ?? []).map((e) => ({ label: e.words, fill: p.page ?? 'none', stroke: p.text })),
    ...(walk ? [{ label: PATH_LEGEND, fill: p.page ?? 'none', stroke: p.text }] : []),
  ];
  return items;
}

/** Why an animated SVG of `info`'s path is too large for its device, before anything is laid out; null when it fits. */
const tooLarge = (drawing: GraphDrawing, info: ExportInfo): TooLargeToAnimate | null =>
  info.walk
    ? animationFits(
        { steps: info.walk.path.steps.length, things: drawing.boxes.length, links: drawing.links.length },
        info.device ?? 'desktop',
      )
    : null;

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
 * A host's layout, the one it draws with. It gives the drawing laid out and themed in the fixed palette of `theme`. Or
 * it gives why it is not laid out (over a size limit, or took too long). Or it gives null when it is no longer wanted.
 * Rejects when the engine fails.
 */
export type ExportLayout = (drawing: GraphDrawing, theme: ExportTheme) => Promise<Drawn | Refusal | null>;

const refuseEmpty = (scope: ExportScope): void => {
  if (scope.empty) throw new Error(`There is nothing to export: ${scope.why ?? 'the scope is empty'}`);
};

/**
 * The drawing an export lays out. It is the scope's, styled as its view or the whole graph is when it has a style. That
 * style gives its nudges and direction, the arrowheads it hides and the properties it shows inline (§14, §15).
 */
const laidOutDrawing = (scope: ExportScope, info: ExportInfo): GraphDrawing =>
  info.style ? styledDrawing(scope.drawing, info.style, info.data, scope.view) : scope.drawing;

/**
 * The image of `scope`, laid out by `engine` and drawn in the fixed colours of `info.theme`, in its frame. Refuses an empty
 * scope, which has nothing to draw. An engine that fails raises its failure, so nothing is written (failed_export). It
 * lays out on the thread it is called on, under no limit. A host that draws apart from its interface uses
 * `exportWithLayout`, which lays the export out where its drawings are.
 */
export function exportSvg(scope: ExportScope, engine: Engine, info: ExportInfo): ExportImage {
  refuseEmpty(scope);
  const drawing = laidOutDrawing(scope, info);
  const large = tooLarge(drawing, info);
  if (large) throw new Error(`The animated SVG was not made: ${large.why}. ${sentence(large.fix)}.`);
  const laid = directions(drawing);
  const drawn = chosen(
    laid,
    laid.map((d) => engine.render(d.dot)),
    info.theme === 'dark' ? PALETTES.dark : PALETTES.light,
  );
  return framedImage(scope, drawing, drawn, info);
}

/**
 * The image of `scope` as `exportSvg` gives it, laid out by the host's `layout`. That is the one its drawings go
 * through, apart from the interface and under the same size and time limits (layout_contained). So a huge or hostile
 * graph never holds the page for an export. The limit's refusal is given back whole (failed_export). The host then says
 * why and writes nothing. Gives null when the layout is no longer wanted. An engine that fails raises its failure.
 * Refuses an empty scope before any layout is asked for. A played path may be too large to animate on its device. Then
 * it gives back why, and what would make it fit, also before any layout (animation_export_fits).
 */
export async function exportWithLayout(
  scope: ExportScope,
  layout: ExportLayout,
  info: ExportInfo,
): Promise<ExportImage | Refusal | TooLargeToAnimate | null> {
  refuseEmpty(scope);
  const drawing = laidOutDrawing(scope, info);
  const large = tooLarge(drawing, info);
  if (large) return large;
  const drawn = await layout(drawing, info.theme === 'dark' ? 'dark' : 'light');
  if (!drawn || 'reason' in drawn) return drawn;
  const load = info.pictures,
    loaded = load ? await Promise.all((drawing.pictures ?? []).map((p) => load(p.value))) : [];
  return framedImage(scope, drawing, drawn, info, loaded);
}

/** The drawn graph marked, in its frame, in the fixed colours of `info.theme`, its pictures filled by what was `loaded`. */
function framedImage(
  scope: ExportScope,
  drawing: GraphDrawing,
  drawn: Drawn,
  info: ExportInfo,
  loaded: readonly PictureLoaded[] = [],
): ExportImage {
  const palette = info.theme === 'dark' ? PALETTES.dark : PALETTES.light;
  const flow = info.motion ? (drawing.flow ?? []) : [];
  const { walk } = info;
  const plan = walk && pathPlan(drawing, walk.path, reversedLinks(drawing, drawn.rankdir));
  const looked = marked(
    drawn.svg,
    drawing.boxes.map((b) => b.key),
    {
      faded: scope.faded,
      looks: looksOf(scope, info.style),
      tags: info.style && scope.view !== undefined ? lookTags(legendOf(info.style, { view: scope.view })) : undefined,
    },
    palette,
  );
  // the pictures on boxes embedded, moving in an SVG within their limits, and what was done with each said (§16, §18)
  const pictured = withPictures(looked, drawing, loaded, !!info.motion, palette);
  const body = withRunners(walk && plan ? pathBody(pictured.svg, walk.path, plan, palette) : pictured.svg, flow);
  const view = scope.view !== undefined;
  const viewSaid = view
    ? sentence(scope.reading ?? '') + (scope.context ? ' (the rest of the graph is faded)' : '')
    : undefined;
  const animation = pictured.said.length ? pictured.said : undefined;
  // a played path says it is played, at what pace, and the walk in order, so the image tells it still (motion_not_alone)
  const subtitle = [viewSaid, walk && pathSubtitle(walk), animation && animationSaid(animation).slice(0, -1)]
    .filter(Boolean)
    .join('. ');
  const title = view ? `${scope.graph} · view ${scope.view}` : scope.graph;
  const image: ExportImage = framed(
    { svg: body, width: drawn.width, height: drawn.height },
    {
      title: walk ? `${title} · path ${walk.path.title}` : title,
      ...(subtitle ? { subtitle } : {}),
      legend: legendItems(scope, drawing, info, palette),
      footer: footerText(info.note, info.date),
    },
    palette,
  );
  image.svg = withStillPictures(withFlow(image.svg, flow));
  if (walk && plan) image.svg = withPath(image.svg, plan, walk.pace);
  if (animation) image.animation = animation;
  // a theme variable or a blend in a colour would read as black or nothing outside Obsidian: never let one out
  if (/(?:style|fill|stroke)="[^"]*(?:var\(--|color-mix\()/.test(image.svg))
    throw new Error(
      'the image still has a theme variable in its colours, so it would not read the same outside Obsidian',
    );
  return image;
}
