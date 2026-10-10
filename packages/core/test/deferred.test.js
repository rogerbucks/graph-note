// Deferred things (editor spec §5 and §8): marking a thing for later writes a Deferred saying what is needed and why it
// waits (park_for_later); a deferred thing is told apart in the drawing so it can be drawn dashed with a later mark
// (deferred_drawn); and the problems badge counts what is parked apart from problems, those past their revisit date as
// overdue (parked_not_broken).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readNote } from '../src/drawing.ts';
import { layoutSource } from '../src/layout.ts';
import { parkForLater, parked, parkedCount } from '../src/deferred.ts';

const BLOCK = `// graph: reader
(q:Question {title: 'Which device?'}),
(small:Option {name: 'Small reader'}),
(tablet:Option {name: 'Tablet'}),
(small)-[:ANSWERS]->(q)`;

const TODAY = '2026-10-07';
const PARK = { what: 'say what the small reader answers', why: 'waiting for the trial' };

/** The messages of the problems a block reads with: a hint only offers a fix, and is no problem (note-reading.ts). */
const problemsOf = (...blocks) =>
  readNote(blocks)
    .problems.filter((p) => p.severity !== 'hint')
    .map((p) => p.message);

/** A Deferred written by hand: its id, its properties as written, and the thing it defers. */
const deferral = (id, thing, props) => `,\n(${id}:Deferred {${props}}),\n(${id})-[:DEFERS]->(${thing})`;

