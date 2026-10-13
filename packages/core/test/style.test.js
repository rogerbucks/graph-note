// The style graph (editor spec §2, §6, §7): nudges, the properties shown and the styling of views and paths are written
// as their own block, a graph in the same notation, beside the graph they style and never in its data. It is checked like
// any graph — every name in it must be in the graph it styles — and a style block that cannot be read never stops the
// drawing: the graph is drawn in the locked style, and the problem is listed.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { dataKind, gqlBlocks, graphOfBlock, styleOf } from '../src/blocks.ts';
import { readNote } from '../src/drawing.ts';
import { outsideOf, readStyle } from '../src/style.ts';
import { styleEdit } from '../src/style-edit.ts';

const TRIP = `// graph: trip · SOURCE
(home:Place {name: 'Home'}),
(park:Place {name: 'The park', open: 'dawn'}),
(cafe:Cafe {name: 'Cafe'}),
(lake:Place {name: 'The lake'}),
(walk:Path {title: 'Walk'}),
(walk)-[:STEP {seq: 1}]->(home),
(walk)-[:STEP {seq: 2}]->(park),
(home)-[:NEAR]->(park),
(park)-[:NEAR]->(lake)`;

const STYLED = `// graph: trip_style · STYLE trip
// The style of graph trip
(n1:Nudge {word: 'beside', thing: 'home', other: 'park'}),
(n2:Nudge {word: 'group', thing: 'lake', group: 'Water'}),
(n3:Nudge {word: 'direction', direction: 'TB'}),
(n4:Nudge {word: 'before', thing: 'cafe', other: 'lake'}),
(s1:Show {property: 'open', kind: 'Place'}),
(s2:Show {property: 'name', thing: 'cafe'}),
(l1:Look {view: 'outdoors', kind: 'Place', colour: 'green', means: 'open air'}),
(l2:Look {path: 'walk', from: 'home', type: 'NEAR', to: 'park', line: 'bold', colour: 'orange', means: 'walked'}),
(l3:Look {path: 'walk', thing: 'cafe', format: 'italic'}),
(v1:ViewStyle {view: 'outdoors', outside: 'hide'}),
(w1:Shown {view: 'outdoors', zoom: 1.5, x: 120, y: -40, frame: '0,0,300,200', selected: 'park'})`;

/** The style of graph trip in a note of the given blocks, and its problems. */
const styleIn = (...texts) => readStyle(texts, 'trip', readNote(texts));
/** A style block of graph trip holding the given lines. */
const styleBlock = (...lines) => ['// graph: trip_style · STYLE trip', ...lines].join('\n');
const messages = (problems) => problems.map((p) => p.message);

