// Every keyboard shortcut in one list (editor spec §44, shortcuts_listed). The list is the one table the help shows.
// So it must hold every key the drawing and the editor answer. A key a handler answers but the list leaves out is a
// shortcut no one can find. Each row says its keys and what it does in the catalogue's words.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SHORTCUTS, SHORTCUT_PLACES } from '../src/shortcuts.ts';
import { SOURCE_WORDS } from '../src/source-words.ts';

/** The files whose key handlers the list must cover. */
const HANDLERS = [
  'src/zoom.ts',
  'src/display/graph-view/viewport-events.ts',
  'src/display/graph-view/box-move-keys.ts',
  'src/display/graph-view/selection.ts',
  'src/display/editor/typing-keys.ts',
];

/** Each key a handler compares a key event with, as `key === 'x'`, written as the list writes it. */
function answered() {
  const keys = new Set();
  for (const file of HANDLERS) {
    const text = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
    for (const m of text.matchAll(/key === '([^']+)'/g)) keys.add(m[1].toLowerCase());
    if (text.includes("startsWith('Arrow')")) for (const a of ['arrowup', 'arrowdown']) keys.add(a);
  }
  return keys;
}

describe('the list of keyboard shortcuts', () => {
  // proves: shortcuts_listed
  test('holds every key the drawing and the editor answer', () => {
    const listed = new Set(SHORTCUTS.flatMap((s) => s.keys.map((k) => k.toLowerCase())));
    const missing = [...answered()].filter((k) => !listed.has(k));
    assert.deepEqual(missing, [], 'answered by a handler, but not listed');
    assert.ok(listed.has('?'), 'and the key that shows the list');
  });

  // proves: shortcuts_listed
  test('says the keys and what each does in the catalogue’s words, under the place it works', () => {
    const ids = SHORTCUTS.map((s) => s.id);
    assert.equal(new Set(ids).size, ids.length, 'each row named once');
    for (const s of SHORTCUTS) {
      assert.ok(SHORTCUT_PLACES.includes(s.place), `${s.id}: a known place`);
      assert.equal(typeof SOURCE_WORDS[`shortcut.${s.id}`], 'string', `${s.id}: what it does`);
      assert.equal(typeof SOURCE_WORDS[`shortcut.${s.id}.keys`], 'string', `${s.id}: its keys`);
    }
    for (const place of SHORTCUT_PLACES) assert.equal(typeof SOURCE_WORDS[`shortcuts.place.${place}`], 'string');
  });

  // proves: shortcuts_listed
  test('marks the drawing’s commands, which the host lets a person give keys of their own', () => {
    assert.deepEqual(
      SHORTCUTS.filter((s) => s.command).map((s) => s.id),
      ['zoom-in', 'zoom-out', 'fit', 'full-screen', 'shortcuts'],
    );
  });
});
