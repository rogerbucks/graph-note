// A gql block that is not a graph to draw — a query, a schema, an excerpt, or a graph that cannot be read — shown as
// code, coloured by the same tokenizer as the gql-highlight plugin (spec §4, "colour"), with a copy button.
import { Notice, setIcon } from 'obsidian';
import { tokenize } from '@graph-note/core';

export function renderCode(parent: HTMLElement, source: string): HTMLElement {
  const pre = parent.createEl('pre', { cls: 'language-gql graph-note-code' });
  const code = pre.createEl('code', { cls: 'language-gql is-loaded' });
  for (const t of tokenize(source)) {
    if (t.c) code.createSpan({ cls: `gql-${t.c}`, text: t.s });
    else code.appendText(t.s);
  }
  const copy = pre.createEl('button', { cls: 'copy-code-button', attr: { 'aria-label': 'Copy', type: 'button' } });
  setIcon(copy, 'copy');
  copy.addEventListener('click', () => {
    void navigator.clipboard.writeText(source).then(() => new Notice('Copied'));
  });
  return pre;
}