describe('a style block in a note', () => {
  // proves: style_block_in_note
  test('is known by its graph line, which names the graph it styles, and is never data to draw', () => {
    assert.equal(styleOf(STYLED), 'trip');
    assert.equal(styleOf('// graph: trip_style  ·  STYLE  trip\n(n:Nudge)'), 'trip');
    assert.equal(styleOf(TRIP), null);
    assert.equal(styleOf('// graph: trip · SCHEMA trip'), null);
    assert.equal(dataKind(STYLED), null);
    assert.equal(graphOfBlock(STYLED), null);
    assert.equal(dataKind(TRIP), 'data');
  });

  // proves: style_block_in_note, style_is_a_graph
  test('is kept out of the drawing: the note draws only the graph it styles', () => {
    const r = readNote([TRIP, STYLED]);
    assert.deepEqual([...r.graphs.keys()], ['trip']);
    assert.deepEqual(Object.keys(r.world), ['trip']);
    assert.deepEqual(Object.keys(r.whole), ['trip']);
    assert.deepEqual(
      r.graphs.get('trip').boxes.map((b) => b.key),
      ['home', 'park', 'cafe', 'lake', 'walk'],
    );
  });

  // proves: style_is_a_graph
  test('leaves the data graph read exactly as it is read with no style block, wherever the style block is', () => {
    const plain = readNote([TRIP]);
    const after = readNote([TRIP, STYLED]);
    assert.deepEqual(after.graphs, plain.graphs);
    assert.deepEqual(after.problems, plain.problems);
    const first = readNote([STYLED, TRIP]);
    assert.deepEqual(first.graphs, plain.graphs);
    assert.deepEqual(
      first.problems.map((p) => ({ ...p, block: p.block - 1 })),
      plain.problems,
    );
    // a broken style block changes nothing in the data either
    const broken = readNote([TRIP, styleBlock("(n1:Nudge {word: 'beside' thing: 'home'})")]);
    assert.deepEqual(broken.graphs, plain.graphs);
    assert.deepEqual(broken.problems, plain.problems);
  });

  // proves: style_is_a_graph
  test('gives the nudges, the properties shown, the looks, how views are shown, and the direction', () => {
    const { style, problems } = styleIn(TRIP, STYLED);
    assert.deepEqual(problems, []);
    assert.deepEqual(
      style.nudges.map((n) => [n.word, n.thing, n.other ?? n.group ?? n.direction]),
      [
        ['beside', 'home', 'park'],
        ['group', 'lake', 'Water'],
        ['direction', undefined, 'TB'],
        ['before', 'cafe', 'lake'],
      ],
    );
    assert.equal(style.direction, 'TB');
    assert.deepEqual(style.nudges[0].at, { block: 1, line: 3, id: 'n1' });
    assert.deepEqual(
      style.shows.map((s) => [s.property, s.kind, s.thing]),
      [
        ['open', 'Place', undefined],
        ['name', undefined, 'cafe'],
      ],
    );
    assert.deepEqual(
      style.looks.map(({ at: _at, ...l }) => l),
      [
        { view: 'outdoors', kind: 'Place', colour: 'green', means: 'open air' },
        {
          path: 'walk',
          link: { from: 'home', type: 'NEAR', to: 'park' },
          line: 'bold',
          colour: 'orange',
          means: 'walked',
        },
        { path: 'walk', thing: 'cafe', format: 'italic' },
      ],
    );
    assert.deepEqual(style.views.get('outdoors'), { outside: 'hide' });
    assert.deepEqual(style.shown.get('outdoors'), {
      zoom: 1.5,
      x: 120,
      y: -40,
      frame: { x: 0, y: 0, width: 300, height: 200 },
      selected: 'park',
    });
  });

  // proves: style_block_in_note
  test('every style block of the graph is read and merged; a style block of another graph is not', () => {
    const other = "// graph: else_style · STYLE elsewhere\n(n9:Nudge {word: 'direction', direction: 'LR'})";
    const more = styleBlock("(n5:Nudge {word: 'beside', thing: 'park', other: 'lake'})");
    const { style, problems } = styleIn(TRIP, STYLED, other, more);
    assert.deepEqual(problems, []);
    assert.deepEqual(
      style.nudges.map((n) => n.at.id),
      ['n1', 'n2', 'n3', 'n4', 'n5'],
    );
    assert.equal(style.nudges[4].at.block, 3);
    assert.equal(style.direction, 'TB');
  });

  // proves: style_is_a_graph
  test('a note with no style block gives the locked style: nothing nudged, shown or styled', () => {
    const { style, problems } = styleIn(TRIP);
    assert.deepEqual(problems, []);
    assert.deepEqual(style.nudges, []);
    assert.deepEqual(style.looks, []);
    assert.equal(style.direction, undefined);
    assert.equal(style.views.size + style.shown.size + style.shows.length + style.arrows.length, 0);
  });
});

