// The diagram type on a card (spec §15). The strip under the bar says how the graph is drawn. Diagram type lists the
// seven types (diagram_type_set, type_only_when_fits, suggest_type). Each that fits can be chosen, written into the
// style graph. Each that does not comes with why. The one suggested is said so, and never drawn until chosen. A chosen
// type that has stopped fitting is said, with why, and the nearest type that fits offered (type_stops_fitting). A graph
// of more than 1,000 things is offered the table or a view as the way in (large_way_in). The core decides all of it
// (types.ts). A type a plug-in adds is drawn as a picture of the marks that plug-in gave, when one here draws it
// (plugin_diagram_type_named). Otherwise the strip says which plug-in draws it. In reading view a type chosen is only
// looked at: drawn at once, never saved, and said so. Where the note is edited, a type looked at can be kept
// (type_try_reading).
import { chosenDiagram, diagramOffer, tableOf, wayIn, word } from '@thoughtknot/core';
import type {
  DiagramOffer,
  DiagramSpace,
  DiagramTable,
  DiagramType,
  DiagramWrite,
  Drawn,
  GraphDrawing,
  NoteReading,
  Diagram,
  StyleGraph,
} from '@thoughtknot/core';
import type { LeftAt } from '../links/link-types';
import { centreStrip } from './radial-centre';
import { renderTable, tableSize } from './table-view';
import { button } from './view-bar';
import { renderTimelineChoice, timelineChange } from './timeline-choice';
import type { TimelinePick, TimelineShown } from './timeline-choice';
export { TypePlace, typeLeftAt } from './type-place';

/** What a card is given of the diagram types, beyond its drawing. */
export interface DiagramShown extends DiagramOffer {
  /** For a graph of more than 1,000 things: the way in, in words. */
  wayIn: { say: string } | null;
  /** The drawing as a table, when it is drawn as one. */
  table?: DiagramTable;
  /** Writes the type chosen into the style graph: for the graph, or for the view the card shows. */
  choose: (type: DiagramType) => void;
  /** The drawing as a plug-in's diagram type drew it: the core's SVG of its marks, the type and its size. */
  picture?: PluginPicture;
  /** Draws the card as the type chosen, never saving it: for reading view. The saved type puts the card back. */
  look?: (type: DiagramType) => void;
  /** Whether the card is drawn as a type only looked at, not saved. */
  tried?: boolean;
  /** Draws the card as its saved type again. */
  back?: () => void;
  /** Saves the type looked at, as choosing it does. */
  keep?: () => void;
  /** Keeps where the card is, just before its type changes, for the card drawn as the new type (type_keeps_place). */
  leave?: (at: TypeLeftAt) => void;
  /** Where the card was left when its type changed, once; the card drawn as the new type takes it up. */
  kept?: () => TypeLeftAt | undefined;
  /** In a radial drawing: the thing at its centre, its words, and whether it was picked over the usual centre. */
  centre?: { key: string; text: string; picked: boolean };
  /** Puts thing `key` in the centre of the radial drawing, or the usual centre back (null), saved in the style graph. */
  centreOn?: (key: string | null) => void;
  /** As `centreOn`, but only looked at, never saved: for reading view (radial_centre_pick). */
  centreLook?: (key: string | null) => void;
  /** Set by the strip: `centreOn`, the boxes gliding there; false where nothing can be put in the centre (radial_centre_pick). */
  putCentre?: (key: string | null) => boolean;
  /** For a card drawn as a timeline: its order and what it shows, to offer (timeline_choice_card). */
  timeline?: TimelineShown;
  /** Writes a timeline's order or what it shows into the style graph, keeping the rest of its Diagram. */
  chooseTimeline?: (p: TimelinePick) => void;
  /** Draws the card with a timeline's order or what it shows, never saving it: for reading view. */
  lookTimeline?: (p: TimelinePick) => void;
}

/** Where a card was when its type changed: its zoom, the thing selected, and whether it was full screen. */
export interface TypeLeftAt extends LeftAt {
  full?: boolean;
  /** Where each box was on the screen, by its thing's key: the boxes of the card drawn next glide from there. */
  places?: Map<string, DOMRect>;
}

/** How a host lets a card look at a type without saving it (type_try_reading). */
export interface Trying {
  /** The type the card is drawn as from the style graph as saved. */
  saved: DiagramType;
  /** For a radial drawing saved with a centre picked: that thing's key (radial_centre_chosen). */
  savedCentre?: string;
  /** Whether the card is drawn as a type only looked at. */
  tried: boolean;
  /** Draws the card as the change, never written; null draws it as saved again. */
  tryOut: (change: DiagramWrite | null) => void;
  /** Keeps where the card is as its type changes; `kept` gives it back once, to the card drawn next. */
  leave: (at: TypeLeftAt) => void;
  kept: () => TypeLeftAt | undefined;
}