describe('parking a thing for later (park_for_later)', () => {
  test('writes a Deferred that says what is needed and why it waits, linked to the thing', () => {
    // park_for_later
    const out = parkForLater(BLOCK, 'small', PARK);
    const g = readNote([out]).world.reader;
    const [d] = g.labelled('Deferred');
    assert.equal(g.p(d).what, PARK.what);
    assert.equal(g.p(d).why, PARK.why);
    assert.deepEqual(
      g.out(d, 'DEFERS').map((e) => e[2]),
      ['small'],
    );
  });

  test('reads with no new problem, and leaves everything already written as it was', () => {
    // park_for_later
    const out = parkForLater(BLOCK, 'small', PARK);
    assert.deepEqual(problemsOf(out), problemsOf(BLOCK));
    assert.ok(out.startsWith(BLOCK), 'the block is kept whole, with only a comma added after its last item');
  });

  test('writes the revisit date only when one is given, as a DATE', () => {
    // park_for_later
    assert.ok(!parkForLater(BLOCK, 'small', PARK).includes('revisit_by'));
    const out = parkForLater(BLOCK, 'small', { ...PARK, revisitBy: '2026-11-01' });
    assert.ok(out.includes("revisit_by: DATE '2026-11-01'"));
    assert.deepEqual(problemsOf(out), problemsOf(BLOCK));
    assert.equal(parked(readNote([out]), 'reader', TODAY).get('small')?.revisitBy, '2026-11-01');
  });

  test('writes the rule it parks when one is given', () => {
    // park_for_later
    const out = parkForLater(BLOCK, 'small', { ...PARK, rule: 'every_option_answers' });
    const g = readNote([out]).world.reader;
    assert.equal(g.p(g.labelled('Deferred')[0]).rule, 'every_option_answers');
  });

  test('quotes and escapes the words as locking does, so any words read back as written', () => {
    // park_for_later
    const what = "ask Ann's team about a \\ and 'quotes'";
    const out = parkForLater(BLOCK, 'small', { what, why: 'no reply yet' });
    assert.equal(parked(readNote([out]), 'reader', TODAY).get('small')?.what, what);
    assert.deepEqual(problemsOf(out), problemsOf(BLOCK));
  });

  test('a line break in the words becomes a space, so a string never spans lines', () => {
    // park_for_later
    const out = parkForLater(BLOCK, 'small', { what: 'say what\nit answers  ', why: '  waiting\r\nfor the trial' });
    const p = parked(readNote([out]), 'reader', TODAY).get('small');
    assert.deepEqual([p?.what, p?.why], ['say what it answers', 'waiting for the trial']);
  });

  test('a block that already ends with a comma gets no second one', () => {
    // park_for_later
    const withComma = BLOCK + ',';
    const out = parkForLater(withComma, 'small', PARK);
    assert.ok(!/,\s*,/.test(out), 'never two commas in a row');
    assert.ok(problemsOf(withComma).length > 0, 'the comma at the end was itself a problem');
    assert.deepEqual(problemsOf(out), [], 'and parking makes it a separator');
    assert.equal(parked(readNote([out]), 'reader', TODAY).size, 1);
  });

  test('a block that ends with a comment line keeps it, and the comma goes after the last item', () => {
    // park_for_later
    const out = parkForLater(BLOCK + '\n// the end of the block', 'small', PARK);
    assert.ok(out.includes('(small)-[:ANSWERS]->(q),\n// the end of the block\n'));
    assert.deepEqual(problemsOf(out), problemsOf(BLOCK));
    assert.equal(parked(readNote([out]), 'reader', TODAY).size, 1);
  });

  test('a comment after the last item on its own line is kept, with the comma before it', () => {
    // park_for_later
    const commented = BLOCK + ' // not decided';
    const out = parkForLater(commented, 'small', PARK);
    assert.ok(out.includes('(small)-[:ANSWERS]->(q), // not decided\n'));
    assert.deepEqual(problemsOf(out), problemsOf(commented), 'nothing new beyond what the comment already was');
  });

  test('a // inside the last words is not a comment', () => {
    // park_for_later
    const block = "// graph: g\n(a:T {name: 'see http://x.example'})";
    const out = parkForLater(block, 'a', PARK);
    assert.ok(out.includes("'see http://x.example'}),\n"));
    assert.deepEqual(problemsOf(out), []);
  });

  test('a block ending with blank lines is not left with a gap before the new items', () => {
    // park_for_later
    const out = parkForLater(BLOCK + '\n\n  \n', 'small', PARK);
    assert.ok(out.includes('(small)-[:ANSWERS]->(q),\n(later_small:Deferred'));
    assert.deepEqual(problemsOf(out), problemsOf(BLOCK));
  });

  test('takes a fresh id: later_<thing>, then _2, _3 when it is taken', () => {
    // park_for_later
    const once = parkForLater(BLOCK, 'small', PARK);
    assert.deepEqual(readNote([once]).world.reader.labelled('Deferred'), ['later_small']);
    const twice = parkForLater(once, 'small', { what: 'again', why: 'still waiting' });
    assert.deepEqual(readNote([twice]).world.reader.labelled('Deferred'), ['later_small', 'later_small_2']);
    const thrice = parkForLater(twice, 'tablet', { what: 'and this', why: 'later' });
    assert.deepEqual(readNote([thrice]).world.reader.labelled('Deferred'), [
      'later_small',
      'later_small_2',
      'later_tablet',
    ]);
    // a thing already called later_small, written for another reason, is not reused
    const taken = parkForLater(BLOCK.replace('(tablet:', '(later_small:'), 'small', PARK);
    assert.deepEqual(readNote([taken]).world.reader.labelled('Deferred'), ['later_small_2']);
    assert.deepEqual(problemsOf(thrice), problemsOf(BLOCK));
  });

  test('long words are split over lines, indented as the settings say', () => {
    // park_for_later
    const what = 'say what the small reader answers once the three week trial is over and written up';
    const out = parkForLater(BLOCK, 'small', { what, why: 'waiting for the trial', revisitBy: '2026-11-01' }, '  ');
    assert.ok(out.includes(`(later_small:Deferred {\n  what: '${what}',\n  why: 'waiting for the trial',\n`));
    assert.equal(parked(readNote([out]), 'reader', TODAY).get('small')?.what, what);
    assert.deepEqual(problemsOf(out), problemsOf(BLOCK));
  });

  test('refuses when it does not say what is needed, or why it waits', () => {
    // park_for_later
    assert.throws(() => parkForLater(BLOCK, 'small', { what: '', why: 'later' }), /what/);
    assert.throws(() => parkForLater(BLOCK, 'small', { what: 'x', why: '' }), /why/);
    assert.throws(() => parkForLater(BLOCK, 'small', { what: '   ', why: 'later' }), /what/);
    assert.throws(() => parkForLater(BLOCK, 'small', { what: 'x', why: '\n\t' }), /why/);
  });

  test('refuses a thing the block does not have, and a block with no graph', () => {
    // park_for_later
    assert.throws(() => parkForLater(BLOCK, 'nobody', PARK), /nobody/);
    assert.throws(() => parkForLater('(a:T)', 'a', PARK), /graph/);
  });

  test('refuses a revisit date that is not a day, so nothing odd is written', () => {
    // park_for_later
    for (const bad of ['next week', '2026-13-01', '2026-02-30', "2026-11-01'}), (x"])
      assert.throws(() => parkForLater(BLOCK, 'small', { ...PARK, revisitBy: bad }), /revisit/);
  });

  test('in a locked graph, Deferred and DEFERS are built in: parking adds no undeclared-type warning', () => {
    // park_for_later
    const locked = `${BLOCK},
(reader_schema:GraphMeta {graph: 'reader', schema: 'reader@1'}),
(kind_option:Meta:ElementType {name: 'Option', kind: 'node', origin: 'source'}),
(kind_question:Meta:ElementType {name: 'Question', kind: 'node', origin: 'source'}),
(link_answers:Meta:ElementType {name: 'ANSWERS', kind: 'edge', origin: 'source', reading: 'answers', reverse_name: 'answered by'}),
(reader_schema)-[:DECLARES]->(kind_option),
(reader_schema)-[:DECLARES]->(kind_question),
(reader_schema)-[:DECLARES]->(link_answers)`;
    assert.deepEqual(problemsOf(locked), []);
    assert.deepEqual(problemsOf(parkForLater(locked, 'small', PARK)), []);
  });
});

