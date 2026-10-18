// Names, labels and values as the person wrote them keep their own direction (editor spec §42, bidi_labels): each element
// of the interface that shows one is read from its first strong letter and set apart from the words around it, so an
// Arabic name in an English panel, or an English one in a Hebrew panel, is never reordered. The drawing and the exports
// are still to come (the requirement's test is partial).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const root = new URL('../../../', import.meta.url);
const css = readFileSync(new URL('styles.css', root), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

/** Each element that shows the person's own words, by its selector, with the class the display layer gives it. */
const SHOWN = {
  '.graph-note-quick-name': 'graph-note-quick-name',
  '.graph-note-quick-kind': 'graph-note-quick-kind',
  '.graph-note-quick-properties li': 'graph-note-quick-properties',
  '.graph-note-quick-note': 'graph-note-quick-note',
  '.graph-note-details-head strong': 'graph-note-details-head',
  '.graph-note-kind': 'graph-note-kind',
  '.graph-note-link-thing': 'graph-note-link-thing',
  '.graph-note-table td': 'graph-note-table',
  '.graph-note-details .metadata-property-key': 'metadata-property-key',
  '.graph-note-details .metadata-property-value': 'metadata-property-value',
};

/** The display layer's source, every file, as one text. */
function displaySource(dir = new URL('packages/core/src/display/', root)) {
  return readdirSync(dir, { withFileTypes: true })
    .map((e) =>
      e.isDirectory() ? displaySource(new URL(`${e.name}/`, dir)) : readFileSync(new URL(e.name, dir), 'utf8'),
    )
    .join('\n');
}

describe('the person’s own words keep their own direction', () => {
  test('each element that shows a name, a label or a value is read from its first strong letter, set apart', () => {
    const rule = [...css.matchAll(/([^{}]+)\{([^{}]*unicode-bidi: plaintext;[^{}]*)\}/g)].flatMap((m) =>
      m[1].split(',').map((s) => s.replace(/\s+/g, ' ').trim()),
    );
    assert.deepEqual(rule.sort(), Object.keys(SHOWN).sort());
  });

  test('each of those elements is one the display layer makes', () => {
    const source = displaySource();
    for (const [selector, cls] of Object.entries(SHOWN))
      assert.ok(source.includes(`'${cls}'`) || source.includes(`${cls} `), `${selector}: no element has ${cls}`);
  });
});
