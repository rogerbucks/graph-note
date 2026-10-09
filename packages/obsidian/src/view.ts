// A drawn graph (spec §3): the bar — problems badge, Fit, zoom out, zoom in, Full screen, Edit — and the drawing, which
// zooms and pans by button, gesture and key (the core's Zoom decides; this passes the events in and shows the view), opens
// full screen, and shows a box's details when it is tapped or opened from the keyboard.
import { MarkdownRenderChild, Platform, setIcon } from 'obsidian';
import { Zoom, details, linkDetails, linkInBlock, textVersion, withoutColorMix } from '@graph-note/core';
import { renderProperties } from './properties';
import { renderCode } from './code';
import type {
  CompletenessReport,
  Drawn,
  Estimate,
  Mode,
  NoteReading,
  Problem,
  View,
  ZoomEvent,
} from '@graph-note/core';

/** The editor open in place on this card, as the inspector needs it: the block's text as typed, and a way to replace it. */
export interface Editing {
  session: { text: string } | null;
  replace(text: string): void;
  /** What the details were open on, so the inspector reopens on it in the redrawn card. */
  selected: { key: string } | { link: number } | null;
}

/** A problem, with the note line it is on. */
export interface ShownProblem extends Problem {
  noteLine: number;
}

/** What a drawing needs: the reading, the graph, its drawn SVG and problems, where it is shown, and what its buttons do. */
export interface ViewOptions {
  /** The block's text, shown read-only by Source in reading view (spec §3). */
  source?: string;
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
  /** The completeness report shown behind the badge (spec §8). */
  completeness?: CompletenessReport;
  /** Edit here: opens the text in place, inside this card (spec §4). */
  onEditHere?: () => void;
  /** While the card is edited, its edit button closes the editor, as its Done does (spec §4). */
  onDoneEditing?: () => void;
  /** Tells the card each time an editor in place opens or closes; returns how to stop. */
  watchEditing?: (changed: () => void) => () => void;
  /** Called once the card is built, with the place in it where the editor in place sits. */
  onReady?: (slot: HTMLElement) => void;
  /** The editor open in place on this card, if any: then the details are the inspector (spec §14). */
  editing?: () => Editing | undefined;
}

/** What a tap or a key can land on: a box, by its id, or an estimated link, by its place in the drawing's estimates. */
type Target = { key: string } | { estimate: number } | { link: number };

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;

/**
 * Whether a card is where the note is only read, not edited: reading view, a hover preview or an embed, as opposed to
 * Live Preview or Source mode (spec §3, "Read-only in Reading view"; decided 9 Oct 2026).
 */
export const readOnlyHere = (el: HTMLElement): boolean =>
  !!el.closest('.markdown-reading-view, .markdown-preview-view') && !el.closest('.markdown-source-view');

/**
 * Runs `then` once `el` is on the page, at once when it already is. Live Preview draws a block into a card that goes on
 * the page only after, and where a card is decides what it offers. Gives up after a couple of seconds.
 */
export function whenPlaced(
  el: HTMLElement,
  then: () => void,
  wanted: () => boolean = () => true,
  giveUpMs = 2000,
): void {
  if (el.isConnected) return then();
  const started = Date.now();
  const check = () => {
    if (!wanted()) return; // the card was unloaded before it was placed
    if (el.isConnected) then();
    else if (Date.now() - started < giveUpMs) window.setTimeout(check, 16);
  };
  window.setTimeout(check, 16);
}
const problemText = (p: ShownProblem) => `Line ${p.noteLine}: ${p.message} — ${p.fix}`;
const sign = (p: Problem) => (p.severity === 'warning' ? '⚠ Warning' : '✖ Error');
/** More problems than this do not fit a screen, so they are grouped (spec §8). */
const GROUP_OVER = 8;

/** The kind of a problem, for grouping many: what sort of thing went wrong, in words. */
function kindOf(p: Problem): string {
  if (/no thing called|is not in graph/.test(p.message)) return 'links to things not in the graph';
  if (/is not a relationship/.test(p.message)) return 'relationship types not in the graph';
  if (/not a value|expected|cannot be read|not one word/i.test(p.message)) return 'lines that cannot be read';
  return 'other problems';
}

