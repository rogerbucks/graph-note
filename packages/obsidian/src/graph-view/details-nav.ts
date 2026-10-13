// Finding your way from a card's details (editor spec §25, slice 3): a thing's links listed by relationship type and
// direction in the core's words, each linked thing and each link a button that chooses it (details_links_listed,
// details_choose_moves); the back and forward steps of the trail of things chosen (details_trail); and the move to what
// is chosen, brief and eased, at once when the system asks for reduced motion (details_move_motion). The words, the walk
// and the easing are the core's; this puts them on the page and runs the move frame by frame.
import { MOVE_MS, glideAt } from '@graph-note/core';
import type { LinkGroup, NoteReading, Place, Trail, TrailStep, Zoom } from '@graph-note/core';
import { button } from './view-bar';

/** What the details ask of their card when something is chosen from them. */
export interface NavActions {
  /** Makes a thing or link the selection, shows its details and brings it into view, readable (§25). */
  choose: (step: TrailStep) => void;
  /** The details sheet opened or changed size: the card keeps the chosen thing clear above it. */
  sheetMoved: () => void;
}

/** A link in words, as the drawing names it for screen readers: "Link: Tablet answers Which device?". */
export function linkWords(reading: NoteReading, graph: string, link: number): string {
  const d = reading.graphs.get(graph),
    l = d?.links[link],
    text = (k: string) => d?.boxes.find((b) => b.key === k)?.text ?? k;
  return l ? `Link: ${text(l.from)} ${l.reading} ${text(l.to)}` : 'Link';
}

/** A step of the trail, or the selection, by name: a thing's text, or "the link Tablet answers Which device?". */
export function stepName(reading: NoteReading, graph: string, step: TrailStep): string {
  if ('key' in step) return reading.graphs.get(graph)?.boxes.find((b) => b.key === step.key)?.text ?? step.key;
  return `the link ${linkWords(reading, graph, step.link).replace(/^Link: /, '')}`;
}

/**
 * A thing's groups of links, one item each, read as the core words them: the words before the names, each name a button
 * that chooses the thing with a button beside it for each link that reaches it, and the words after, such as the count.
 */
export function renderLinkGroups(
  el: HTMLElement,
  groups: LinkGroup[],
  linkName: (link: number) => string,
  choose: (step: TrailStep) => void,
): void {
  const ul = el.createEl('ul', { cls: 'graph-note-link-groups' });
  for (const g of groups) {
    const li = ul.createEl('li', { cls: 'graph-note-link-group' });
    if (g.before) li.appendText(g.before);
    g.things.forEach((t, i) => {
      if (i > 0) li.appendText(i === g.things.length - 1 ? ' and ' : ', ');
      thingButton(li, t.text, () => choose({ key: t.key }));
      // a thing linked twice in the same way is named once, with a button for each of its links
      for (const n of t.links)
        button(li, linkName(n), 'link', () => choose({ link: n })).addClass('graph-note-link-choice');
    });
    if (g.after) li.appendText(g.after);
  }
}

/** A button naming a thing, which chooses it. */
export function thingButton(parent: HTMLElement, text: string, onClick: () => void): HTMLButtonElement {
  const b = parent.createEl('button', { cls: 'graph-note-link-thing', text, attr: { type: 'button' } });
  b.addEventListener('click', onClick);
  return b;
}

/** Back and forward along the trail, when there is a step to take, each naming where it goes. */
export function renderTrail(
  el: HTMLElement,
  trail: Trail,
  name: (step: TrailStep) => string,
  go: (way: 'back' | 'forward') => void,
): void {
  const back = trail.previous(),
    next = trail.next();
  if (!back && !next) return;
  const row = el.createDiv({ cls: 'graph-note-trail', attr: { role: 'navigation', 'aria-label': 'Trail' } });
  if (back) button(row, `Back to ${name(back)}`, 'arrow-left', () => go('back'), 'Back');
  if (next) button(row, `Forward to ${name(next)}`, 'arrow-right', () => go('forward'), 'Forward');
}

/** Whether the system asks for reduced motion. */
export const reducedMotion = (win: Window): boolean => !!win.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;

/** The move of a card's view to a chosen thing: one at a time, the next taking over from one under way. */
export class Glide {
  private readonly el: HTMLElement;
  /** Which move is under way, so a frame of one taken over or stopped does nothing. */
  private run = 0;

  /** For the card's viewport, whose window draws the frames. */
  constructor(el: HTMLElement) {
    this.el = el;
  }

  /** Moves the zoom to `to`: eased over MOVE_MS, a frame at a time, or at once when the system asks for reduced motion. */
  to(zoom: Zoom, to: Place): void {
    const run = ++this.run,
      win = this.el.win;
    if (reducedMotion(win)) {
      zoom.restore(to.scale, to.x, to.y);
      return;
    }
    const v = zoom.view(),
      from = { scale: v.scale, x: v.x, y: v.y };
    let start: number | null = null;
    const frame = (time?: number) => {
      if (run !== this.run) return;
      const now = typeof time === 'number' ? time : Date.now();
      start ??= now;
      const t = (now - start) / MOVE_MS,
        at = glideAt(from, to, t);
      zoom.restore(at.scale, at.x, at.y);
      if (t < 1) win.requestAnimationFrame(frame);
    };
    win.requestAnimationFrame(frame);
  }

  /** Stops a move under way where it is: a finger or the pointer took over, or the selection went. */
  stop(): void {
    this.run++;
  }
}
