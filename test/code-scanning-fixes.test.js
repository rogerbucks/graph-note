// The code scanning alerts of #849, each fixed at its cause (risks SEC-11 to SEC-15). Each test fails on the code before
// the fix. A slow pattern is given text made to slow it, at a size where the old pattern took seconds. A pattern that
// ran in time with the square of the text's length now runs in time with its length.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { themed } from '../packages/core/src/theme.ts';
import { hitAreas } from '../packages/core/src/hits.ts';
import { imageLink } from '../packages/core/src/image-links.ts';
import { parseView } from '../packages/core/src/view-profile.ts';
import { cutAtFirst, removeAll, trimChars } from '../packages/core/src/text-cuts.ts';
import { fromJunit } from '../scripts/tests-first-run.mjs';
import { jsText } from '../scripts/targets-reflow.mjs';

const require = createRequire(import.meta.url);
const { project } = require('../packages/graph-spec/src/rules/projection.js');
const { lensBuckets } = require('../packages/graph-spec/src/rules/lenses.js');

// The old patterns took seconds at these sizes, and minutes at a few times more. The test's own time limit fails a
// pattern that slows again, without the test measuring time itself.
const LIMIT = { timeout: 10_000 };

describe('a pattern that ran slow on text made for it now runs in time with its length (js/polynomial-redos)', () => {
  test('the kind captions of a drawing', LIMIT, () => {
    assert.match(themed(`<svg><text${' fill="#0000fe"'.repeat(30000)}`, [], []), /^<svg/);
  });

  test('the scale and the move of a drawing, and its graph group', LIMIT, () => {
    assert.ok(hitAreas(`<svg><g class="graph" transform="${'scale(('.repeat(30000)}">`));
    assert.ok(hitAreas(`<svg><g class="graph" transform="${'translate(('.repeat(30000)}">`));
    assert.ok(hitAreas(`<svg><g ${'class="graph"'.repeat(30000)}`));
  });

  test('an image address with many marks', LIMIT, () => {
    assert.equal(imageLink(`https://x/${'#'.repeat(60000)}`), null);
  });

  test('a view query with a long unclosed quote', LIMIT, () => {
    assert.match(parseView(`MATCH (n) WHERE n.name = '${"\\'".repeat(60000)}`).refused, /never closed/);
  });

  test('a lens rule with many WHENs and no THEN', LIMIT, () => {
    const rule = `MATCH (n:T) RETURN n.id AS id, CASE ${'WHEN a'.repeat(30000)} ELSE 'x' END AS grp`;
    assert.equal(lensBuckets(null, rule), null);
  });

  test('the cuts that took the place of the slow patterns', LIMIT, () => {
    assert.equal(trimChars(`${'-'.repeat(60000)}x`, '-.'), 'x');
    assert.equal(cutAtFirst(`${'//'.repeat(60000)}`, '//'), '');
    assert.equal(trimChars('.-a.b-.', '-.'), 'a.b');
    assert.equal(cutAtFirst('a.png?x#y', '?', '#'), 'a.png');
    assert.equal(cutAtFirst('a.png#y?x', '?', '#'), 'a.png');
    assert.equal(cutAtFirst('plain', '//'), 'plain');
  });
});

describe('tags taken out leave none made from the pieces round them (js/incomplete-multi-character-sanitization)', () => {
  test('a drawing keeps no comment, title or declaration', () => {
    const svg = themed('<svg><!-<!-- a -->- b --><ti<title>t</title>tle>x</title><text>k</text></svg>', [], []);
    assert.doesNotMatch(svg, /<!--|<title>/);
  });

  test('a test report keeps no comment', () => {
    const report = '<testsuites><!-<!-- a -->- <testcase name="hidden"/> --></testsuites>';
    assert.deepEqual(fromJunit(report).passed, []);
  });

  test('removeAll goes on until nothing matches', () => {
    assert.equal(removeAll('<<!---->!---->x', /<!--[\s\S]*?-->/g), 'x');
  });
});

describe('a name in a graph never reaches an object’s prototype (js/prototype-polluting-assignment)', () => {
  test('a relationship or a property named __proto__ is kept as a name of its own', () => {
    const g = {
      nodes: new Map([
        ['a', [new Set(['Thing']), {}]],
        ['b', [new Set(['Thing']), { __proto__: null, ['__proto__']: 'x' }]],
      ]),
      edges: [['a', '__proto__', 'b', {}]],
    };
    const [blocks] = project(g);
    assert.deepEqual(Object.getOwnPropertyDescriptor(blocks.a, '__proto__')?.value, ['b']);
    assert.equal(Object.getOwnPropertyDescriptor(blocks.b, '__proto__')?.value, 'x');
    assert.equal(Object.getPrototypeOf(blocks.a), Object.prototype);
    assert.equal({}.push, undefined);
  });
});

describe('text put into code for a page is escaped (js/bad-code-sanitization)', () => {
  test('a label cannot end the script it is put in, or break its line', () => {
    const text = jsText('a</script><script>x()</script>\u2028b');
    assert.doesNotMatch(text, /[<>/\u2028\u2029]/);
    assert.equal(JSON.parse(text), 'a</script><script>x()</script>\u2028b');
  });
});