/** The problems — one by one, or grouped by kind with the worst first when there are many — and the completeness report. */
export function renderProblems(
  parent: HTMLElement,
  problems: ShownProblem[],
  hidden: boolean,
  completeness?: CompletenessReport,
): HTMLElement {
  const box = parent.createDiv({ cls: 'graph-note-problems' });
  box.hidden = hidden;
  const item = (ul: HTMLElement, p: ShownProblem) =>
    ul.createEl('li', {
      cls: p.severity === 'warning' ? 'is-warning' : 'is-error',
      text: `${sign(p)} — ${problemText(p)}`,
    });
  if (problems.length > GROUP_OVER) {
    const groups = new Map<string, ShownProblem[]>();
    for (const p of problems) {
      const k = `${p.severity}|${kindOf(p)}`;
      groups.set(k, [...(groups.get(k) ?? []), p]);
    }
    const order = [...groups].sort(([a, x], [b, y]) =>
      a.startsWith('error') === b.startsWith('error') ? y.length - x.length : a.startsWith('error') ? -1 : 1,
    );
    for (const [k, ps] of order) {
      const d = box.createEl('details');
      d.createEl('summary', {
        text: `${k.startsWith('warning') ? 'Warning' : 'Error'}: ${ps.length} × ${k.split('|')[1]}`,
      });
      const ul = d.createEl('ul');
      for (const p of ps) item(ul, p);
    }
  } else if (problems.length) {
    const ul = box.createEl('ul');
    for (const p of problems) item(ul, p);
  }
  if (completeness?.rules.length) {
    box.createEl('h4', { text: 'Completeness' });
    const ul = box.createEl('ul');
    for (const r of completeness.rules) {
      const li = ul.createEl('li', { text: `${r.says || r.rule}: ${r.malformed || r.summary}` });
      const sub = li.createEl('ul');
      for (const m of r.missing) sub.createEl('li', { cls: 'is-error', text: `✖ Missing — ${m.at}: ${m.fix}` });
      for (const x of r.overdue) sub.createEl('li', { cls: 'is-warning', text: `⚠ Overdue — ${x}` });
      for (const x of r.deferred) sub.createEl('li', { text: `◌ Deferred — ${x}` });
    }
  }
  return box;
}

let described = 0;

function button(
  parent: HTMLElement,
  label: string,
  icon: string,
  onClick: () => void,
  text?: string,
): HTMLButtonElement {
  const b = parent.createEl('button', { cls: 'clickable-icon', attr: { 'aria-label': label, type: 'button' } });
  setIcon(b, icon);
  if (text) b.createSpan({ cls: 'graph-note-badge-text', text });
  b.addEventListener('click', onClick);
  return b;
}

/** A drawn graph with its bar, zoom, full screen, details and, in edit mode, the inspector. */
export class GraphView extends MarkdownRenderChild {
  private readonly o: ViewOptions;
  private zoom!: Zoom;
  private viewport!: HTMLElement;
  private svg!: SVGSVGElement;
  private detailsEl!: HTMLElement;
  private fullscreen: { view: GraphView; overlay: HTMLElement } | null = null;
  private boxDown: { id: number; x: number; y: number; target: Target } | null = null;
  private editButton: HTMLButtonElement | null = null;
  private codeEl: HTMLElement | null = null;

  constructor(containerEl: HTMLElement, options: ViewOptions) {
    super(containerEl);
    this.o = options;
  }

