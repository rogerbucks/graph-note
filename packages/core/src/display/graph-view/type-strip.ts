// The diagram type on a card (spec §15): the strip under the bar saying how the graph is drawn, and Diagram type, which
// lists the seven types — each that fits to choose, written into the style graph; each that does not with why; the one
// suggested said so, and never drawn until chosen (diagram_type_set, type_only_when_fits, suggest_type). A chosen type
// that has stopped fitting is said, with why, and the nearest type that fits offered (type_stops_fitting); a graph of more
// than 50 things is offered the table or a view as the way in (large_way_in). The core decides all of it (types.ts).
import { diagramOffer, tableOf, wayIn } from '@graph-note/core';
import type {
  DiagramOffer,
  DiagramTable,
  DiagramType,
  DiagramWrite,
  Drawn,
  GraphDrawing,
  NoteReading,
  StyleGraph,
} from '@graph-note/core';
import { tableSize } from './table-view';
import { button } from './view-bar';

/** What a card is given of the diagram types, beyond its drawing. */
export interface DiagramShown extends DiagramOffer {
  /** For a graph of more than 50 things: the way in, in words. */
  wayIn: { say: string } | null;
  /** The drawing as a table, when it is drawn as one. */
  table?: DiagramTable;
  /** Writes the type chosen into the style graph: for the graph, or for the view the card shows. */
  choose: (type: DiagramType) => void;
}

/** A type's name as a sentence says it, with its article: "a tree", "an unknown". */
const said = (type: string): string => `${/^[aeiou]/.test(type) ? 'an' : 'a'} ${type}`;
/** A type's name as a button says it. */
const named = (type: string): string => `${type.charAt(0).toUpperCase()}${type.slice(1)}`;

/**
 * What a card shows of the diagram types for `drawing` — a graph, or a view (`view`) as drawn — styled by `style`, its
 * values from `g`: the core's offer, the way in to a large graph, the table when drawn as one, and Choose, which hands
 * `write` the change to the style graph and what to say once it is written. A tree is chosen along the relationship it
 * fits best, so it stays the tree that was offered.
 */
export function diagramShown(
  drawing: GraphDrawing,
  style: StyleGraph,
  g: NoteReading['world'][string] | undefined,
  view: string | undefined,
  write: (change: DiagramWrite, done: string) => void,
): DiagramShown {
  const offer = diagramOffer(drawing, style, g, view);
  return {
    ...offer,
    wayIn: wayIn(drawing.boxes.length),
    ...(offer.choice.drawn === 'table' ? { table: tableOf(drawing, g) } : {}),
    choose: (type) => {
      const along = type === 'tree' ? offer.fits.find((f) => f.type === 'tree')?.relationship : undefined;
      write(
        { type, ...(view === undefined ? {} : { view }), ...(along === undefined ? {} : { relationship: along }) },
        `${view === undefined ? 'The graph' : `View ${view}`} is now drawn as ${said(type)}.`,
      );
    },
  };
}

/** What a card is given for a graph drawn as a table: no SVG, and the table's own size, for the zoom to fit. */
export const tableDrawn = (table: DiagramTable): Drawn => ({ svg: '', rankdir: 'LR', ...tableSize(table) });

/**
 * The strip under a card's bar: how it is drawn, Diagram type and its list, and, when there is one to say, that the type
 * chosen has stopped fitting, or the way in to a large graph. Returns the controls that write, which a read-only card
 * takes away; what it says stays.
 */
export function renderTypeStrip(root: HTMLElement, d: DiagramShown): HTMLElement[] {
  const { choice, suggested } = d,
    writes: HTMLElement[] = [];
  const strip = root.createDiv({ cls: 'graph-note-type-strip' });
  strip.createSpan({ cls: 'graph-note-type-drawn', text: `Drawn as ${said(choice.drawn)}` });
  const list = root.createEl('ul', { cls: 'graph-note-type-list', attr: { 'aria-label': 'Diagram types' } });
  list.hidden = true;
  const open = () => {
    list.hidden = !list.hidden;
    toggle.setAttribute('aria-expanded', String(!list.hidden));
  };
  const toggle = button(strip, 'Diagram type', 'layout-dashboard', open, 'Diagram type');
  toggle.setAttribute('aria-expanded', 'false');
  writes.push(toggle, list);
  // each type a tile, its state marked by class for the look and said in words beside it, never by colour alone
  for (const f of d.fits) {
    const li = list.createEl('li', {
      cls: [
        ...(f.type === choice.drawn ? ['graph-note-type-now'] : []),
        ...(f.fits && f.type === suggested.type && f.type !== choice.drawn ? ['graph-note-type-suggested'] : []),
        ...(f.fits ? [] : ['graph-note-type-unfit']),
      ],
    });
    const b = li.createEl('button', {
      text: named(f.type),
      attr: { type: 'button', 'aria-pressed': String(f.type === choice.drawn) },
    });
    b.disabled = !f.fits;
    b.addEventListener('click', () => d.choose(f.type));
    const why = f.fits
      ? [f.type === choice.drawn ? 'drawn now' : '', f.type === suggested.type ? `suggested: ${suggested.because}` : '']
          .filter(Boolean)
          .join('; ')
      : (f.why ?? '');
    li.createSpan({ cls: 'graph-note-type-why', text: why });
  }
  const stopped = choice.stopped;
  if (stopped) {
    const banner = root.createDiv({ cls: ['graph-note-banner', 'graph-note-type-stopped'], attr: { role: 'alert' } });
    banner.createSpan({
      text: `This graph no longer fits ${said(stopped.type)}: ${stopped.why}. It is drawn as a network until another type is chosen.`,
    });
    const label = stopped.nearest === 'network' ? 'Draw as a network' : `Use ${stopped.nearest}`;
    writes.push(button(banner, label, 'check', () => d.choose(stopped.nearest), label));
  }
  if (d.wayIn && choice.drawn !== 'table') {
    const way = root.createDiv({ cls: 'graph-note-way-in', attr: { role: 'note' } });
    way.createSpan({ text: `${d.wayIn.say} A view is made with Edit here, then Make a view.` });
    writes.push(button(way, 'Show as table', 'table', () => d.choose('table'), 'Show as table'));
  }
  return writes;
}
