// A drawn graph (spec §3): the bar — problems badge, Fit, zoom out, zoom in, Full screen, Edit — and the drawing, which
// zooms and pans by button, gesture and key (the core's Zoom decides; this passes the events in and shows the view), opens
// full screen, and shows a box's details when it is tapped or opened from the keyboard.
import { MarkdownRenderChild, setIcon } from 'obsidian';
import { Zoom, details } from '@graph-note/core';
import type { Drawn, Mode, NoteReading, Problem, View, ZoomEvent } from '@graph-note/core';

/** A problem, with the note line it is on. */
export interface ShownProblem extends Problem {
  noteLine: number;
}

export interface ViewOptions {
  reading: NoteReading;
  graph: string;
  drawn: Drawn;
  problems: ShownProblem[];
  mode: Mode;
  lineOf: (p: Problem) => number;
  onEdit: () => void;
  /** In full screen: leaves it. */
  onClose?: () => void;
}

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;
const problemText = (p: ShownProblem) => `Line ${p.noteLine}: ${p.message} — ${p.fix}`;

/** The list of problems, shown or behind the badge. */
export function renderProblems(parent: HTMLElement, problems: ShownProblem[], hidden: boolean): HTMLElement {
  const box = parent.createDiv({ cls: 'graph-note-problems' });
  box.hidden = hidden;
  const list = box.createEl('ul');
  for (const p of problems) list.createEl('li', { text: problemText(p) });
  return box;
}

function button(parent: HTMLElement, label: string, icon: string, onClick: () => void, text?: string): HTMLButtonElement {
  const b = parent.createEl('button', { cls: 'clickable-icon', attr: { 'aria-label': label, type: 'button' } });
  setIcon(b, icon);
  if (text) b.createSpan({ cls: 'graph-note-badge-text', text });
  b.addEventListener('click', onClick);
  return b;
}

export class GraphView extends MarkdownRenderChild {
  private readonly o: ViewOptions;
  private zoom!: Zoom;
  private viewport!: HTMLElement;
  private svg!: SVGSVGElement;
  private detailsEl!: HTMLElement;
  private fullscreen: { view: GraphView; overlay: HTMLElement } | null = null;
  private boxDown: { id: number; x: number; y: number; key: string } | null = null;

  constructor(containerEl: HTMLElement, options: ViewOptions) {
    super(containerEl);
    this.o = options;
  }

  override onload(): void {
    const { problems, mode } = this.o, root = this.containerEl;
    root.addClass('graph-note-view', `is-${mode}`);

    const bar = root.createDiv({ cls: 'graph-note-bar', attr: { role: 'toolbar', 'aria-label': `Graph ${this.o.graph}` } });
    const label = problems.length ? plural(problems.length, 'problem') : 'No problems';
    const badge = button(bar, label, problems.length ? 'alert-triangle' : 'check-circle', () => {
      list.hidden = !list.hidden;
      badge.setAttribute('aria-expanded', String(!list.hidden));
    }, label);
    badge.addClass('graph-note-badge');
    badge.setAttribute('aria-expanded', 'false');
    button(bar, 'Fit', 'maximize', () => this.zoom.fit());
    button(bar, 'Zoom out', 'zoom-out', () => this.zoom.zoomOut());
    button(bar, 'Zoom in', 'zoom-in', () => this.zoom.zoomIn());
    if (mode === 'full') button(bar, 'Close full screen', 'minimize', () => this.o.onClose?.());
    else button(bar, 'Full screen', 'expand', () => this.openFullscreen());
    button(bar, 'Edit', 'pencil', () => this.o.onEdit());

    const list = renderProblems(root, problems, true);
    this.viewport = root.createDiv({
      cls: 'graph-note-viewport',
      attr: { tabindex: '0', role: 'group', 'aria-label': `Drawing of graph ${this.o.graph}: ${plural(this.o.drawn.width ? this.boxes().length : 0, 'thing')}. Plus, minus and zero zoom; Escape leaves full screen.` },
    });
    this.svg = this.insertSvg();
    this.detailsEl = root.createDiv({ cls: 'graph-note-details', attr: { role: 'region', 'aria-live': 'polite' } });
    this.detailsEl.hidden = true;

    this.zoom = new Zoom({ width: this.o.drawn.width, height: this.o.drawn.height }, this.viewportSize(), mode);
    this.zoom.onChange = (v) => this.apply(v);
    this.zoom.onExit = () => this.o.onClose?.();
    this.apply(this.zoom.view());
    this.bindEvents();
    const observer = new ResizeObserver(() => this.zoom.resize(this.viewportSize()));
    observer.observe(this.viewport);
    this.register(() => observer.disconnect());
    if (mode === 'full') this.viewport.focus();
  }

  override onunload(): void {
    this.fullscreen?.overlay.remove();
    this.fullscreen = null;
  }

  private boxes() {
    return this.o.reading.graphs.get(this.o.graph)?.boxes ?? [];
  }

  /** The drawing, parsed from its SVG text, each box made reachable from the keyboard and named for screen readers. */
  private insertSvg(): SVGSVGElement {
    const parsed = new DOMParser().parseFromString(this.o.drawn.svg, 'image/svg+xml').documentElement;
    const svg = this.viewport.appendChild(activeDocument.importNode(parsed, true)) as unknown as SVGSVGElement;
    svg.removeAttribute('style');
    svg.classList.add('graph-note-svg');
    const boxes = this.boxes();
    for (const g of Array.from(svg.querySelectorAll('g.node'))) {
      const box = boxes[Number(/^node(\d+)$/.exec(g.getAttribute('id') ?? '')?.[1]) - 1];
      if (!box) continue;
      g.setAttribute('tabindex', '0');
      g.setAttribute('role', 'button');
      g.setAttribute('aria-label', box.kind ? `${box.kind}: ${box.text}` : box.text);
      g.setAttribute('data-key', box.key);
    }
    return svg;
  }