  override onload(): void {
    const { problems, mode } = this.o,
      root = this.containerEl;
    root.addClass('graph-note-view', `is-${mode}`);

    const bar = root.createDiv({
      cls: 'graph-note-bar',
      attr: { role: 'toolbar', 'aria-label': `Graph ${this.o.graph}` },
    });
    const gaps = this.o.completeness?.gaps ?? 0;
    const label =
      [problems.length ? plural(problems.length, 'problem') : '', gaps ? plural(gaps, 'gap') : '']
        .filter(Boolean)
        .join(', ') || 'No problems';
    const badge = button(
      bar,
      label,
      problems.length || gaps ? 'alert-triangle' : 'check-circle',
      () => {
        list.hidden = !list.hidden;
        badge.setAttribute('aria-expanded', String(!list.hidden));
      },
      label,
    );
    badge.addClass('graph-note-badge');
    badge.setAttribute('aria-expanded', 'false');
    button(bar, 'Fit', 'maximize', () => this.zoom.fit());
    button(bar, 'Zoom out', 'zoom-out', () => this.zoom.zoomOut());
    button(bar, 'Zoom in', 'zoom-in', () => this.zoom.zoomIn());
    if (mode === 'full') button(bar, 'Close full screen', 'minimize', () => this.o.onClose?.());
    else button(bar, 'Full screen', 'expand', () => this.openFullscreen());
    const editing: HTMLElement[] = [];
    if (mode !== 'pane' && this.o.onEditHere) {
      this.editButton = button(bar, 'Edit here', 'pencil', () =>
        this.o.editing?.()?.session ? this.o.onDoneEditing?.() : this.o.onEditHere?.(),
      );
      editing.push(this.editButton);
      this.showEditing();
      if (this.o.watchEditing) this.register(this.o.watchEditing(() => this.showEditing()));
    }
    if (mode !== 'pane') editing.push(button(bar, 'Edit in pane', 'panel-right-open', () => this.o.onEdit()));
    const source: HTMLButtonElement | null =
      mode === 'note' ? button(bar, 'Show source', 'code', () => source && this.toggleSource(source)) : null;

    const list = renderProblems(root, problems, true, this.o.completeness);
    this.viewport = root.createDiv({
      cls: 'graph-note-viewport',
      attr: {
        tabindex: '0',
        role: 'group',
        'aria-label': `Drawing of graph ${this.o.graph}: ${plural(this.o.drawn.width ? this.boxes().length : 0, 'thing')}. Plus, minus and zero zoom; Escape leaves full screen.`,
      },
    });
    this.svg = this.insertSvg();
    // the drawing as sentences, for screen readers (spec §11)
    const d = this.drawing();
    if (d) {
      const sr = root.createDiv({ cls: 'graph-note-sr', attr: { id: `graph-note-sr-${++described}` } });
      const ul = sr.createEl('ul');
      for (const line of textVersion(d)) ul.createEl('li', { text: line });
      this.viewport.setAttribute('aria-describedby', sr.getAttribute('id') ?? '');
    }
    this.detailsEl = root.createDiv({ cls: 'graph-note-details', attr: { role: 'region', 'aria-live': 'polite' } });
    this.detailsEl.hidden = true;
    const slot = mode === 'note' ? root.createDiv({ cls: 'graph-note-edit-slot' }) : null;

    this.zoom = new Zoom({ width: this.o.drawn.width, height: this.o.drawn.height }, this.viewportSize(), mode);
    this.zoom.onChange = (v) => this.apply(v);
    this.zoom.onExit = () => this.o.onClose?.();
    this.apply(this.zoom.view());
    this.bindEvents();
    const observer = new ResizeObserver(() => this.zoom.resize(this.viewportSize()));
    observer.observe(this.viewport);
    this.register(() => observer.disconnect());
    if (mode === 'full') this.viewport.focus();
    // what the card offers depends on where it is: in reading view it is read-only, with Source in place of Edit
    let gone = false;
    this.register(() => (gone = true));
    whenPlaced(
      root,
      () => {
        if (mode === 'note' && readOnlyHere(root)) {
          editing.forEach((b) => b.remove());
          this.editButton = null;
          slot?.remove();
          return;
        }
        source?.remove();
        if (slot) this.o.onReady?.(slot);
        const reopen = this.o.editing?.()?.selected;
        if (reopen) this.open(reopen);
      },
      () => !gone,
    );
  }

  /** Source, in reading view: the block's text, coloured and read-only, in place of the drawing; and back. */
  private toggleSource(b: HTMLButtonElement): void {
    const showing = !this.viewport.hidden;
    if (!this.codeEl) {
      this.codeEl = renderCode(this.containerEl, this.o.source ?? '');
      this.containerEl.insertBefore(this.codeEl, this.detailsEl);
      this.codeEl.hidden = true;
    }
    this.viewport.hidden = showing;
    this.codeEl.hidden = !showing;
    if (showing) this.detailsEl.hidden = true;
    b.empty();
    setIcon(b, showing ? 'network' : 'code');
    b.setAttribute('aria-label', showing ? 'Show drawing' : 'Show source');
  }

