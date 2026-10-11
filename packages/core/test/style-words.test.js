// The words of a style graph (editor spec §2, style_words_checked): a key the style graph does not know, and a frame that
// is not a well-formed list of numbers, are each a problem with its fix, applied by the diagnostics' code actions; and a
// view's name, which is the user's own, is never checked against anything. Beside style.test.js, which holds the rest of
// the style graph's tests.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readNote } from '../src/drawing.ts';
import { diagnostics } from '../src/help.ts';
import { readStyle } from '../src/style.ts';

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

const URI = 'file:///Some%20note.md';
/** The style of graph trip in a note of the given blocks, and its problems. */
const styleIn = (...texts) => readStyle(texts, 'trip', readNote(texts));
/** A style block of graph trip holding the given lines. */
const styleBlock = (...lines) => ['// graph: trip_style · STYLE trip', ...lines].join('\n');
const messages = (problems) => problems.map((p) => p.message);
/** The style block (block 1) with the `which`th code action of its `n`th problem applied, through the diagnostics. */
const fixedBy = (block, n, which = 0) => {
  const texts = [TRIP, block];
  const { problems } = readStyle(texts, 'trip', readNote(texts));
  const d = diagnostics({ ...readNote(texts), problems }, 'trip', 1, block, URI)[n];
  const { range, newText } = d.data.fixes[which].edit.changes[URI][0];
  const lines = block.split('\n');
  const line = lines[range.start.line];
  lines[range.start.line] = line.slice(0, range.start.character) + newText + line.slice(range.end.character);
  return lines.join('\n');
};

describe('a key the style graph does not know', () => {
  // proves: style_words_checked
  test('is a problem on the key, fixed to the nearest key the thing may still use', () => {
    const block = styleBlock(
      "(l1:Look {view: 'v', kind: 'Place', colur: 'green', means: 'open', line: 'dashed'}),",
      "(l2:Look {view: 'v', thing: 'home', kine: 'x', format: 'bold'}),",
      "(n1:Nudge {word: 'direction', direction: 'TB', comment: 'why'}),",
      "(s1:Show {property: 'open', kind: 'Place', proprty: 'name'})",
    );
    const { style, problems } = styleIn(TRIP, block);
    assert.deepEqual(
      problems.map((p) => [p.line, p.message, p.fix, p.replace?.with]),
      [
        [2, 'colur is not a key a Look uses', 'change colur to colour', ['colour']],
        [3, 'kine is not a key a Look uses', 'change kine to the one you mean: kind or line', ['kind', 'line']],
        [
          4,
          'comment is not a key a Nudge uses',
          'remove comment, or use one of word, thing, other, group or direction',
          undefined,
        ],
        [5, 'proprty is not a key a Show uses', 'remove proprty, or use one of property, kind or thing', undefined],
      ],
    );
    assert.ok(problems.every((p) => p.graph === 'trip' && p.severity === 'error' && p.block === 1));
    for (const p of problems)
      assert.equal(block.split('\n')[p.span.line].slice(p.span.character, p.span.end), p.message.split(' ')[0]);
    // a thing whose word is not known may not mean what it says, so it is left out until the word is fixed
    assert.deepEqual([style.looks, style.nudges, style.shows], [[], [], []]);
  });

  // proves: style_words_checked
  test('is fixed by the diagnostics’ code actions, and the fix round-trips: the thing is then read, with no problem', () => {
    const block = styleBlock("(l1:Look {view: 'v', kind: 'Place', colur: 'green', means: 'open', line: 'bold'})");
    const fixed = fixedBy(block, 0);
    assert.equal(fixed, block.replace('colur', 'colour'));
    const { style, problems } = styleIn(TRIP, fixed);
    assert.deepEqual(problems, []);
    assert.deepEqual(
      style.looks.map(({ at: _at, ...l }) => l),
      [{ view: 'v', kind: 'Place', colour: 'green', means: 'open', line: 'bold' }],
    );
    // of several equally near, each is a fix of its own
    const tie = styleBlock("(l2:Look {view: 'v', thing: 'home', kine: 'bold', format: 'bold'})");
    assert.equal(fixedBy(tie, 0, 0), tie.replace('kine', 'kind'));
    assert.equal(fixedBy(tie, 0, 1), tie.replace('kine', 'line'));
  });

  // proves: style_words_checked
  test('is the only thing said of a thing that lacks a key by it: no “add …” beside the rename', () => {
    const block = styleBlock(
      "(l1:Look {view: 'v', kind: 'Place', colur: 'green', means: 'm'}),",
      "(n1:Nudge {wrd: 'direction', direction: 'TB'}),",
      "(v1:ViewStyle {view: 'a', outsde: 'hide'}),",
      "(w1:Shown {vew: 'a', zoom: 2}),",
      "(s1:Show {proprty: 'name', kind: 'Place'}),",
      "(l2:Look {view: 'v', kine: 'Place', colour: 'green'})",
    );
    const { problems } = styleIn(TRIP, block);
    assert.deepEqual(
      problems.map((p) => [p.line, p.message, p.replace?.with]),
      [
        [2, 'colur is not a key a Look uses', ['colour']],
        [3, 'wrd is not a key a Nudge uses', ['word']],
        [4, 'outsde is not a key a ViewStyle uses', ['outside']],
        [5, 'vew is not a key a Shown uses', ['view']],
        [6, 'proprty is not a key a Show uses', ['property']],
        [7, 'kine is not a key a Look uses', ['kind', 'line']],
      ],
    );
    // a value at fault is still said: only what is absent waits for the rename
    const wrong = styleIn(TRIP, styleBlock("(w1:Shown {view: 'a', zom: 'big', zoom: 0})")).problems;
    assert.deepEqual(messages(wrong), ['zom is not a key a Shown uses', 'zoom must be a number above 0']);
  });
});

