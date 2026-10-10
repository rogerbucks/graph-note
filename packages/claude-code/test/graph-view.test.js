// What the Claude Code pane shows for a note (spec §10, a Claude Code host): its first graph drawn by the core in the
// host's palette, and always the same graph as lines of text, which stand in, with the reason, wherever no drawing can be.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gqlBlocks, readNote, loadEngine, PALETTES, LAYOUT_LIMITS, READ_LIMITS } from '@graph-note/core';
import { viewOf, PANE_PALETTE, notePath, SVG_MAX, NO_GRAPH, EMPTY_GRAPH } from '../src/graph-view.ts';
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

  test('a note too large to read says so, with the limit, never "no graph"', async () => {
    const huge = `\`\`\`gql\n// graph: huge\n${`(t:Thing {name: '${'x'.repeat(READ_LIMITS.bytes)}'})`}\n\`\`\``;
    const view = await viewOf(huge, graphviz, PALETTES.dark);
    assert.match(view.why ?? '', /too large to read/i);
    assert.notEqual(view.alt, NO_GRAPH);
  });

  test('a graph that could not be read says why, with its first problem', async () => {
    const view = await viewOf("```gql\n// graph: g\n(a:Thing {name: 'A'}\n```", graphviz, PALETTES.dark);
    assert.match(view.alt, /could not be read/);
    assert.equal(view.why, undefined, 'the reason is the view itself: there is no graph to show as text');
    assert.ok(view.lines.length >= 2, 'the problem, with its line, follows');
    assert.match(view.lines[1], /^Line \d+: /);
  });

  test('a graph block with nothing in it yet says so, not "no graph"', async () => {
    const view = await viewOf('```gql\n// graph: g\n```', graphviz, PALETTES.dark);
    assert.deepEqual(view, { title: 'Empty', alt: EMPTY_GRAPH, lines: [EMPTY_GRAPH] });
  });

  test('one thing and one link are counted in the singular', async () => {
    const view = await viewOf(
      "```gql\n// graph: g\n(a:Thing {name: 'A'}), (a)-[:KNOWS]->(a)\n```",
      graphviz,
      PALETTES.dark,
    );
    assert.equal(view.alt, 'g: 1 thing, 1 link');
  });
});

describe('the host around it', () => {
  test("the pane's drawing follows the app's own light or dark, never a guess: the system entry", async () => {
    // the mod API says nothing of the desktop app's appearance, and Claude Code's theme setting is the terminal's, which
    // draws no picture: so the drawing carries both palettes and the scheme picks one, with nothing assumed when unknown
    assert.equal(PANE_PALETTE, PALETTES.system);
    const view = await viewOf(NOTE, graphviz, PANE_PALETTE);
    assert.match(view.svg ?? '', /<style>[^<]*@media \(prefers-color-scheme: dark\)/);
    assert.match(view.svg ?? '', /background:var\(--gn-page\)/);
  });

  test('the note named after /graph, quoted or not, since a note’s name often has spaces', () => {
    assert.equal(notePath('  test-vault/Sample graph note.md '), 'test-vault/Sample graph note.md');
    assert.equal(notePath('"test-vault/Sample graph note.md"'), 'test-vault/Sample graph note.md');
    assert.equal(notePath("'a b.md'"), 'a b.md');
    assert.equal(notePath(''), '');
  });
});
