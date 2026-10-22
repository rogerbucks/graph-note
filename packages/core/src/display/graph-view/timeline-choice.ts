// A timeline's order and what it shows, on a drawing's card (spec §15, timeline_choice_card). A card drawn as a
// timeline offers Order and Show, each a native menu with its label in words. The card decides what a choice does.
// Where the note is edited it is saved in the style graph. In reading view it is only looked at.
import { TIMELINE_ORDERS, TIMELINE_SHOWS, word } from '@thoughtknot/core';
import type { DiagramWrite } from '@thoughtknot/core';

/** What a timeline's Diagram chooses that a card offers: how it is ordered, and what it shows. */
export interface TimelinePick {
  order?: string;
  show?: string;
}

/** What a card drawn as a timeline shows of it: the order it is drawn in, and what it shows. */
export interface TimelineShown {
  order: string;
  show: string;
}

/**
 * The whole Diagram to write or look at when `pick` changes the timeline `now` is: the rest of it kept. A `by` is kept
 * only while the order is still by date or number, as it means nothing for another.
 */
export function timelineChange(now: DiagramWrite, pick: TimelinePick): DiagramWrite {
  const next: DiagramWrite = { ...now, type: 'timeline', ...pick };
  if (next.order !== 'date' && next.order !== 'number') delete next.by;
  return next;
}

/** Puts Order and Show under the card's strip in `root`; `pick` is told each choice. Returns the row. */
export function renderTimelineChoice(
  root: HTMLElement,
  t: TimelineShown,
  pick: (p: TimelinePick) => void,
): HTMLElement {
  const row = root.createDiv({
    cls: 'thoughtknot-timeline',
    attr: { role: 'group', 'aria-label': word('timeline.choice') },
  });
  const menu = <T extends string>(key: 'order' | 'show', among: readonly T[], said: (v: T) => string, now: string) => {
    const label = word(`timeline.${key}`);
    const s = row
      .createEl('label', { text: label })
      .createEl('select', { cls: 'dropdown', attr: { 'aria-label': label } });
    for (const v of among) s.createEl('option', { text: said(v), attr: { value: v } });
    s.value = now;
    s.addEventListener('change', () => pick({ [key]: s.value }));
  };
  menu('order', TIMELINE_ORDERS, (v) => word(`timeline.order.${v}`), t.order);
  menu('show', TIMELINE_SHOWS, (v) => word(`timeline.show.${v}`), t.show);
  return row;
}
