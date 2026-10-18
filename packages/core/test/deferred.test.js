// Deferred things (editor spec §5 and §8): marking a thing for later writes a Deferred saying what is needed and why it
// waits (park_for_later); a deferred thing is told apart in the drawing so it can be drawn dashed with a later mark
// (deferred_drawn); and the problems badge counts what is parked apart from problems, those past their revisit date as
// overdue (parked_not_broken).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import gs from '@thoughtknot/graph-spec';
import { gqlBlocks } from '../src/blocks.ts';
import { readNote } from '../src/drawing.ts';
import { layoutSource } from '../src/layout.ts';
import {
  DeferredNotDeclared,
  declareDeferred,
  declareDeferredBlock,
  parkForLater,
  parked,
  parkedCount,
} from '../src/deferred.ts';

const BLOCK = `// graph: reader
(q:Question {title: 'Which device?'}),
(small:Option {name: 'Small reader'}),
(tablet:Option {name: 'Tablet'}),
(small)-[:ANSWERS]->(q)`;

/** The drawing of BLOCK: parking is given it, to know which things are drawn only under a suggested name (§4). */
const DRAWN = readNote([BLOCK]);

const TODAY = '2026-10-07';
const PARK = { what: 'say what the small reader answers', why: 'waiting for the trial' };