/** What a Diagram carries beyond its type and view, as written: a tree's relationship, a timeline's choice, a centre. */
const CARRIED = ['relationship', 'order', 'by', 'show', 'centre'] as const;
const carried = (d: Partial<Record<(typeof CARRIED)[number], string>>): Record<string, string> =>
  Object.fromEntries(CARRIED.flatMap((k) => (d[k] === undefined ? [] : [[k, d[k]]])));

/**
 * `style` with the diagram type `change` chooses, in place of the one chosen for its view or the whole graph. It is held
 * only in memory, for a type looked at and never saved (type_try_reading).
 */
export function withTried(style: StyleGraph, change: DiagramWrite): StyleGraph {
  const tried: Diagram = {
    type: change.type as DiagramType,
    ...(change.view === undefined ? {} : { view: change.view }),
    ...(carried(change) as Partial<Diagram>),
    at: { block: -1, line: 0, id: 'tried' },
  };
  return { ...style, diagrams: [tried, ...style.diagrams.filter((d) => d.view !== change.view)] };
}

/** The centre `style` picks for a radial drawing in `view`, the view's own over the whole graph's; none if not picked. */
export function pickedCentre(style: Pick<StyleGraph, 'diagrams'>, view?: string): string | undefined {
  return chosenDiagram(style, view)?.centre;
}

/** The space a plug-in's diagram type is given to draw in, in pixels, by every host. */
export const PICTURE_SPACE: DiagramSpace = { width: 960, height: 540 };

/** A graph drawn by a plug-in's diagram type: the SVG the core made of its marks, safe to show, and its size. */
export interface PluginPicture {
  svg: string;
  type: string;
  plugin: string;
  width: number;
  height: number;
}

/** A type's name as a sentence says it, with its article: "a tree". */
const said = (type: DiagramType): string => word(`type.${type}.as`);
/** A type's name as a button says it. */
const named = (type: DiagramType): string => word(`type.${type}`);

/**
 * What a card shows of the diagram types for `drawing`, a graph or a view (`view`) as drawn. It is styled by `style`,
 * its values from `g`. It shows the core's offer, the way in to a large graph, and the table when drawn as one. Choose
 * hands `write` the change to the style graph and what to say once it is written. A tree is chosen along the
 * relationship it fits best, so it stays the tree that was offered. With `trying`, a type can also be looked at: drawn,
 * never written. Looking at the saved type puts the card back.
 */
