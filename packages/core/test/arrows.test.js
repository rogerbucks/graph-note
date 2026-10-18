// Arrowheads hidden or shown (editor spec §15). The style graph may hide a link's arrowhead for the whole graph, for
// one view, or for one relationship type, and show it again. Nothing else ever hides one. The choice is written in the
// style graph, never in the data. The direction a link reads in is never lost: its reading when tapped and the text
// version of the graph say it as before. The tests span arrows.ts (the choice and the source) and style-checks.ts (the
// words). They span style-edit.ts (writing it), render.ts (the source drawn) and help.ts (the text version) too.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { gqlBlocks, gqlSpans, styleOf } from '../src/blocks.ts';
import { readNote } from '../src/drawing.ts';
import { loadEngine } from '../src/engine.ts';
import { textVersion } from '../src/help.ts';
import { drawingSource, layoutSource } from '../src/layout.ts';
import { arrowlessLinks, arrowlessSource, arrowsShown } from '../src/arrows.ts';
import { directions, draw, linkDetails } from '../src/render.ts';
import { readStyle } from '../src/style.ts';
import { styleEdit } from '../src/style-edit.ts';
import { styledDrawing } from '../src/style-source.ts';

// two kinds only receive links, Source and Tag. So the one that is not the main destination is laid out on the far side
// with its link drawn backwards (dir=back). Its arrowhead is hidden and shown like any other
const TRIP = `// graph: trip · SOURCE
(home:Place {name: 'Home'}),
(park:Place {name: 'The park'}),
(cafe:Cafe {name: 'Cafe'}),
(guide:Source {name: 'The guide'}),
(green:Tag {name: 'Green'}),
(home)-[:NEAR]->(park),
(cafe)-[:SERVES]->(park),
(home)-[:CITES]->(guide),
(cafe)-[:CITES]->(guide),
(park)-[:TAGGED]->(green)`;

/** The note's blocks: graph trip, and a style block of the given lines when there are any. */
const textsWith = (...lines) =>
  lines.length ? [TRIP, ['// graph: trip_style · STYLE trip', ...lines].join('\n')] : [TRIP];

/** Graph trip drawn in `view` (none: the whole graph), styled by a style block of the given lines. */
function drawn(view, ...lines) {
  const texts = textsWith(...lines);
  const reading = readNote(texts);
  const { style, problems } = readStyle(texts, 'trip', reading);
  assert.deepEqual(problems, []);
  const plain = reading.graphs.get('trip');
  return { reading, plain, style, drawing: styledDrawing(plain, style, reading.world.trip, view) };
}

