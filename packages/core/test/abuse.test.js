// Abuse (spec §12): no sequence of random edits or random text may crash the viewer or leave it blank. A graph with
// problems is still drawn (§3), so whatever the text, reading it gives either a drawing or problems to list — never an
// exception, and never nothing. The drawing engine is run on what is read, too, and must always return a picture.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readNote, gqlBlocks, graphOfBlock } from '../src/drawing.ts';
import { loadEngine, draw } from '../src/render.ts';
import { diagnostics, completions, readBack, textVersion } from '../src/help.ts';
import { tokenize } from '../src/tokens.ts';

const SEED = `// graph: reader · SOURCE
(question:Question {title: 'Which device should I read long PDFs on?'}),
(large:Option {name: 'Large e-ink reader'}),
(small:Option {name: 'Small e-ink reader'}),
(eyes:Reason {title: 'E-ink is easier on the eyes'}),
(large)-[:ANSWERS]->(question),
(small)-[:ANSWERS]->(question),
(eyes)-[:FAVOURS]->(large),
(eyes)-[:COUNTS_AGAINST]->(small)
SET large.status = 'bought'`;

let s = 20261007;
const rand = (n) => { s = (s * 1103515245 + 12345) >>> 0; return s % n; };
const PIECES = ['(', ')', '[', ']', '{', '}', ':', ',', "'", '-', '>', '<-', '-[:', ']->', '//', '\n', ' ', 'SET ', 'MATCH ', 'x', 'large', 'eyes', 'Q', '9', '\\', 'é', '→', '/*', '`', '"', 'DATE ', 'TRUE', '·', '// graph: '];

/** One random edit: delete a span, insert a piece, or duplicate a span. */
function mutate(text) {
  const i = rand(text.length + 1), j = Math.min(text.length, i + rand(12));
  switch (rand(3)) {
    case 0: return text.slice(0, i) + text.slice(j);
    case 1: return text.slice(0, i) + PIECES[rand(PIECES.length)] + text.slice(i);
    default: return text.slice(0, i) + text.slice(i, j) + text.slice(i);
  }
}

/** Everything the viewer and the pane do with a block of text: none of it may throw. */
function everything(text, engine) {
  const reading = readNote([text]);
  const graph = graphOfBlock(text);
  if (graph) {
    const d = reading.graphs.get(graph);
    // never blank: something drawn, or problems listed, or an empty graph that says so
    assert.ok((d && d.boxes.length) || reading.problems.length || !d || d.boxes.length === 0);
    if (d) {
      const drawn = draw(d, engine);
      assert.match(drawn.svg, /^<svg/, 'a picture, always');
      textVersion(d);
    }
    diagnostics(reading, graph, 0, text, 'file:///x.md');
    completions(reading, graph, text, rand(text.length + 1));
    readBack(reading, graph, text);
  }
  assert.equal(tokenize(text).map((t) => t.s).join(''), text);
}

test('a thousand random edits of a real graph never crash the viewer or leave it blank', async () => {
  const engine = await loadEngine();
  let text = SEED;
  for (let i = 0; i < 1000; i++) {
    text = rand(10) === 0 ? SEED : mutate(text);
    try { everything(text, engine); } catch (e) { assert.fail(`edit ${i} broke it:\n${text}\n${e.stack}`); }
  }
});

test('random text, of every kind, never crashes the viewer', async () => {
  const engine = await loadEngine();
  for (let i = 0; i < 300; i++) {
    let text = '// graph: g\n';
    for (let k = rand(60); k > 0; k--) text += PIECES[rand(PIECES.length)];
    try { everything(text, engine); } catch (e) { assert.fail(`text ${i} broke it:\n${text}\n${e.stack}`); }
  }
});

test('a note of random blocks is always read: its blocks found, its graphs read', () => {
  for (let i = 0; i < 200; i++) {
    let note = '';
    for (let k = rand(8); k > 0; k--) note += ['```gql\n', '```\n', '~~~gql\n', '~~~\n', 'text\n', SEED + '\n', mutate(SEED) + '\n'][rand(7)];
    const blocks = gqlBlocks(note).map((b) => b.text);
    assert.doesNotThrow(() => readNote(blocks), note);
  }
});
