// A graph too large to draw, shown as its overview (editor spec §53, scale_massive_card, scale_search_fly). Roger,
// 22 Oct 2026: past the drawing limit a card shows more than text. Each group is a box, sized by how many things it
// holds, painted by the best painter the device has.
//
// A search box finds any thing by name, in every group. Choosing a match lays its group out on its own, puts it in the
// group's box (core search-fly.ts) and flies the view there. Under reduced motion the view is there at once.
// Filtering keeps the groups' order: they glide to their new places (core filter-live.ts), at once under reduced motion.
// Each search, grown thing and filter is a step on a trail (core explore-trail.ts). Back and Forward draw any earlier
// picture again, exactly as it was. Moving about is massive-moves.ts. 3D view lifts the groups into blocks.
// Nothing is edited here. A filter chosen goes to the host, which saves it where the note is edited (filter-saved.ts).
// A filter the host gives is the one the overview starts with.
import { formatCount, word } from '@thoughtknot/core';
import type { Drawn, GraphDrawing, Refusal } from '@thoughtknot/core';
import type { DrawMark } from '../../drawing-marks.ts';
import type { LaidMarks } from '../../graphviz-marks.ts';
import { partOf } from '../../expand-on-demand.ts';
import { FacetIndex, facetsOf } from '../../facet-counts.ts';
import type { Chosen } from '../../facet-counts.ts';
import type { FilterKeep } from '../../filter-saved.ts';
import { GLIDE_MS, LiveFilter, glide } from '../../filter-live.ts';
import { MarkIndex, visibleOf } from '../../mark-index.ts';
import { overviewOf } from '../../overview.ts';
import type { Palette } from '../../palette.ts';
import { groupsOf, type Grouping } from '../../scale-groups.ts';
import { Trail } from '../../explore-trail.ts';
import { FLY_MS, ThingSearch, flyPath, openGroup, placeOf, viewOnto } from '../../search-fly.ts';
import type { FlyView, Match, Rect } from '../../search-fly.ts';
import { reducedMotion } from './details-nav';
import { parsedSvg } from './drawing-svg';
import { webgl2Painter } from './gl-painter.ts';
import { webgpuPainter } from './gpu-painter.ts';
import { canvasPainter, paintsOf, pickPainter } from './mark-painter.ts';
import type { MarkPainter, Paint, PainterKind, Paints } from './mark-painter.ts';
import { filterPanel } from './massive-filter.ts';
import { growBar } from './massive-grow.ts';
import type { GrowState } from './massive-grow.ts';
import { moveControls } from './massive-moves.ts';
import { plainPaints, spaceButton } from './massive-paints.ts';
import { LISTED, searchBox } from './massive-search.ts';
import { button } from '../button';
import { marksOfSvg } from './svg-marks.ts';

/** What the overview needs from its host. */
export interface MassiveOptions {
  graph: string;
  /** The host's colours, as its drawings name them. */
  palette: Palette;
  /** Lays out a part of the graph, as the card's drawings are laid out: in the worker, under the same limits. */
  layout: (part: GraphDrawing, owner: object) => Promise<Drawn | Refusal | null>;
  /** A thing's properties by its key, for the filters. Not set: things filter by kind alone. */
  props?: (key: string) => Readonly<Record<string, unknown>>;
  /** The filter the overview starts with, as saved. Not set: everything is kept. */
  chosen?: FilterKeep;
  /** Told each filter the user chooses, to save it. Going back or forward is not a choice. */
  chose?: (keep: FilterKeep) => void;
  /** Told the thing chosen: found by search, even in a group too large to draw, or clicked in an opened group. */
  picked?: (key: string) => void;
}

/** The overview on screen: how to close it, its painter, where it looks, and how to find and fly to a thing. */
export interface MassiveView {
  close(): void;
  painter(): PainterKind | null;
  view(): FlyView;
  find(query: string): Match[];
  flyTo(match: Match): Promise<void>;
}

/** One picture of the overview, kept whole on the trail, so going back draws it exactly as it was. */
interface Picture {
  chosen: Chosen;
  grouping: Grouping;
  search: ThingSearch;
  laid: LaidMarks;
  index: MarkIndex;
  opened: Set<string>;
  inside: Map<string, Paint>;
  camera: FlyView;
  said: string;
  grow: GrowState | null;
}

