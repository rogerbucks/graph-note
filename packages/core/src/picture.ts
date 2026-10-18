// A picture on a box (editor spec §18, animated_image_shown): where its style asks, a thing's image is drawn on its box.
// A Picture in the style graph, `(p1:Picture {property: 'photo', kind: 'Cat'})`, names the property that holds the image
// (a link to an image attached in the vault, image-links.ts), for every thing of a kind or one thing, in the whole graph
// or a view; the most particular Picture for a box decides, as a Show does (inline-properties.ts). The layout source
// keeps room for it: a fixed cell at the top of the box's label, filled with `PICTURE_MARK`, which Graphviz draws as one
// square the host finds and fills with the image, or an export embeds it in (export-pictures.ts). The Python library
// keeps the same room (`graphspec/style/picture.py`), held to this byte for byte.
import type { Graph } from '@thoughtknot/graph-spec';
import { STYLE } from './layout.ts';
import type { GraphDrawing, Problem } from './note-reading.ts';
import type { RawThing, StyledNames } from './style-checks.ts';
import type { Picture, StyleGraph } from './style-graph.ts';
import { reader } from './style-reader.ts';

/** The side of the square kept for a picture, in Graphviz's points. */
export const PICTURE_SIZE = 48;

/** The colour the square kept for a picture is filled with: one no theme gives, so the host finds it and only it. */
export const PICTURE_MARK = '#0005fe';

/** What a Picture is for: one kind, or one thing. */
export const PICTURE_FOR = 'a Picture is for one kind or one thing';

/** A box drawn with a picture: its index among the drawing's boxes, its key, and the property and value naming the image. */
export interface PictureBox {
  index: number;
  key: string;
  property: string;
  value: string;
}

/**
 * A Picture, checked: the property that holds the image, of the kind's things or of the thing it names, which the graph
 * has; in a view when it names one, whose name is the user's own.
 */
export function pictureOf(raw: RawThing, names: StyledNames, out: Problem[]): Picture | null {
  const r = reader(raw, names, out),
    before = out.length;
  const has = (k: string) => raw.props[k] !== undefined;
  const targets = ['kind', 'thing'].filter(has).length;
  if (!has('property')) r.missing('a Picture names the property that holds its image', "add property: '<name>'");
  else if (targets > 1) r.report(PICTURE_FOR, 'remove one of them');
  else if (!targets) r.missing(PICTURE_FOR, "add kind: '<Kind>' or thing: '<id>'");
  else {
    const kind = r.name('kind', names.kinds, 'a kind'),
      thing = r.name('thing', names.things, 'a thing', 'the id of a thing');
    const of = kind ? { kind } : thing ? { thing } : null;
    if (of) {
      const property = r.name(
        'property',
        names.properties(of),
        `a property of ${kind ?? thing ?? ''}`,
        'a property it has',
      );
      const view = r.text('view');
      if (property && out.length === before)
        return { property, ...of, ...(view === undefined ? {} : { view }), at: raw.at };
    }
  }
  return null;
}

/**
 * The Picture that decides a box's picture in `view`: of those for its thing or one of its kinds, in scope, the most
 * particular — one for the view over one for the whole graph, then one for the thing over one for its kind — and the
 * first written of two as particular; undefined when none is for it.
 */
export function pictureFor(
  pictures: readonly Picture[],
  view: string | undefined,
  key: string,
  kinds: readonly string[],
): Picture | undefined {
  let chosen: { p: Picture; rank: number } | undefined;
  for (const p of pictures) {
    if (p.view !== undefined && p.view !== view) continue;
    if (p.thing !== undefined ? p.thing !== key : p.kind === undefined || !kinds.includes(p.kind)) continue;
    const rank = (p.view !== undefined ? 2 : 0) + (p.thing !== undefined ? 1 : 0);
    if (!chosen || rank > chosen.rank) chosen = { p, rank };
  }
  return chosen?.p;
}

/**
 * The boxes of `drawing` drawn with a picture in `view` (none: the whole graph), in the order drawn: each whose Picture's
 * property holds text in `g`, the graph as read. Whatever the text names, room is kept, and the host says what it holds;
 * a value that is not text draws none. Empty when the style graph holds no Picture.
 */
export function picturesFor(
  drawing: Pick<GraphDrawing, 'boxes'>,
  g: Graph,
  style: Pick<StyleGraph, 'pictures'>,
  view?: string,
): PictureBox[] {
  if (!style.pictures.length) return [];
  return drawing.boxes.flatMap((b, index) => {
    const p = pictureFor(style.pictures, view, b.key, b.kind ? b.kind.split(' · ') : []);
    const value = p ? g.p(b.key)[p.property] : undefined;
    return p && typeof value === 'string' ? [{ index, key: b.key, property: p.property, value }] : [];
  });
}

/** How a box's line opens its label, a table: `  "<key>" [label=<<table `. */
const BOX_LABEL = '[label=<<table ';

/** The row kept for a picture: a fixed square, marked, then the gap a kind caption has below it. */
const ROW =
  `<tr><td fixedsize="true" width="${PICTURE_SIZE}" height="${PICTURE_SIZE}" bgcolor="${PICTURE_MARK}"></td></tr>` +
  `<tr><td cellpadding="0" height="${STYLE.caption_gap}"></td></tr>`;

/**
 * The Graphviz source `dot` with room kept for each picture of `pictures`: its box's label opened by the marked square and
 * a gap, above the kind caption and the text. With none, `dot` unchanged.
 */
export function pictureSource(dot: string, pictures: readonly Pick<PictureBox, 'key'>[] | undefined): string {
  if (!pictures?.length) return dot;
  const opens = new Set(pictures.map((p) => `  "${p.key}" ${BOX_LABEL}`));
  return dot
    .split('\n')
    .map((line) => {
      const at = line.indexOf(BOX_LABEL);
      if (at < 0 || !opens.has(line.slice(0, at + BOX_LABEL.length))) return line;
      const end = line.indexOf('>', at + BOX_LABEL.length) + 1;
      return `${line.slice(0, end)}${ROW}${line.slice(end)}`;
    })
    .join('\n');
}