/** The lines of a source that draw a link, in the order the links are drawn. */
const linkLines = (dot) => dot.split('\n').filter((l) => /^ {2}"[^"]*" -> "[^"]*" \[label=/.test(l));
/** For each link line, whether it is drawn without its arrowhead. */
const headless = (dot) => linkLines(dot).map((l) => l.includes('dir=none'));
/** The source of each direction the drawing is laid out in. */
const sources = (drawing) => directions(drawing).map((d) => d.dot);

describe('arrowheads are drawn unless the style graph hides them', () => {
  // proves: arrows_shown_unless_hidden
  test('with no style graph, every link has its arrowhead, and the source is the layout source byte for byte', () => {
    const { plain, drawing } = drawn(undefined);
    for (const [i, dot] of sources(drawing).entries()) {
      const rankdir = ['LR', 'TB'][i];
      assert.equal(dot, layoutSource(plain, rankdir).source);
      assert.deepEqual(headless(dot), [false, false, false, false, false]);
    }
    assert.ok(
      linkLines(sources(drawing)[0]).some((l) => l.includes('dir=back')),
      'the backwards link is drawn so',
    );
  });

  // proves: arrows_shown_unless_hidden
  test('a style graph that says nothing of arrowheads, or only shows them, changes nothing', () => {
    const { plain } = drawn(undefined);
    for (const lines of [
      ["(n1:Nudge {word: 'direction', direction: 'LR'})"],
      ["(a1:Arrows {arrowheads: 'show'}),", "(a2:Arrows {arrowheads: 'show', type: 'NEAR'})"],
    ]) {
      const { drawing } = drawn(undefined, ...lines);
      assert.equal(drawing.arrowless, undefined, lines.join(' '));
      assert.equal(sources(drawing)[0], layoutSource(plain, 'LR').source);
    }
  });

  // proves: arrows_shown_unless_hidden
  test('drawn, each link has its arrowhead', async () => {
    const svg = draw(drawn(undefined).drawing, await loadEngine()).svg;
    const edges = svg.split('class="edge"').slice(1);
    assert.equal(edges.length, 5);
    for (const e of edges) assert.equal((e.split('</g>')[0].match(/<polygon/g) ?? []).length, 1);
  });

  // proves: arrows_shown_unless_hidden
  test('an Arrows written in the data is data, and hides nothing', () => {
    const texts = [`${TRIP},\n(a1:Arrows {arrowheads: 'hide'})`];
    const reading = readNote(texts);
    const { style } = readStyle(texts, 'trip', reading);
    const drawing = styledDrawing(reading.graphs.get('trip'), style, reading.world.trip);
    assert.ok(
      drawing.boxes.some((b) => b.key === 'a1'),
      'drawn as a thing of the data',
    );
    assert.ok(headless(sources(drawing)[0]).every((h) => !h));
  });
});

describe('arrowheads can be hidden or shown', () => {
  // proves: arrows_switchable
  test('for the whole graph: every link, the backwards one too, is drawn without its arrowhead', async () => {
    const { plain, drawing } = drawn(undefined, "(a1:Arrows {arrowheads: 'hide'})");
    assert.deepEqual(drawing.arrowless, [0, 1, 2, 3, 4]);
    for (const [i, dot] of sources(drawing).entries()) {
      assert.deepEqual(headless(dot), [true, true, true, true, true]);
      // only the arrowheads change: every link is laid out from the same ends, in the same order
      const plainLines = linkLines(layoutSource(plain, ['LR', 'TB'][i]).source);
      assert.deepEqual(
        linkLines(dot).map((l) => l.replace(/, dir=none\]/, ']')),
        plainLines.map((l) => l.replace(/, dir=back\]/, ']')),
      );
    }
    const svg = draw(drawing, await loadEngine()).svg;
    for (const e of svg.split('class="edge"').slice(1)) assert.ok(!e.split('</g>')[0].includes('<polygon'));
  });

  // proves: arrows_switchable
  test('for one view: hidden in that view only, shown in the whole graph and in every other view', () => {
    const lines = ["(a1:Arrows {arrowheads: 'hide', view: 'walks'})"];
    assert.deepEqual(headless(sources(drawn('walks', ...lines).drawing)[0]), [true, true, true, true, true]);
    assert.deepEqual(headless(sources(drawn(undefined, ...lines).drawing)[0]), [false, false, false, false, false]);
    assert.deepEqual(headless(sources(drawn('food', ...lines).drawing)[0]), [false, false, false, false, false]);
  });

  // proves: arrows_switchable
  test('for one relationship type: only its links are drawn without their arrowheads', () => {
    const { drawing } = drawn(undefined, "(a1:Arrows {arrowheads: 'hide', type: 'CITES'})");
    assert.deepEqual(
      drawing.links.map((l) => l.type),
      ['NEAR', 'SERVES', 'CITES', 'CITES', 'TAGGED'],
    );
    assert.deepEqual(headless(sources(drawing)[0]), [false, false, true, true, false]);
  });

  // proves: arrows_switchable
  test('shown again where a wider choice hides them: a view over the graph, a type over all links', () => {
    const { style } = drawn(
      undefined,
      "(a1:Arrows {arrowheads: 'hide'}),",
      "(a2:Arrows {arrowheads: 'show', type: 'NEAR'}),",
      "(a3:Arrows {arrowheads: 'show', view: 'walks'}),",
      "(a4:Arrows {arrowheads: 'hide', view: 'walks', type: 'SERVES'})",
    );
    assert.equal(arrowsShown(style, undefined, 'CITES'), false);
    assert.equal(arrowsShown(style, undefined, 'NEAR'), true);
    assert.equal(arrowsShown(style, 'walks', 'CITES'), true);
    assert.equal(arrowsShown(style, 'walks', 'SERVES'), false);
    assert.equal(arrowsShown(style, 'food', 'NEAR'), true);
    assert.equal(arrowsShown(style, 'food', 'TAGGED'), false);
  });

  // proves: arrows_switchable
  test('a link drawn backwards keeps dir=back when its type is shown again over a whole-graph hide', () => {
    // Tag first, so it is the main destination and Source, the other kind that only receives, is drawn backwards
    const BACK = `// graph: back · SOURCE
(home:Place {name: 'Home'}),
(park:Place {name: 'The park'}),
(green:Tag {name: 'Green'}),
(guide:Source {name: 'The guide'}),
(home)-[:NEAR]->(park),
(park)-[:TAGGED]->(green),
(home)-[:CITES]->(guide)`;
    const texts = [
      BACK,
      "// graph: back_style · STYLE back\n(a1:Arrows {arrowheads: 'hide'}),\n(a2:Arrows {arrowheads: 'show', type: 'CITES'})",
    ];
    const reading = readNote(texts);
    const { style, problems } = readStyle(texts, 'back', reading);
    assert.deepEqual(problems, []);
    const plain = reading.graphs.get('back');
    const cites = (dot) => linkLines(dot).find((l) => l.startsWith('  "guide" -> "home"'));
    assert.ok(cites(layoutSource(plain, 'LR').source)?.endsWith(', dir=back];'), 'drawn backwards');
    for (const d of directions(styledDrawing(plain, style, reading.world.back))) {
      assert.ok(cites(d.dot).endsWith(', dir=back];'), cites(d.dot));
      assert.ok(!cites(d.dot).includes('dir=none'));
      assert.deepEqual(headless(d.dot), [true, true, false]);
    }
  });

  // proves: arrows_switchable
  test('the source changes only on the links chosen, and not at all when none is', () => {
    const dot = layoutSource(drawn(undefined).plain, 'LR').source;
    assert.equal(arrowlessSource(dot, []), dot);
    const lines = dot.split('\n'),
      out = arrowlessSource(dot, [0, 3]).split('\n');
    assert.equal(out.length, lines.length);
    const changed = lines.flatMap((l, i) => (l === out[i] ? [] : [[l, out[i]]]));
    assert.equal(changed.length, 2);
    for (const [before, after] of changed)
      assert.equal(
        after,
        before.includes('dir=back') ? before.replace('dir=back', 'dir=none') : before.replace(/\];$/, ', dir=none];'),
      );
  });

  // proves: arrows_switchable
  test('a link guessed from a near miss is hidden with its type, as a written one is', () => {
    const texts = [
      `${TRIP},\n(cafe)-[:NEAR]->(parkk)`,
      "// graph: trip_style · STYLE trip\n(a1:Arrows {arrowheads: 'hide', type: 'NEAR'})",
    ];
    const reading = readNote(texts);
    const plain = reading.graphs.get('trip');
    const { style } = readStyle(texts, 'trip', reading);
    assert.deepEqual(
      plain.estimates.map((e) => [e.kind, e.type, e.to]),
      [['name', 'NEAR', 'park']],
      'parkk is read as park, a guess',
    );
    assert.deepEqual(arrowlessLinks(plain, style), [0, plain.links.length], 'the written NEAR link, then the guess');
    const dot = directions(styledDrawing(plain, style, reading.world.trip))[0].dot;
    const guessed = linkLines(dot).filter((l) => l.includes('(estimated)'));
    assert.equal(guessed.length, 1, dot);
    assert.ok(guessed[0].includes('dir=none'), guessed[0]);
    assert.equal(headless(dot).filter(Boolean).length, 2, 'the written NEAR link and the guess, no other');
    // a near miss of a type is drawn as the type it is taken for, and hidden with it
    const typo = [`${TRIP},\n(park)-[:NEAR]->(cafe),\n(cafe)-[:NEER]->(home)`, texts[1]];
    const r = readNote(typo),
      d = r.graphs.get('trip');
    assert.deepEqual(
      d.estimates.map((e) => [e.kind, e.written, e.taken, e.index]),
      [['type', 'NEER', 'NEAR', 6]],
    );
    assert.deepEqual(arrowlessLinks(d, readStyle(typo, 'trip', r).style), [0, 5, 6]);
    assert.equal(
      headless(drawingSource(plain, 'LR')).filter(Boolean).length,
      0,
      'the drawing source itself is untouched',
    );
  });
});

