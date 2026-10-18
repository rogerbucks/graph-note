// Quick info (editor spec §24, quick_info, quick_info_no_hover_only): pointing at a thing or a link for a moment shows a
// tooltip, in the theme's style, with its name, its kind, how a thing is linked, its first few properties, how many problems it has and the first
// paragraph of its note, rendered as the details render it. It also opens by a long press on touch and when the thing has
// the keyboard focus, so nothing depends on hover (§5), and then describes it, so a screen reader reads it
// (quick_info_read_aloud); Escape closes it; and it is put beside the thing, never over it.
// The tooltip is made of text, and the note by Obsidian's own renderer through the card's links; it sits on the page itself,
// so no card clips it and a full-screen card does not hide it. One tooltip to a card, taken away with the card.
import { readInHostDirection } from '../host';
import { Lifecycle } from '../lifecycle';
import { word } from '@thoughtknot/core';
import type { View } from '@thoughtknot/core';
import { infoOf } from './quick-info-content';
import { placeTip } from './quick-info-place';
import type { Box } from './quick-info-place';
import { targetAt } from './taps';
import type { Taps, Target } from './taps';
import type { ViewOptions } from './view-options';

/** How long a pointer must stay, and a finger must be held, before the tooltip opens, in milliseconds. */
const HOVER_MS = 500,
  HOLD_MS = 500;
/** How far a held finger may move, in pixels, and still be held. */
const SLOP = 10;

/** What the tooltip asks of its card. */
export interface QuickInfoHost {
  o: ViewOptions;
  svg: () => SVGSVGElement | null;
  viewport: () => HTMLElement;
  view: () => View;
  taps: Taps;
  /** Whether the focus that arrived was the keyboard's, not a click's. */
  byKeyboard: () => boolean;
}

/** How many tooltips have been made, so each has the page's only id. */
let tips = 0;

/** A thing or a link the tooltip can speak of. */
type Subject = { key: string } | { link: number };
/** How it was opened. */
type Via = 'hover' | 'focus' | 'hold';

const subjectOf = (target: EventTarget | null): { subject: Subject; at: Element } | null => {
  const t: Target | null = targetAt(target);
  const at = (target as Element | null)?.closest?.('g.node, g.edge, tr[data-key], tr[data-link]');
  if (!t || !at || 'estimate' in t) return null;
  return { subject: t, at };
};

const same = (a: Subject | null, b: Subject | null): boolean =>
  !!a && !!b && ('key' in a ? 'key' in b && a.key === b.key : 'link' in b && a.link === b.link);

/** The quick info of one card. */
export class QuickInfo {
  private readonly host: QuickInfoHost;
  private el: HTMLElement | null = null;
  private owner: Lifecycle | null = null;
  /** Counts the tooltips asked for, so one asked for and left before it was rendered is never shown. */
  private token = 0;
  private timer: number | null = null;
  /** What the pointer is over, so moving between the parts of one thing starts nothing again. */
  private pointed: Subject | null = null;
  private shown: { via: Via; at: Element } | null = null;
  /** The finger held down, and whether holding opened the tooltip, so the lift is not a tap. */
  private held: { id: number; x: number; y: number } | null = null;
  private fired = false;

  constructor(host: QuickInfoHost) {
    this.host = host;
  }

  /** The pointer arrived on something: a mouse or pen waits a moment on a thing or link. A finger is not hovering. */
  over(e: PointerEvent): void {
    if (e.pointerType === 'touch') return;
    const s = subjectOf(e.target);
    if (!s) return this.leave();
    if (same(this.pointed, s.subject)) return;
    this.leave();
    this.pointed = s.subject;
    this.after(HOVER_MS, () => this.show(s.subject, s.at, 'hover'));
  }

  /** The pointer is leaving something; moving between the parts of one thing or link keeps the tooltip. */
  out(e: PointerEvent): void {
    if (e.pointerType === 'touch') return;
    const to = subjectOf(e.relatedTarget)?.subject ?? null;
    if (to && same(to, subjectOf(e.target)?.subject ?? null)) return;
    this.leave();
  }

  /** A thing or link took the keyboard's focus: its tooltip opens at once. A click's focus opens nothing. */
  focusIn(e: FocusEvent): void {
    if (!this.host.byKeyboard()) return;
    const s = subjectOf(e.target);
    if (s) void this.show(s.subject, s.at, 'focus');
  }

  /** The focus left: a tooltip it opened closes. */
  focusOut(): void {
    if (this.shown?.via === 'focus') this.hide();
  }

  /** A pointer went down: any tooltip closes, and a finger or pen on a thing or link starts to be held. */
  pressed(e: PointerEvent): void {
    this.hide();
    this.fired = false;
    const s = e.pointerType === 'touch' || e.pointerType === 'pen' ? subjectOf(e.target) : null;
    if (!s) return;
    this.held = { id: e.pointerId, x: e.clientX, y: e.clientY };
    this.after(HOLD_MS, () => {
      // nothing to show: the hold is nothing, and the lift is a tap as any other
      if (!infoOf(this.host.o.reading, this.host.o.graph, s.subject)) return;
      this.fired = true;
      return this.show(s.subject, s.at, 'hold');
    });
  }