export function diagramShown(
  drawing: GraphDrawing,
  style: StyleGraph,
  g: NoteReading['world'][string] | undefined,
  view: string | undefined,
  write: (change: DiagramWrite, done: string) => void,
  trying?: Trying,
): DiagramShown {
  const offer = diagramOffer(drawing, style, g, view);
  const change = (type: DiagramType): DiagramWrite => {
    const along = type === 'tree' ? offer.fits.find((f) => f.type === 'tree')?.relationship : undefined;
    return { type, ...(view === undefined ? {} : { view }), ...(along === undefined ? {} : { relationship: along }) };
  };
  const now = (type: DiagramType) =>
    view === undefined
      ? word('type.now-graph', { type: said(type) })
      : word('type.now-view', { view, type: said(type) });
  const choose = (type: DiagramType) => write(change(type), now(type));
  // the Diagram drawn here, whole: a type looked at, or kept, keeps its tree's relationship and its timeline's choice
  const d = chosenDiagram(style, view);
  const whole: DiagramWrite =
    d && d.type === offer.choice.drawn
      ? { type: d.type, ...(view === undefined ? {} : { view }), ...carried(d) }
      : change(offer.choice.drawn);
  const plan = offer.choice.plan;
  const timeline = plan?.type === 'timeline' ? timelineChange(whole, {}) : undefined;
  const centre = plan?.type === 'radial' ? plan.centre : undefined,
    text = (key: string) => drawing.boxes.find((b) => b.key === key)?.text ?? key;
  // a centre put in a radial drawing: saved, or looked at in reading view, where it can be (radial_centre_pick)
  const radial = (key: string | null): DiagramWrite => ({
    type: 'radial',
    ...(view === undefined ? {} : { view }),
    ...(key ? { centre: key } : {}),
  });
  const centreOn = (key: string | null) =>
    write(radial(key), word('type.now-centre', { thing: text(key ?? centreOfUsual()) }));
  const centreLook = (key: string | null) =>
    trying?.tryOut(trying.saved === 'radial' && trying.savedCentre === (key ?? undefined) ? null : radial(key));
  // the usual centre: the one the radial drawing has with none picked
  const centreOfUsual = () => {
    const usual = diagramOffer(
      drawing,
      { ...style, diagrams: [{ type: 'radial', at: { block: -1, line: 0, id: 'usual' } }] },
      g,
    );
    return usual.choice.plan?.type === 'radial' ? usual.choice.plan.centre : '';
  };
  return {
    ...offer,
    ...(centre === undefined
      ? {}
      : {
          centre: { key: centre, text: text(centre), picked: pickedCentre(style, view) !== undefined },
          centreOn,
        }),
    wayIn: wayIn(drawing.boxes.length),
    ...(offer.choice.drawn === 'table' ? { table: tableOf(drawing, g) } : {}),
    choose,
    ...(timeline && plan?.type === 'timeline'
      ? {
          timeline: { order: plan.order, show: timeline.show ?? 'all' },
          chooseTimeline: (p: TimelinePick) => write(timelineChange(timeline, p), word('timeline.now')),
          ...(trying ? { lookTimeline: (p: TimelinePick) => trying.tryOut(timelineChange(timeline, p)) } : {}),
        }
      : {}),
    ...(trying
      ? {
          look: (type: DiagramType) => trying.tryOut(type === trying.saved ? null : change(type)),
          tried: trying.tried,
          back: () => trying.tryOut(null),
          ...(centre === undefined ? {} : { centreLook }),
          keep: () => write(whole, now(offer.choice.drawn)),
          leave: trying.leave,
          kept: trying.kept,
        }
      : {}),
  };
}

/** What a card is given for a graph a plug-in drew: no SVG of Graphviz's, and the picture's size, for the zoom to fit. */
export const pictureDrawn = (p: PluginPicture): Drawn => ({ svg: '', rankdir: 'LR', width: p.width, height: p.height });

/** Puts a plug-in's picture in `viewport`, moved and scaled as a table is. Its SVG is the core's, every label escaped. */
export function renderPicture(viewport: HTMLElement, p: PluginPicture): HTMLElement {
  const wrap = viewport.createDiv({ cls: ['thoughtknot-table', 'thoughtknot-plugin-picture'] });
  wrap.setAttribute('role', 'img');
  wrap.setAttribute('aria-label', word('type.drawn-plugin', { type: p.type, plugin: p.plugin }));
  const svg = new DOMParser().parseFromString(p.svg, 'image/svg+xml').documentElement;
  wrap.appendChild(activeDocument.importNode(svg, true));
  return wrap;
}

/** The drawing a card shows in `viewport` that is not Graphviz's: the table, or a plug-in's picture; else null. */
export function drawnApart(
  viewport: HTMLElement,
  d: Pick<DiagramShown, 'table' | 'picture'> | undefined,
): HTMLElement | null {
  if (d?.table) return renderTable(viewport, d.table);
  return d?.picture ? renderPicture(viewport, d.picture) : null;
}

/** What a card is given for a graph drawn as a table: no SVG, and the table's own size, for the zoom to fit. */
export const tableDrawn = (table: DiagramTable): Drawn => ({ svg: '', rankdir: 'LR', ...tableSize(table) });

/**
 * The strip under a card's bar: how it is drawn, and Diagram type and its list. When there is one to say, it says the
 * type chosen has stopped fitting, or gives the way in to a large graph. Returns the controls that write, which a
 * read-only card takes away; what it says stays. Where the card can look at a type (`d.look`), its types stay offered
 * while `readOnly` says so, each drawn without being saved. A type looked at is said not saved, with Back to saved, and
 * Keep it where the note is edited. Each keeps where the card is (`where`) first, for the card drawn as the new type.
 */
