// Adding a thing (editor spec §5, add_thing). It asks for the thing's text first and suggests its name from it. The
// name is in the style of the graph's names and never one of them (name_from_text, suggested_name_unique). The thing is
// then written as text, after the block's last item, and nothing else in the block changes. A name of the user's own is
// held to the same rules.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import gs from '@thoughtknot/graph-spec';
import { addThing, suggestName } from '../src/add-thing.ts';
import { readNote } from '../src/drawing.ts';
import { nameFromText } from '../src/name-suggestions.ts';

const BLOCK = `// graph: reader
(question:Question {title: 'Which device?'}),
(large_reader:Option {name: 'Large reader'}),
(large_reader)-[:ANSWERS]->(question)`;
const reading = readNote([BLOCK]);
const added = (r) => {
  assert.ok(!('refused' in r), 'refused: ' + (r.refused ?? ''));
  return r;
};

describe('the name suggested for a text', () => {
  test('follows the style of the graph’s names, and is the one nameFromText gives', () => {
    assert.equal(suggestName(reading, 'reader', 'Small reader', 'Option'), 'small_reader');
    const names = new Map([
      ['question', 'Question'],
      ['large_reader', 'Option'],
    ]);
    assert.equal(
      suggestName(reading, 'reader', 'Small reader', 'Option'),
      nameFromText('Small reader', names, 'Option'),
    );
  });

  test('is never a name the graph has, whatever the case, but a number is added', () => {
    assert.equal(suggestName(reading, 'reader', 'Large reader', 'Option'), 'large_reader_2');
    assert.equal(suggestName(reading, 'reader', 'LARGE READER'), 'large_reader_2');
  });

  test('counts a name written in the block since the note was read, and one that is only mentioned', () => {
    const typed = `${BLOCK},\n(tablet:Option {name: 'Tablet'}),\n(tablet)-[:RIVALS]->(phone)`;
    assert.equal(suggestName(reading, 'reader', 'Tablet', 'Option', typed), 'tablet_2');
    assert.equal(suggestName(reading, 'reader', 'Phone', 'Option', typed), 'phone_2');
  });

  test('follows a prefix the graph’s names take from their kinds', () => {
    const styled = readNote([
      "// graph: g\n(option_large:Option {name: 'Large'}),\n(option_small:Option {name: 'Small'}),\n(person_ann:Person {name: 'Ann'}),\n(person_bo:Person {name: 'Bo'})",
    ]);
    assert.equal(suggestName(styled, 'g', 'Tablet', 'Option'), 'option_tablet');
  });

  test('is always a name the graph reads, even for a text with no letters in it, and never a reserved word', () => {
    assert.equal(suggestName(reading, 'reader', '日本語', 'Option'), 'option');
    assert.equal(suggestName(reading, 'reader', 'match'), 'match_2');
    assert.equal(suggestName(reading, 'nowhere', 'Small reader', 'Option'), 'small_reader');
  });
});