describe('the properties shown are remembered in the style graph', () => {
  const NOTE = ['# A walk', '', '```gql', TRIP, '```', ''].join('\n');
  const blocksOf = (note) => gqlBlocks(note).map((b) => b.text);
  const write = (note, show) => {
    const r = styleEdit(note, 'trip', { show });
    assert.ok('note' in r, r.refused);
    return r.note;
  };
  const shows = (note) => {
    const { style, problems } = styleIn(...blocksOf(note));
    assert.deepEqual(problems, []);
    return style.shows.map(({ at: _at, ...s }) => s);
  };

  // proves: properties_remembered
  test('for the whole graph or for one view: written to the style graph, never the data, and read back', () => {
    let note = write(NOTE, { property: 'open', kind: 'Place', inline: 'on' });
    note = write(note, { property: 'seq', type: 'STEP', view: 'walked', inline: 'on' });
    note = write(note, { property: 'open', kind: 'Place', view: 'walked', inline: 'off' });
    const blocks = blocksOf(note);
    assert.equal(blocks[0], TRIP, 'the data block is never touched');
    assert.equal(styleOf(blocks[1]), 'trip');
    assert.deepEqual(blocks[1].split('\n').slice(2), [
      "(show_1:Show {property: 'open', kind: 'Place', inline: 'on'}),",
      "(show_2:Show {property: 'seq', type: 'STEP', view: 'walked', inline: 'on'}),",
      "(show_3:Show {property: 'open', kind: 'Place', view: 'walked', inline: 'off'})",
    ]);
    assert.deepEqual(shows(note), [
      { property: 'open', kind: 'Place', inline: 'on' },
      { property: 'seq', type: 'STEP', view: 'walked', inline: 'on' },
      { property: 'open', kind: 'Place', view: 'walked', inline: 'off' },
    ]);
  });

  // proves: properties_remembered
  test('switched again, the choice is changed where it is written, never written twice', () => {
    const on = write(NOTE, { property: 'open', kind: 'Place', view: 'walked', inline: 'on' });
    const off = write(on, { property: 'open', kind: 'Place', view: 'walked', inline: 'off' });
    assert.deepEqual(shows(off), [{ property: 'open', kind: 'Place', view: 'walked', inline: 'off' }]);
    // the same property for the whole graph is a choice of its own
    const both = write(off, { property: 'open', kind: 'Place', inline: 'on' });
    assert.deepEqual(shows(both), [
      { property: 'open', kind: 'Place', view: 'walked', inline: 'off' },
      { property: 'open', kind: 'Place', inline: 'on' },
    ]);
  });

  // proves: properties_remembered
  test('a choice the style graph would not accept is refused, with the reason, and nothing is written', () => {
    const refused = (show) => styleEdit(NOTE, 'trip', { show });
    assert.deepEqual(refused({ kind: 'Place', inline: 'on' }), { refused: 'a Show names the property to show' });
    assert.deepEqual(refused({ property: 'open', inline: 'on' }), {
      refused: 'a Show is for one kind, thing or relationship type',
    });
    assert.deepEqual(refused({ property: 'open', kind: 'Place', inline: 'maybe' }), {
      refused: 'inline must be on or off',
    });
  });

  // proves: properties_remembered
  test('a Show for a relationship type names a property its links have; switched on or off, nothing else', () => {
    const { style, problems } = styleIn(
      TRIP,
      styleBlock(
        "(s1:Show {property: 'seq', type: 'STEP'}),",
        "(s2:Show {property: 'sq', type: 'STEP'}),",
        "(s3:Show {property: 'seq', type: 'STEP', inline: 'offf'}),",
        "(s4:Show {property: 'seq', type: 'STEP', view: 'v', inline: 'off'}),",
        "(s5:Show {property: 'seq', type: 'STEP', view: 'v', inline: 'on'})",
      ),
    );
    assert.deepEqual(
      problems.map((p) => [p.line, p.message, p.fix]),
      [
        [3, 'sq is not a property of STEP in graph trip', 'write a property it has in graph trip, or remove it'],
        [4, 'inline must be on or off', 'change offf to off'],
        [6, 'seq of STEP is switched both off (line 5) and on in view v', 'remove one of them'],
      ],
    );
    assert.deepEqual(
      style.shows.map((s) => [s.property, s.type, s.view, s.inline]),
      [
        ['seq', 'STEP', undefined, 'on'],
        ['seq', 'STEP', 'v', 'off'],
      ],
    );
  });
});