export function renderTypeStrip(
  root: HTMLElement,
  d: DiagramShown,
  readOnly: () => boolean = () => false,
  where?: () => TypeLeftAt,
): HTMLElement[] {
  const { choice, suggested, look } = d,
    writes: HTMLElement[] = [];
  // the type about to change: where the card is kept first, so the next card is full screen, selected and zoomed alike
  const leaving =
    (then: () => void): (() => void) =>
    () => {
      if (where) d.leave?.(where());
      then();
    };
  // a type picked: looked at while the card is read-only, when it can be; else chosen, and saved
  const pick = (type: DiagramType) => leaving(() => (look && readOnly() ? look(type) : d.choose(type)))();
  // a control that picks a type stays where the card is read-only only when the type can be looked at there
  const picks = (...els: HTMLElement[]) => {
    if (!look) writes.push(...els);
  };
  const strip = root.createDiv({ cls: 'thoughtknot-type-strip' });
  const drawnAs = d.picture
    ? word('type.drawn-plugin', { type: d.picture.type, plugin: d.picture.plugin })
    : word('type.drawn', { type: said(choice.drawn) });
  strip.createSpan({ cls: 'thoughtknot-type-drawn', text: drawnAs });
  // a plug-in's type that nothing here draws: which plug-in draws it, and that the graph is a network meanwhile
  if (choice.plugin && !d.picture)
    root.createDiv({ cls: 'thoughtknot-type-plugin', attr: { role: 'note' }, text: choice.plugin.why });
  const list = root.createEl('ul', { cls: 'thoughtknot-type-list', attr: { 'aria-label': word('type.list') } });
  list.hidden = true;
  const open = () => {
    list.hidden = !list.hidden;
    toggle.setAttribute('aria-expanded', String(!list.hidden));
  };
  const toggle = button(strip, word('type.choose'), 'layout-dashboard', open, word('type.choose'));
  toggle.setAttribute('aria-expanded', 'false');
  picks(toggle, list);
  // a timeline's order and what it shows: looked at while the card is read-only, when it can be; else saved
  if (d.timeline) {
    const { chooseTimeline, lookTimeline } = d;
    const row = renderTimelineChoice(root, d.timeline, (p) =>
      leaving(() => (lookTimeline && readOnly() ? lookTimeline(p) : chooseTimeline?.(p)))(),
    );
    if (!lookTimeline) writes.push(row);
  }
  // each type a tile, its state marked by class for the look and said in words beside it, never by colour alone
  for (const f of d.fits) {
    const li = list.createEl('li', {
      cls: [
        ...(f.type === choice.drawn ? ['thoughtknot-type-now'] : []),
        ...(f.fits && f.type === suggested.type && f.type !== choice.drawn ? ['thoughtknot-type-suggested'] : []),
        ...(f.fits ? [] : ['thoughtknot-type-unfit']),
      ],
    });
    const b = li.createEl('button', {
      text: named(f.type),
      attr: { type: 'button', 'aria-pressed': String(f.type === choice.drawn) },
    });
    b.disabled = !f.fits;
    b.addEventListener('click', () => pick(f.type));
    const why = f.fits
      ? [
          f.type === choice.drawn ? word('type.drawn-now') : '',
          f.type === suggested.type ? word('type.suggested', { because: suggested.because }) : '',
        ]
          .filter(Boolean)
          .join('; ')
      : (f.why ?? '');
    li.createSpan({ cls: 'thoughtknot-type-why', text: why });
  }
  const stopped = choice.stopped;
  if (stopped) {
    const banner = root.createDiv({ cls: ['thoughtknot-banner', 'thoughtknot-type-stopped'], attr: { role: 'alert' } });
    banner.createSpan({
      text: word('type.stopped', { type: said(stopped.type), why: stopped.why }),
    });
    const label =
      stopped.nearest === 'network'
        ? word('type.as-network')
        : word('type.use', { type: word(`type.${stopped.nearest}.word`) });
    picks(button(banner, label, 'check', () => pick(stopped.nearest), label));
  }
  if (d.wayIn && choice.drawn !== 'table') {
    const way = root.createDiv({ cls: 'thoughtknot-way-in', attr: { role: 'note' } });
    way.createSpan({ text: word('type.way-in', { say: d.wayIn.say }) });
    picks(button(way, word('type.as-table'), 'table', () => pick('table'), word('type.as-table')));
  }
  writes.push(...centreStrip(root, d, readOnly, where)); // a radial drawing's centre, picked (radial_centre_pick)
  if (d.tried) {
    // a type only looked at: said so, never by colour alone, with the way back and, where the note is edited, to keep it
    const tried = root.createDiv({ cls: 'thoughtknot-type-tried', attr: { role: 'status' } });
    tried.createSpan({ text: word('type.tried') });
    if (d.back) button(tried, word('type.back'), 'undo-2', leaving(d.back), word('type.back'));
    if (d.keep) writes.push(button(tried, word('type.keep'), 'check', leaving(d.keep), word('type.keep')));
  }
  return writes;
}