  /** The edit button as the card stands: a pencil to edit here, or, while edited, a view icon to finish (spec §4). */
  private showEditing(): void {
    const b = this.editButton;
    if (!b) return;
    const on = !!this.o.editing?.()?.session;
    b.empty();
    setIcon(b, on ? 'book-open' : 'pencil');
    b.setAttribute('aria-label', on ? 'Done editing' : 'Edit here');
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
    // CSS color-mix arrived in iOS 16.2, and Obsidian runs on iOS 15: without it a blend would draw black, so use the plain hue
    const mixes = typeof CSS === 'undefined' || CSS.supports('color', 'color-mix(in srgb, red 50%, blue)');
    const parsed = new DOMParser().parseFromString(
      mixes ? this.o.drawn.svg : withoutColorMix(this.o.drawn.svg),
      'image/svg+xml',
    ).documentElement;
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
      g.setAttribute('aria-pressed', 'false');
    }
    // links: each written link in order, then the estimated ones added to the drawing (spec §3)
    const d = this.drawing(),
      written = d?.links.length ?? 0,
      named = (d?.estimates ?? []).filter((e) => e.kind === 'name');
    const textOf = (k: string) => this.boxes().find((b) => b.key === k)?.text ?? k;
    for (const g of Array.from(svg.querySelectorAll('g.edge'))) {
      const n = Number(/^edge(\d+)$/.exec(g.getAttribute('id') ?? '')?.[1]) - 1;
      const e = n < written ? d?.estimates.find((x) => x.kind === 'type' && x.index === n) : named[n - written];
      const l = n < written ? d?.links[n] : undefined;
      if (!e && l) {
        // a written link: tap it, or press Enter on it, for its details
        g.setAttribute('data-link', String(n));
        g.setAttribute('tabindex', '0');
        g.setAttribute('role', 'button');
        g.setAttribute('aria-pressed', 'false');
        g.setAttribute('aria-label', `Link: ${textOf(l.from)} ${l.reading} ${textOf(l.to)}`);
        continue;
      }
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
    const edge = el?.closest?.('g.edge'),
      estimate = edge?.getAttribute('data-estimate'),
      link = edge?.getAttribute('data-link');
    if (estimate) return { estimate: Number(estimate) };
    return link ? { link: Number(link) } : null;
  }

  private open(t: Target): void {
    if ('key' in t) this.showDetails(t.key);
    else if ('link' in t) this.showLink(t.link);
    else {
      const e = this.drawing()?.estimates[t.estimate];
      if (e) this.showEstimate(e);
    }
  }

  private bindEvents(): void {
    const vp = this.viewport;
    const use = (e: Event, ev: ZoomEvent) => {
      if (this.zoom.handle(ev)) {
        e.preventDefault();
        return true;
      }
      return false;
    };
    this.registerDomEvent(vp, 'pointerdown', (e: PointerEvent) => {
      const target = this.targetAt(e.target),
        p = this.point(e);
      if (target) this.boxDown = { id: e.pointerId, ...p, target };
      const pointer = e.pointerType === 'touch' || e.pointerType === 'pen' ? e.pointerType : 'mouse';
      if (use(e, { kind: 'down', id: e.pointerId, pointer, ...p, onBox: !!target })) {
        vp.setPointerCapture(e.pointerId);
        vp.focus({ preventScroll: true });
      }
    });
    this.registerDomEvent(vp, 'pointermove', (e: PointerEvent) => {
      use(e, { kind: 'move', id: e.pointerId, ...this.point(e) });
    });
    this.registerDomEvent(vp, 'pointerup', (e: PointerEvent) => {
      const p = this.point(e);
      use(e, { kind: 'up', id: e.pointerId, ...p, time: e.timeStamp ?? 0 });
      const down = this.boxDown;
      this.boxDown = null;
      if (down && down.id === e.pointerId && Math.hypot(p.x - down.x, p.y - down.y) < 10) this.open(down.target);
    });
    this.registerDomEvent(vp, 'pointercancel', (e: PointerEvent) => {
      this.boxDown = null;
      this.zoom.handle({ kind: 'cancel', id: e.pointerId });
    });
    this.registerDomEvent(
      vp,
      'wheel',
      (e: WheelEvent) => {
        const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * 400 : e.deltaY;
        use(e, { kind: 'wheel', ...this.point(e), dy, ctrl: e.ctrlKey, meta: e.metaKey });
      },
      { passive: false },
    );
    this.registerDomEvent(vp, 'dblclick', (e: MouseEvent) => {
      use(e, { kind: 'dblclick', ...this.point(e), onBox: !!this.targetAt(e.target) });
    });
    this.registerDomEvent(vp, 'keydown', (e: KeyboardEvent) => {
      const target = this.targetAt(e.target);
      if (target && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        this.open(target);
        return;
      }
      use(e, { kind: 'key', key: e.key, ctrl: e.ctrlKey, meta: e.metaKey, alt: e.altKey });
    });
  }

  /** Marks the box or link whose details are open — a heavier line, and pressed for screen readers — and only that one. */
  private select(key: string | null, link: number | null = null): void {
    for (const g of Array.from(this.svg.querySelectorAll('g.node, g.edge'))) {
      const on =
        (key !== null && g.getAttribute('data-key') === key) ||
        (link !== null && g.getAttribute('data-link') === String(link));
      g.classList.toggle('is-selected', on);
      if (g.hasAttribute('aria-pressed')) g.setAttribute('aria-pressed', String(on));
    }
  }

