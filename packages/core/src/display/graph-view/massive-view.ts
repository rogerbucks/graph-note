// A graph too large to draw, shown as its overview (editor spec §53, scale_massive_card, scale_search_fly). Roger,
// 22 Oct 2026: past the drawing limit a card shows more than text. Each group is a box, sized by how many things it
// holds, painted by the best painter the device has.
//
// A search box finds any thing by name, in every group. Choosing a match lays its group out on its own, puts it in the
// group's box (core search-fly.ts) and flies the view there. Under reduced motion the view is there at once.
// Drag to move, scroll to zoom. The keyboard does the same: arrows move, + and - zoom, Home shows it all again.
// It only looks: nothing is edited here, and nothing reaches the note.
import { formatCount, word } from '@thoughtknot/core';
import type { Drawn, GraphDrawing, Refusal } from '@thoughtknot/core';
import type { DrawMark } from '../../drawing-marks.ts';
import type { LaidMarks } from '../../graphviz-marks.ts';
import { MarkIndex } from '../../mark-index.ts';
import { overviewOf } from '../../overview.ts';
import type { Palette } from '../../palette.ts';
import { groupsOf } from '../../scale-groups.ts';
import { FLY_MS, ThingSearch, flyPath, openGroup, placeOf, viewOnto } from '../../search-fly.ts';
import type { FlyView, Match } from '../../search-fly.ts';
import { reducedMotion } from './details-nav';
import { parsedSvg } from './drawing-svg';
import { webgl2Painter } from './gl-painter.ts';
import { webgpuPainter } from './gpu-painter.ts';
import { canvasPainter, paintsOf, pickPainter } from './mark-painter.ts';
import type { MarkPainter, Paint, PainterKind, Paints } from './mark-painter.ts';
import { marksOfSvg } from './svg-marks.ts';

/** What the overview needs from its host. */
export interface MassiveOptions {
  graph: string;
  /** The host's colours, as its drawings name them. */
  palette: Palette;
  /** Lays out a part of the graph, as the card's drawings are laid out: in the worker, under the same limits. */
  layout: (part: GraphDrawing, owner: object) => Promise<Drawn | Refusal | null>;
}

/** The overview on screen: how to close it, its painter, where it looks, and how to find and fly to a thing. */
export interface MassiveView {
  close(): void;
  painter(): PainterKind | null;
  view(): FlyView;
  find(query: string): Match[];
  flyTo(match: Match): Promise<void>;
}

/** How many matches the list shows. */
const LISTED = 8;
/** How far a key press moves the view, in screen pixels. */
const KEY_STEP = 48;

let made = 0;

/** The drawing cut down to the things `keys` names and the links between them, to lay out one group alone. */
function partOf(d: GraphDrawing, keys: readonly string[]): GraphDrawing {
  const kept = new Set(keys);
  const { folding: _folding, ...rest } = d;
  return {
    ...rest,
    boxes: d.boxes.filter((b) => kept.has(b.key)),
    links: d.links.filter((l) => kept.has(l.from) && kept.has(l.to)),
    estimates: [],
  };
}

/**
 * The paint of each style, as plain colours a canvas takes. A host's colours may name its theme's variables, which a
 * canvas cannot read, so each is read back once through an element of the card.
 */
function plainPaints(el: HTMLElement, paints: Paints): Paints {
  const probe = el.createSpan({ cls: 'thoughtknot-massive-probe' });
  const seen = new Map<string, string>();
  const plain = (css: string | undefined) => {
    if (!css) return undefined;
    let c = seen.get(css);
    if (c === undefined) {
      probe.setCssProps({ '--thoughtknot-probe': css });
      c = el.win.getComputedStyle(probe).color;
      seen.set(css, c);
    }
    return c;
  };
  const table = new Map<string, Paint>();
  return (style) => {
    let p = table.get(style);
    if (!p) {
      const { fill, line, text } = paints(style);
      p = { fill: plain(fill), line: plain(line), text: plain(text) };
      table.set(style, p);
    }
    return p;
  };
}

