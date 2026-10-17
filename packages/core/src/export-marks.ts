// Marking a drawn SVG for an export (editor spec §16, §7): what is outside a view faded, and each look drawn. In Obsidian
// both are classes the stylesheet draws; an image cannot take the stylesheet, so here they are written into the SVG itself,
// as the style attribute of the group or shape, in the palette's fixed colours. A look's hue is drawn on the outline only,
// in the locked line blend (theme.ts `hueColour`); text is never recoloured, so its locked contrast holds on any box. Groups are found by Graphviz's numbering, node1,
// node2… and edge1, edge2…, in the order the drawing's things and links were given.
import type { Palette } from './palette.ts';
import type { ThingLook } from './style-graph.ts';
import { hueColour } from './theme.ts';

/** How faded a thing outside the view is drawn: the pane's own opacity (styles.css), so an export matches what was seen. */
export const FADED_OPACITY = 0.35;

/** What to mark: the things and links to fade (the links by edge number), and the looks of things (by key) and links. */
export interface Marks {
  faded: { things: string[]; links: number[] };
  looks: { things: Map<string, ThingLook>; links: Map<number, ThingLook> };
}

const DASHES = { dashed: '6 4', dotted: '2 3' } as const;

/** A tag with these style declarations set: those it has are changed in place, the others added after them. */
function styled(tag: string, set: [string, string][]): string {
  if (!set.length) return tag;
  const had = / style="([^"]*)"/.exec(tag);
  const decls = new Map<string, string>();
  for (const d of (had?.[1] ?? '').split(';')) {
    const at = d.indexOf(':');
    if (at > 0) decls.set(d.slice(0, at).trim(), d.slice(at + 1).trim());
  }
  for (const [name, value] of set) decls.set(name, value);
  const style = ` style="${[...decls].map(([name, value]) => `${name}:${value}`).join(';')}"`;
  if (had) return tag.replace(had[0], () => style);
  return tag.replace(/\s*(\/?)>$/, (_, slash: string) => `${style}${slash}>`);
}

/** The declarations a look sets on a shape (a box or a line) and on a text; an arrowhead is a shape filled in the line's colour. */
function declarations(look: ThingLook, p: Palette, part: 'shape' | 'arrow' | 'text'): [string, string][] {
  const out: [string, string][] = [];
  if (part === 'text') {
    // a look's hue is on the outline only: the text keeps the palette's text colour, so its locked 4.5:1 holds on any box
    if (look.format === 'bold') out.push(['font-weight', 'bold']);
    if (look.format === 'italic') out.push(['font-style', 'italic']);
    return out;
  }
  if (look.hue) {
    if (part === 'arrow') out.push(['fill', hueColour(look.hue, 'line', p)]);
    out.push(['stroke', hueColour(look.hue, 'line', p)]);
  }
  if (look.line === 'bold') out.push(['stroke-width', '3']);
  if (look.line === 'dashed' || look.line === 'dotted') out.push(['stroke-dasharray', DASHES[look.line]]);
  return out;
}

/** The inside of a group with its look drawn. */
function looked(body: string, look: ThingLook, p: Palette, edge: boolean): string {
  return body.replace(/<(path|polygon|ellipse|polyline|text)\b[^>]*>/g, (tag, name: string) =>
    styled(tag, declarations(look, p, name === 'text' ? 'text' : edge && name === 'polygon' ? 'arrow' : 'shape')),
  );
}

/**
 * The SVG with what the view fades and each look drawn. `keys` are the drawing's things in the order they were laid out,
 * so the n-th is `node<n>`. With nothing to mark the SVG is returned as it was.
 */
export function marked(svg: string, keys: readonly string[], marks: Marks, palette: Palette): string {
  const fadedThings = new Set(marks.faded.things),
    fadedLinks = new Set(marks.faded.links);
  if (!fadedThings.size && !fadedLinks.size && !marks.looks.things.size && !marks.looks.links.size) return svg;
  // a linear walk, never a regular expression over the whole SVG, so a hostile drawing cannot make it slow
  let out = '',
    from = 0;
  for (let at = svg.indexOf('<g id="', from); at >= 0; at = svg.indexOf('<g id="', at + 1)) {
    const id = /^(node|edge)(\d+)"/.exec(svg.slice(at + 7, at + 32));
    if (!id) continue;
    const openEnd = svg.indexOf('>', at);
    if (openEnd < 0) break;
    const close = svg.indexOf('</g>', openEnd + 1);
    if (close < 0) break;
    const [, kind, n] = id;
    const pos = Number(n) - 1,
      node = kind === 'node',
      key = keys[pos] ?? '',
      faded = node ? fadedThings.has(key) : fadedLinks.has(pos),
      look = node ? marks.looks.things.get(key) : marks.looks.links.get(pos);
    const open = svg.slice(at, openEnd + 1),
      body = svg.slice(openEnd + 1, close);
    out += `${svg.slice(from, at)}${faded ? styled(open, [['opacity', String(FADED_OPACITY)]]) : open}${look ? looked(body, look, palette, !node) : body}`;
    from = close;
    at = close;
  }
  return out + svg.slice(from);
}