describe('the style graph is checked like any graph', () => {
  // proves: style_is_a_graph
  test('a style block that takes a data graph’s name as its own is a problem: a reader not knowing STYLE would merge it into that data', () => {
    const own = "// graph: trip · STYLE trip\n(n1:Nudge {word: 'direction', direction: 'TB'})";
    const { problems } = styleIn(TRIP, own);
    assert.ok(
      problems.some((p) => p.line === 1 && /name of its own/.test(p.message) && /trip_style/.test(p.fix)),
      messages(problems).join(' | '),
    );
  });

  // proves: style_graph_checked
  test('a name that is not in the graph it styles is a problem on its line, with the nearest name as the fix', () => {
    const block = styleBlock(
      "(n1:Nudge {word: 'beside', thing: 'hme', other: 'park'}),",
      "(l1:Look {view: 'v', kind: 'Plaice', colour: 'green', means: 'open'}),",
      "(l2:Look {path: 'wlk', thing: 'cafe', line: 'dashed'}),",
      "(l3:Look {view: 'v', from: 'home', type: 'NEER', to: 'park', line: 'dotted'}),",
      "(s1:Show {property: 'opn', kind: 'Place'}),",
      "(w1:Shown {view: 'v', zoom: 2, selected: 'zzzzzz'})",
    );
    const { style, problems } = styleIn(TRIP, block);
    assert.deepEqual(
      problems.map((p) => [p.block, p.line, p.message, p.fix, p.replace?.with]),
      [
        [1, 2, 'hme is not a thing in graph trip', 'change hme to home', ['home']],
        [1, 3, 'Plaice is not a kind in graph trip', 'change Plaice to Place', ['Place']],
        [1, 4, 'wlk is not a path in graph trip', 'change wlk to walk', ['walk']],
        [1, 5, 'NEER is not a relationship type in graph trip', 'change NEER to NEAR', ['NEAR']],
        [1, 6, 'opn is not a property of Place in graph trip', 'change opn to open', ['open']],
        [1, 7, 'zzzzzz is not a thing in graph trip', 'write the id of a thing in graph trip, or remove it', undefined],
      ],
    );
    assert.ok(problems.every((p) => p.graph === 'trip' && p.severity === 'error'));
    // the span is where the name is written, so the fix can be made in place
    const [first] = problems;
    assert.equal(block.split('\n')[first.span.line].slice(first.span.character, first.span.end), 'hme');
    // what names nothing is left out; the rest is used
    assert.deepEqual(style.nudges, []);
    assert.deepEqual(style.looks, []);
    assert.deepEqual(style.shows, []);
    assert.deepEqual(style.shown.get('v'), { zoom: 2 });
  });

  // proves: style_graph_checked
  test('a style graph holds only its own kinds of thing, and no links; a value of the wrong type is a problem', () => {
    const block = styleBlock(
      "(x1:Colour {name: 'red'}),",
      "(n1:Nudge {word: 'beside', thing: 'home', other: 'park'}),",
      "(n2:Nudge {word: 'beside', thing: 'cafe', other: 'lake'}),",
      '(n1)-[:AFTER]->(n2),',
      "(w1:Shown {view: 'v', zoom: 'big'})",
    );
    const { style, problems } = styleIn(TRIP, block);
    assert.deepEqual(
      problems.map((p) => [p.line, p.message]),
      [
        [
          2,
          'Colour is not a kind of thing a style graph holds: Nudge, Show, Look, ViewStyle, Shown, Arrows or Diagram',
        ],
        [5, 'a link means nothing in a style graph'],
        [6, 'zoom must be a number'],
      ],
    );
    assert.equal(style.nudges.length, 2);
  });

  // proves: style_graph_checked
  test('each kind of style thing names what it needs, and a name is written as text', () => {
    const block = styleBlock(
      "(n1:Nudge {word: 'direction'}),",
      "(s1:Show {property: 'name'}),",
      "(s2:Show {property: 'name', kind: 'Place', thing: 'home'}),",
      "(s3:Show {kind: 'Place'}),",
      "(v1:ViewStyle {view: 'v'}),",
      '(w1:Shown {zoom: 2}),',
      "(n2:Nudge {word: 'beside', thing: 3, other: 'home'})",
    );
    const { style, problems } = styleIn(TRIP, block);
    assert.deepEqual(
      problems.map((p) => [p.line, p.message, p.fix]),
      [
        [2, 'a direction nudge names its direction', "add direction: 'LR' or 'TB'"],
        [
          3,
          'a Show is for one kind, thing or relationship type',
          "add kind: '<Kind>', thing: '<id>' or type: '<TYPE>'",
        ],
        [4, 'a Show is for one kind, thing or relationship type', 'remove all but one of them'],
        [5, 'a Show names the property to show', "add property: '<name>'"],
        [6, 'a ViewStyle says fade or hide', "add outside: 'fade' or 'hide'"],
        [7, 'a Shown names its view', "add view: '<the view's name>'"],
        [8, 'thing must be text', 'write thing in quotes'],
      ],
    );
    assert.deepEqual(style, readStyle([TRIP], 'trip', readNote([TRIP])).style);
  });

  // proves: style_graph_checked
  test('a style block for a graph the note does not have is a problem, and nothing in it is used', () => {
    const block = "// graph: nowhere_style · STYLE nowhere\n(n1:Nudge {word: 'direction', direction: 'TB'})";
    const { style, problems } = readStyle([TRIP, block], 'nowhere', readNote([TRIP, block]));
    assert.deepEqual(
      problems.map((p) => [p.block, p.line, p.message]),
      [[1, 1, 'there is no graph nowhere in this note to style']],
    );
    assert.equal(style.direction, undefined);
  });
});