describe('the choice is saved in the style graph, never in the data', () => {
  const NOTE = ['# A walk', '', '```gql', TRIP, '```', ''].join('\n');
  const texts = (note) => gqlBlocks(note).map((b) => b.text);
  const data = (note) =>
    gqlSpans(note)
      .filter((s) => styleOf(s.text) === null)
      .map((s) => s.text);

  // proves: arrows_switchable
  test('written for the whole graph, a view or a type, read back, and changed in place when switched again', () => {
    let note = NOTE;
    for (const arrows of [
      { arrowheads: 'hide' },
      { arrowheads: 'hide', view: 'walks' },
      { arrowheads: 'hide', type: 'NEAR' },
    ]) {
      const r = styleEdit(note, 'trip', { arrows });
      assert.ok('note' in r, r.refused);
      note = r.note;
    }
    assert.deepEqual(data(note), data(NOTE), 'the data is never touched');
    const style = gqlBlocks(note).at(-1).text;
    assert.match(style, /^\/\/ graph: trip_style · STYLE trip/);
    assert.ok(style.includes("(arrows_1:Arrows {arrowheads: 'hide'})"), style);
    assert.ok(style.includes("(arrows_2:Arrows {arrowheads: 'hide', view: 'walks'})"), style);
    assert.ok(style.includes("(arrows_3:Arrows {arrowheads: 'hide', type: 'NEAR'})"), style);
    const shownAgain = styleEdit(note, 'trip', { arrows: { arrowheads: 'show', type: 'NEAR' } });
    assert.ok('note' in shownAgain);
    const after = gqlBlocks(shownAgain.note).at(-1).text;
    assert.ok(after.includes("(arrows_3:Arrows {arrowheads: 'show', type: 'NEAR'})"), after);
    assert.equal(after.match(/:Arrows/g).length, 3, 'changed in place, never written twice');
    const reading = readNote(texts(shownAgain.note));
    const { style: read, problems } = readStyle(texts(shownAgain.note), 'trip', reading);
    assert.deepEqual(problems, []);
    assert.equal(arrowsShown(read, undefined, 'NEAR'), true);
    assert.equal(arrowsShown(read, undefined, 'CITES'), false);
  });

  // proves: arrows_switchable
  test('a choice the style graph would not accept is refused, with the reason, and nothing is written', () => {
    assert.deepEqual(styleEdit(NOTE, 'trip', { arrows: { arrowheads: 'faint' } }), {
      refused: 'arrowheads must be show or hide',
    });
    assert.deepEqual(styleEdit(NOTE, 'trip', { arrows: { arrowheads: 'hide', type: '' } }), {
      refused: 'a relationship type needs a name',
    });
  });

  // proves: arrows_switchable
  test('what cannot be used is a problem on its line with its fix, and is left out', () => {
    const texts = textsWith(
      '(a1:Arrows {}),',
      "(a2:Arrows {arrowheads: 'hid'}),",
      "(a3:Arrows {arrowheads: 'hide', type: 'NEARR'}),",
      "(a4:Arrows {arrowheads: 'hide', type: 'NEAR'}),",
      "(a5:Arrows {arrowheads: 'show', type: 'NEAR'}),",
      "(a6:Arrows {arowheads: 'hide'})",
    );
    const { style, problems } = readStyle(texts, 'trip', readNote(texts));
    assert.deepEqual(
      problems.map((p) => [p.line, p.message, p.fix]),
      [
        [2, 'an Arrows says show or hide', "add arrowheads: 'show' or 'hide'"],
        [3, 'arrowheads must be show or hide', 'change hid to hide'],
        [4, 'NEARR is not a relationship type in graph trip', 'change NEARR to NEAR'],
        [6, 'the arrowheads of NEAR in the whole graph are set to both hide (line 5) and show', 'remove one of them'],
        [7, 'arowheads is not a key an Arrows uses', 'change arowheads to arrowheads'],
      ],
    );
    assert.deepEqual(
      style.arrows.map((a) => [a.arrowheads, a.type]),
      [['hide', 'NEAR']],
    );
  });
});