// the graph library's §5 (types.js, schema_types.py): a locked graph must declare Deferred and DEFERS like any type
const LOCKED = `${BLOCK},
(reader_schema:GraphMeta {graph: 'reader', schema: 'reader@1'}),
(kind_option:Meta:ElementType {name: 'Option', kind: 'node', origin: 'source'}),
(kind_question:Meta:ElementType {name: 'Question', kind: 'node', origin: 'source'}),
(link_answers:Meta:ElementType {name: 'ANSWERS', kind: 'edge', origin: 'source', reading: 'answers', reverse_name: 'answered by'}),
(reader_schema)-[:DECLARES]->(kind_option),
(reader_schema)-[:DECLARES]->(kind_question),
(reader_schema)-[:DECLARES]->(link_answers)`;
const KIND_DEFERRED = `(kind_deferred:Meta:ElementType {name: 'Deferred', kind: 'node', origin: 'source'}),
(reader_schema)-[:DECLARES]->(kind_deferred)`;
const LINK_DEFERS = `(link_defers:Meta:ElementType {name: 'DEFERS', kind: 'edge', origin: 'source', reading: 'defers', reverse_name: 'deferred by'}),
(reader_schema)-[:DECLARES]->(link_defers)`;
const DECLARED = `${LOCKED},\n${KIND_DEFERRED},\n${LINK_DEFERS}`;

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
    const out = parkForLater(BLOCK, 'small', PARK, DRAWN);
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
    const out = parkForLater(BLOCK, 'small', PARK, DRAWN);
    assert.deepEqual(problemsOf(out), problemsOf(BLOCK));
    assert.ok(out.startsWith(BLOCK), 'the block is kept whole, with only a comma added after its last item');
  });

  test('writes the revisit date only when one is given, as a DATE', () => {
    // park_for_later
    assert.ok(!parkForLater(BLOCK, 'small', PARK, DRAWN).includes('revisit_by'));
    const out = parkForLater(BLOCK, 'small', { ...PARK, revisitBy: '2026-11-01' }, DRAWN);
    assert.ok(out.includes("revisit_by: DATE '2026-11-01'"));
    assert.deepEqual(problemsOf(out), problemsOf(BLOCK));
    assert.equal(parked(readNote([out]), 'reader', TODAY).get('small')?.revisitBy, '2026-11-01');
  });

  test('writes the rule it parks when one is given', () => {
    // park_for_later
    const out = parkForLater(BLOCK, 'small', { ...PARK, rule: 'every_option_answers' }, DRAWN);
    const g = readNote([out]).world.reader;
    assert.equal(g.p(g.labelled('Deferred')[0]).rule, 'every_option_answers');
  });

  test('quotes and escapes the words as locking does, so any words read back as written', () => {
    // park_for_later
    const what = "ask Ann's team about a \\ and 'quotes'";
    const out = parkForLater(BLOCK, 'small', { what, why: 'no reply yet' }, DRAWN);
    assert.equal(parked(readNote([out]), 'reader', TODAY).get('small')?.what, what);
    assert.deepEqual(problemsOf(out), problemsOf(BLOCK));
  });

  test('a line break in the words becomes a space, so a string never spans lines', () => {
    // park_for_later
    const park = { what: 'say what\nit answers  ', why: '  waiting\r\nfor the trial' };
    const out = parkForLater(BLOCK, 'small', park, DRAWN);
    const p = parked(readNote([out]), 'reader', TODAY).get('small');
    assert.deepEqual([p?.what, p?.why], ['say what it answers', 'waiting for the trial']);
  });

  test('a block that already ends with a comma gets no second one', () => {
    // park_for_later
    const withComma = BLOCK + ',';
    const out = parkForLater(withComma, 'small', PARK, readNote([withComma]));
    assert.ok(!/,\s*,/.test(out), 'never two commas in a row');
    assert.ok(problemsOf(withComma).length > 0, 'the comma at the end was itself a problem');
    assert.deepEqual(problemsOf(out), [], 'and parking makes it a separator');
    assert.equal(parked(readNote([out]), 'reader', TODAY).size, 1);
  });

  test('a block that ends with a comment line keeps it, and the comma goes after the last item', () => {
    // park_for_later
    const out = parkForLater(BLOCK + '\n// the end of the block', 'small', PARK, DRAWN);
    assert.ok(out.includes('(small)-[:ANSWERS]->(q),\n// the end of the block\n'));
    assert.deepEqual(problemsOf(out), problemsOf(BLOCK));
    assert.equal(parked(readNote([out]), 'reader', TODAY).size, 1);
  });

  test('a comment after the last item on its own line is kept, with the comma before it', () => {
    // park_for_later
    const commented = BLOCK + ' // not decided';
    const out = parkForLater(commented, 'small', PARK, readNote([commented]));
    assert.ok(out.includes('(small)-[:ANSWERS]->(q), // not decided\n'));
    assert.deepEqual(problemsOf(out), problemsOf(commented), 'nothing new beyond what the comment already was');
  });

  test('a // inside the last words is not a comment', () => {
    // park_for_later
    const block = "// graph: g\n(a:T {name: 'see http://x.example'})";
    const out = parkForLater(block, 'a', PARK, readNote([block]));
    assert.ok(out.includes("'see http://x.example'}),\n"));
    assert.deepEqual(problemsOf(out), []);
  });

  test('a block ending with blank lines is not left with a gap before the new items', () => {
    // park_for_later
    const out = parkForLater(BLOCK + '\n\n  \n', 'small', PARK, DRAWN);
    assert.ok(out.includes('(small)-[:ANSWERS]->(q),\n(later_small:Deferred'));
    assert.deepEqual(problemsOf(out), problemsOf(BLOCK));
  });

  test('takes a fresh id: later_<thing>, then _2, _3 when it is taken', () => {
    // park_for_later
    const once = parkForLater(BLOCK, 'small', PARK, DRAWN);
    assert.deepEqual(readNote([once]).world.reader.labelled('Deferred'), ['later_small']);
    const twice = parkForLater(once, 'small', { what: 'again', why: 'still waiting' }, readNote([once]));
    assert.deepEqual(readNote([twice]).world.reader.labelled('Deferred'), ['later_small', 'later_small_2']);
    const thrice = parkForLater(twice, 'tablet', { what: 'and this', why: 'later' }, readNote([twice]));
    assert.deepEqual(readNote([thrice]).world.reader.labelled('Deferred'), [
      'later_small',
      'later_small_2',
      'later_tablet',
    ]);
    // a thing already called later_small, written for another reason, is not reused
    const takenBlock = BLOCK.replace('(tablet:', '(later_small:');
    const taken = parkForLater(takenBlock, 'small', PARK, readNote([takenBlock]));
    assert.deepEqual(readNote([taken]).world.reader.labelled('Deferred'), ['later_small_2']);
    assert.deepEqual(problemsOf(thrice), problemsOf(BLOCK));
  });

  test('long words are split over lines, indented as the settings say', () => {
    // park_for_later
    const what = 'say what the small reader answers once the three week trial is over and written up';
    const park = { what, why: 'waiting for the trial', revisitBy: '2026-11-01' };
    const out = parkForLater(BLOCK, 'small', park, DRAWN, '  ');
    assert.ok(out.includes(`(later_small:Deferred {\n  what: '${what}',\n  why: 'waiting for the trial',\n`));
    assert.equal(parked(readNote([out]), 'reader', TODAY).get('small')?.what, what);
    assert.deepEqual(problemsOf(out), problemsOf(BLOCK));
  });

  test('refuses when it does not say what is needed, or why it waits', () => {
    // park_for_later
    assert.throws(() => parkForLater(BLOCK, 'small', { what: '', why: 'later' }, DRAWN), /what/);
    assert.throws(() => parkForLater(BLOCK, 'small', { what: 'x', why: '' }, DRAWN), /why/);
    assert.throws(() => parkForLater(BLOCK, 'small', { what: '   ', why: 'later' }, DRAWN), /what/);
    assert.throws(() => parkForLater(BLOCK, 'small', { what: 'x', why: '\n\t' }, DRAWN), /why/);
  });

  test('refuses a thing the block does not have, and a block with no graph', () => {
    // park_for_later
    assert.throws(() => parkForLater(BLOCK, 'nobody', PARK, DRAWN), /nobody/);
    assert.throws(() => parkForLater('(a:T)', 'a', PARK, readNote(['(a:T)'])), /graph/);
  });

  test('refuses a revisit date that is not a day, so nothing odd is written', () => {
    // park_for_later
    for (const bad of ['next week', '2026-13-01', '2026-02-30', "2026-11-01'}), (x"])
      assert.throws(() => parkForLater(BLOCK, 'small', { ...PARK, revisitBy: bad }, DRAWN), /revisit/);
  });

  test('a locked graph that does not declare Deferred and DEFERS is not parked in, and says to declare them', () => {
    // park_for_later
    assert.deepEqual(problemsOf(LOCKED), []);
    assert.throws(
      () => parkForLater(LOCKED, 'small', PARK, readNote([LOCKED])),
      /locked.*declare.*Deferred and DEFERS/,
    );
  });

  test('a locked graph that declares them is parked in with no undeclared-type warning', () => {
    // park_for_later
    assert.deepEqual(problemsOf(parkForLater(DECLARED, 'small', PARK, readNote([DECLARED]))), []);
  });

  test('a thing written in another block of its graph is parked, given the graph as the note reads it', () => {
    // park_for_later
    const first = "// graph: reader\n(small:Option {name: 'Small'}),\n(later_small:Deferred {what: 'a', why: 'b'})";
    const second = "// graph: reader\n(big:Option {name: 'Big'})";
    const note = readNote([first, second]);
    assert.throws(() => parkForLater(second, 'small', PARK, note), /no small/);
    const written = parkForLater(second, 'small', PARK, note, '    ', note.whole.reader);
    assert.match(written, /\(later_small_2:Deferred/, 'a fresh id, not one taken in another block');
    assert.deepEqual(problemsOf(first, written), []);
  });

  test('a block that ends with a SET or MATCH is not parked in: the Deferred needs a block of its own', () => {
    // park_for_later
    const set = `${BLOCK},\nSET small.name = 'Little'`;
    assert.throws(() => parkForLater(set, 'small', PARK, readNote([set])), /SET or MATCH/);
  });
});

