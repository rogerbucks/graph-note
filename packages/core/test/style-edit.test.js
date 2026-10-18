// Writing to the style graph (editor spec §2, §6, §7). A nudge, a look, a view's fade or hide and how a view was shown
// are written as text into the graph's style block. That block is made after the graph's last block when there is none.
// They are never written into a data block, so the data reads exactly as before.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { gqlBlocks, gqlSpans, styleOf } from '../src/blocks.ts';
import { readNote } from '../src/drawing.ts';
import { outsideOf, readStyle } from '../src/style.ts';
import { styleEdit } from '../src/style-edit.ts';

const TRIP = `// graph: trip
(home:Place {name: 'Home'}),
(park:Place {name: 'The park'}),
(home)-[:NEAR]->(park)`;
const OTHER = `// graph: other
(a:Thing {name: 'A'})`;
const NOTE = ['# A walk', '', '```gql', TRIP, '```', '', 'Some words.', '', '```gql', OTHER, '```', ''].join('\n');

const written = (r) => {
  assert.ok(!('refused' in r), 'refused: ' + (r.refused ?? ''));
  return r.note;
};
/** The style of a graph in a note, and its problems. */
const styleIn = (note, graph = 'trip') => {
  const texts = gqlBlocks(note).map((b) => b.text);
  return readStyle(texts, graph, readNote(texts));
};
/** The note's data blocks, by text: what a style edit must never change. */
const data = (note) =>
  gqlSpans(note)
    .filter((s) => styleOf(s.text) === null)
    .map((s) => s.text);

describe('a note with no style block', () => {
  // proves: style_block_in_note, style_is_a_graph
  test('gets one after the graph’s last block, with its graph line and a comment saying whose style it is', () => {
    const note = written(styleEdit(NOTE, 'trip', { nudge: { word: 'beside', thing: 'home', other: 'park' } }));
    const lines = note.split('\n');
    assert.deepEqual(lines.slice(7, 15), [
      '```',
      '',
      '```gql',
      '// graph: trip_style · STYLE trip',
      '// The style of graph trip: how it is drawn, never its data (editor spec §2).',
      "(nudge_1:Nudge {word: 'beside', thing: 'home', other: 'park'})",
      '```',
      '',
    ]);
    assert.deepEqual(data(note), data(NOTE));
    const { style, problems } = styleIn(note);
    assert.deepEqual(problems, []);
    assert.deepEqual(
      style.nudges.map((n) => [n.word, n.thing, n.other]),
      [['beside', 'home', 'park']],
    );
  });

  // proves: style_is_a_graph
  test('the data graph reads exactly as it did before the style was written', () => {
    const note = written(styleEdit(NOTE, 'trip', { outside: { view: 'outdoors', outside: 'hide' } }));
    const before = readNote(gqlBlocks(NOTE).map((b) => b.text)),
      after = readNote(gqlBlocks(note).map((b) => b.text));
    assert.deepEqual(after.graphs, before.graphs);
    assert.deepEqual(
      after.problems,
      before.problems.map((p) => (p.block > 0 ? { ...p, block: p.block + 1 } : p)),
    );
    assert.deepEqual(Object.keys(after.whole), Object.keys(before.whole));
  });

  // proves: style_block_in_note
  test('after a schema written later for the graph, the graph’s last block; never for a graph the note lacks', () => {
    const schema = "// graph: trip\n(m:GraphMeta {graph: 'trip'})";
    const note = `${NOTE}\n\`\`\`gql\n${schema}\n\`\`\`\n`;
    const out = written(styleEdit(note, 'trip', { nudge: { word: 'direction', direction: 'TB' } }));
    const texts = gqlSpans(out).map((s) => s.text);
    assert.deepEqual(texts.map(styleOf), [null, null, null, 'trip']);
    assert.deepEqual(styleEdit(NOTE, 'nowhere', { nudge: { word: 'direction', direction: 'TB' } }), {
      refused: 'there is no graph nowhere in this note to style',
    });
  });
});

