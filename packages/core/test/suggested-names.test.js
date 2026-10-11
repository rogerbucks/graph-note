// A thing drawn only under a suggested name is never written by that name unasked (editor spec §4, unnamed_drawn_suggested:
// "nothing is written until its fix is accepted"). Every edit that would write the name into the text — a recorded path, a
// property made a list, a value added to one, a thing parked for later, a nudge, a look, a view saved as shown — refuses
// with "accept its name first", and writes nothing; once the name is written, each edit goes through as for any thing.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readNote } from '../src/drawing.ts';
import { acceptNameFirst, suggestedAmong } from '../src/suggested-names.ts';
import { pathBlock } from '../src/paths.ts';
import { addToList, makeList } from '../src/linked-list.ts';
import { parkForLater } from '../src/deferred.ts';
import { styleEdit } from '../src/style-edit.ts';

const BLOCK = `// graph: reader
(q:Question {title: 'Which device?'}),
(large:Option {name: 'Large reader'}),
(:Option {name: 'Small reader', tags: 'light'}),
(large)-[:ANSWERS]->(q)`;
/** The same block once the fix is accepted: the name written after the (. */
const NAMED = BLOCK.replace('(:Option', '(small_reader:Option');
const reading = readNote([BLOCK]);
const named = readNote([NAMED]);
const TAG = { rel: 'HAS_TAG', kind: 'Tag' };
const refusedFirst = (why) => assert.match(why, /^accept its name first: .*small_reader/);

describe('the things drawn under a suggested name', () => {
  test('are found among the keys asked about, in the order asked, and a written or unknown key is not one', () => {
    assert.deepEqual(suggestedAmong(reading, 'reader', ['large', 'small_reader', 'nowhere']), ['small_reader']);
    assert.deepEqual(suggestedAmong(named, 'reader', ['large', 'small_reader']), [], 'written, so no longer suggested');
    assert.deepEqual(suggestedAmong(reading, 'other', ['small_reader']), [], 'a graph that is not there');
  });

  test('the refusal says to accept the name first, and names the text and the name that is only suggested', () => {
    assert.equal(acceptNameFirst(reading, 'reader', ['large', 'q']), null);
    assert.equal(
      acceptNameFirst(reading, 'reader', ['small_reader']),
      'accept its name first: Small reader is only drawn under the suggested name small_reader, which is not written yet',
    );
  });

  test('several are each named, and the refusal speaks of their names', () => {
    const two = readNote(["// graph: g\n(:Option {name: 'One'}),\n(:Option {name: 'Two'})"]);
    assert.equal(
      acceptNameFirst(two, 'g', ['one', 'two']),
      'accept their names first: One (one) and Two (two) are only drawn under suggested names, which are not written yet',
    );
  });
});

describe('a path recorded through a thing drawn under a suggested name', () => {
  test('is refused, and nothing is written', () => {
    const r = pathBlock(reading, 'reader', BLOCK, 'Walk', ['large', 'small_reader']);
    assert.ok('refused' in r, 'refused');
    refusedFirst(r.refused);
  });

  test('is written once the name is', () => {
    const r = pathBlock(named, 'reader', NAMED, 'Walk', ['large', 'small_reader']);
    assert.ok(!('refused' in r), 'refused: ' + (r.refused ?? ''));
    assert.match(r.text, /\(walk\)-\[:STEP \{seq: 2\}\]->\(small_reader\)/);
  });

  test('a path through only written things is unaffected', () => {
    const r = pathBlock(reading, 'reader', BLOCK, 'Walk', ['large', 'q']);
    assert.ok(!('refused' in r));
  });
});