  /** What tapping a link shows: its reading, the things at either end, its properties, and any problem on it. */
  private showLink(index: number): void {
    const d = linkDetails(this.o.reading, this.o.graph, index);
    if (!d) return;
    this.select(null, index);
    const el = this.panel(`${d.from.text} ${d.reading} ${d.to.text}`, d.type);
    const ul = el.createEl('ul');
    ul.createEl('li', { text: `From: ${d.from.text}` });
    ul.createEl('li', { text: `To: ${d.to.text}` });
    if (d.properties.length && !this.o.editing?.()?.session) {
      el.createEl('h4', { text: 'Properties' });
      const props = el.createEl('ul');
      for (const [k, v] of d.properties) props.createEl('li', { text: `${k}: ${v}` });
    }
    if (d.problems.length) {
      el.createEl('h4', { text: 'Problems' });
      const probs = el.createEl('ul');
      for (const p of d.problems) probs.createEl('li', { text: problemText({ ...p, noteLine: this.o.lineOf(p) }) });
    }
    this.inspector(el, { link: index }, '');
  }

  /** The details panel, emptied and shown, with a heading and a close button. */
  private panel(title: string, kind?: string): HTMLElement {
    const el = this.detailsEl;
    el.empty();
    el.hidden = false;
    el.setAttribute('aria-label', `Details of ${title}`);
    el.toggleClass('is-sheet', Platform.isPhone && !!this.o.editing?.()?.session); // the inspector, on a phone: a bottom sheet (§14)
    const head = el.createDiv({ cls: 'graph-note-details-head' });
    head.createEl('strong', { text: title });
    if (kind) head.createSpan({ cls: 'graph-note-kind', text: kind });
    button(head, 'Close details', 'x', () => {
      el.hidden = true;
      this.select(null);
      this.viewport.focus();
      const ed = this.o.editing?.();
      if (ed) ed.selected = null;
    });
    return el;
  }

  /** What tapping an estimated link shows: in a sentence, what was written, what it was taken to mean, and the fix. */
  private showEstimate(e: Estimate): void {
    this.select(null);
    const el = this.panel('⚠ Estimated link', 'a guess, not written');
    el.createEl('p', { text: e.explain.replace(/^Line \d+/, `Line ${this.o.lineOf(e)}`) });
  }

  /** What tapping a box shows: its text, kind, links in and out, and any problem on it. */
  private showDetails(key: string): void {
    const d = details(this.o.reading, this.o.graph, key);
    if (!d) return;
    this.select(key);
    const el = this.panel(d.text, d.kind);
    const links = (title: string, items: string[]) => {
      if (!items.length) return;
      el.createEl('h4', { text: title });
      const ul = el.createEl('ul');
      for (const i of items) ul.createEl('li', { text: i });
    };
    links(
      'Links out',
      d.out.map((l) => `${l.reading} → ${l.text}`),
    );
    links(
      'Links in',
      d.in.map((l) => `${l.text} ${l.reading} this`),
    );
    if (!d.out.length && !d.in.length) el.createEl('p', { text: 'No links in or out.' });
    links(
      'Problems',
      d.problems.map((p) => problemText({ ...p, noteLine: this.o.lineOf(p) })),
    );
    this.inspector(el, { thing: key }, d.kind.split(' · ')[0] ?? '');
  }

  /**
   * The inspector (spec §14): in edit mode, every property of the thing or link, each changed, added or removed — its value
   * checked against its type first — written as text into the block being edited.
   */
  private inspector(el: HTMLElement, target: { thing: string } | { link: number }, kind: string): void {
    const ed = this.o.editing?.();
    if (!ed?.session) return;
    ed.selected = 'thing' in target ? { key: target.thing } : { link: target.link };
    const text = () => ed.session?.text ?? '';
    renderProperties(el, {
      reading: this.o.reading,
      graph: this.o.graph,
      target,
      kind,
      text,
      // a link is edited in its own brackets, counted among the links written in the block being edited
      inBlock: () =>
        'thing' in target ? target : { link: linkInBlock(this.o.reading, this.o.graph, target.link, text()) },
      replace: (t) => ed.replace(t),
    });
  }

  private openFullscreen(): void {
    if (this.fullscreen) return;
    const overlay = activeDocument.body.createDiv({
      cls: 'graph-note-fullscreen',
      attr: { role: 'dialog', 'aria-modal': 'true', 'aria-label': `Graph ${this.o.graph}, full screen` },
    });
    const view = new GraphView(overlay.createDiv({ cls: 'graph-note' }), {
      ...this.o,
      mode: 'full',
      onClose: () => this.closeFullscreen(),
    });
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