  /** The pointer moved: a finger that has gone further than a fingertip's slop is dragging, not holding. */
  moved(e: PointerEvent): void {
    const h = this.held;
    if (h && h.id === e.pointerId && Math.hypot(e.clientX - h.x, e.clientY - h.y) > SLOP) this.release();
  }

  /** The pointer lifted or was cancelled; true when the hold had opened the tooltip, so the lift is not a tap. */
  released(id: number): boolean {
    if (this.held?.id !== id) return false;
    const fired = this.fired;
    this.release();
    this.fired = false;
    return fired;
  }

  /** A key was pressed: Escape closes the tooltip, and the focus stays where it is. */
  key(e: KeyboardEvent): void {
    if (e.key === 'Escape') this.hide();
  }

  /** The tooltip closes and anything waited for is let go. */
  hide(): void {
    this.cancel();
    this.token++;
    this.pointed = null;
    if (this.shown?.via === 'focus') this.shown.at.removeAttribute('aria-describedby');
    this.shown = null;
    if (this.el) this.el.hidden = true;
    this.owner?.unload();
    this.owner = null;
  }

  /** The card goes: the tooltip goes with it. */
  onunload(): void {
    if (this.timer !== null) window.clearTimeout(this.timer);
    this.timer = null;
    this.hide();
    this.el?.remove();
    this.el = null;
  }

  private leave(): void {
    this.cancel();
    this.pointed = null;
    if (this.shown?.via === 'hover') this.hide();
  }

  private release(): void {
    this.cancel();
    this.held = null;
  }

  /** Waits `ms` for `then`, letting go of any wait before it. */
  private after(ms: number, then: () => void | Promise<void>): void {
    this.cancel();
    this.timer = window.setTimeout(() => {
      this.timer = null;
      void then();
    }, ms);
  }

  private cancel(): void {
    if (this.timer !== null) window.clearTimeout(this.timer);
    this.timer = null;
  }

  /** Opens the tooltip for a subject: its words, its note rendered, then put beside the thing and shown. */
  private async show(subject: Subject, at: Element, via: Via): Promise<void> {
    const o = this.host.o,
      info = infoOf(o.reading, o.graph, subject);
    if (!info) return;
    this.hide();
    this.pointed = via === 'hover' ? subject : null;
    const token = this.token;
    const owner = new Lifecycle();
    owner.load();
    this.owner = owner;
    const el = (this.el ??= readInHostDirection(
      activeDocument.body.createDiv({
        cls: 'thoughtknot-quick-info',
        attr: { role: 'tooltip', id: `thoughtknot-tip-${++tips}` },
      }),
    ));
    el.hidden = true;
    el.empty();
    const head = el.createDiv({ cls: 'thoughtknot-quick-head' });
    head.createEl('strong', { cls: 'thoughtknot-quick-name', text: info.name });
    head.createSpan({ cls: 'thoughtknot-quick-kind', text: info.kind });
    if (info.links) el.createDiv({ cls: 'thoughtknot-quick-links', text: info.links });
    if (info.properties.length) {
      const ul = el.createEl('ul', { cls: 'thoughtknot-quick-properties' });
      for (const p of info.properties) ul.createEl('li', { text: p });
    }
    el.createDiv({
      cls: 'thoughtknot-quick-problems',
      text: info.problems ? word('bar.problems', { count: info.problems }) : word('bar.no-problems'),
    });
    if (info.note) {
      const box = el.createDiv({ cls: 'thoughtknot-quick-note' });
      if (o.links) await o.links.render(info.note, box, owner);
      else box.setText(info.note);
    }
    // asked for again, or closed, while the note was being rendered: this one is no longer wanted
    if (token !== this.token) return;
    this.shown = { via, at };
    el.hidden = false;
    // the thing with the focus is described by its tooltip, so a screen reader reads it (quick_info_read_aloud)
    if (via === 'focus') at.setAttribute('aria-describedby', el.id);
    this.place(el, at);
  }

  /** Puts the tooltip beside the thing, as the page lays the thing out now, never over it. */
  private place(el: HTMLElement, at: Element): void {
    const anchor = this.anchor(at);
    if (!anchor) return;
    const size = el.getBoundingClientRect();
    const win = activeWindow,
      p = placeTip(
        anchor,
        { width: size.width, height: size.height },
        { width: win.innerWidth || Infinity, height: win.innerHeight || Infinity },
      );
    el.setCssProps({ '--thoughtknot-qi-x': `${p.x}px`, '--thoughtknot-qi-y': `${p.y}px` });
  }

  /** Where the thing or link is on the page: its box in the drawing, as the view shows it, or a table row's. */
  private anchor(at: Element): Box | null {
    const svg = this.host.svg();
    if (!svg) {
      const r = at.getBoundingClientRect();
      return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
    }
    const b = this.host.taps.bounds(at.getAttribute('id') ?? '');
    if (!b) return null;
    const v = this.host.view(),
      r = this.host.viewport().getBoundingClientRect();
    return {
      left: r.left + v.x + b.x * v.width,
      top: r.top + v.y + b.y * v.height,
      right: r.left + v.x + (b.x + b.width) * v.width,
      bottom: r.top + v.y + (b.y + b.height) * v.height,
    };
  }
}
