// Finding your way from a card's details (editor spec §25, slice 3):
// - a thing's links listed by relationship type and direction in the core's words;
// - in and out each in a part of its own (details_ins_outs);
// - each linked thing and each link a button that chooses it (details_links_listed, details_choose_moves);
// - the back and forward steps of the trail of things chosen (details_trail);
// - the move to what is chosen, brief and eased, at once when the system asks for reduced motion (details_move_motion).
// The words, the walk and the easing are the core's; this puts them on the page and runs the move frame by frame.
import { MOVE_MS, glideAt, word } from '@thoughtknot/core';
import type { LinkGroup, NoteReading, Place, Trail, TrailStep, Zoom } from '@thoughtknot/core';
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
  return l
    ? word('details.link-said', { from: text(l.from), reading: l.reading, to: text(l.to) })
    : word('details.link');
}

/** A step of the trail, or the selection, by name: a thing's text, or "the link Tablet answers Which device?". */
export function stepName(reading: NoteReading, graph: string, step: TrailStep): string {
  if ('key' in step) return reading.graphs.get(graph)?.boxes.find((b) => b.key === step.key)?.text ?? step.key;
  const d = reading.graphs.get(graph),
    l = d?.links[step.link],
    text = (k: string) => d?.boxes.find((b) => b.key === k)?.text ?? k;
  return l
    ? word('details.step-link', { from: text(l.from), reading: l.reading, to: text(l.to) })
    : word('details.step-link-unknown');
}

/**
 * A thing's links in two labelled parts, in before out (details_ins_outs). Each part is headed with its name and how
 * many links it holds. Its groups are listed as `renderLinkGroups` lists them, or a line says it has none. Side by side
 * where the panel is wide, one above the other where it is narrow, as the style sheet lays them out.
 */
export function renderInsOuts(
  el: HTMLElement,
  groups: LinkGroup[],
  linkName: (link: number) => string,
  choose: (step: TrailStep) => void,
): void {
  const both = el.createDiv({ cls: 'thoughtknot-ins-outs' });
  for (const [way, title, none] of [
    ['in', word('details.links-in'), word('details.none-in')],
    ['out', word('details.links-out'), word('details.none-out')],
  ] as const) {
    const these = groups.filter((g) => g.direction === way);
    const part = both.createEl('section', { cls: `thoughtknot-links-part is-${way}` });
    const id = `thoughtknot-links-${way}-${++parts}`;
    const head = part.createEl('h4', { cls: 'thoughtknot-section-label', text: title, attr: { id } });
    part.setAttribute('aria-labelledby', id);
    head.createSpan({ cls: 'thoughtknot-count', text: String(these.reduce((n, g) => n + g.count, 0)) });
    if (these.length) renderLinkGroups(part, these, linkName, choose);
    else part.createEl('p', { cls: 'thoughtknot-none', text: none });
  }
}

/** How many parts have been drawn, so each heading's id is the page's only one. */
let parts = 0;

/**
 * A thing's groups of links, one item each, and each link on a single line of its own (details_ins_outs). A line says
 * the group's reading, then the thing at the other end. The thing is a button that chooses it. Beside it is a button
 * for each link that reaches it. The first line of a group of more than one link says how many it holds.
 */
export function renderLinkGroups(
  el: HTMLElement,
  groups: LinkGroup[],
  linkName: (link: number) => string,
  choose: (step: TrailStep) => void,
): void {
  const ul = el.createEl('ul', { cls: 'thoughtknot-link-groups' });
  for (const g of groups) {
    const li = ul.createEl('li', { cls: 'thoughtknot-link-group' });
    // the reading, or, where none could be guessed, the words after the names: "part of plan this"
    const words = (g.before || g.after.replace(/ \(\d+\)$/, '')).trim();
    const rows = li.createEl('ul', { cls: 'thoughtknot-link-rows' });
    g.things.forEach((t, i) => {
      const row = rows.createEl('li', { cls: 'thoughtknot-link-row' });
      const reading = row.createSpan({ cls: 'thoughtknot-link-reading', text: words });
      if (i === 0 && g.count > 1) reading.createSpan({ cls: 'thoughtknot-count', text: String(g.count) });
      thingButton(row, t.text, () => choose({ key: t.key }));
      // a thing linked twice in the same way is named once, with a button for each of its links
      for (const n of t.links)
        button(row, linkName(n), 'link', () => choose({ link: n })).addClass('thoughtknot-link-choice');
    });
  }
}

/** A button naming a thing, which chooses it. */
export function thingButton(parent: HTMLElement, text: string, onClick: () => void): HTMLButtonElement {
  const b = parent.createEl('button', { cls: 'thoughtknot-link-thing', text, attr: { type: 'button' } });
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
  const row = el.createDiv({
    cls: 'thoughtknot-trail',
    attr: { role: 'navigation', 'aria-label': word('details.trail') },
  });
  if (back)
    button(row, word('details.back-to', { name: name(back) }), 'arrow-left', () => go('back'), word('details.back'));
  if (next)
    button(
      row,
      word('details.forward-to', { name: name(next) }),
      'arrow-right',
      () => go('forward'),
      word('details.forward'),
    );
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