/** Shows `drawing`, too large to draw whole, as its overview at the end of `parent`, the card. */
export function massiveView(parent: HTMLElement, drawing: GraphDrawing, o: MassiveOptions): MassiveView {
  const grouping = groupsOf(drawing);
  const search = new ThingSearch(drawing.boxes, grouping);
  const names = new Map(grouping.groups.map((g) => [g.id, g.label]));
  const keysOf = new Map(grouping.groups.map((g) => [g.id, g.keys]));
  const owner = {};
  let laid: LaidMarks = overviewOf(grouping);
  let index = new MarkIndex(laid);
  const opened = new Set<string>();

  const el = parent.createDiv({ cls: 'thoughtknot-massive' });
  const id = `thoughtknot-massive-${++made}`;
  const input = el.createEl('input', {
    cls: 'thoughtknot-massive-search',
    type: 'search',
    placeholder: word('massive.search'),
    attr: {
      'aria-label': word('massive.search'),
      role: 'combobox',
      'aria-expanded': 'false',
      'aria-controls': `${id}-list`,
      'aria-autocomplete': 'list',
    },
  });
  const list = el.createEl('ul', { cls: 'thoughtknot-massive-list', attr: { role: 'listbox', id: `${id}-list` } });
  list.hidden = true;
  const things = formatCount(search.size),
    groups = formatCount(grouping.groups.length);
  const stage = el.createDiv({
    cls: 'thoughtknot-massive-stage',
    attr: { tabindex: '0', role: 'img', 'aria-label': word('massive.name', { graph: o.graph, things, groups }) },
  });
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
    const marks = index.visible(view, camera.scale);
    painter?.paint(marks, camera, paints);
    text?.paint(marks, camera, paints);
  };
  const again = () => {
    if (asked) return;
    asked = true;
    win.requestAnimationFrame(paint);
  };
  const fit = (): FlyView => {
    const scale = Math.min(width / laid.space.width, height / laid.space.height);
    return { x: (laid.space.width - width / scale) / 2, y: (laid.space.height - height / scale) / 2, scale };
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

  /** Lays out group `group` on its own and puts it in its box; false when it cannot be drawn. */
  const openUp = async (group: string): Promise<boolean> => {
    if (opened.has(group)) return true;
    const drawn = await o.layout(partOf(drawing, keysOf.get(group) ?? []), owner);
    if (!open || !drawn || 'reason' in drawn) return false;
    // the SVG is read in the card, so each shape takes the theme's colours, then taken away
    const holder = el.createDiv({ cls: 'thoughtknot-massive-read' });
    const svg = holder.appendChild(parsedSvg(drawn));
    const read = marksOfSvg(svg);
    holder.remove();
    const marks: DrawMark[] = read.marks.map((m) => ({ ...m, style: `${group}|${m.style}` }));
    for (const m of read.marks) insidePaints.set(`${group}|${m.style}`, read.paints(m.style));
    laid = openGroup(laid, group, { space: { width: drawn.width, height: drawn.height }, marks });
    index = new MarkIndex(laid);
    opened.add(group);
    return true;
  };

  const flyTo = async (match: Match) => {
    const group = names.get(match.group) ?? match.group;
    said.setText(word('massive.opening', { group }));
    const drawn = await openUp(match.group);
    if (!open) return;
    const box = laid.marks.find((m) => m.id === match.group);
    const place =
      (drawn ? placeOf(laid, match.key) : null) ?? (box && 'width' in box ? box : { x: 0, y: 0, width: 1, height: 1 });
    said.setText(word(drawn ? 'massive.at' : 'massive.not-drawn', { name: match.text, group }));
    const path = flyPath(camera, viewOnto(place, width, height), width, height, reducedMotion(win));
    const start = win.performance.now(),
      mine = ++flight;
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

  // the search box and its list of matches
  let matches: Match[] = [],
    active = -1;
  const show = () => {
    list.empty();
    matches.forEach((m, i) => {
      list.createEl('li', {
        text: `${m.text} · ${names.get(m.group) ?? m.group}`,
        attr: { role: 'option', id: `${id}-${i}`, 'aria-selected': i === active ? 'true' : 'false' },
      });
    });
    list.hidden = !matches.length;
    input.setAttribute('aria-expanded', matches.length ? 'true' : 'false');
    if (active >= 0) input.setAttribute('aria-activedescendant', `${id}-${active}`);
    else input.removeAttribute('aria-activedescendant');
  };
  const choose = (i: number) => {
    const m = matches[i];
    if (!m) return;
    matches = [];
    active = -1;
    show();
    void flyTo(m);
  };
  input.addEventListener('input', () => {
    matches = search.find(input.value, LISTED);
    active = matches.length ? 0 : -1;
    show();
    said.setText(input.value.trim() ? word('massive.found', { count: matches.length }) : '');
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!matches.length) return;
      active = (active + (e.key === 'ArrowDown' ? 1 : matches.length - 1)) % matches.length;
      show();
    } else if (e.key === 'Enter') choose(Math.max(0, active));
    else if (e.key === 'Escape' && matches.length) {
      matches = [];
      show();
    } else return;
    e.preventDefault();
  });
  list.addEventListener('click', (e) => {
    const li = (e.target as Element | null)?.closest('li');
    if (li) choose(Array.from(list.children).indexOf(li));
  });

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
  let dragging: { id: number; x: number; y: number } | null = null;
  stage.addEventListener('pointerdown', (e) => {
    dragging = { id: e.pointerId, x: e.clientX, y: e.clientY };
    stage.setPointerCapture(e.pointerId);
  });
  stage.addEventListener('pointermove', (e) => {
    if (!dragging || dragging.id !== e.pointerId) return;
    move(e.clientX - dragging.x, e.clientY - dragging.y);
    dragging = { id: e.pointerId, x: e.clientX, y: e.clientY };
  });
  const letGo = () => (dragging = null);
  stage.addEventListener('pointerup', letGo);
  stage.addEventListener('pointercancel', letGo);
  stage.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      const at = stage.getBoundingClientRect();
      zoom(Math.pow(1.0015, -e.deltaY), e.clientX - at.left, e.clientY - at.top);
    },
    { passive: false },
  );
  stage.addEventListener('keydown', (e) => {
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [KEY_STEP, 0],
      ArrowRight: [-KEY_STEP, 0],
      ArrowUp: [0, KEY_STEP],
      ArrowDown: [0, -KEY_STEP],
    };
    const by = moves[e.key];
    if (by) move(...by);
    else if (e.key === '+' || e.key === '=') zoom(1.25);
    else if (e.key === '-') zoom(0.8);
    else if (e.key === 'Home') {
      camera = fit();
      flight++;
      again();
    } else return;
    e.preventDefault();
  });

  resize();
  return {
    close,
    painter: () => painter?.kind ?? null,
    view: () => camera,
    find: (q) => search.find(q, LISTED),
    flyTo,
  };
}
