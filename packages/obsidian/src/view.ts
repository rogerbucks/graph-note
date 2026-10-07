// A drawn graph (spec §3): the bar — problems badge, Fit, zoom out, zoom in, Full screen, Edit — and the drawing, which
// zooms and pans by button, gesture and key (the core's Zoom decides; this passes the events in and shows the view), opens
// full screen, and shows a box's details when it is tapped or opened from the keyboard.
import { MarkdownRenderChild, setIcon } from 'obsidian';
import { Zoom, details } from '@graph-note/core';
import type { Drawn, Estimate, Mode, NoteReading, Problem, View, ZoomEvent } from '@graph-note/core';

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
  /** The note line of a line in a block. */
  lineOf: (at: { block: number; line: number }) => number;
  onEdit: () => void;
  /** In full screen: leaves it. */
  onClose?: () => void;
}

/** What a tap or a key can land on: a box, by its id, or an estimated link, by its place in the drawing's estimates. */
type Target = { key: string } | { estimate: number };

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
  private boxDown: { id: number; x: number; y: number; target: Target } | null = null;

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

  private drawing() {
    return this.o.reading.graphs.get(this.o.graph);
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
    // links: each written link in order, then the estimated ones added to the drawing (spec §3)
    const d = this.drawing(), written = d?.links.length ?? 0, named = (d?.estimates ?? []).filter((e) => e.kind === 'name');
    const textOf = (k: string) => this.boxes().find((b) => b.key === k)?.text ?? k;
    for (const g of Array.from(svg.querySelectorAll('g.edge'))) {
      const n = Number(/^edge(\d+)$/.exec(g.getAttribute('id') ?? '')?.[1]) - 1;
      const e = n < written ? d?.estimates.find((x) => x.kind === 'type' && x.index === n) : named[n - written];
      if (!e || !d) continue;
      g.setAttribute('data-estimate', String(d.estimates.indexOf(e)));
      g.setAttribute('tabindex', '0');
      g.setAttribute('role', 'button');
      g.setAttribute('aria-label', `Estimated link: ${textOf(e.from)} ${e.reading} ${textOf(e.to)}. Open it for why.`);
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

  private targetAt(target: EventTarget | null): Target | null {
    const el = target as Element | null;
    const key = el?.closest?.('g.node')?.getAttribute('data-key');
    if (key) return { key };
    const estimate = el?.closest?.('g.edge')?.getAttribute('data-estimate');
    return estimate ? { estimate: Number(estimate) } : null;
  }

  private open(t: Target): void {
    if ('key' in t) this.showDetails(t.key);
    else { const e = this.drawing()?.estimates[t.estimate]; if (e) this.showEstimate(e); }
  }

  private bindEvents(): void {
    const vp = this.viewport;
    const use = (e: Event, ev: ZoomEvent) => { if (this.zoom.handle(ev)) { e.preventDefault(); return true; } return false; };
    this.registerDomEvent(vp, 'pointerdown', (e: PointerEvent) => {
      const target = this.targetAt(e.target), p = this.point(e);
      if (target) this.boxDown = { id: e.pointerId, ...p, target };
      const pointer = e.pointerType === 'touch' || e.pointerType === 'pen' ? e.pointerType : 'mouse';
      if (use(e, { kind: 'down', id: e.pointerId, pointer, ...p, onBox: !!target })) {
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
      if (down && down.id === e.pointerId && Math.hypot(p.x - down.x, p.y - down.y) < 10) this.open(down.target);
    });
    this.registerDomEvent(vp, 'pointercancel', (e: PointerEvent) => { this.boxDown = null; this.zoom.handle({ kind: 'cancel', id: e.pointerId }); });
    this.registerDomEvent(vp, 'wheel', (e: WheelEvent) => {
      const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * 400 : e.deltaY;
      use(e, { kind: 'wheel', ...this.point(e), dy, ctrl: e.ctrlKey, meta: e.metaKey });
    }, { passive: false });
    this.registerDomEvent(vp, 'dblclick', (e: MouseEvent) => { use(e, { kind: 'dblclick', ...this.point(e), onBox: !!this.targetAt(e.target) }); });
    this.registerDomEvent(vp, 'keydown', (e: KeyboardEvent) => {
      const target = this.targetAt(e.target);
      if (target && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); this.open(target); return; }
      use(e, { kind: 'key', key: e.key, ctrl: e.ctrlKey, meta: e.metaKey, alt: e.altKey });
    });
  }

  /** The details panel, emptied and shown, with a heading and a close button. */
  private panel(title: string, kind?: string): HTMLElement {
    const el = this.detailsEl;
    el.empty();
    el.hidden = false;
    const head = el.createDiv({ cls: 'graph-note-details-head' });
    head.createEl('strong', { text: title });
    if (kind) head.createSpan({ cls: 'graph-note-kind', text: kind });
    button(head, 'Close details', 'x', () => { el.hidden = true; this.viewport.focus(); });
    return el;
  }

  /** What tapping an estimated link shows: in a sentence, what was written, what it was taken to mean, and the fix. */
  private showEstimate(e: Estimate): void {
    const el = this.panel('⚠ Estimated link', 'a guess, not written');
    el.createEl('p', { text: e.explain.replace(/^Line \d+/, `Line ${this.o.lineOf(e)}`) });
  }

  /** What tapping a box shows: its text, kind, links in and out, and any problem on it. */
  private showDetails(key: string): void {
    const d = details(this.o.reading, this.o.graph, key);
    if (!d) return;
    const el = this.panel(d.text, d.kind);
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