describe('adding a thing', () => {
  test('writes it after the block’s last item with its text, and changes nothing else in the block', () => {
    const r = added(addThing(reading, 'reader', BLOCK, { text: 'Small reader', kind: 'Option' }));
    assert.equal(r.name, 'small_reader');
    assert.equal(r.text, `${BLOCK},\n(small_reader:Option {name: 'Small reader'})`);
    const again = readNote([r.text]);
    assert.deepEqual(again.problems, []);
    assert.equal(again.graphs.get('reader').boxes.find((b) => b.key === 'small_reader').text, 'Small reader');
  });

  test('asks for the text first: with none, or only spaces, nothing is written', () => {
    for (const text of ['', '   ', '\n\t'])
      assert.deepEqual(addThing(reading, 'reader', BLOCK, { text, kind: 'Option' }), {
        refused: 'give the thing its text first: its name is suggested from it',
      });
  });

  test('a name of its own is kept, and held to the rules: one word, not taken, not a word the language keeps', () => {
    assert.equal(added(addThing(reading, 'reader', BLOCK, { text: 'Small reader', name: 'tiny' })).name, 'tiny');
    const refused = (name) => addThing(reading, 'reader', BLOCK, { text: 'Small reader', name }).refused;
    assert.match(refused('Large_Reader'), /already a name in graph reader/);
    assert.match(refused('two words'), /one word/);
    assert.match(refused('3d'), /one word/);
    assert.match(refused('match'), /language keeps/);
    assert.equal(added(addThing(reading, 'reader', BLOCK, { text: 'Small reader', name: '  ' })).name, 'small_reader');
  });

  test('the kind is optional, and one word', () => {
    const r = added(addThing(reading, 'reader', BLOCK, { text: 'Small reader' }));
    assert.equal(r.text.split('\n').at(-1), "(small_reader {name: 'Small reader'})");
    assert.match(addThing(reading, 'reader', BLOCK, { text: 'Small reader', kind: 'Two words' }).refused, /one word/);
  });

  test('the text goes under the key the kind’s things already use, and is quoted as GQL quotes', () => {
    const r = added(addThing(reading, 'reader', BLOCK, { text: "Which one's best?\nReally", kind: 'Question' }));
    assert.ok(r.text.split('\n').at(-1).startsWith(`(${r.name}:Question {title: 'Which one`), r.text);
    assert.deepEqual(readNote([r.text]).problems, []);
    const boxes = readNote([r.text]).graphs.get('reader').boxes;
    assert.equal(boxes.find((b) => b.key === r.name).text, "Which one's best? Really");
  });

  test('goes before a SET, after the last path, and a block with only a SET is refused', () => {
    const set = `${BLOCK}\nSET large_reader.price = 3`;
    const r = added(addThing(readNote([set]), 'reader', set, { text: 'Small reader', kind: 'Option' }));
    assert.ok(r.text.includes("(small_reader:Option {name: 'Small reader'})"));
    assert.ok(r.text.indexOf('small_reader') < r.text.indexOf('SET'), 'before the SET');
    assert.deepEqual(readNote([r.text]).problems, []);
    const only = '// graph: reader\nSET large_reader.price = 3';
    assert.match(addThing(reading, 'reader', only, { text: 'x' }).refused, /SET or MATCH/);
  });

  test('an empty block takes it as its first item', () => {
    const r = added(addThing(readNote(['// graph: g']), 'g', '// graph: g', { text: 'Home', kind: 'Place' }));
    assert.equal(r.text, "// graph: g\n(home:Place {name: 'Home'})");
  });

  test('a block of another graph, or a locked graph whose schema lacks the kind, is refused', () => {
    assert.match(addThing(reading, 'nowhere', BLOCK, { text: 'x' }).refused, /not in graph nowhere/);
    const locked = `${BLOCK},
(reader_schema:GraphMeta {graph: 'reader', schema: 'reader@1'}),
(kind_option:Meta:ElementType {name: 'Option', kind: 'node', origin: 'source'}),
(kind_question:Meta:ElementType {name: 'Question', kind: 'node', origin: 'source'}),
(link_answers:Meta:ElementType {name: 'ANSWERS', kind: 'edge', origin: 'source', reading: 'answers', reverse_name: 'is answered by'}),
(reader_schema)-[:DECLARES]->(kind_option),
(reader_schema)-[:DECLARES]->(kind_question),
(reader_schema)-[:DECLARES]->(link_answers)`;
    const r = readNote([locked]);
    assert.match(
      addThing(r, 'reader', locked, { text: 'Fast', kind: 'Tag' }).refused,
      /graph reader is locked and its schema does not declare Tag: declare it in the schema first/,
    );
    assert.ok(!('refused' in addThing(r, 'reader', locked, { text: 'Small reader', kind: 'Option' })));
  });

  test('a label the graph keeps for its schema is no kind: the thing would never be drawn', () => {
    for (const kind of gs.SCHEMA_LABELS) {
      const r = addThing(reading, 'reader', BLOCK, { text: 'Small reader', kind });
      assert.match(
        r.refused,
        new RegExp(`${kind} is a label the graph keeps for its schema: choose another kind`),
        kind,
      );
    }
    assert.ok(gs.SCHEMA_LABELS.includes('ElementType') && gs.SCHEMA_LABELS.includes('GraphMeta'));
  });

  test('Path is no kind for a new thing: a path is recorded with its steps, and one with none reads as broken', () => {
    const block = "// graph: g\n(a:X {name: 'A'})";
    assert.deepEqual(addThing(readNote([block]), 'g', block, { text: 'Fast', kind: 'Path' }), {
      refused:
        'Path is the kind a recorded path takes, and a path needs its steps: record a path, or choose another kind',
    });
    // Deferred, also a kind the graph reads in its own way, reads back clean, so it is still allowed
    const deferred = added(addThing(readNote([block]), 'g', block, { text: 'Later', kind: 'Deferred' }));
    assert.deepEqual(readNote([deferred.text]).problems, []);
  });
});

describe('an id typed in the block', () => {
  const typed = `${BLOCK},\n(z:Option {id: 'q', name: 'Zed'})`;

  test('is a name the graph has: the suggestion is never it', () => {
    assert.equal(suggestName(reading, 'reader', 'Q', undefined, typed), 'q_2');
    assert.equal(suggestName(reading, 'reader', 'Q', undefined, BLOCK), 'q', 'but free when it is not typed');
  });

  test('is taken for a name of the user’s own too, and the thing is refused', () => {
    assert.match(
      addThing(reading, 'reader', typed, { text: 'Q', name: 'q' }).refused,
      /already a name in graph reader/,
    );
    assert.equal(added(addThing(reading, 'reader', typed, { text: 'Q' })).name, 'q_2');
  });
});
