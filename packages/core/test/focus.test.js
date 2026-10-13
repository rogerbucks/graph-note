// Focus (editor spec §25, slice 3): selecting a thing or a link keeps it and its neighbours at full strength and fades the
// rest, readable and not by colour alone, to a set depth, cleared by an empty tap or Escape. The sums are made here with
// plain data; the drawing's marks are the Obsidian package's tests.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readNote } from '../src/drawing.ts';
import { THEME_COLOURS } from '../src/palette.ts';
import { DEFAULT_SETTINGS, OPTIONS, settingsFrom } from '../src/settings.ts';
import { STYLE } from '../src/layout.ts';
import { FADE, KEPT, FocusState, depthOf, edgesOf, estimateEdge, focusOf, highlightOf } from '../src/focus.ts';

// a-b, b-c, c-d, a-e; f stands alone
const EDGES = [
  { from: 'a', to: 'b' },
  { from: 'b', to: 'c' },
  { from: 'c', to: 'd' },
  { from: 'e', to: 'a' },
];
const sorted = (set) => [...set].sort();
const kept = (k) => ({ things: sorted(k.things), edges: sorted(k.edges) });

describe('selecting a thing keeps it, its links and the things at their other ends', () => {
  test('a thing in the middle keeps both its links and both ends, and nothing else', () => {
    assert.deepEqual(kept(focusOf(EDGES, { thing: 'b' })), { things: ['a', 'b', 'c'], edges: [0, 1] });
  });

  test('a link is followed whichever way it points', () => {
    assert.deepEqual(kept(focusOf(EDGES, { thing: 'a' })), { things: ['a', 'b', 'e'], edges: [0, 3] });
    assert.deepEqual(kept(focusOf(EDGES, { thing: 'c' })), { things: ['b', 'c', 'd'], edges: [1, 2] });
  });

  test('a thing with no links keeps only itself', () => {
    assert.deepEqual(kept(focusOf(EDGES, { thing: 'f' })), { things: ['f'], edges: [] });
  });

  test('the one step is the default, and a link between two neighbours is not kept', () => {
    const triangle = [...EDGES, { from: 'b', to: 'e' }];
    assert.deepEqual(kept(focusOf(triangle, { thing: 'a' })), { things: ['a', 'b', 'e'], edges: [0, 3] });
  });

  test('it fades and keeps by membership only: nothing is moved, hidden or changed in what it is given', () => {
    const edges = Object.freeze(EDGES.map((e) => Object.freeze({ ...e })));
    const before = JSON.stringify(edges);
    const k = focusOf(edges, { thing: 'b' });
    assert.equal(JSON.stringify(edges), before);
    assert.ok(k.things instanceof Set && k.edges instanceof Set, 'sets of what stays at full strength');
    assert.ok(!('hidden' in k) && !('moved' in k), 'it says only what is kept');
  });
});

describe('selecting a link keeps it and the two things it joins', () => {
  test('the link and its two ends, and nothing else', () => {
    assert.deepEqual(kept(focusOf(EDGES, { edge: 1 })), { things: ['b', 'c'], edges: [1] });
  });

  test('a link that loops back to its own thing keeps that one thing', () => {
    assert.deepEqual(kept(focusOf([{ from: 'x', to: 'x' }], { edge: 0 })), { things: ['x'], edges: [0] });
  });

  test('how far focus reaches does not change it', () => {
    assert.deepEqual(kept(focusOf(EDGES, { edge: 1 }, 2)), { things: ['b', 'c'], edges: [1] });
  });

  test('a link that is not there gives no focus', () => {
    assert.equal(focusOf(EDGES, { edge: 9 }), null);
    assert.equal(focusOf(EDGES, { edge: -1 }), null);
  });
});

describe('how far focus reaches', () => {
  test('two steps keep the things two links away, and the links that lead to them', () => {
    assert.deepEqual(kept(focusOf(EDGES, { thing: 'b' }, 2)), {
      things: ['a', 'b', 'c', 'd', 'e'],
      edges: [0, 1, 2, 3],
    });
  });

  test('two steps do not reach a third', () => {
    const chain = [
      { from: 'p', to: 'q' },
      { from: 'q', to: 'r' },
      { from: 'r', to: 's' },
      { from: 's', to: 't' },
    ];
    assert.deepEqual(kept(focusOf(chain, { thing: 'p' }, 2)), { things: ['p', 'q', 'r'], edges: [0, 1] });
  });

  test('a setting chooses it: one step, the default, or two', () => {
    const option = OPTIONS.find((o) => o.key === 'focusDepth');
    assert.ok(option, 'on the settings page');
    assert.deepEqual(
      option.choices.map((c) => c.value),
      ['one', 'two'],
    );
    assert.equal(DEFAULT_SETTINGS.focusDepth, 'one');
    assert.equal(depthOf(DEFAULT_SETTINGS.focusDepth), 1);
    assert.equal(depthOf('two'), 2);
    assert.equal(depthOf('three'), 1, 'anything else is the default');
    assert.equal(settingsFrom({ focusDepth: 'two' }).focusDepth, 'two');
    assert.equal(settingsFrom({ focusDepth: 'seven' }).focusDepth, 'one', 'out of range is the default');
    assert.equal(settingsFrom(null).focusDepth, 'one');
  });
});

