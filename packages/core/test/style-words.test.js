// The words of a style graph (editor spec §2, style_words_checked). A key the style graph does not know is a problem
// with its fix. So is a frame that is not a well-formed list of numbers. The diagnostics' code actions apply the fix. A
// view's name, which is the user's own, is never checked against anything. Beside style.test.js, which holds the rest of
// the style graph's tests.
import { afterEach, test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { isPseudoWord } from '../src/pseudo-words.ts';
import { setLanguage, SOURCE_LANGUAGE } from '../src/words.ts';
import { gqlBlocks } from '../src/blocks.ts';
import { readNote } from '../src/drawing.ts';
import { diagnostics } from '../src/help.ts';
import { readStyle } from '../src/style.ts';
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

afterEach(() => setLanguage(SOURCE_LANGUAGE));

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
        [
          5,
          'proprty is not a key a Show uses',
          'remove proprty, or use one of property, kind, thing, type, view or inline',
          undefined,
        ],
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

describe('the diagram type, saved in the style graph', () => {
  // proves: type_remembered
  test('is a Diagram: its type, for the whole graph or for one view, and for a tree its relationship', () => {
    const { style, problems } = styleIn(
      TRIP,
      styleBlock("(d1:Diagram {type: 'tree', relationship: 'NEAR'}),", "(d2:Diagram {type: 'table', view: 'all'})"),
    );
    assert.deepEqual(problems, []);
    assert.deepEqual(
      style.diagrams.map(({ at: _at, ...d }) => d),
      [
        { type: 'tree', relationship: 'NEAR' },
        { type: 'table', view: 'all' },
      ],
    );
  });

  // proves: type_remembered
  test('a type not in the set, a relationship not in the graph or given to another type, is a problem, left out', () => {
    const { style, problems } = styleIn(
      TRIP,
      styleBlock(
        "(d1:Diagram {type: 'tre'}),",
        "(d2:Diagram {type: 'flow', relationship: 'NEAR'}),",
        "(d3:Diagram {type: 'tree', relationship: 'NEER'}),",
        "(d4:Diagram {view: 'v'})",
      ),
    );
    assert.deepEqual(
      problems.map((p) => [p.line, p.message, p.fix]),
      [
        [2, 'tre is not a diagram type', 'change tre to tree'],
        [3, 'a relationship is chosen only for a tree', "remove relationship, or make it type: 'tree'"],
        [4, 'NEER is not a relationship type in graph trip', 'change NEER to NEAR'],
        [
          5,
          'a Diagram names its type',
          "add type: 'network', 'tree', 'flow', 'radial', 'lanes', 'timeline' or 'table'",
        ],
      ],
    );
    assert.deepEqual(style.diagrams, []);
  });

  // proves: type_remembered
  test('two types for one place: the later is a problem and left out; a view’s and the whole graph’s are two places', () => {
    const { style, problems } = styleIn(
      TRIP,
      styleBlock(
        "(d1:Diagram {type: 'flow'}),",
        "(d2:Diagram {type: 'radial', view: 'v'}),",
        "(d3:Diagram {type: 'tree'}),",
        "(d4:Diagram {type: 'flow'})",
      ),
    );
    assert.deepEqual(messages(problems), ['the diagram type of the whole graph is set to both flow (line 2) and tree']);
    assert.deepEqual(
      style.diagrams.map((d) => [d.type, d.view]),
      [
        ['flow', undefined],
        ['radial', 'v'],
        ['flow', undefined],
      ],
    );
  });

  // proves: type_remembered
  test('is written into the style block when chosen, changed in place for the same place, never into the data', () => {
    const note = `\`\`\`gql\n${TRIP}\n\`\`\`\n`;
    const first = styleEdit(note, 'trip', { diagram: { type: 'tree', relationship: 'NEAR' } });
    assert.match(first.note, /\(diagram_1:Diagram \{type: 'tree', relationship: 'NEAR'\}\)/);
    const again = styleEdit(first.note, 'trip', { diagram: { type: 'flow' } });
    assert.match(again.note, /\(diagram_1:Diagram \{type: 'flow'\}\)/);
    assert.equal(again.note.match(/:Diagram /g).length, 1, 'changed in place, never written twice');
    const view = styleEdit(again.note, 'trip', { diagram: { type: 'table', view: 'v' } });
    assert.match(view.note, /\(diagram_2:Diagram \{type: 'table', view: 'v'\}\)/);
    const texts = gqlBlocks(view.note).map((b) => b.text);
    assert.equal(texts[0], TRIP, 'the data untouched');
    assert.deepEqual(
      readStyle(texts, 'trip', readNote(texts)).style.diagrams.map((d) => [d.type, d.view]),
      [
        ['flow', undefined],
        ['table', 'v'],
      ],
    );
    assert.deepEqual(styleEdit(note, 'trip', { diagram: { type: 'pie' } }), {
      refused: 'type must be network, tree, flow, radial, lanes, timeline or table',
    });
    assert.deepEqual(styleEdit(note, 'trip', { diagram: { type: 'flow', relationship: 'NEAR' } }), {
      refused: 'a relationship is chosen only for a tree',
    });
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

describe('what a key or a frame at fault says, in the person’s language', () => {
  // proves: words_catalogue
  test('the problem and its fix are said in it, for an unknown key and for each frame at fault', () => {
    setLanguage('en-XA');
    const block = styleBlock(
      "(l1:Look {view: 'v', kind: 'Place', colur: 'green'}),",
      "(a1:Arrows {view: 'v', zzz: 'x'}),",
      "(w1:Shown {view: 'v', frame: '1,2,3,4,'}),",
      "(w2:Shown {view: 'w', frame: '1,2,3,'}),",
      "(w3:Shown {view: 'x', frame: 'a,b'})",
    );
    const { problems } = styleIn(TRIP, block);
    assert.ok(problems.length >= 5, 'each is a problem');
    for (const p of problems) assert.ok(isPseudoWord(p.message) && isPseudoWord(p.fix), `${p.message} / ${p.fix}`);
  });
});
