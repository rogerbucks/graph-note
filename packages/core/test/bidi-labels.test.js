// Names, labels and values as the person wrote them keep their own direction (editor spec §42, bidi_labels). Each
// element of the interface that shows one is read from its first strong letter. It is set apart from the words around
// it. So an Arabic name in an English panel, or an English one in a Hebrew panel, is never reordered. In the drawing
// and every picture saved from it, a label with a right-to-left letter is wrapped in Unicode's first strong isolate.
// The Python library does the same to the same cases (bidi-label-cases.json).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { isolateLabels } from '../src/bidi.ts';
import { readNote } from '../src/drawing.ts';
import { draw } from '../src/render.ts';
import { loadEngine } from '../src/engine.ts';
import { framed } from '../src/export-frame.ts';
import { overviewOf } from '../src/overview.ts';
import { overviewSvg } from '../src/overview-svg.ts';
import { PALETTES } from '../src/palette.ts';

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

const CASES = JSON.parse(readFileSync(new URL('./bidi-label-cases.json', import.meta.url), 'utf8')).cases;
const FSI = '&#x2068;';
const PDI = '&#x2069;';
/** The words of every text and text span of `svg`. */
const labels = (svg) => [...svg.matchAll(/<(?:text|tspan)\b[^>]*>([^<]+)</g)].map((m) => m[1]);

describe('in the drawing and every picture of it, a label with a right-to-left letter is set apart', () => {
  test('each case is set apart as the cases say, and any other label stays byte for byte', () => {
    for (const c of CASES) assert.equal(isolateLabels(c.svg), c.isolated, c.name);
  });

  test('the drawing sets apart an Arabic name and a mixed Hebrew one, and leaves an English one', async () => {
    const engine = await loadEngine();
    const note =
      "// graph: g\n(a:Person {name: 'مرحبا بالعالم'}), (b:Person {name: 'שלום 2024 ABC'}), (c:Person {name: 'Ann'})";
    const out = await draw(readNote([note]).graphs.get('g'), engine);
    const said = labels(out.svg);
    assert.ok(said.includes(`${FSI}مرحبا بالعالم${PDI}`), said.join(' | '));
    assert.ok(said.includes(`${FSI}שלום 2024 ABC${PDI}`), said.join(' | '));
    assert.ok(said.includes('Ann'), said.join(' | '));
  });

  test('a saved picture sets apart its legend’s kinds, and the overview its groups’ names', () => {
    const inner = { svg: '<svg viewBox="0 0 10 10"><g/></svg>', width: 100, height: 100 };
    const text = { title: 'עץ', legend: [{ label: 'مكان', fill: '#fff', stroke: '#000' }], footer: 'From a.md' };
    const saved = labels(framed(inner, text, PALETTES.light).svg);
    assert.ok(saved.includes(`${FSI}עץ${PDI}`) && saved.includes(`${FSI}مكان${PDI}`), saved.join(' | '));
    const grouping = {
      by: 'kind',
      groups: [{ id: 'group:a', label: 'أماكن', by: 'kind', keys: ['a', 'b'] }],
      between: [],
    };
    const overview = labels(overviewSvg(overviewOf(grouping), PALETTES.light, ['Overview']));
    assert.ok(
      overview.some((l) => l.startsWith(`${FSI}أماكن`)),
      overview.join(' | '),
    );
  });
});