describe('what is parked, and what is overdue (parked_not_broken)', () => {
  const read = (...items) => readNote([BLOCK + items.join('')]);

  test('each thing a Deferred defers is parked, with what, why, the date and which Deferred', () => {
    // parked_not_broken
    const map = parked(
      read(deferral('later', 'small', "what: 'x', why: 'y', revisit_by: DATE '2026-12-01'")),
      'reader',
      TODAY,
    );
    assert.deepEqual([...map.keys()], ['small']);
    assert.deepEqual(map.get('small'), {
      what: 'x',
      why: 'y',
      revisitBy: '2026-12-01',
      overdue: false,
      by: ['later'],
    });
  });

  test('a Deferred past its revisit date is overdue; one not yet due is not; today itself is not yet', () => {
    // parked_not_broken
    const map = parked(
      read(
        deferral('past', 'small', "what: 'x', why: 'y', revisit_by: DATE '2026-10-01'"),
        deferral('soon', 'tablet', "what: 'x', why: 'y', revisit_by: DATE '2026-10-07'"),
      ),
      'reader',
      TODAY,
    );
    assert.deepEqual([map.get('small')?.overdue, map.get('tablet')?.overdue], [true, false]);
    const later = parked(
      read(deferral('past', 'small', "what: 'x', why: 'y', revisit_by: DATE '2026-10-01'")),
      'reader',
      '2026-09-30',
    );
    assert.equal(later.get('small')?.overdue, false);
  });

  test('a Deferred with no revisit date is parked and never overdue', () => {
    // parked_not_broken
    const p = parked(read(deferral('later', 'small', "what: 'x', why: 'y'")), 'reader', '2099-01-01').get('small');
    assert.deepEqual([p?.overdue, p?.revisitBy], [false, null]);
  });

  test('two Deferreds on one thing: overdue only when both are', () => {
    // parked_not_broken
    const past = (id) => deferral(id, 'small', "what: 'x', why: 'y', revisit_by: DATE '2026-10-01'");
    const future = deferral('open', 'small', "what: 'x2', why: 'y2', revisit_by: DATE '2026-12-01'");
    const bare = deferral('bare', 'small', "what: 'x3', why: 'y3'");
    const both = parked(read(past('a'), past('b')), 'reader', TODAY).get('small');
    assert.deepEqual([both?.overdue, both?.by], [true, ['a', 'b']]);
    assert.equal(parked(read(past('a'), future), 'reader', TODAY).get('small')?.overdue, false);
    assert.equal(parked(read(past('a'), bare), 'reader', TODAY).get('small')?.overdue, false);
    // the date it falls overdue is the later one
    assert.equal(parked(read(past('a'), future), 'reader', TODAY).get('small')?.revisitBy, '2026-12-01');
  });

  test('a Deferred missing its why still parks the thing, and nothing crashes', () => {
    // parked_not_broken
    const reading = read(deferral('half', 'small', "what: 'x'"), deferral('none', 'tablet', ''));
    const map = parked(reading, 'reader', TODAY);
    assert.deepEqual(
      [map.get('small')?.what, map.get('small')?.why, map.get('tablet')?.what, map.get('tablet')?.why],
      ['x', '', '', ''],
    );
    assert.deepEqual(parkedCount(map), { parked: 2, overdue: 0 });
  });

  test('a graph that is not there, or has nothing parked, has an empty map', () => {
    // parked_not_broken
    assert.equal(parked(read(), 'reader', TODAY).size, 0);
    assert.equal(parked(read(), 'nothing', TODAY).size, 0);
  });

  test('the count says how many are parked and how many of those are overdue', () => {
    // parked_not_broken
    const map = parked(
      read(
        deferral('a', 'small', "what: 'x', why: 'y', revisit_by: DATE '2026-10-01'"),
        deferral('b', 'tablet', "what: 'x', why: 'y', revisit_by: DATE '2026-12-01'"),
        deferral('c', 'q', "what: 'x', why: 'y', revisit_by: DATE '2026-10-01'"),
        deferral('d', 'q', "what: 'x', why: 'y'"),
      ),
      'reader',
      TODAY,
    );
    assert.deepEqual(parkedCount(map), { parked: 3, overdue: 1 });
  });

  test('parked things are counted apart: they add no problem', () => {
    // parked_not_broken
    const withDeferrals = read(deferral('a', 'small', "what: 'x', why: 'y', revisit_by: DATE '2026-10-01'"));
    assert.deepEqual(problemsOf(BLOCK + deferral('a', 'small', "what: 'x', why: 'y'")), problemsOf(BLOCK));
    assert.deepEqual(
      withDeferrals.problems.filter((p) => p.severity !== 'hint'),
      [],
    );
  });

  test('a thing parked by the pane reads back as parked', () => {
    // parked_not_broken
    const map = parked(
      readNote([parkForLater(BLOCK, 'tablet', { ...PARK, revisitBy: '2026-10-01' })]),
      'reader',
      TODAY,
    );
    assert.deepEqual([...map.keys()], ['tablet']);
    assert.equal(map.get('tablet')?.overdue, true);
  });
});