// Roger, 11 Oct 2026: in a locked graph, parking is refused unless the schema declares Deferred and DEFERS, and the
// refusal offers the fix: the two declarations, written into the schema as Lock writes them (park_for_later)
describe('declaring Deferred and DEFERS in the schema (park_for_later)', () => {
  const SCHEMA = `// graph: reader\n${LOCKED.slice(BLOCK.length + 2)}`;
  const noteOf = (...blocks) =>
    ['# Reader', '', ...blocks.flatMap((b) => ['```gql', b, '```', '']), 'After.', ''].join('\n');
  const blocksOf = (note) => gqlBlocks(note).map((b) => b.text);
  const wholeOf = (...blocks) => readNote(blocks).whole.reader;
  const untypedIn = (...blocks) => gs.untyped(wholeOf(...blocks));
  // what is written, laid out as Lock lays out a schema: a long thing split over lines, a comment line before the part
  const TAIL = `// ── Deferred things, declared so one can be parked for later ──
(kind_deferred:Meta:ElementType {
    name: 'Deferred', kind: 'node', origin: 'source'}),
(link_defers:Meta:ElementType {
    name: 'DEFERS', kind: 'edge', origin: 'source',
    reading: 'defers', reverse_name: 'is deferred by'}),
(reader_schema)-[:DECLARES]->(kind_deferred),
(reader_schema)-[:DECLARES]->(link_defers)`;

  test('writes the two declarations as Lock writes them, last in the block that holds the graph meta', () => {
    // park_for_later
    assert.equal(declareDeferred(noteOf(LOCKED), 'reader'), noteOf(`${LOCKED},\n${TAIL}`));
  });

  test('after it, parking in the same block works, the note reads with no new problem and nothing is untyped', () => {
    // park_for_later
    const [block] = blocksOf(declareDeferred(noteOf(LOCKED), 'reader'));
    const parkedBlock = parkForLater(block, 'small', PARK, readNote([block]));
    assert.deepEqual(problemsOf(parkedBlock), problemsOf(LOCKED));
    assert.deepEqual(untypedIn(parkedBlock), [[], [], []]);
    // the check bites: the same Deferred parked without the declarations leaves both untyped
    const bare = `${LOCKED}${deferral('later_small', 'small', "what: 'x', why: 'y'")}`;
    assert.deepEqual(untypedIn(bare), [['Deferred'], ['DEFERS'], []]);
  });

  test('a schema written in a later block gets the declarations there, and the data block is left whole', () => {
    // park_for_later
    const note = noteOf(BLOCK, SCHEMA);
    const out = declareDeferred(note, 'reader');
    const [data, schema] = blocksOf(out);
    assert.equal(data, BLOCK);
    assert.equal(schema, `${SCHEMA},\n${TAIL}`);
    assert.equal(out, noteOf(BLOCK, `${SCHEMA},\n${TAIL}`), 'every other byte of the note is kept');
    // parking in the data block works once the graph is read with its new schema, and was refused before
    const before = readNote([BLOCK, SCHEMA]);
    assert.throws(
      () => parkForLater(BLOCK, 'small', PARK, before, '    ', before.whole.reader),
      /declare.*Deferred and DEFERS/,
    );
    const after = readNote([data, schema]);
    const parkedBlock = parkForLater(data, 'small', PARK, after, '    ', after.whole.reader);
    assert.deepEqual(problemsOf(parkedBlock, schema), problemsOf(BLOCK, SCHEMA));
    assert.deepEqual(untypedIn(parkedBlock, schema), [[], [], []]);
  });

  test('keeps the note’s line endings and every byte outside the schema block', () => {
    // park_for_later
    const crlf = noteOf(BLOCK, SCHEMA).replace(/\n/g, '\r\n');
    const out = declareDeferred(crlf, 'reader');
    assert.equal(out, declareDeferred(noteOf(BLOCK, SCHEMA), 'reader').replace(/\n/g, '\r\n'));
    assert.ok(!/[^\r]\n/.test(out), 'no bare line feed in a note written with CRLF');
    assert.ok(out.startsWith('# Reader\r\n\r\n```gql\r\n// graph: reader\r\n(q:Question'));
    assert.ok(out.endsWith('```\r\n\r\nAfter.\r\n'));
  });

  test('declares only what is missing: a schema with Deferred but not DEFERS gets DEFERS alone', () => {
    // park_for_later
    const some = `${LOCKED},\n${KIND_DEFERRED}`;
    const out = declareDeferred(noteOf(some), 'reader');
    const [block] = blocksOf(out);
    assert.equal(block.split("name: 'Deferred'").length, 2, 'Deferred is declared once');
    assert.ok(block.includes("name: 'DEFERS', kind: 'edge'"));
    assert.ok(block.endsWith('(reader_schema)-[:DECLARES]->(link_defers)'));
    assert.ok(!block.includes('kind_deferred_2'));
    assert.deepEqual(untypedIn(parkForLater(block, 'small', PARK, readNote([block]))), [[], [], []]);
    // and the other way round
    const edge = declareDeferred(noteOf(`${LOCKED},\n${LINK_DEFERS}`), 'reader');
    assert.ok(
      blocksOf(edge)[0].endsWith(
        "name: 'Deferred', kind: 'node', origin: 'source'}),\n(reader_schema)-[:DECLARES]->(kind_deferred)",
      ),
    );
  });

  test('a schema that declares both already is returned as it was', () => {
    // park_for_later
    assert.equal(declareDeferred(noteOf(DECLARED), 'reader'), noteOf(DECLARED));
    const split = noteOf(BLOCK, `${SCHEMA},\n${KIND_DEFERRED},\n${LINK_DEFERS}`);
    assert.equal(declareDeferred(split, 'reader'), split);
  });

  test('takes fresh ids, also against the graph’s other blocks', () => {
    // park_for_later
    const data = BLOCK.replace('(tablet:', '(link_defers:');
    const out = declareDeferred(noteOf(data, SCHEMA), 'reader');
    const [, schema] = blocksOf(out);
    assert.match(schema, /\(link_defers_2:Meta:ElementType/);
    assert.match(schema, /\(reader_schema\)-\[:DECLARES\]->\(link_defers_2\)/);
    assert.match(schema, /\(kind_deferred:Meta:ElementType/, 'an id not taken keeps its own name');
    assert.deepEqual(problemsOf(data, schema), problemsOf(data, SCHEMA));
    const note = readNote([data, schema]);
    const parkedBlock = parkForLater(data, 'small', PARK, note, '    ', note.whole.reader);
    assert.deepEqual(untypedIn(parkedBlock, schema), [[], [], []]);
  });

  test('puts a comma where GQL needs one, never two, and keeps a comment at the end of the block', () => {
    // park_for_later
    for (const end of [',', '\n// the end of the schema', '\n\n  \n', ' // not decided', ',\n// the end']) {
      const schema = LOCKED + end;
      const [block] = blocksOf(declareDeferred(noteOf(schema), 'reader'));
      assert.ok(!/,\s*,/.test(block), `never two commas in a row after ${JSON.stringify(end)}`);
      assert.ok(block.includes(end.trim().split('\n').at(-1) ?? ''), 'the comment is kept');
      assert.deepEqual(untypedIn(parkForLater(block, 'small', PARK, readNote([block]))), [[], [], []]);
      const was = problemsOf(schema);
      assert.ok(
        problemsOf(block).every((m) => was.includes(m)),
        'nothing new is wrong',
      );
    }
  });

  test('lays a long thing out indented as the settings say', () => {
    // park_for_later
    const [block] = blocksOf(declareDeferred(noteOf(LOCKED), 'reader', '\t'));
    assert.ok(block.includes("(kind_deferred:Meta:ElementType {\n\tname: 'Deferred'"));
    assert.ok(block.includes("origin: 'source',\n\treading: 'defers', reverse_name: 'is deferred by'}),"));
  });

  test('names the block and what to write, for a host that writes the block itself', () => {
    // park_for_later
    const blocks = [BLOCK, SCHEMA];
    assert.deepEqual(declareDeferredBlock(blocks, 'reader'), { block: 1, text: `${SCHEMA},\n${TAIL}` });
    assert.deepEqual(declareDeferredBlock([LOCKED], 'reader'), { block: 0, text: `${LOCKED},\n${TAIL}` });
    assert.deepEqual(declareDeferredBlock([DECLARED], 'reader'), { block: 0, text: DECLARED });
  });

  test('refuses a draft: there is no schema block to write into', () => {
    // park_for_later
    assert.throws(() => declareDeferred(noteOf(BLOCK), 'reader'), /no schema/);
  });

  test('refuses a graph typed by a shared schema, which is declared there', () => {
    // park_for_later
    const named = BLOCK.replace('// graph: reader', '// graph: reader · schema house');
    assert.throws(() => declareDeferred(noteOf(named), 'reader'), /shared schema/);
  });

  test('refuses a GraphMeta whose id is not a plain name, saying so and what to rename it to', () => {
    // park_for_later: a link can only name a node by a plain name, so DECLARES could not be written to it
    for (const [id, rename] of [
      ['Café', 'Caf_'],
      ['9x', '_9x'],
      ['m-1', 'm_1'],
    ]) {
      const schema = LOCKED.replaceAll('reader_schema', 'm').replace('(m:GraphMeta {', `(m:GraphMeta {id: '${id}', `);
      assert.deepEqual(problemsOf(schema), [], `${id} reads`);
      assert.throws(
        () => declareDeferred(noteOf(schema), 'reader'),
        (e) =>
          /GraphMeta/.test(e.message) &&
          e.message.includes(`'${id}'`) &&
          /not a plain name/.test(e.message) &&
          e.message.includes(`rename it to ${rename}`) &&
          !/has no GraphMeta/.test(e.message),
        id,
      );
    }
  });

  test('refuses a schema with no graph meta to declare from, a graph that is not in the note, and a block ending in SET', () => {
    // park_for_later
    const noMeta = LOCKED.replace(/\(reader_schema:GraphMeta[^\n]*\n/, '').replace(/\(reader_schema\)[^\n]*\n?/g, '');
    assert.throws(() => declareDeferred(noteOf(noMeta), 'reader'), /GraphMeta/);
    assert.throws(() => declareDeferred(noteOf(LOCKED), 'nobody'), /nobody/);
    assert.throws(() => declareDeferred(noteOf(`${LOCKED},\nSET small.name = 'Little'`), 'reader'), /SET or MATCH/);
  });
});

describe('the refusal that has a fix (park_for_later)', () => {
  test('a locked graph without the declarations is refused in a way a host can tell, in the same words', () => {
    // park_for_later
    assert.throws(
      () => parkForLater(LOCKED, 'small', PARK, readNote([LOCKED])),
      (e) =>
        e instanceof DeferredNotDeclared &&
        e.code === 'deferred-not-declared' &&
        e.graph === 'reader' &&
        e.lacking.join() === 'Deferred,DEFERS' &&
        e.message ===
          'graph reader is locked and its schema does not declare Deferred and DEFERS: declare them in the schema first',
    );
    const kindOnly = `${LOCKED},\n${KIND_DEFERRED}`;
    const some = parkForLater.bind(null, kindOnly, 'small', PARK, readNote([kindOnly]));
    assert.throws(some, (e) => e instanceof DeferredNotDeclared && e.lacking.join() === 'DEFERS');
  });

  test('every other refusal stays a plain error', () => {
    // park_for_later
    for (const refuse of [
      () => parkForLater(BLOCK, 'small', { what: '', why: 'x' }, DRAWN),
      () => parkForLater(BLOCK, 'nobody', PARK, DRAWN),
      () => parkForLater('(a:T)', 'a', PARK, readNote(['(a:T)'])),
    ])
      assert.throws(refuse, (e) => e instanceof Error && !(e instanceof DeferredNotDeclared) && !('code' in e));
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
      readNote([parkForLater(BLOCK, 'tablet', { ...PARK, revisitBy: '2026-10-01' }, DRAWN)]),
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