describe('a style block that cannot be read', () => {
  // proves: broken_style_block
  test('never stops the drawing: what cannot be read is a problem on its line, and the rest is used', () => {
    const block = styleBlock(
      "(n1:Nudge {word: 'beside', thing: 'home', other: 'park'}),",
      "(n2:Nudge {word: 'beside' thing: 'cafe'}),",
      "(n3:Nudge {word: 'direction', direction: 'TB'})",
    );
    const texts = [TRIP, block];
    const reading = readNote(texts);
    assert.ok(reading.graphs.get('trip').boxes.length, 'the graph is drawn');
    const { style, problems } = readStyle(texts, 'trip', reading);
    assert.deepEqual(
      problems.map((p) => [p.graph, p.block, p.line, p.severity]),
      [['trip', 1, 3, 'error']],
    );
    assert.deepEqual(
      style.nudges.map((n) => n.at.id),
      ['n1', 'n3'],
    );
  });

  // proves: broken_style_block
  test('a style graph line that names no graph is listed, and the block is still never drawn as data', () => {
    const block = "// graph: trip_style · STYLE\n(n1:Nudge {word: 'direction', direction: 'TB'})";
    const r = readNote([TRIP, block]);
    assert.deepEqual([...r.graphs.keys()], ['trip']);
    const p = r.problems.find((x) => x.block === 1);
    assert.equal(p.line, 1);
    assert.match(p.message, /names no graph to style/);
    assert.equal(p.fix, "write the graph it styles after STYLE: '// graph: trip_style · STYLE <graph>'");
  });

  // proves: broken_style_block
  test('nothing written in a style block throws: the locked style is kept, with a problem', () => {
    for (const lines of [['(('], ["(n:Nudge {word: 'beside'"], ['MATCH (n) SET n.x = 1'], ['', '', '']]) {
      const texts = [TRIP, styleBlock(...lines)];
      const reading = readNote(texts);
      const { style } = readStyle(texts, 'trip', reading);
      assert.deepEqual(style.nudges, [], lines.join('\n'));
    }
  });

  // proves: broken_style_block
  test('a style block too large to read is not read: the graph keeps the locked style, and says why', () => {
    const many = Array.from({ length: 12_000 }, (_, i) => `(n${i}:Nudge {word: 'direction', direction: 'TB'}),`);
    const block = styleBlock(...many, "(z:Nudge {word: 'direction', direction: 'TB'})");
    const { style, problems } = styleIn(TRIP, block);
    assert.equal(style.direction, undefined);
    assert.deepEqual(
      problems.map((p) => [p.block, p.line]),
      [[1, 1]],
    );
    assert.match(problems[0].message, /too large to read/);
  });
});

