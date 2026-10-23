// The centre of a radial drawing, picked on its card (spec §15, radial_centre_pick). A thing's details offer Centre
// here, and so do C on its box and a right-click on it (radial_centre_menu). The drawing is laid out again around it,
// and each box glides from where it was. A card drawn as another type is drawn radial around it, where radial fits
// (radial_centre_anywhere). Where the note is edited, the centre is saved in the style graph. In reading view it is only
// looked at, never saved, as a diagram type is (type_try_reading). A radial drawing's strip says its centre and how to
// pick another (radial_centre_hint). While a centre is picked, it gives the way back to the usual centre: the thing
// with the most links.
import { chosenDiagram, diagramOffer, word } from '@thoughtknot/core';
import type { DiagramOffer, DiagramWrite, GraphDrawing, NoteReading, StyleGraph } from '@thoughtknot/core';
import { boxPlaces } from './regroup';
import type { DiagramShown, Trying, TypeLeftAt } from './type-strip';
import { button } from './view-bar';

/** The centre `style` picks for a radial drawing in `view`, the view's own over the whole graph's; none if not picked. */
export function pickedCentre(style: Pick<StyleGraph, 'diagrams'>, view?: string): string | undefined {
  return chosenDiagram(style, view)?.centre;
}

/**
 * What a card is given to put a thing in the centre, for `drawing` in `view` as `offer` has it. When drawn radial, it
 * gets its centre. Wherever a radial drawing fits, from any type, it gets the way to put a thing there. That is saved by
 * `write`, or only looked at by `trying` (radial_centre_anywhere).
 */
export function centreShown(
  drawing: GraphDrawing,
  style: StyleGraph,
  g: NoteReading['world'][string] | undefined,
  view: string | undefined,
  offer: DiagramOffer,
  write: (change: DiagramWrite, done: string) => void,
  trying?: Trying,
): Partial<DiagramShown> {
  const plan = offer.choice.plan,
    centre = plan?.type === 'radial' ? plan.centre : undefined;
  if (centre === undefined && !offer.fits.some((f) => f.type === 'radial' && f.fits)) return {};
  const text = (key: string) => drawing.boxes.find((b) => b.key === key)?.text ?? key;
  const radial = (key: string | null): DiagramWrite => ({
    type: 'radial',
    ...(view === undefined ? {} : { view }),
    ...(key ? { centre: key } : {}),
  });
  // the usual centre: the one the radial drawing has with none picked
  const usual = () => {
    const at = { block: -1, line: 0, id: 'usual' },
      p = diagramOffer(drawing, { ...style, diagrams: [{ type: 'radial', at }] }, g).choice.plan;
    return p?.type === 'radial' ? p.centre : '';
  };
  return {
    ...(centre === undefined
      ? {}
      : { centre: { key: centre, text: text(centre), picked: pickedCentre(style, view) !== undefined } }),
    textOf: text,
    centreOn: (key) => write(radial(key), word('type.now-centre', { thing: text(key ?? usual()) })),
    ...(trying
      ? {
          centreLook: (key: string | null) =>
            trying.tryOut(trying.saved === 'radial' && trying.savedCentre === (key ?? undefined) ? null : radial(key)),
        }
      : {}),
  };
}

/**
 * Radial in the type list, with a thing selected (radial_centre_anywhere). As `toggle` opens the list, its `tile` says
 * which thing it will be drawn around. `put` puts that thing in the centre, if one is selected that can be. It says
 * whether it did. When it did not, the tile is chosen as any other.
 */
export function aroundSelected(
  toggle: HTMLElement,
  d: DiagramShown,
  where?: () => TypeLeftAt,
): { tile: (b: HTMLElement) => void; put: () => boolean } {
  let tile: HTMLElement | null = null;
  const around = (): string | undefined => {
    const key = where?.().selected;
    return key && d.canCentre?.(key) ? key : undefined;
  };
  toggle.addEventListener('click', () => {
    const key = around();
    tile?.setText(key ? word('type.radial-around', { thing: d.textOf?.(key) ?? key }) : word('type.radial'));
  });
  return {
    tile: (b) => (tile = b),
    put: () => {
      const key = around();
      return !!key && !!d.putCentre?.(key);
    },
  };
}

/**
 * Gives `d` its way to put a thing in the centre, as `putCentre`, and says a centre picked under the strip in `root`.
 * Looked at while the card is read-only (`readOnly`), where it can be; else saved. Where the card is (`where`) and its
 * boxes are kept first, so the card drawn next takes up its place and glides its boxes. Returns the control that
 * writes, which a read-only card takes away.
 */
export function centreStrip(
  root: HTMLElement,
  d: DiagramShown,
  readOnly: () => boolean,
  where?: () => TypeLeftAt,
): HTMLElement[] {
  const { centre, centreOn } = d;
  if (!centreOn) return [];
  const look = () => !!d.centreLook && readOnly();
  const can = () => !readOnly() || !!d.centreLook;
  d.canCentre = (key) => key !== centre?.key && can();
  d.putCentre = (key) => {
    if (!can() || (key === null ? !centre?.picked : key === centre?.key)) return false;
    const places = boxPlaces(root.querySelector<SVGSVGElement>('svg.thoughtknot-svg'));
    if (where) d.leave?.({ ...where(), places });
    if (look()) d.centreLook?.(key);
    else centreOn(key);
    return true;
  };
  if (!centre) return [];
  // the centre said, and how to pick another, so the way is found without knowing it is there (radial_centre_hint)
  const line = root.createDiv({ cls: 'thoughtknot-type-centre', attr: { role: 'status' } });
  line.createSpan({ text: word('type.centred', { thing: centre.text }) });
  if (can()) line.createSpan({ cls: 'thoughtknot-type-centre-how', text: ` ${word('type.centre-how')}` });
  if (!centre.picked) return [];
  const back = button(
    line,
    word('type.usual-centre'),
    'locate-fixed',
    () => d.putCentre?.(null),
    word('type.usual-centre'),
  );
  return d.centreLook ? [] : [back];
}