describe('with arrowheads hidden, the direction is never lost', () => {
  const HIDE = "(a1:Arrows {arrowheads: 'hide'})";

  // proves: direction_never_lost
  test('a link tapped says its reading from one end to the other, as written', () => {
    const { reading, drawing } = drawn(undefined, HIDE);
    assert.deepEqual(drawing.arrowless, [0, 1, 2, 3, 4]);
    const shown = { ...reading, graphs: new Map(reading.graphs).set('trip', drawing) };
    const said = drawing.links.map((_, i) => {
      const d = linkDetails(shown, 'trip', i);
      return `${d.from.text} ${d.reading} ${d.to.text}`;
    });
    assert.deepEqual(said, [
      'Home near The park',
      'Cafe serves The park',
      'Home cites The guide',
      'Cafe cites The guide',
      'The park tagged Green',
    ]);
    // the backwards link is laid out from its far end, yet read from the end it is written from
    assert.ok(linkLines(sources(drawing)[0]).some((l) => l.startsWith('  "green" -> "park"')));
  });

  // proves: direction_never_lost
  test('the text version of the graph says each link in its direction, the same as with arrowheads drawn', () => {
    const hidden = drawn(undefined, HIDE).drawing,
      { plain } = drawn(undefined);
    assert.deepEqual(textVersion(hidden), textVersion(plain));
    assert.ok(textVersion(hidden).includes('The park tagged Green.'));
    assert.ok(textVersion(hidden).includes('Home cites The guide.'));
  });
});