describe('telling a deferred box in the drawing (deferred_drawn)', () => {
  const NOTE = BLOCK + deferral('later', 'small', "what: 'x', why: 'y', revisit_by: DATE '2026-10-01'");
  const drawingOf = (note, today = TODAY) => readNote([note], 0, [], undefined, today).graphs.get('reader');

  test('a box a Deferred defers carries what is needed and whether it is overdue', () => {
    // deferred_drawn
    const box = drawingOf(NOTE).boxes.find((b) => b.key === 'small');
    assert.deepEqual(box.deferred, { overdue: true, what: 'x' });
    const notYet = drawingOf(NOTE, '2026-09-01').boxes.find((b) => b.key === 'small');
    assert.deepEqual(notYet.deferred, { overdue: false, what: 'x' });
  });

  test('no other box carries it', () => {
    // deferred_drawn
    for (const box of drawingOf(NOTE).boxes.filter((b) => b.key !== 'small'))
      assert.ok(!('deferred' in box), `${box.key} is not deferred`);
    for (const box of drawingOf(BLOCK).boxes) assert.ok(!('deferred' in box), `${box.key} is not deferred`);
  });

  test('the layout source does not change: the plugin draws the dash and the mark on the drawing afterwards', () => {
    // deferred_drawn
    const d = drawingOf(NOTE);
    const plain = { ...d, boxes: d.boxes.map(({ deferred: _gone, ...box }) => box) };
    assert.ok(
      d.boxes.some((b) => b.deferred),
      'the drawing has a deferred box',
    );
    for (const rankdir of ['LR', 'TB'])
      assert.ok(layoutSource(d, rankdir).source === layoutSource(plain, rankdir).source, rankdir);
  });
});