describe('a list made of or added to a thing drawn under a suggested name', () => {
  test('making a property a list is refused, and nothing is written', () => {
    const r = makeList(BLOCK, reading, 'reader', 'small_reader', 'tags', TAG);
    assert.equal(r.ok, false);
    refusedFirst(r.reason);
  });

  test('adding a value to it is refused, and nothing is written', () => {
    const r = addToList(BLOCK, reading, 'reader', 'small_reader', TAG, 'cheap');
    assert.equal(r.ok, false);
    refusedFirst(r.reason);
  });

  test('a value that reuses it is refused: the link would name it', () => {
    const r = addToList(BLOCK, reading, 'reader', 'large', { rel: 'SEE_ALSO', kind: 'Option' }, 'Small reader');
    assert.equal(r.ok, false);
    refusedFirst(r.reason);
    const again = makeList(
      BLOCK.replace(
        "(large:Option {name: 'Large reader'})",
        "(large:Option {name: 'Large reader', also: 'Small reader'})",
      ),
      reading,
      'reader',
      'large',
      'also',
      { rel: 'SEE_ALSO', kind: 'Option' },
    );
    assert.equal(again.ok, false);
    refusedFirst(again.reason);
  });

  test('once the name is written, both go through', () => {
    assert.equal(makeList(NAMED, named, 'reader', 'small_reader', 'tags', TAG).ok, true);
    assert.equal(addToList(NAMED, named, 'reader', 'small_reader', TAG, 'cheap').ok, true);
  });
});

describe('a thing drawn under a suggested name parked for later', () => {
  const park = { what: 'a price', why: 'not quoted yet' };

  test('is refused, saying to accept its name first, and nothing is written', () => {
    assert.throws(
      () => parkForLater(BLOCK, 'small_reader', park, '    ', reading.whole.reader, reading),
      (e) => /^accept its name first: .*small_reader/.test(e.message),
    );
  });

  test('is parked once the name is written, and a written thing is parked as ever', () => {
    assert.match(
      parkForLater(NAMED, 'small_reader', park, '    ', named.whole.reader, named),
      /DEFERS\]->\(small_reader\)/,
    );
    assert.match(parkForLater(BLOCK, 'large', park, '    ', reading.whole.reader, reading), /DEFERS\]->\(large\)/);
  });
});

describe('a style written for a thing drawn under a suggested name', () => {
  const note = `# Reader\n\n\`\`\`gql\n${BLOCK}\n\`\`\`\n`;
  const look = { colour: 'red', means: 'a favourite' };
  const refused = (change) => {
    const r = styleEdit(note, 'reader', change, reading);
    assert.ok('refused' in r, 'refused');
    refusedFirst(r.refused);
  };

  test('a nudge naming it, as the thing or as the other, is refused', () => {
    refused({ nudge: { word: 'beside', thing: 'small_reader', other: 'large' } });
    refused({ nudge: { word: 'before', thing: 'large', other: 'small_reader' } });
    refused({ nudge: { word: 'group', thing: 'small_reader', group: 'devices' } });
  });

  test('a look for it, or for a link to it, is refused', () => {
    refused({ look: { view: 'near', thing: 'small_reader', ...look } });
    refused({ look: { path: 'tour', link: { from: 'large', type: 'SEE_ALSO', to: 'small_reader' }, ...look } });
  });

  test('a view saved as shown with it selected is refused', () => {
    refused({ shown: { view: 'near', zoom: 1, x: 0, y: 0, selected: 'small_reader' } });
  });

  test('what names only written things is written, with or without the reading', () => {
    const change = { nudge: { word: 'beside', thing: 'large', other: 'q' } };
    assert.ok('note' in styleEdit(note, 'reader', change, reading));
    assert.ok('note' in styleEdit(note, 'reader', change));
    assert.ok('note' in styleEdit(note, 'reader', { outside: { view: 'near', outside: 'hide' } }, reading));
    assert.ok('note' in styleEdit(note, 'reader', { shown: { view: 'near', zoom: 1, x: 0, y: 0 } }, reading));
  });

  test('once the name is written, the same nudge is', () => {
    const r = styleEdit(
      note.replace('(:Option', '(small_reader:Option'),
      'reader',
      { nudge: { word: 'beside', thing: 'small_reader', other: 'large' } },
      named,
    );
    assert.ok('note' in r);
  });
});
