// A view's card (spec §7): the strip under the bar — the view in plain English, Fade others or Hide others, which writes
// the choice in the style graph (fade_or_hide_in_style), and Save as shown (view_saved_as_shown); the legend of the
// colours its looks use, each with what it means (styling_keeps_locked_rules); and, on the drawing, what is outside the
// view faded, and each look drawn in the locked style's own blend of its hue (styled_paths_and_views).
import { hueColour } from '@graph-note/core';
import type { LegendEntry, Outside, ThingLook, View } from '@graph-note/core';
import { button } from './view-bar';

/** What a drawing shown as a view is given, beyond a plain drawing's options. */
export interface ViewShown {
  name: string;
  /** The view in plain English. */
  reading: string;
  outside: Outside;
  /** What is outside the view, when it is faded rather than hidden: its things, and its links by index. */
  faded: { things: string[]; links: number[] };
  /** Each look the style gives, by thing and by link index. */
  looks: { things: Map<string, ThingLook>; links: Map<number, ThingLook> };
  legend: LegendEntry[];
  /** How the view was saved as shown, to show it so again. */
  shown?: { zoom?: number; x?: number; y?: number; selected?: string };
  /** Writes the choice of what is outside the view into the style graph. */
  setOutside: (outside: Outside) => void;
  /** Writes how the view is shown now into the style graph. */
  saveShown: (view: View, selected: string | null) => void;
}

/** The strip under the bar, and the legend. `now` gives how the drawing is shown, and what is selected. */
export function renderViewStrip(
  root: HTMLElement,
  v: ViewShown,
  now: () => { view: View; selected: string | null },
): void {
  const strip = root.createDiv({ cls: 'graph-note-view-strip' });
  strip.createSpan({ cls: 'graph-note-view-reading', text: `View ${v.name}: ${v.reading}` });
  const other: Outside = v.outside === 'fade' ? 'hide' : 'fade';
  button(strip, other === 'hide' ? 'Hide others' : 'Fade others', other === 'hide' ? 'eye-off' : 'eye', () =>
    v.setOutside(other),
  );
  button(strip, 'Save as shown', 'bookmark', () => {
    const { view, selected } = now();
    v.saveShown(view, selected);
  });
  if (!v.legend.length) return;
  const legend = root.createEl('ul', { cls: 'graph-note-legend', attr: { 'aria-label': 'Legend' } });
  for (const e of v.legend) {
    const li = legend.createEl('li');
    li.createSpan({ cls: 'graph-note-swatch' }).setCssProps({ '--graph-note-swatch': hueColour(e.colour, 'line') });
    li.createSpan({ text: e.means });
  }
}

const lookClasses = (g: SVGElement, look: ThingLook | undefined) => {
  if (!look) return;
  g.classList.add('graph-note-look');
  if (look.line) g.classList.add(`graph-note-line-${look.line}`);
  if (look.format) g.classList.add(`graph-note-format-${look.format}`);
  if (look.hue)
    g.setCssProps({
      '--graph-note-look-line': hueColour(look.hue, 'line'),
      '--graph-note-look-label': hueColour(look.hue, 'label'),
    });
};

/** Marks the drawing as the view says: what is outside it faded, and each look drawn. */
export function markView(svg: SVGSVGElement, v: ViewShown): void {
  const faded = new Set(v.faded.things),
    fadedLinks = new Set(v.faded.links.map(String));
  for (const g of Array.from(svg.querySelectorAll<SVGGElement>('g.node'))) {
    const key = g.getAttribute('data-key') ?? '';
    g.classList.toggle('graph-note-faded', faded.has(key));
    lookClasses(g, v.looks.things.get(key));
  }
  for (const g of Array.from(svg.querySelectorAll<SVGGElement>('g.edge[data-link]'))) {
    const n = g.getAttribute('data-link') ?? '';
    g.classList.toggle('graph-note-faded', fadedLinks.has(n));
    lookClasses(g, v.looks.links.get(Number(n)));
  }
}