describe('nudges', () => {
  // proves: four_nudge_words
  test('a nudge is one of four words; any other is a problem whose fix names the nearest', () => {
    const block = styleBlock(
      "(n1:Nudge {word: 'besides', thing: 'home', other: 'park'}),",
      "(n2:Nudge {word: 'grop', thing: 'home', group: 'G'}),",
      "(n3:Nudge {word: 'centre'})",
    );
    const { style, problems } = styleIn(TRIP, block);
    assert.deepEqual(
      problems.map((p) => [p.line, p.message, p.fix, p.replace?.with]),
      [
        [
          2,
          'a nudge must be one of four words: beside, before, group or direction',
          'change besides to beside',
          ['beside'],
        ],
        [3, 'a nudge must be one of four words: beside, before, group or direction', 'change grop to group', ['group']],
        [
          4,
          'a nudge must be one of four words: beside, before, group or direction',
          'change centre to before',
          ['before'],
        ],
      ],
    );
    assert.deepEqual(style.nudges, []);
  });

  // proves: four_nudge_words, nudge_problems
  test('each word needs its parts: beside and before two things, group a thing and its group, direction one listed', () => {
    const block = styleBlock(
      "(n1:Nudge {word: 'beside', thing: 'home'}),",
      "(n2:Nudge {word: 'before', other: 'home'}),",
      "(n3:Nudge {word: 'group', thing: 'home'}),",
      "(n4:Nudge {word: 'direction', direction: 'RL'}),",
      "(n5:Nudge {thing: 'home'})",
    );
    const { style, problems } = styleIn(TRIP, block);
    assert.deepEqual(
      problems.map((p) => [p.line, p.message, p.fix]),
      [
        [2, 'a beside nudge names two things: thing and other', "add other: '<id>'"],
        [3, 'a before nudge names two things: thing and other', "add thing: '<id>'"],
        [4, 'a group nudge names a thing and its group', "add group: '<the group's label>'"],
        [5, 'RL is not a direction the locked style lays out in', 'change RL to LR'],
        [
          6,
          'a nudge must be one of four words: beside, before, group or direction',
          "add word: 'beside', 'before', 'group' or 'direction'",
        ],
      ],
    );
    assert.deepEqual(style.nudges, []);
  });

  // proves: nudge_problems
  test('a direction written in the wrong case is fixed to the direction it means, never to the other', () => {
    const block = styleBlock(
      "(n1:Nudge {word: 'direction', direction: 'tb'}),",
      "(n2:Nudge {word: 'direction', direction: 'Lr'})",
    );
    const { problems } = styleIn(TRIP, block);
    assert.deepEqual(
      problems.map((p) => [p.line, p.message, p.fix, p.replace?.with]),
      [
        [2, 'tb is not a direction the locked style lays out in', 'change tb to TB', ['TB']],
        [3, 'Lr is not a direction the locked style lays out in', 'change Lr to LR', ['LR']],
      ],
    );
  });

  // proves: nudge_problems
  test('nudges that conflict are each a problem with a fix; the first is kept and the later left out', () => {
    const block = styleBlock(
      "(n1:Nudge {word: 'direction', direction: 'TB'}),",
      "(n2:Nudge {word: 'direction', direction: 'LR'}),",
      "(n3:Nudge {word: 'beside', thing: 'home', other: 'park'}),",
      "(n4:Nudge {word: 'before', thing: 'park', other: 'home'}),",
      "(n5:Nudge {word: 'group', thing: 'lake', group: 'Water'}),",
      "(n6:Nudge {word: 'group', thing: 'lake', group: 'Wild'}),",
      "(n7:Nudge {word: 'before', thing: 'cafe', other: 'lake'}),",
      "(n8:Nudge {word: 'before', thing: 'lake', other: 'walk'}),",
      "(n9:Nudge {word: 'before', thing: 'walk', other: 'cafe'}),",
      "(n10:Nudge {word: 'direction', direction: 'TB'})",
    );
    const { style, problems } = styleIn(TRIP, block);
    assert.deepEqual(
      problems.map((p) => [p.line, p.message, p.fix]),
      [
        [3, 'this direction nudge (LR) conflicts with the one on line 2 (TB)', 'remove one of them'],
        [
          5,
          'home and park cannot be both beside and before each other: this conflicts with line 4',
          'remove one of them',
        ],
        [7, 'lake is in two groups, Water (line 6) and Wild', 'remove one of them'],
        [10, 'this before nudge closes a loop: cafe before lake before walk before cafe', 'remove one of them'],
      ],
    );
    assert.ok(problems.every((p) => p.severity === 'error'));
    assert.deepEqual(
      style.nudges.map((n) => n.at.id),
      ['n1', 'n3', 'n5', 'n7', 'n8', 'n10'],
    );
    assert.equal(style.direction, 'TB');
  });
});