describe('a drawing’s links, written and estimated', () => {
  const read = readNote([
    `// graph: g
(alpha:Thing {name: 'Alpha'}), (bravo:Thing {name: 'Bravo'}),
(alpha)-[:FAVOURS]->(bravo), (bravo)-[:FAVOURS]->(alpha), (alpha)-[:FAVOURS]->(bravp), (bravo)-[:FAVORS]->(alpha)`,
  ]).graphs.get('g');

  test('the links are listed as the drawing draws them: written ones first, then the estimates of a name', () => {
    const edges = edgesOf(read);
    assert.ok(read.estimates.some((e) => e.kind === 'name') && read.estimates.some((e) => e.kind === 'type'));
    assert.equal(edges.length, read.links.length + read.estimates.filter((e) => e.kind === 'name').length);
    assert.deepEqual(edges[0], { from: 'alpha', to: 'bravo', type: 'FAVOURS' });
  });

  test('an estimated link is found at its place among them', () => {
    const edges = edgesOf(read);
    read.estimates.forEach((e, n) => {
      const at = estimateEdge(read, n);
      if (e.kind === 'name') assert.deepEqual([edges[at].from, edges[at].to], [e.from, e.to]);
      else assert.equal(at, e.index);
    });
  });
});

describe('what is faded stays readable, and focus is not shown by colour alone', () => {
  // the contrast of the locked style (§11): text 4.5:1 on the page
  const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const mix = (a, b, p) => a.map((x, i) => x * p + b[i] * (1 - p));
  const luminance = (c) => {
    const [r, g, b] = c.map((v) => {
      const s = v / 255;
      return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const contrast = (a, b) => {
    const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05);
  };

  for (const [name, T] of Object.entries(THEME_COLOURS)) {
    test(`${name} theme: the text, the kind captions and every hue’s label keep 4.5:1 on the page when faded`, () => {
      const page = rgb(T.page),
        text = rgb(T.text);
      const hues = [...STYLE.kind_hues, ...STYLE.edge_hues, ...Object.values(STYLE.edge_colours)];
      const colours = [
        ['text', text],
        ['kind caption', rgb(T.muted)],
        ...hues.map((h) => [`${h} label`, mix(rgb(T[h]), text, STYLE.label_mix / 100)]),
      ];
      for (const [what, colour] of colours) {
        const faded = mix(colour, page, FADE.text);
        assert.ok(contrast(faded, page) >= 4.5, `${what}: ${contrast(faded, page).toFixed(2)}:1`);
      }
    });
  }

  test('strength differs where colour does not: a kept thing has the heavier outline and a fill, a faded one a lighter outline and none', () => {
    assert.ok(KEPT.width > FADE.width, 'outline');
    assert.ok(FADE.fill < STYLE.fill_opacity, 'fill');
    assert.ok(FADE.width > 0 && FADE.text > 0, 'faded, never gone');
    for (const v of [...Object.values(FADE), ...Object.values(KEPT)])
      assert.equal(typeof v, 'number', 'no colour in it');
  });
});

describe('clearing the focus', () => {
  test('selecting sets the focus, and an empty tap clears the selection and the focus together', () => {
    const f = new FocusState();
    assert.equal(f.kept(EDGES, 1), null, 'nothing selected, nothing faded');
    f.select({ thing: 'b' });
    assert.deepEqual(f.target, { thing: 'b' });
    assert.deepEqual(kept(f.kept(EDGES, 1)).things, ['a', 'b', 'c']);
    assert.equal(f.clear(), true, 'something was cleared');
    assert.equal(f.target, null);
    assert.equal(f.kept(EDGES, 1), null);
  });

  test('Escape clears the same, and says whether it did, so it leaves full screen only when there was nothing to clear', () => {
    const f = new FocusState();
    assert.equal(f.clear(), false, 'nothing to clear');
    f.select({ edge: 2 });
    assert.equal(f.clear(), true);
    assert.equal(f.clear(), false);
  });

  test('selecting another thing moves the focus to it', () => {
    const f = new FocusState();
    f.select({ thing: 'b' });
    f.select({ thing: 'd' });
    assert.deepEqual(kept(f.kept(EDGES, 1)).things, ['c', 'd']);
  });

  test('the depth is the one asked for when it is worked out', () => {
    const f = new FocusState();
    f.select({ thing: 'b' });
    assert.deepEqual(kept(f.kept(EDGES, 2)).things, ['a', 'b', 'c', 'd', 'e']);
  });
});

describe('the highlight, for a thing or a link under the pointer', () => {
  test('a thing highlights itself alone', () => {
    assert.deepEqual(kept(highlightOf(EDGES, { thing: 'b' })), { things: ['b'], edges: [] });
  });

  test('a link highlights itself and the two things it joins', () => {
    assert.deepEqual(kept(highlightOf(EDGES, { edge: 2 })), { things: ['c', 'd'], edges: [2] });
  });

  test('a link that is not there highlights nothing', () => {
    assert.equal(highlightOf(EDGES, { edge: 7 }), null);
  });
});