let made = 0;

/** Shows `drawing`, too large to draw whole, as its overview at the end of `parent`, the card. */
export function massiveView(parent: HTMLElement, drawing: GraphDrawing, o: MassiveOptions): MassiveView {
  const whole = groupsOf(drawing);
  const live = new LiveFilter(
    whole,
    new FacetIndex(
      drawing.boxes.map((b) => b.key),
      facetsOf(drawing.boxes, o.props),
    ),
  );
  let grouping = whole;
  let search = new ThingSearch(drawing.boxes, grouping);
  let names = new Map(grouping.groups.map((g) => [g.id, g.label]));
  let keysOf = new Map(grouping.groups.map((g) => [g.id, g.keys]));
  const owner = {};
  let laid: LaidMarks = overviewOf(grouping, live.order);
  /** The marks while groups glide after a filter, painted without an index; null when still. */
  let gliding: LaidMarks | null = null;
  let index = new MarkIndex(laid);
  const opened = new Set<string>();

  const el = parent.createDiv({ cls: 'thoughtknot-massive' });
  const id = `thoughtknot-massive-${++made}`;
  searchBox(el, id, {
    find: (q, most) => search.find(q, most),
    named: (group) => names.get(group) ?? group,
    choose: (m) => void flyTo(m),
    say: (text) => said.setText(text),
  });
  const named = () =>
    word('massive.name', {
      graph: o.graph,
      things: formatCount(search.size),
      groups: formatCount(grouping.groups.length),
    });
  const stage = el.createDiv({ cls: 'thoughtknot-massive-stage', attr: { tabindex: '0', role: 'img' } });
  stage.setAttribute('aria-label', named());
  const shapes = stage.createEl('canvas', { cls: 'thoughtknot-massive-canvas' }),
    words = stage.createEl('canvas', { cls: 'thoughtknot-massive-canvas' });
  const said = el.createDiv({ cls: 'thoughtknot-massive-said', attr: { 'aria-live': 'polite' } });
  const win = el.win;
  const overviewPaints = plainPaints(el, paintsOf(o.palette));
  const insidePaints = new Map<string, Paint>();
  const paints: Paints = (style) => insidePaints.get(style) ?? overviewPaints(style);

  let painter: MarkPainter | null = null,
    text: MarkPainter | null = null;
  let width = 1,
    height = 1;
  let camera: FlyView = { x: 0, y: 0, scale: 1 };
  let asked = false,
    fitted = false,
    open = true,
    flight = 0;

  const paint = () => {
    asked = false;
    if (!open) return;
    const view = { x: camera.x, y: camera.y, width: width / camera.scale, height: height / camera.scale };
    const marks = gliding ? visibleOf(gliding.marks, view, camera.scale) : index.visible(view, camera.scale);
    painter?.paint(marks, camera, paints);
    text?.paint(marks, camera, paints);
  };
  const again = () => {
    if (asked) return;
    asked = true;
    win.requestAnimationFrame(paint);
  };
  const fit = (space = laid.space): FlyView => {
    const scale = Math.min(width / space.width, height / space.height);
    return { x: (space.width - width / scale) / 2, y: (space.height - height / scale) / 2, scale };
  };
  const resize = () => {
    // the card was drawn again or closed, which its size shows: the overview goes with it
    if (!el.isConnected) return close();
    width = Math.max(1, stage.clientWidth);
    height = Math.max(1, stage.clientHeight);
    const ratio = win.devicePixelRatio || 1;
    painter?.resize(width, height, ratio);
    text?.resize(width, height, ratio);
    if (!fitted && width > 1 && height > 1) {
      camera = fit();
      fitted = true;
      record();
    }
    again();
  };
  const sizer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(resize);
  sizer?.observe(stage);
  void Promise.all([
    pickPainter(shapes, [webgpuPainter, webgl2Painter, canvasPainter]),
    pickPainter(words, [(c) => canvasPainter(c, true)]),
  ]).then(([shaped, worded]) => {
    painter = shaped;
    text = worded;
    if (!open) return close();
    resize();
  });

  const close = () => {
    open = false;
    sizer?.disconnect();
    painter?.destroy();
    text?.destroy();
    painter = text = null;
    el.remove();
  };

  /**
   * Lays `part` out on its own and puts it in group `id`'s box, in place of any inside shown there before. With `box`,
   * that box is made, over the overview, as for a picture grown from a thing. False when it cannot be drawn.
   */
  const layIn = async (id: string, part: GraphDrawing, box?: Rect): Promise<boolean> => {
    const drawn = await o.layout(part, owner);
    if (!open || !drawn || 'reason' in drawn) return false;
    // the SVG is read in the card, so each shape takes the theme's colours, then taken away
    const holder = el.createDiv({ cls: 'thoughtknot-massive-read' });
    const svg = holder.appendChild(parsedSvg(drawn));
    const read = marksOfSvg(svg);
    holder.remove();
    const marks: DrawMark[] = read.marks.map((m) => ({ ...m, style: `${id}|${m.style}` }));
    for (const m of read.marks) insidePaints.set(`${id}|${m.style}`, read.paints(m.style));
    const base = box
      ? {
          space: laid.space,
          marks: [
            ...laid.marks.filter((m) => m.id !== id),
            { id, kind: 'group', style: 'overview.grown', z: 2.9, ...box } as const,
          ],
        }
      : laid;
    laid = openGroup(base, id, { space: { width: drawn.width, height: drawn.height }, marks });
    index = new MarkIndex(laid);
    return true;
  };

  /** Flies the view to `place`, or puts it there at once under reduced motion. */
  const flyOnto = async (place: Rect) => {
    const path = flyPath(camera, viewOnto(place, width, height), width, height, reducedMotion(win));
    const start = win.performance.now(),
      mine = ++flight;
    gliding = null;
    await new Promise<void>((done) => {
      const step = (now: number) => {
        if (!open || mine !== flight) return done();
        const t = Math.min(1, (now - start) / FLY_MS);
        camera = path(t);
        paint();
        if (t < 1) win.requestAnimationFrame(step);
        else done();
      };
      step(start);
    });
  };

  const grower = growBar(el, { drawing, layIn, flyOnto, say: (text) => said.setText(text), stepped: () => record() });

  /** The overview drawn from the things `now` keeps, at once. */
  const kept = (now: Chosen) => {
    chosen = now;
    const f = live.filter(now);
    grouping = f.grouping;
    search = new ThingSearch(f.mask ? drawing.boxes.filter((_, i) => f.mask?.[i]) : drawing.boxes, grouping);
    names = new Map(grouping.groups.map((g) => [g.id, g.label]));
    keysOf = new Map(grouping.groups.map((g) => [g.id, g.keys]));
    laid = f.laid;
    index = new MarkIndex(laid);
    opened.clear();
    stage.setAttribute('aria-label', named());
    said.setText(word('massive.kept', { count: search.size }));
  };
  // the filters: the overview drawn again from the things kept, its groups in the same order, gliding there
  const regroup = (now: Chosen) => {
    const from = gliding ?? laid;
    kept(now);
    record(fit(laid.space));
    o.chose?.(Object.fromEntries(Object.entries(now).map(([k, v]) => [k, [...v]])));
    const at = glide(from, laid),
      mine = ++flight,
      start = win.performance.now(),
      reduced = reducedMotion(win);
    const step = (now: number) => {
      if (!open || mine !== flight) return;
      const t = reduced ? 1 : Math.min(1, (now - start) / GLIDE_MS);
      gliding = t < 1 ? at(t) : null;
      camera = fit((gliding ?? laid).space);
      // the inside of a group opened before shrinks away with it, so its colours go only once it has gone
      if (!gliding) insidePaints.clear();
      paint();
      if (gliding) win.requestAnimationFrame(step);
    };
    step(start);
  };
  const tools = el.createDiv({ cls: 'thoughtknot-massive-tools' });
  el.insertBefore(tools, stage);
  const filters = filterPanel(tools, live.index, regroup);
  spaceButton(tools, el, o.graph, () => ({ marks: laid.marks, paints }), stage);

  // the trail: each search, grown thing and filter is a step, and back and forward draw that step's picture again
  const trail = new Trail<Picture>();
  let chosen: Chosen = {};
  const backButton = button(tools, word('massive.back'), 'arrow-left', () => go(trail.back()), word('massive.back'));
  const forwardButton = button(
    tools,
    word('massive.forward'),
    'arrow-right',
    () => go(trail.forward()),
    word('massive.forward'),
  );
  const steps = () => {
    backButton.disabled = !trail.canBack;
    forwardButton.disabled = !trail.canForward;
  };
  const record = (at = camera) => {
    const kept = Object.entries(chosen).map(([k, v]) => [k, new Set(v)] as const);
    trail.push({
      chosen: Object.fromEntries(kept),
      grouping,
      search,
      laid,
      index,
      opened: new Set(opened),
      inside: new Map(insidePaints),
      camera: at,
      said: said.textContent ?? '',
      grow: grower.state(),
    });
    steps();
  };
  const go = (p: Picture | undefined) => {
    if (!p) return;
    flight++;
    gliding = null;
    ({ grouping, search, laid, index, camera, chosen } = p);
    names = new Map(grouping.groups.map((g) => [g.id, g.label]));
    keysOf = new Map(grouping.groups.map((g) => [g.id, g.keys]));
    opened.clear();
    for (const g of p.opened) opened.add(g);
    insidePaints.clear();
    for (const [k, v] of p.inside) insidePaints.set(k, v);
    filters.set(p.chosen);
    grower.restore(p.grow);
    stage.setAttribute('aria-label', named());
    said.setText(p.said);
    steps();
    again();
  };

  const flyTo = async (match: Match) => {
    const group = names.get(match.group) ?? match.group;
    said.setText(word('massive.opening', { group }));
    const drawn = opened.has(match.group) || (await layIn(match.group, partOf(drawing, keysOf.get(match.group) ?? [])));
    if (!open) return;
    if (drawn) opened.add(match.group);
    const box = laid.marks.find((m) => m.id === match.group);
    const thing = drawn ? placeOf(laid, match.key) : null;
    const place = thing ?? (box && 'width' in box ? box : { x: 0, y: 0, width: 1, height: 1 });
    said.setText(word(drawn ? 'massive.at' : 'massive.not-drawn', { name: match.text, group }));
    if (thing) grower.start(match.key, match.text, thing);
    o.picked?.(match.key);
    await flyOnto(place);
    record();
  };

  // moving and zooming the view
  const zoom = (k: number, sx = width / 2, sy = height / 2) => {
    const scale = Math.min(64, Math.max(fit().scale / 4, camera.scale * k));
    camera = { x: camera.x + sx / camera.scale - sx / scale, y: camera.y + sy / camera.scale - sy / scale, scale };
    flight++;
    again();
  };
  const move = (dx: number, dy: number) => {
    camera = { ...camera, x: camera.x - dx / camera.scale, y: camera.y - dy / camera.scale };
    flight++;
    again();
  };
  const home = () => {
    camera = fit();
    flight++;
    again();
  };
  // the thing under a click, the one drawn on top
  const pick = (sx: number, sy: number) => {
    const at = { x: camera.x + sx / camera.scale, y: camera.y + sy / camera.scale, width: 0, height: 0 };
    const hit = index.inView(at).map((i) => index.marks[i]);
    const key = hit.filter((m) => m?.kind === 'box' && m.of).pop()?.of;
    if (key) o.picked?.(key);
  };
  const [back, forward] = [() => go(trail.back()), () => go(trail.forward())];
  moveControls(stage, { zoom, move, home, back, forward, pick });

  // a saved filter: the overview starts with it, the first step on the trail
  if (o.chosen && Object.values(o.chosen).some((v) => v.length)) {
    kept(Object.fromEntries(Object.entries(o.chosen).map(([k, v]) => [k, new Set(v)])));
    filters.set(chosen);
  }
  resize();
  return {
    close,
    painter: () => painter?.kind ?? null,
    view: () => camera,
    find: (q) => search.find(q, LISTED),
    flyTo,
  };
}