describe('a note with a style block', () => {
  // proves: style_is_a_graph
  test('has each new nudge and look added at its end, comma-joined, each with a fresh id', () => {
    let note = written(styleEdit(NOTE, 'trip', { nudge: { word: 'beside', thing: 'home', other: 'park' } }));
    note = written(styleEdit(note, 'trip', { nudge: { word: 'group', thing: 'home', group: "Bob's \\ place" } }));
    note = written(
      styleEdit(note, 'trip', {
        look: { view: 'v', link: { from: 'home', type: 'NEAR', to: 'park' }, colour: 'orange', means: 'near it' },
      }),
    );
    note = written(styleEdit(note, 'trip', { look: { path: 'p', kind: 'Place', line: 'dashed', format: 'bold' } }));
    const style = gqlSpans(note).find((s) => styleOf(s.text) === 'trip').text;
    assert.deepEqual(style.split('\n').slice(2), [
      "(nudge_1:Nudge {word: 'beside', thing: 'home', other: 'park'}),",
      "(nudge_2:Nudge {word: 'group', thing: 'home', group: 'Bob\\'s \\\\ place'}),",
      "(look_1:Look {view: 'v', from: 'home', type: 'NEAR', to: 'park', colour: 'orange', means: 'near it'}),",
      "(look_2:Look {path: 'p', kind: 'Place', line: 'dashed', format: 'bold'})",
    ]);
    const read = styleIn(note).style;
    assert.equal(read.nudges[1].group, "Bob's \\ place");
    assert.equal(read.looks.length, 1, 'the look for path p, which the graph lacks, is read and reported');
    assert.deepEqual(data(note), data(NOTE));
  });

  // proves: style_is_a_graph
  test('text with a line break or a tab in it is written as its escape, on one line, and reads back as given', () => {
    let note = written(
      styleEdit(NOTE, 'trip', {
        look: { view: 'v', thing: 'home', colour: 'orange', means: 'line one\nline two' },
      }),
    );
    note = written(styleEdit(note, 'trip', { nudge: { word: 'group', thing: 'park', group: 'A\tB\r\nC' } }));
    const style = gqlSpans(note).find((s) => styleOf(s.text) === 'trip').text;
    assert.deepEqual(style.split('\n').slice(2), [
      "(look_1:Look {view: 'v', thing: 'home', colour: 'orange', means: 'line one\\nline two'}),",
      "(nudge_1:Nudge {word: 'group', thing: 'park', group: 'A\\tB\\r\\nC'})",
    ]);
    const read = styleIn(note);
    assert.deepEqual(
      read.problems.filter((p) => p.severity === 'error'),
      [],
    );
    assert.equal(read.style.nudges[0].group, 'A\tB\r\nC');
    assert.deepEqual(data(note), data(NOTE));
  });

  // proves: fade_or_hide_in_style
  test('a view set to fade or hide again has its one setting changed, never a second added', () => {
    let note = written(styleEdit(NOTE, 'trip', { outside: { view: 'outdoors', outside: 'hide' } }));
    note = written(styleEdit(note, 'trip', { outside: { view: 'indoors', outside: 'hide' } }));
    note = written(styleEdit(note, 'trip', { outside: { view: 'outdoors', outside: 'fade' } }));
    const block = gqlSpans(note).find((s) => styleOf(s.text) === 'trip').text;
    assert.deepEqual(block.split('\n').slice(2), [
      "(outside_1:ViewStyle {view: 'outdoors', outside: 'fade'}),",
      "(outside_2:ViewStyle {view: 'indoors', outside: 'hide'})",
    ]);
    const { style, problems } = styleIn(note);
    assert.deepEqual(problems, []);
    assert.equal(outsideOf(style, 'outdoors'), 'fade');
    assert.equal(outsideOf(style, 'indoors'), 'hide');
  });

  // proves: view_saved_as_shown
  test('a view saved as shown writes its zoom, position, frame and selection, replacing what was saved before', () => {
    let note = written(styleEdit(NOTE, 'trip', { shown: { view: 'v', zoom: 1.5, x: 120, y: -40 } }));
    note = written(
      styleEdit(note, 'trip', {
        shown: { view: 'v', zoom: 2, x: 0.5, y: 3, frame: { x: 0, y: 0, width: 300, height: 200 }, selected: 'park' },
      }),
    );
    const block = gqlSpans(note).find((s) => styleOf(s.text) === 'trip').text;
    assert.deepEqual(block.split('\n').slice(2), [
      "(shown_1:Shown {view: 'v', zoom: 2, x: 0.5, y: 3, frame: '0,0,300,200', selected: 'park'})",
    ]);
    const { style, problems } = styleIn(note);
    assert.deepEqual(problems, []);
    assert.deepEqual(style.shown.get('v'), {
      zoom: 2,
      x: 0.5,
      y: 3,
      frame: { x: 0, y: 0, width: 300, height: 200 },
      selected: 'park',
    });
    assert.deepEqual(data(note), data(NOTE));
  });

  // proves: style_block_in_note
  test('belongs to its own graph: a style written for another graph gets that graph its own block', () => {
    let note = written(styleEdit(NOTE, 'trip', { nudge: { word: 'direction', direction: 'TB' } }));
    note = written(styleEdit(note, 'other', { nudge: { word: 'direction', direction: 'LR' } }));
    assert.deepEqual(
      gqlSpans(note).map((s) => styleOf(s.text)),
      [null, 'trip', null, 'other'],
    );
    assert.equal(styleIn(note, 'trip').style.direction, 'TB');
    assert.equal(styleIn(note, 'other').style.direction, 'LR');
  });
});

describe('what is never written', () => {
  // proves: four_nudge_words, fade_or_hide_in_style, styling_keeps_locked_rules, view_saved_as_shown
  test('a change the style graph would refuse is refused, with the reason, and the note is left alone', () => {
    const refusals = [
      [
        { nudge: { word: 'near', thing: 'home', other: 'park' } },
        'a nudge must be one of four words: beside, before, group or direction',
      ],
      [{ outside: { view: 'v', outside: 'blur' } }, 'outside must be fade or hide'],
      [{ outside: { view: '', outside: 'hide' } }, 'a view needs a name'],
      [{ look: { view: 'v', thing: 'home', colour: 'blue' } }, 'blue needs a meaning, for the legend: give means'],
      [{ look: { view: 'v', thing: 'home', colour: '#f00', means: 'x' } }, '#f00 is not a colour of the locked style'],
      [{ look: { thing: 'home', line: 'dashed' } }, 'a look is for one view or one path'],
      [{ look: { view: 'v', line: 'dashed' } }, 'a look styles one thing, kind or link'],
      [{ look: { view: 'v', thing: 'home' } }, 'a look changes a colour, a line or a format'],
      [{ look: { view: 'v', thing: 'home', line: 'wavy' } }, 'line must be solid, dashed, dotted or bold'],
      [{ shown: { view: 'v', zoom: Infinity, x: 0, y: 0 } }, 'zoom, x and y must be numbers, and zoom above 0'],
      [{ shown: { view: 'v', zoom: 1, x: 0, y: 0, selected: '' } }, 'selected must name a thing'],
    ];
    for (const [change, refused] of refusals) assert.deepEqual(styleEdit(NOTE, 'trip', change), { refused });
  });
});