describe('views in the style graph', () => {
  // proves: fade_or_hide_in_style
  test('whether things outside a view are faded or hidden is set in the style graph; fade when nothing is written', () => {
    const { style } = styleIn(TRIP, STYLED);
    assert.equal(outsideOf(style, 'outdoors'), 'hide');
    assert.equal(outsideOf(style, 'indoors'), 'fade');
    const block = styleBlock(
      "(v1:ViewStyle {view: 'a', outside: 'blur'}),",
      "(v2:ViewStyle {view: 'b', outside: 'hide'}),",
      "(v3:ViewStyle {view: 'b', outside: 'fade'}),",
      "(v4:ViewStyle {outside: 'fade'})",
    );
    const checked = styleIn(TRIP, block);
    assert.deepEqual(
      checked.problems.map((p) => [p.line, p.message, p.fix]),
      [
        [2, 'outside must be fade or hide', 'change blur to fade or hide'],
        [4, 'view b is set to both hide (line 3) and fade', 'remove one of them'],
        [5, 'a ViewStyle names its view', "add view: '<the view's name>'"],
      ],
    );
    assert.equal(outsideOf(checked.style, 'a'), 'fade');
    assert.equal(outsideOf(checked.style, 'b'), 'hide');
  });

  // proves: view_saved_as_shown
  test('how a view was shown is read from the style graph: its zoom, position, frame and selection, each checked', () => {
    const block = styleBlock(
      "(w1:Shown {view: 'a', zoom: 0, frame: '1,2,3'}),",
      "(w2:Shown {view: 'b', x: 'left', selected: 'home'})",
    );
    const { style, problems } = styleIn(TRIP, block);
    assert.deepEqual(
      problems.map((p) => [p.line, p.message]),
      [
        [2, 'zoom must be a number above 0'],
        [2, "frame must be four numbers, 'x,y,width,height'"],
        [3, 'x must be a number'],
      ],
    );
    assert.deepEqual(style.shown.get('a'), {});
    assert.deepEqual(style.shown.get('b'), { selected: 'home' });
  });
});
