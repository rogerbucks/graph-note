// The block editor's suggestions (spec §4): names, kinds and relationships already in the graph, dropped down under the
// caret as a list the field's own keys work — the arrows move the choice, Enter or Tab takes it, Escape closes it — so
// the hands never leave the keys (keyboard_any_device). The one chosen is written into the field in place of what was
// being typed. A click takes one too, the focus kept in the field.
import type { CompletionItem } from '@graph-note/core';

/** Shows `items` as the options of the list, the one at `active` chosen, or hides it when there are none. */
export function showSuggestions(
  list: HTMLElement,
  items: CompletionItem[],
  active: number,
  accept: (item: CompletionItem) => void,
): void {
  list.empty();
  list.hidden = !items.length;
  items.forEach((item, i) => {
    const option = list.createDiv({
      cls: 'graph-note-suggestion',
      attr: { role: 'option', id: `${list.id}-${i}`, 'aria-selected': String(i === active) },
    });
    option.createSpan({ cls: 'graph-note-suggestion-name', text: item.insertText ?? item.label });
    if (item.detail) option.createSpan({ cls: 'graph-note-suggestion-detail', text: item.detail });
    // the field keeps the focus, so typing carries on where it was
    option.addEventListener('mousedown', (e) => e.preventDefault());
    option.addEventListener('click', () => accept(item));
  });
}

/** Marks the option at `active` as chosen, and points the field at it, so a screen reader says it. */
export function chooseSuggestion(list: HTMLElement, t: HTMLTextAreaElement, active: number | null): void {
  const options = Array.from(list.querySelectorAll('[role="option"]'));
  options.forEach((o, i) => {
    o.setAttribute('aria-selected', String(i === active));
    o.toggleClass('is-selected', i === active);
  });
  const chosen = active === null || list.hidden ? undefined : options[active];
  if (chosen) {
    t.setAttribute('aria-activedescendant', chosen.id);
    chosen.scrollIntoView?.({ block: 'nearest' });
  } else t.removeAttribute('aria-activedescendant');
}

/** Puts the list under the caret's line, at its column: the field is in a fixed-width font, so a column is a character. */
export function placeSuggestions(list: HTMLElement, t: HTMLTextAreaElement): void {
  const before = t.value.slice(0, t.selectionStart ?? t.value.length);
  const line = before.split('\n').length - 1,
    column = before.length - before.lastIndexOf('\n') - 1;
  list.setCssProps({
    '--graph-note-caret-line': String(line),
    '--graph-note-caret-column': String(column),
    '--graph-note-caret-scroll': `${t.scrollLeft}px`,
  });
}

/** Writes a suggestion into the field, from where the word being typed starts to the caret, with the focus kept there. */
export function acceptSuggestion(t: HTMLTextAreaElement, item: CompletionItem, wordFrom: number): void {
  const caret = t.selectionStart ?? t.value.length,
    from = item.from ?? wordFrom,
    text = item.insertText ?? item.label;
  t.value = t.value.slice(0, from) + text + t.value.slice(caret);
  t.setSelectionRange(from + text.length, from + text.length);
  t.focus();
}
