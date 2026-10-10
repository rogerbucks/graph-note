// What the Claude Code pane shows for a note (spec §10, a Claude Code host): its first graph drawn by the core in the
// host's palette, and always the same graph as lines of text, which stand in, with the reason, wherever no drawing can be.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gqlBlocks, readNote, loadEngine, PALETTES, LAYOUT_LIMITS } from '@graph-note/core';
import { viewOf, paletteFor, notePath, SVG_MAX, NO_GRAPH } from '../src/graph-view.ts';
import { NODE_MISSING } from '../src/graphviz-process.ts';

const NOTE = readFileSync(new URL('../../../test-vault/Sample graph note.md', import.meta.url), 'utf8');
const [DRAWING] = readNote(gqlBlocks(NOTE).map((b) => b.text)).graphs.values();
const engine = await loadEngine();
const graphviz = async (dots) => ({ svgs: dots.map((d) => engine.render(d)) });

describe('a drawn graph', () => {
  test('the first graph of the note, drawn in the palette given, with its summary as the words for it', async () => {
    const view = await viewOf(NOTE, graphviz, PALETTES.dark);
    assert.equal(view.title, DRAWING.graph);
    assert.equal(view.alt, `${DRAWING.graph}: ${DRAWING.boxes.length} things, ${DRAWING.links.length} links`);
    assert.match(view.svg ?? '', /^<svg [^>]*background:#1e1e1e/);
    assert.doesNotMatch(view.svg ?? '', /var\(/, 'no theme variable, which an isolated image cannot resolve');
    assert.ok(view.svg.length <= SVG_MAX);
    assert.equal(view.why, undefined);
  });

  test('every link is also written as a line of text, for the terminal and for anyone who cannot see the drawing', async () => {
    const view = await viewOf(NOTE, graphviz, PALETTES.light);
    assert.equal(view.lines[0], view.alt);
    assert.deepEqual(
      view.lines.slice(1),
      DRAWING.links.map((l) => `${l.from} —${l.reading}→ ${l.to}`),
    );
  });
});

describe('never a blank pane', () => {
  test('when node is missing, the reason and the graph as text', async () => {
    const view = await viewOf(NOTE, async () => ({ why: NODE_MISSING }), PALETTES.dark);
    assert.equal(view.svg, undefined);
    assert.equal(view.why, NODE_MISSING);
    assert.equal(view.lines.length, DRAWING.links.length + 1);
  });

  test('a drawing over what a pane takes is shown as text, with why', async () => {
    const view = await viewOf(
      NOTE,
      async (dots) => ({ svgs: dots.map(() => `<svg>${'x'.repeat(SVG_MAX)}</svg>`) }),
      PALETTES.dark,
    );
    assert.equal(view.svg, undefined);
    assert.match(view.why ?? '', /too large/i);
  });

  test('a graph over the layout limits is never handed to Graphviz', async () => {
    const big = `\`\`\`gql\n// graph: big\n${Array.from({ length: LAYOUT_LIMITS.things + 1 }, (_, i) => `(t${i}:Thing {name: 'T ${i}'})`).join(',\n')}\n\`\`\``;
    let ran = false;
    const view = await viewOf(big, async (dots) => ((ran = true), graphviz(dots)), PALETTES.dark);
    assert.equal(ran, false);
    assert.match(view.why ?? '', /too large to draw/i);
    assert.match(view.why ?? '', /things/);
  });

  test('a note with no graph says so', async () => {
    const view = await viewOf('# Just words\n', graphviz, PALETTES.dark);
    assert.deepEqual(view, { title: 'No graph', alt: NO_GRAPH, lines: [NO_GRAPH] });
  });
});

describe('the host around it', () => {
  test("the palette follows Claude Code's theme setting: light themes take the light entry, every other the dark", () => {
    for (const t of ['light', 'light-daltonized', 'light-ansi']) assert.equal(paletteFor(t), PALETTES.light, t);
    for (const t of ['dark', 'dark-daltonized', 'dark-ansi', 'auto', undefined])
      assert.equal(paletteFor(t), PALETTES.dark, t);
  });

  test('the note named after /graph, quoted or not, since a note’s name often has spaces', () => {
    assert.equal(notePath('  test-vault/Sample graph note.md '), 'test-vault/Sample graph note.md');
    assert.equal(notePath('"test-vault/Sample graph note.md"'), 'test-vault/Sample graph note.md');
    assert.equal(notePath("'a b.md'"), 'a b.md');
    assert.equal(notePath(''), '');
  });
});
