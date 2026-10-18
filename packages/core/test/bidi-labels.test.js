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
  '.thoughtknot-quick-name': 'thoughtknot-quick-name',
  '.thoughtknot-quick-kind': 'thoughtknot-quick-kind',
  '.thoughtknot-quick-properties li': 'thoughtknot-quick-properties',
  '.thoughtknot-quick-note': 'thoughtknot-quick-note',
  '.thoughtknot-details-head strong': 'thoughtknot-details-head',
  '.thoughtknot-kind': 'thoughtknot-kind',
  '.thoughtknot-link-thing': 'thoughtknot-link-thing',
  '.thoughtknot-table td': 'thoughtknot-table',
  '.thoughtknot-details .metadata-property-key': 'metadata-property-key',
  '.thoughtknot-details .metadata-property-value': 'metadata-property-value',
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
