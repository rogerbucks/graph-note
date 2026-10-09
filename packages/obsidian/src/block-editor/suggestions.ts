// The block editor's suggestions (spec §4): names, kinds and relationships already in the graph, offered as buttons where
// the caret is, and the one chosen written into the field in place of what was being typed.
import type { CompletionItem } from '@graph-note/core';
import { button } from './editor-layout';

/** Shows up to twelve suggestions as buttons, or hides the bar when there are none. */
export function showSuggestions(
  bar: HTMLElement,
  items: CompletionItem[],
  accept: (item: CompletionItem) => void,
): void {
  bar.empty();
  bar.hidden = !items.length;
  for (const item of items.slice(0, 12)) {
    const shown = item.insertText ?? item.label;
    button(bar, item.detail ? `${shown} — ${item.detail}` : shown, null, () => accept(item), shown);
  }
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