  /** The viewport's size. In a note it is as tall as the drawing fitted to its width, as a note sizes a drawing. */
  private viewportSize() {
    const width = this.viewport.clientWidth || this.o.drawn.width;
    if (this.o.mode !== 'note') return { width, height: this.viewport.clientHeight || this.o.drawn.height };
    return { width, height: this.o.drawn.height * Math.min(1, width / this.o.drawn.width) };
  }

  private apply(v: View): void {
    this.svg.setAttribute('width', String(v.width));
    this.svg.setAttribute('height', String(v.height));
    this.viewport.setCssProps({
      '--graph-note-x': `${v.x}px`,
      '--graph-note-y': `${v.y}px`,
      '--graph-note-height': `${this.viewportSize().height}px`,
      '--graph-note-touch': this.zoom.touchAction(),
    });
    this.viewport.toggleClass('is-zoomed', this.zoom.zoomedIn());
  }

  private point(e: { clientX: number; clientY: number }) {
    const r = this.viewport.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private boxAt(target: EventTarget | null): string | null {
    const g = (target as Element | null)?.closest?.('g.node');
    return g?.getAttribute('data-key') ?? null;
  }

  private bindEvents(): void {
    const vp = this.viewport;
    const use = (e: Event, ev: ZoomEvent) => { if (this.zoom.handle(ev)) { e.preventDefault(); return true; } return false; };
    this.registerDomEvent(vp, 'pointerdown', (e: PointerEvent) => {
      const key = this.boxAt(e.target), p = this.point(e);
      if (key) this.boxDown = { id: e.pointerId, ...p, key };
      const pointer = e.pointerType === 'touch' || e.pointerType === 'pen' ? e.pointerType : 'mouse';
      if (use(e, { kind: 'down', id: e.pointerId, pointer, ...p, onBox: !!key })) {
        vp.setPointerCapture(e.pointerId);
        vp.focus({ preventScroll: true });
      }
    });
    this.registerDomEvent(vp, 'pointermove', (e: PointerEvent) => { use(e, { kind: 'move', id: e.pointerId, ...this.point(e) }); });
    this.registerDomEvent(vp, 'pointerup', (e: PointerEvent) => {
      const p = this.point(e);
      use(e, { kind: 'up', id: e.pointerId, ...p, time: e.timeStamp ?? 0 });
      const down = this.boxDown;
      this.boxDown = null;
      if (down && down.id === e.pointerId && Math.hypot(p.x - down.x, p.y - down.y) < 10) this.showDetails(down.key);
    });
    this.registerDomEvent(vp, 'pointercancel', (e: PointerEvent) => { this.boxDown = null; this.zoom.handle({ kind: 'cancel', id: e.pointerId }); });
    this.registerDomEvent(vp, 'wheel', (e: WheelEvent) => {
      const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * 400 : e.deltaY;
      use(e, { kind: 'wheel', ...this.point(e), dy, ctrl: e.ctrlKey, meta: e.metaKey });
    }, { passive: false });
    this.registerDomEvent(vp, 'dblclick', (e: MouseEvent) => { use(e, { kind: 'dblclick', ...this.point(e), onBox: !!this.boxAt(e.target) }); });
    this.registerDomEvent(vp, 'keydown', (e: KeyboardEvent) => {
      const key = this.boxAt(e.target);
      if (key && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); this.showDetails(key); return; }
      use(e, { kind: 'key', key: e.key, ctrl: e.ctrlKey, meta: e.metaKey, alt: e.altKey });
    });
  }

  /** What tapping a box shows: its text, kind, links in and out, and any problem on it. */
  private showDetails(key: string): void {
    const d = details(this.o.reading, this.o.graph, key), el = this.detailsEl;
    if (!d) return;
    el.empty();
    el.hidden = false;
    const head = el.createDiv({ cls: 'graph-note-details-head' });
    head.createEl('strong', { text: d.text });
    if (d.kind) head.createSpan({ cls: 'graph-note-kind', text: d.kind });
    button(head, 'Close details', 'x', () => { el.hidden = true; this.viewport.focus(); });
    const links = (title: string, items: string[]) => {
      if (!items.length) return;
      el.createEl('h4', { text: title });
      const ul = el.createEl('ul');
      for (const i of items) ul.createEl('li', { text: i });
    };
    links('Links out', d.out.map((l) => `${l.reading} → ${l.text}`));
    links('Links in', d.in.map((l) => `${l.text} ${l.reading} this`));
    if (!d.out.length && !d.in.length) el.createEl('p', { text: 'No links in or out.' });
    links('Problems', d.problems.map((p) => problemText({ ...p, noteLine: this.o.lineOf(p) })));
  }

  private openFullscreen(): void {
    if (this.fullscreen) return;
    const overlay = activeDocument.body.createDiv({ cls: 'graph-note-fullscreen', attr: { role: 'dialog', 'aria-modal': 'true', 'aria-label': `Graph ${this.o.graph}, full screen` } });
    const view = new GraphView(overlay.createDiv({ cls: 'graph-note' }), { ...this.o, mode: 'full', onClose: () => this.closeFullscreen() });
    this.fullscreen = { view, overlay };
    this.addChild(view);
  }

  private closeFullscreen(): void {
    const f = this.fullscreen;
    if (!f) return;
    this.fullscreen = null;
    this.removeChild(f.view);
    f.overlay.remove();
    this.viewport.focus();
  }
}
