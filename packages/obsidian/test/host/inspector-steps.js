// What the tests of the inspector do by hand: open a box's details while editing in place, find a property's row and a
// field by its label, set a field and let it go, pick from a type menu — and the same for a list's chips.
import assert from 'node:assert/strict';
import { until } from './load-plugin.js';
import { labelled } from './notes.js';
import { show } from './card-notes.js';
import { word } from '@graph-note/core';

/** Opens the block for editing in place and waits for its text field. */
export async function editing(env) {
  const el = await show(env);
  labelled(el, word('bar.edit-here')).click();
  await until(() => !!el.querySelector('textarea'));
  return el;
}

/** Taps the box whose key is given (by keyboard), opening its details. */
export const tapKey = (el, key) =>
  el
    .querySelectorAll('g.node')
    .find((n) => n.getAttribute('data-key') === key)
    .dispatch('keydown', { key: 'Enter' });

/** The text of the block as typed in the edit field. */
export const text = (el) => el.querySelector('textarea').value;

/** The input in `el` named by its label. */
export const field = (el, label) => el.querySelectorAll('input').find((x) => x.getAttribute('aria-label') === label);

/** A property's row, by its name — or, for a list, by its relationship. */
export const row = (el, key) => el.querySelector(`.metadata-property[data-property-key="${key}"]`);

/** Sets a field as a person would, and lets it go: the change is written when the field is left. */
export function enter(input, value) {
  input.value = value;
  input.dispatch('change');
}

/** Opens a property's type menu, from its icon, and picks an item. */
export function pick(env, el, key, title) {
  row(el, key).querySelector('.metadata-property-icon').click();
  const menu = env.state.menus.at(-1);
  const item = menu.items.find((it) => it.title === title);
  assert.ok(item, `${title} in ${menu.items.map((it) => it.title)}`);
  item.click();
}

/** The words on a list's chips, in order. */
export const chips = (el, rel) =>
  row(el, rel)
    .querySelectorAll('.multi-select-pill .multi-select-pill-content')
    .map((c) => c.textContent);

/** Presses the x on the chip whose words are given. */
export function removeChip(el, rel, words) {
  const pill = row(el, rel)
    .querySelectorAll('.multi-select-pill')
    .find((p) => p.querySelector('.multi-select-pill-content').textContent === words);
  assert.ok(pill, `a chip ${words}`);
  pill.querySelector('.multi-select-pill-remove-button').click();
}

/** Types a value in a list's add field and presses Enter. */
export function addChip(el, rel, words) {
  const input = row(el, rel).querySelector('input.multi-select-input');
  input.value = words;
  input.dispatch('keydown', { key: 'Enter' });
}

/** Chooses List for a property and fills in the form that asks for the kind and the relationship. */
export function makeList(env, el, key, kind, rel) {
  pick(env, el, key, 'List');
  enter(field(el, 'Kind of the linked things'), kind);
  enter(field(el, 'Relationship from this thing'), rel);
  labelled(el, 'Make list').click();
}
