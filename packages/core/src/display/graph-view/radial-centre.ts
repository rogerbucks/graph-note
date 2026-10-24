// The centre of a radial drawing, picked on its card (spec §15, radial_centre_pick). A thing's details offer Put in the
// centre, and C on its box does the same. The drawing is laid out again around it, and each box glides from where it
// was. Where the note is edited, the centre is saved in the style graph. In reading view it is only looked at, never
// saved, as a diagram type is (type_try_reading). While a centre is picked, the strip says so, with the way back to the
// usual centre: the thing with the most links.
import { word } from '@thoughtknot/core';
import { boxPlaces } from './regroup';
import type { DiagramShown, TypeLeftAt } from './type-strip';
import { button } from '../button';

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
  if (!centre || !centreOn) return [];
  const look = () => !!d.centreLook && readOnly();
  d.putCentre = (key) => {
    if (key === centre.key || (key === null && !centre.picked) || (readOnly() && !d.centreLook)) return false;
    const places = boxPlaces(root.querySelector<SVGSVGElement>('svg.thoughtknot-svg'));
    if (where) d.leave?.({ ...where(), places });
    if (look()) d.centreLook?.(key);
    else centreOn(key);
    return true;
  };
  if (!centre.picked) return [];
  const line = root.createDiv({ cls: 'thoughtknot-type-centre', attr: { role: 'status' } });
  line.createSpan({ text: word('type.centred', { thing: centre.text }) });
  const back = button(
    line,
    word('type.usual-centre'),
    'locate-fixed',
    () => d.putCentre?.(null),
    word('type.usual-centre'),
  );
  return d.centreLook ? [] : [back];
}