describe('a frame', () => {
  // proves: style_words_checked
  test('is a list of numbers with nothing stray; a stray comma or space is a problem, fixed by removing it', () => {
    const cases = [
      ['1,2,3,4,', '1,2,3,4', "frame '1,2,3,4,' has a stray comma or space", "change it to '1,2,3,4'"],
      ['1,,2,3,4', '1,2,3,4', "frame '1,,2,3,4' has a stray comma or space", "change it to '1,2,3,4'"],
      [',1,2,3,4', '1,2,3,4', "frame ',1,2,3,4' has a stray comma or space", "change it to '1,2,3,4'"],
      [' 1, 2 ,3,4 ', '1,2,3,4', "frame ' 1, 2 ,3,4 ' has a stray comma or space", "change it to '1,2,3,4'"],
      [
        '1,2,3,',
        '1,2,3',
        "frame '1,2,3,' has a stray comma or space, and is not four numbers",
        "remove the stray comma or space, giving '1,2,3', then write four numbers, 'x,y,width,height'",
      ],
    ];
    for (const [written, clean, message, fix] of cases) {
      const block = styleBlock(`(w1:Shown {view: 'v', frame: '${written}'})`);
      const { style, problems } = styleIn(TRIP, block);
      assert.deepEqual(
        problems.map((p) => [p.line, p.message, p.fix, p.replace]),
        [[2, message, fix, { written, with: [clean] }]],
        written,
      );
      const { span } = problems[0];
      assert.equal(block.split('\n')[span.line].slice(span.character, span.end), written);
      assert.equal(style.shown.get('v')?.frame, undefined, 'a frame at fault is left out');
      const fixed = fixedBy(block, 0);
      assert.equal(fixed, block.replace(`'${written}'`, `'${clean}'`));
      const after = styleIn(TRIP, fixed);
      // the fix leaves four numbers read as they were written, or, of three, the one problem of there being three
      if (clean.split(',').length === 4) {
        assert.deepEqual(after.problems, []);
        assert.deepEqual(after.style.shown.get('v').frame, { x: 1, y: 2, width: 3, height: 4 });
      } else assert.deepEqual(messages(after.problems), ["frame must be four numbers, 'x,y,width,height'"]);
    }
  });

  // proves: style_words_checked
  test('whose parts are not numbers is a problem with no edit; signs, decimals and exponents are numbers', () => {
    const bad = [
      '',
      ',',
      '1,a,3,4',
      '1;2;3;4',
      '1 2,3,4',
      '1,2,3,4,5',
      '1,2,3',
      '0x10,0,1,1',
      '1e999,0,1,1',
      '--1,0,1,1',
      '+-1,0,1,1',
      '1.2.3,0,1,1',
      '.,0,1,1',
      '1e,0,1,1',
    ];
    for (const written of bad)
      assert.deepEqual(
        styleIn(TRIP, styleBlock(`(w1:Shown {view: 'v', frame: '${written}'})`)).problems.map((p) => [
          p.message,
          p.replace,
        ]),
        [["frame must be four numbers, 'x,y,width,height'", undefined]],
        written,
      );
    const { style, problems } = styleIn(TRIP, styleBlock("(w1:Shown {view: 'v', frame: '-5.5,0,1e-7,120'})"));
    assert.deepEqual(problems, []);
    assert.deepEqual(style.shown.get('v').frame, { x: -5.5, y: 0, width: 1e-7, height: 120 });
  });

  // proves: style_words_checked
  test('written by hand with a plus sign, or a dot with digits on one side only, is still read, as it always was', () => {
    for (const [written, frame] of [
      ['+1,0,1,1', { x: 1, y: 0, width: 1, height: 1 }],
      ['.5,0,1,1', { x: 0.5, y: 0, width: 1, height: 1 }],
      ['5.,0,1,1', { x: 5, y: 0, width: 1, height: 1 }],
      ['+.5e1,-.5,5.e0,+7', { x: 5, y: -0.5, width: 5, height: 7 }],
    ]) {
      const { style, problems } = styleIn(TRIP, styleBlock(`(w1:Shown {view: 'v', frame: '${written}'})`));
      assert.deepEqual(problems, [], written);
      assert.deepEqual(style.shown.get('v').frame, frame, written);
    }
  });
});

