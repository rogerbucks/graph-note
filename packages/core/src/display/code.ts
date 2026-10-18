// A gql block that is not a graph to draw is shown as code, with a copy button. Such a block is a query, a schema, an
// excerpt, or a graph that cannot be read. It is coloured by the same tokenizer as the gql-highlight plugin (spec §4,
// "colour"). A very long one is shown plain (spec §9, layout_contained): coloured, it would be hundreds of thousands of
// elements on the page.
import { tokenize, word } from '@thoughtknot/core';
import { notice, setIcon } from './host';

/** The longest text coloured, in characters: about 2,000 lines of a graph, far more than is read at a glance. */
const COLOURED_UP_TO = 100_000;

/** A gql block that is not a graph, such as a query, shown as coloured code with a copy button. */
export function renderCode(parent: HTMLElement, source: string): HTMLElement {
  const pre = parent.createEl('pre', { cls: 'language-gql thoughtknot-code' });
  const code = pre.createEl('code', { cls: 'language-gql is-loaded' });
  if (source.length > COLOURED_UP_TO) code.setText(source);
  else
    for (const t of tokenize(source)) {
      if (t.c) code.createSpan({ cls: `gql-${t.c}`, text: t.s });
      else code.appendText(t.s);
    }
  const copy = pre.createEl('button', {
    cls: 'copy-code-button',
    attr: { 'aria-label': word('code.copy'), type: 'button' },
  });
  setIcon(copy, 'copy');
  copy.addEventListener('click', () => {
    // a device may refuse the clipboard, as a phone can: that is said, never left to fail without a word
    void navigator.clipboard.writeText(source).then(
      () => notice(word('code.copied')),
      () => notice(word('code.copy-refused')),
    );
  });
  return pre;
}
