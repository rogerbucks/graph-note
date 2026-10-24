// The properties of a thing chosen in the overview of a graph too large to read at once (editor spec §53,
// scale_in_parts). They show under the overview, each in a field. The host writes a change to the note's text first
// (editInParts), and says why when it cannot. Read only, the fields are shown but cannot be changed.
import { word } from '@thoughtknot/core';
import type { PropType } from '@thoughtknot/core';

/** What the properties need from their host: the thing, and how to write a change, or that they are read only. */
export interface MassiveThing {
  key: string;
  props: Readonly<Record<string, unknown>>;
  readOnly: boolean;
  /** Writes `prop` as `words`, read as `type`. Resolves to why it was not written, or null. */
  change: (prop: string, type: PropType, words: string) => Promise<string | null>;
}

/** The type a stored value is edited as, from how it was read. None: it is shown, but not edited here. */
function typeOf(value: unknown): PropType | null {
  if (typeof value === 'number') return 'number';
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value !== 'string') return null;
  if (/^\d{4}-\d\d-\d\d$/.test(value)) return 'date';
  return /^\d{4}-\d\d-\d\d[T ]\d\d:\d\d/.test(value) ? 'datetime' : 'text';
}

/** Shows the thing's properties at the end of `parent`, in place of any thing shown there before. */
export function massiveThing(parent: HTMLElement, t: MassiveThing): void {
  parent.querySelector('.thoughtknot-stored-thing')?.remove();
  const box = parent.createDiv({ cls: 'thoughtknot-stored-thing metadata-container' });
  const name = typeof t.props.name === 'string' && t.props.name ? t.props.name : t.key;
  box.createEl('h4', { text: word('massive.thing', { name }) });
  if (t.readOnly) box.createEl('p', { cls: 'thoughtknot-hint', text: word('massive.read-only') });
  const said = box.createEl('p', { cls: 'thoughtknot-hint', attr: { role: 'status' } });
  for (const [prop, value] of Object.entries(t.props)) {
    if (prop === 'id') continue;
    const type = typeOf(value);
    const row = box.createDiv({ cls: 'metadata-property' });
    row.createSpan({ cls: 'metadata-property-key', text: prop });
    const input = row.createEl('input', {
      cls: 'metadata-input metadata-input-text',
      attr: { type: 'text', 'aria-label': word('properties.value-of', { name: prop }) },
    });
    input.value = typeof value === 'string' ? value : JSON.stringify(value);
    input.disabled = t.readOnly || !type;
    if (type)
      input.addEventListener('change', () => {
        said.setText('');
        void t.change(prop, type, input.value).then((why) => {
          if (why) said.setText(word('properties.refused', { name: prop, why }));
        });
      });
  }
}