describe('a view’s name', () => {
  // proves: style_words_checked
  test('is the user’s own: never checked against anything, however odd, or near a thing’s name', () => {
    const names = [
      'hme',
      'Plaice',
      'wlk',
      'home',
      'Place',
      'walk',
      'select',
      'MATCH',
      'NaN',
      'a b c',
      '42',
      'Zürich — 2026?',
    ];
    const lines = names.flatMap((v, i) => [
      `(l${i}:Look {view: '${v}', kind: 'Place', colour: 'green', means: 'open'}),`,
      `(v${i}:ViewStyle {view: '${v}', outside: 'hide'}),`,
      `(w${i}:Shown {view: '${v}', zoom: 2})${i === names.length - 1 ? '' : ','}`,
    ]);
    const { style, problems } = styleIn(TRIP, styleBlock(...lines));
    assert.deepEqual(problems, []);
    assert.deepEqual(
      style.looks.map((l) => l.view),
      names,
    );
    assert.deepEqual([...style.views.keys()], names);
    assert.deepEqual([...style.shown.keys()], names);
  });
});

describe('a word written in a style graph', () => {
  // proves: style_graph_checked
  test('is quoted in a message as it was written, even with a dollar sign in it', () => {
    const block = styleBlock(
      "(n1:Nudge {word: 'direction', direction: 'U$&P'}),",
      "(n2:Nudge {word: 'direction', direction: '$`'}),",
      "(n3:Nudge {word: 'direction', direction: '$$'})",
    );
    assert.deepEqual(messages(styleIn(TRIP, block).problems), [
      'U$&P is not a direction the locked style lays out in',
      '$` is not a direction the locked style lays out in',
      '$$ is not a direction the locked style lays out in',
    ]);
  });
});
