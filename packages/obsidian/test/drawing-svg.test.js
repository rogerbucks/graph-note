// The drawing as the card shows it (spec §3): a link's label kept a small gap from its line when the drawing runs down the
// page (device check V-07, 11 Oct 2026: on a vertical layout the label text began right at the line). Graphviz puts such
// a label beside its line with no room between; the layout source and the themed SVG are the Python library's byte for
// byte, so the gap is made here, in the card, by the stylesheet, and the layout is untouched.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { build } from './host/load-plugin.js';
import { rules, winner } from './host/cascade.js';
import { fence } from './host/notes.js';
import { load, styles, show, svgOf } from './host/view-notes.js';

before(() => build());

// the V-07 graph: Reason -favours-> Option -answers-> Question, which runs down the page
const DOWN = `// graph: reader · SOURCE
(question:Question {title: 'Which device should I read on?'}),
(large:Option {name: 'Large reader'}),
(reason:Reason {title: 'A4 pages need a big screen'}),
(large)-[:ANSWERS]->(question),
(reason)-[:FAVOURS]->(large)`;
// eight options answering one question: wide, so it runs across the page
const ACROSS = `// graph: reader · SOURCE
(q:Question {title: 'Which device?'}),
${Array.from({ length: 8 }, (_, i) => `(o${i}:Option {name: 'Option number ${i}'}), (o${i})-[:ANSWERS]->(q)`).join(',\n')}`;

const all = rules(styles, 'styles.css');
/** A link's label as the page holds it, in a drawing with the given classes on its svg. */
const label = (...svgClasses) => ({
  tag: 'text',
  classes: [],
  ancestors: [
    { tag: 'g', classes: ['edge'] },
    { tag: 'svg', classes: ['graph-note-svg', ...svgClasses] },
  ],
});

describe('a link’s label in a drawing that runs down the page', () => {
  let env;
  before(async () => {
    env = await load();
  });
  after(() => env.uninstall());

  test('the card marks the drawing as running down, and a drawing that runs across is not marked', async () => {
    const down = svgOf((await show(env, fence(DOWN))).el);
    assert.ok(down.classList.contains('graph-note-down'), 'down');
    const across = svgOf((await show(env, fence(ACROSS))).el);
    assert.ok(!across.classList.contains('graph-note-down'), 'across');
  });

  test('the label is moved right, away from its line, by a small gap', () => {
    const moved = winner(all, label('graph-note-down'), 'transform');
    assert.ok(moved, 'a rule moves it');
    const gap = Number(/^translateX\((\d+(?:\.\d+)?)px\)$/.exec(moved.value)?.[1]);
    assert.ok(gap >= 3 && gap <= 8, `a small gap, not ${moved.value}`);
  });

  test('only a link’s label moves: not a box’s text, and not a label in a drawing that runs across', () => {
    const box = {
      tag: 'text',
      classes: [],
      ancestors: [{ tag: 'g', classes: ['node'] }, label('graph-note-down').ancestors[1]],
    };
    assert.equal(winner(all, box, 'transform'), undefined);
    assert.equal(winner(all, label(), 'transform'), undefined);
  });

  test('it moves nothing in the SVG itself: the label keeps the x Graphviz gave it', async () => {
    const { el } = await show(env, fence(DOWN));
    const labels = svgOf(el).querySelectorAll('g.edge text');
    assert.equal(labels.length, 2);
    for (const t of labels) assert.equal(t.getAttribute('transform'), null);
  });
});
