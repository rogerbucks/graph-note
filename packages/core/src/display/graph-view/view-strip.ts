// A view's card (spec §7). The strip under the bar holds the view in plain language, and Fade others or Hide others.
// That button writes the choice in the style graph (fade_or_hide_in_style). The strip also holds Save as shown
// (view_saved_as_shown). The legend gives the colours its looks use, each with what it means
// (styling_keeps_locked_rules). On the drawing, what is outside the view is faded. Each look is drawn in the locked
// style's own blend of its hue (styled_paths_and_views).
import { hueColour, lookTags, word } from '@thoughtknot/core';
import type { LegendChoice, LegendEntry, Outside, ThingLook, View } from '@thoughtknot/core';
import { button } from '../button';

/** What a drawing shown as a view is given, beyond a plain drawing's options. */
export interface ViewShown {
  name: string;
  /** The view in plain language. */
  reading: string;
  outside: Outside;
  /** What is outside the view, when it is faded rather than hidden: its things, and its links by index. */
  faded: { things: string[]; links: number[] };
  /** Each look the style gives, by thing and by link index. */
  looks: { things: Map<string, ThingLook>; links: Map<number, ThingLook> };
  legend: LegendEntry[];
  /** How the view was saved as shown, to show it so again: its legend's choices among it (§25, untangle_legend). */
  shown?: { zoom?: number; x?: number; y?: number; selected?: string; legend?: readonly LegendChoice[] };
  /** Writes the choice of what is outside the view into the style graph. */
  setOutside: (outside: Outside) => void;
  /** Writes how the view is shown now into the style graph, the legend's choices with it. */
  saveShown: (view: View, selected: string | null, legend: readonly LegendChoice[]) => void;
}

/**
 * The strip under the bar, and the legend. `now` gives how the drawing is shown, what is selected and what the legend
 * that untangles has chosen. Save as shown writes that, and nothing else does.
 */
export function renderViewStrip(
  root: HTMLElement,
  v: ViewShown,
  now: () => { view: View; selected: string | null; legend: readonly LegendChoice[] },
): HTMLElement[] {
  const strip = root.createDiv({ cls: 'thoughtknot-view-strip' });
  strip.createSpan({
    cls: 'thoughtknot-view-reading',
    text: word('strip.reading', { name: v.name, reading: v.reading }),
  });
  const other: Outside = v.outside === 'fade' ? 'hide' : 'fade';
  // the buttons that write the style graph, which a read-only place (reading view) takes away
  const writes = [
    button(strip, word(other === 'hide' ? 'strip.hide' : 'strip.fade'), other === 'hide' ? 'eye-off' : 'eye', () =>
      v.setOutside(other),
    ),
    button(strip, word('strip.save'), 'bookmark', () => {
      const { view, selected, legend } = now();
      v.saveShown(view, selected, legend);
    }),
  ];
  if (!v.legend.length) return writes;
  const legend = root.createEl('ul', { cls: 'thoughtknot-legend', attr: { 'aria-label': word('strip.legend') } });
  const tags = lookTags(v.legend);
  for (const e of v.legend) {
    const li = legend.createEl('li');
    li.createSpan({ cls: 'thoughtknot-swatch' }).setCssProps({ '--thoughtknot-swatch': hueColour(e.colour, 'line') });
    // the tag each box or link of this colour carries, so it is matched without its colour (§44, colour_never_alone)
    li.createSpan({ cls: 'thoughtknot-look-tag', text: `${tags.get(e.colour) ?? ''} ` });
    li.appendText(e.means);
  }
  return writes;
}

/** Adds words to what a screen reader hears of a box or link: never said by colour or fading alone. */
const say = (g: SVGElement, words: string) => {
  const label = g.getAttribute('aria-label');
  if (label && words) g.setAttribute('aria-label', `${label}, ${words}`);
};

const SVG = 'http://www.w3.org/2000/svg';

/** Puts the tag of a look's colour on a box, at its top left, or over a link's label, else by its arrowhead. */
function putTag(g: SVGElement, tag: string, edge: boolean) {
  const nums = (el: Element | null, name: string) =>
    (el?.getAttribute(name) ?? '').match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
  let x: number | undefined, y: number | undefined;
  if (edge) {
    const label = g.querySelector('text');
    [x, y] = label
      ? [nums(label, 'x')[0], (nums(label, 'y')[0] ?? 12) - 12]
      : nums(g.querySelector('polygon'), 'points');
  } else {
    const shape = g.querySelector('path, polygon');
    const all = nums(shape, shape?.tagName.toLowerCase() === 'path' ? 'd' : 'points');
    if (all.length >= 4) {
      x = Math.min(...all.filter((_, i) => i % 2 === 0)) + 4;
      y = Math.min(...all.filter((_, i) => i % 2 === 1)) + 10;
    }
  }
  if (x === undefined || y === undefined) return;
  const mark = g.appendChild(activeDocument.createElementNS(SVG, 'text'));
  mark.setAttribute('class', 'thoughtknot-look-tag');
  mark.setAttribute('x', String(x));
  mark.setAttribute('y', String(y));
  mark.setAttribute('aria-hidden', 'true');
  mark.textContent = tag;
}

const lookClasses = (
  g: SVGElement,
  look: ThingLook | undefined,
  means: Map<string, string>,
  tags: Map<string, string>,
  edge = false,
) => {
  if (!look) return;
  const tag = look.hue ? tags.get(look.hue) : undefined;
  if (tag && !g.querySelector('.thoughtknot-look-tag')) putTag(g, tag, edge);
  if (look.hue) say(g, means.get(look.hue) ?? '');
  g.classList.add('thoughtknot-look');
  if (look.line) g.classList.add(`thoughtknot-line-${look.line}`);
  if (look.format) g.classList.add(`thoughtknot-format-${look.format}`);
  if (look.hue) g.setCssProps({ '--thoughtknot-look-line': hueColour(look.hue, 'line') });
};

/** Marks the drawing as the view says: what is outside it faded, and each look drawn. */
export function markView(svg: SVGSVGElement, v: ViewShown): void {
  const faded = new Set(v.faded.things),
    fadedLinks = new Set(v.faded.links.map(String)),
    means = new Map(v.legend.map((e) => [e.colour, e.means])),
    tags = lookTags(v.legend);
  for (const g of Array.from(svg.querySelectorAll<SVGGElement>('g.node'))) {
    const key = g.getAttribute('data-key') ?? '';
    g.classList.toggle('thoughtknot-faded', faded.has(key));
    if (faded.has(key)) say(g, word('strip.outside'));
    lookClasses(g, v.looks.things.get(key), means, tags);
  }
  for (const g of Array.from(svg.querySelectorAll<SVGGElement>('g.edge[data-link]'))) {
    const n = g.getAttribute('data-link') ?? '';
    g.classList.toggle('thoughtknot-faded', fadedLinks.has(n));
    if (fadedLinks.has(n)) say(g, word('strip.outside'));
    lookClasses(g, v.looks.links.get(Number(n)), means, tags, true);
  }
}
