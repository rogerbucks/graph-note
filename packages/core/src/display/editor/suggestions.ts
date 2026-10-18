// The block editor's suggestions (spec §4): names, kinds and relationships already in the graph. They drop down under
// the caret as a list the field's own keys work. The arrows move the choice, Enter or Tab takes it, and Escape closes
// it. So the hands never leave the keys (keyboard_any_device). The one chosen is written into the field in place of
// what was being typed. A click takes one too, the focus kept in the field.
import type { CompletionItem } from '@thoughtknot/core';

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
      cls: 'thoughtknot-suggestion',
      attr: { role: 'option', id: `${list.id}-${i}`, 'aria-selected': String(i === active) },
    });
    option.createSpan({ cls: 'thoughtknot-suggestion-name', text: item.insertText ?? item.label });
    if (item.detail) option.createSpan({ cls: 'thoughtknot-suggestion-detail', text: item.detail });
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

/** The parts of the coloured picture that are not the field's text: the ghost text, and the sign and note after a line. */
const NOT_TEXT = ['thoughtknot-ghost', 'thoughtknot-line-end'];

/** Where the caret is in the picture, as a collapsed range at the `at`th character of the field's text, if it can be found. */
function caretIn(overlay: HTMLElement, at: number): Range | null {
  let left = at;
  const walk = (node: Node): Range | null => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === 3) {
        const len = child.textContent?.length ?? 0;
        if (left <= len) {
          const r = overlay.doc.createRange();
          r.setStart(child, left);
          return r;
        }
        left -= len;
      } else if (child.nodeType === 1 && !NOT_TEXT.some((c) => (child as HTMLElement).hasClass(c))) {
        const r = walk(child);
        if (r) return r;
      }
    }
    return null;
  };
  return walk(overlay);
}

/**
 * Puts the list under the caret, on the row it is on. It is measured in the coloured picture, which wraps as the field
 * does (long_lines_wrap). Where nothing can be measured, it goes under its line at its column, the field being in a
 * fixed-width font.
 */
export function placeSuggestions(list: HTMLElement, t: HTMLTextAreaElement, overlay?: HTMLElement): void {
  const at = t.selectionStart ?? t.value.length,
    before = t.value.slice(0, at);
  const line = before.split('\n').length - 1,
    column = before.length - before.lastIndexOf('\n') - 1;
  const props: Record<string, string> = {
    '--thoughtknot-caret-line': String(line),
    '--thoughtknot-caret-column': String(column),
    '--thoughtknot-caret-scroll': `${t.scrollLeft}px`,
  };
  try {
    const box = overlay && caretIn(overlay, at)?.getBoundingClientRect(),
      frame = list.parentElement?.getBoundingClientRect();
    if (box && frame && box.height) {
      props['--thoughtknot-caret-top'] = `${box.bottom - frame.top}px`;
      props['--thoughtknot-caret-left'] = `${box.left - frame.left}px`;
    }
  } catch {
    // a page that cannot measure a range: the line and column above
  }
  list.setCssProps(props);
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
