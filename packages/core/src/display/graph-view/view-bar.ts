// A drawing's bar (spec §3): the problems badge, Fit, zoom out, zoom in, Find a thing, Filter by kind or link, View (§25),
// Full screen, and where the note is edited, Edit here and Edit in pane; in reading view, Source. Each control says what
// it is in words as well as by its icon.
import { setIcon } from '../host';
import { parkedCount, word } from '@graph-note/core';
import type { ViewOptions } from './view-options';

/** A number of things, in words: "1 problem", "2 problems". */
export const plural = (n: number, one: string): string => `${n} ${one}${n === 1 ? '' : 's'}`;

/** How the badge says what is parked for later (§8): ", 2 parked, 1 overdue", or nothing when nothing is. */
const parkedWords = (count: { parked: number; overdue: number } | undefined): string[] =>
  count?.parked
    ? [
        word('bar.parked', { count: count.parked }),
        ...(count.overdue ? [word('bar.overdue', { count: count.overdue })] : []),
      ]
    : [];

/** An icon button named for screen readers, with words beside the icon when given. */
export function button(
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

/** What the bar's buttons do. */
export interface BarActions {
  /** The badge: shows or hides the problems behind it, and says which. */
  toggleProblems: (badge: HTMLButtonElement) => void;
  fit: () => void;
  zoomOut: () => void;
  zoomIn: () => void;
  /** Find a thing: opens or closes the search row, and says which (§25). */
  find: (b: HTMLButtonElement) => void;
  /** Filter by kind or link: opens or closes the legend that untangles, and says which (§25). */
  legend: (b: HTMLButtonElement) => void;
  /** View: opens or closes the View menu's switches, and says which (§25). */
  view: (b: HTMLButtonElement) => void;
  fullScreen: () => void;
  editHere: () => void;
  toggleSource: (b: HTMLButtonElement) => void;
  /** Export: shows or hides the Export form. */
  export: () => void;
}

/** The bar's buttons that depend on where the card is: the edit buttons, and Source. */
export interface BarPlaced {
  /** Edit here, which shows whether the card is being edited. */
  editButton: HTMLButtonElement | null;
  /** The buttons that edit, taken away in reading view. */
  editing: HTMLElement[];
  /** Source, taken away where the note is edited. */
  source: HTMLButtonElement | null;
}

/** Builds the bar of a drawing at the top of its card. */
export function renderBar(root: HTMLElement, o: ViewOptions, on: BarActions): BarPlaced {
  const { problems, mode } = o;
  const bar = root.createDiv({
    cls: 'graph-note-bar',
    attr: { role: 'toolbar', 'aria-label': word('bar.name', { graph: o.graph }) },
  });
  const gaps = o.completeness?.gaps ?? 0;
  // a hint only offers a fix, so it is listed behind the badge but never counted in it
  const counted = problems.filter((p) => p.severity !== 'hint').length;
  // things parked for later are counted apart from problems, and those past their revisit date as overdue (§8)
  const found = [
    ...(counted ? [word('bar.problems', { count: counted })] : []),
    ...(gaps ? [word('bar.gaps', { count: gaps })] : []),
  ];
  const label = [
    ...(found.length ? found : [word('bar.no-problems')]),
    ...parkedWords(o.parked && parkedCount(o.parked)),
  ].join(', ');
  const badge = button(
    bar,
    label,
    counted || gaps ? 'alert-triangle' : 'check-circle',
    () => on.toggleProblems(badge),
    label,
  );
  badge.addClass('graph-note-badge');
  badge.setAttribute('aria-expanded', 'false');
  button(bar, word('bar.fit'), 'maximize', () => on.fit());
  button(bar, word('bar.zoom-out'), 'zoom-out', () => on.zoomOut());
  button(bar, word('bar.zoom-in'), 'zoom-in', () => on.zoomIn());
  // finding a thing and filtering by kind only change the picture, never the note, so they are offered wherever it is (§25);
  // a graph drawn as a table (§15) has nothing to fade or hide, so there it is found but never filtered
  const find = button(bar, word('bar.find'), 'search', () => on.find(find));
  find.setAttribute('aria-expanded', 'false');
  if (!o.diagram?.table) {
    const legend = button(bar, word('bar.filter'), 'filter', () => on.legend(legend));
    legend.setAttribute('aria-expanded', 'false');
  }
  // the View menu's switches change the drawing alone, so it is offered wherever the drawing is (§25)
  if (o.switches) {
    const view = button(bar, word('bar.view'), 'layers', () => on.view(view));
    view.setAttribute('aria-expanded', 'false');
  }
  if (mode === 'full') button(bar, word('bar.close-full-screen'), 'minimize', () => o.onClose?.());
  else button(bar, word('bar.full-screen'), 'expand', () => on.fullScreen());
  // Export writes a new file, never the note, so it is offered wherever the drawing is (spec §16)
  if (o.exporting) button(bar, word('bar.export'), 'download', () => on.export());
  const editing: HTMLElement[] = [];
  let editButton: HTMLButtonElement | null = null;
  if (mode !== 'pane' && o.onEditHere) {
    editButton = button(bar, word('bar.edit-here'), 'pencil', () => on.editHere());
    editing.push(editButton);
  }
  if (mode !== 'pane') editing.push(button(bar, word('bar.edit-in-pane'), 'panel-right-open', () => o.onEdit()));
  const source: HTMLButtonElement | null =
    mode === 'note' ? button(bar, word('bar.show-source'), 'code', () => source && on.toggleSource(source)) : null;
  return { editButton, editing, source };
}
