// The inspector (editor spec §14, slice 1 since 7 Oct 2026). It shows every property of the selected thing or link,
// each edited, added or removed. That is done as text, in the block where the thing or link is written (§2, edits are
// text). Each value is checked against its type before it is written. The names already used on things of the same kind
// are offered first.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readNote } from '../src/drawing.ts';
import {
  parseValue,
  setProperty,
  renameProperty,
  propertyNames,
  propertiesOf,
  spanOf,
  linkInBlock,
} from '../src/inspector.ts';

const BLOCK = `// graph: reader
(q:Question {title: 'Which device?'}),
(large:Option {name: 'Large reader', price: 300, ordered: DATE '2026-10-01'}),
(small:Option {name: 'Small reader'}),
(notes:Source {title: 'Trial notes'}),
(large)-[:ANSWERS]->(q),
(large)-[:CITES {where: 'day 2'}]->(notes)`;

describe('values, checked against their type before they are written', () => {
  test('text, number, date, date and time, and true or false, each written as the profile writes it', () => {
    assert.deepEqual(parseValue('text', "it's"), { ok: true, gql: "'it\\'s'" });
    assert.deepEqual(parseValue('number', '12.5'), { ok: true, gql: '12.5' });
    assert.deepEqual(parseValue('date', '2026-10-07'), { ok: true, gql: "DATE '2026-10-07'" });
    assert.deepEqual(parseValue('datetime', '2026-10-07T21:30:00+10:00'), {
      ok: true,
      gql: "DATETIME '2026-10-07T21:30:00+10:00'",
    });
    assert.deepEqual(parseValue('boolean', 'true'), { ok: true, gql: 'TRUE' });
  });

  test('text with a line break or a tab in it is written with its escape, so the thing stays on its line and reads', () => {
    assert.deepEqual(parseValue('text', 'one\ntwo\tthree'), { ok: true, gql: "'one\\ntwo\\tthree'" });
    const r = setProperty(BLOCK, 'reader', { thing: 'small' }, 'note', parseValue('text', 'one\ntwo').gql);
    assert.equal(r.ok, true);
    const read = readNote([r.text]);
    assert.deepEqual(
      read.problems.filter((p) => p.severity === 'error'),
      [],
    );
    assert.equal(read.world.reader.p('small').note, 'one\ntwo');
  });

  test('a value that is not of its type is refused, saying what was expected', () => {
    assert.match(parseValue('number', 'twelve').error, /a number/);
    assert.match(parseValue('date', '2026-13-40').error, /YYYY-MM-DD/);
    assert.match(parseValue('datetime', '2026-10-07T21:30').error, /offset/);
    assert.match(parseValue('boolean', 'maybe').error, /true or false/);
  });

  test('a list cannot be written: the document profile holds no lists, and it says so', () => {
    assert.match(parseValue('list', 'a, b').error, /no lists/);
  });
});

describe('every property of a thing or a link', () => {
  test('a thing’s properties, each with its value and type; its id is not offered for editing', () => {
    assert.deepEqual(propertiesOf(readNote([BLOCK]), 'reader', { thing: 'large' }), [
      { key: 'name', value: 'Large reader', type: 'text' },
      { key: 'ordered', value: '2026-10-01', type: 'date' },
      { key: 'price', value: '300', type: 'number' },
    ]);
  });

  test('a link’s properties, by its place among the graph’s links', () => {
    assert.deepEqual(propertiesOf(readNote([BLOCK]), 'reader', { link: 1 }), [
      { key: 'where', value: 'day 2', type: 'text' },
    ]);
  });
});

describe('edits are text, in the block where the thing is written', () => {
  test('changing a value rewrites it in place, and nothing else', () => {
    const r = setProperty(BLOCK, 'reader', { thing: 'large' }, 'price', '320');
    assert.equal(r.text, BLOCK.replace('price: 300', 'price: 320'));
  });

  test('an id with a dot, a plus or a bracket in it is matched as written: never another thing, never a broken search', () => {
    const block = "// graph: tools\n(node_js:Tool {name: 'Node'}),\n(n:Tool {id: 'node.js', name: 'Node.js'})";
    const r = setProperty(block, 'tools', { thing: 'node.js' }, 'version', "'24'");
    assert.ok(!r.ok || !r.text.includes("(node_js:Tool {name: 'Node', version: '24'})"), 'node_js is not node.js');
    for (const id of ['c++', 'x(1', 'a[b', 'what?', '$1'])
      assert.doesNotThrow(() => spanOf(`// graph: g\n(c:T {id: '${id}'})`, { thing: id }), id);
  });

  test('adding a property appends it to the thing’s map, or gives the thing a map', () => {
    assert.equal(
      setProperty(BLOCK, 'reader', { thing: 'large' }, 'colour', "'grey'").text,
      BLOCK.replace("ordered: DATE '2026-10-01'}", "ordered: DATE '2026-10-01', colour: 'grey'}"),
    );
    assert.equal(
      setProperty(
        BLOCK.replace("(small:Option {name: 'Small reader'})", '(small:Option)'),
        'reader',
        { thing: 'small' },
        'price',
        '99',
      ).text,
      BLOCK.replace("(small:Option {name: 'Small reader'})", '(small:Option {price: 99})'),
    );
  });

  test('removing a property takes it out of the map, and an emptied map with it', () => {
    assert.equal(
      setProperty(BLOCK, 'reader', { thing: 'large' }, 'price', null).text,
      BLOCK.replace('price: 300, ', ''),
    );
    assert.equal(
      setProperty(BLOCK, 'reader', { thing: 'small' }, 'name', null).text,
      BLOCK.replace("(small:Option {name: 'Small reader'})", '(small:Option)'),
    );
  });

  test('a link’s properties are edited in its own brackets', () => {
    assert.equal(
      setProperty(BLOCK, 'reader', { link: 1 }, 'where', "'day 3'").text,
      BLOCK.replace("where: 'day 2'", "where: 'day 3'"),
    );
    assert.equal(
      setProperty(BLOCK, 'reader', { link: 0 }, 'weight', '2').text,
      BLOCK.replace('(large)-[:ANSWERS]->(q)', '(large)-[:ANSWERS {weight: 2}]->(q)'),
    );
  });

  test('a string holding braces, commas or quotes is not mistaken for the map’s own', () => {
    const tricky = "// graph: g\n(a:T {note: 'x, {y}: \\'z\\'', n: 1})";
    assert.equal(setProperty(tricky, 'g', { thing: 'a' }, 'n', '2').text, tricky.replace('n: 1', 'n: 2'));
  });

  test('a thing not written in this block cannot be edited here, and it says where to', () => {
    const r = setProperty('// graph: reader\n(large)-[:ANSWERS]->(q)', 'reader', { thing: 'large' }, 'price', '1');
    assert.equal(r.ok, false);
    assert.match(r.reason, /not written in this block/);
  });

  test('the id cannot be changed or removed here: it is the thing’s name', () => {
    assert.match(setProperty(BLOCK, 'reader', { thing: 'large' }, 'id', "'x'").reason, /name/);
  });

  test('what is written reads back as the graph intended', () => {
    const r = setProperty(BLOCK, 'reader', { thing: 'large' }, 'checked', 'TRUE');
    const back = readNote([r.text]);
    assert.deepEqual(back.problems, []);
    assert.equal(back.world.reader.p('large').checked, true);
  });
});

describe('helpful names', () => {
  test('the names already used on things of the same kind come first, then the graph’s other names', () => {
    assert.deepEqual(propertyNames(readNote([BLOCK]), 'reader', 'Option'), ['name', 'ordered', 'price', 'title']);
    assert.deepEqual(propertyNames(readNote([BLOCK]), 'reader', 'Source'), ['title', 'name', 'ordered', 'price']);
  });
});

describe('in a locked graph', () => {
  test('only the properties its schema declares for the kind are offered', () => {
    const schema = `// graph: reader
(k1:Meta:ElementType {name: 'Option', kind: 'node'}), (k2:Meta:ElementType {name: 'Source', kind: 'node'}),
(p1:Meta:ElementType {name: 'Option.name', kind: 'property'}), (p2:Meta:ElementType {name: 'Option.price', kind: 'property'}),
(p3:Meta:ElementType {name: 'Source.title', kind: 'property'})`;
    const r = readNote([BLOCK, schema]);
    assert.deepEqual(propertyNames(r, 'reader', 'Option'), ['name', 'price']);
    assert.deepEqual(propertyNames(r, 'reader', 'Source'), ['title']);
  });
});

// Selecting in the drawing moves the editor to the item (editor spec §4, select_moves_text; asked for 7 Oct 2026). It
// moves to the text of the pattern that writes a thing, or of a link's own brackets and arrow, in the block being
// edited.
describe('where an item is written in the block', () => {
  const span = (text, t) => {
    const s = spanOf(text, t);
    return s && text.slice(s.from, s.to);
  };

  test('a thing: the pattern that writes it, not a later mention of it', () => {
    assert.equal(
      span(BLOCK, { thing: 'large' }),
      "(large:Option {name: 'Large reader', price: 300, ordered: DATE '2026-10-01'})",
    );
    assert.equal(span(BLOCK, { thing: 'q' }), "(q:Question {title: 'Which device?'})");
  });

  test('a thing only mentioned in this block: its first mention', () => {
    assert.equal(span('// graph: reader\n(x:T),\n(large)-[:ANSWERS]->(q)', { thing: 'q' }), '(q)');
  });

  test('a thing not in this block at all: nowhere', () => {
    assert.equal(spanOf(BLOCK, { thing: 'nobody' }), null);
  });

  test('a link: its brackets with its arrow, counted among the links of this block, either way round', () => {
    assert.equal(span(BLOCK, { link: 0 }), '-[:ANSWERS]->');
    assert.equal(span(BLOCK, { link: 1 }), "-[:CITES {where: 'day 2'}]->");
    assert.equal(span('// graph: g\n(a)<-[:R]-(b)', { link: 0 }), '<-[:R]-');
    assert.equal(spanOf(BLOCK, { link: 2 }), null);
  });

  test('a name inside a string or a comment is never taken for the thing', () => {
    const text = "// graph: g\n// (a:T) was here\n(b:T {note: '(a:T)'}),\n(a:T)";
    assert.equal(spanOf(text, { thing: 'a' })?.from, text.lastIndexOf('(a:T)'));
  });

  test('a thing drawn under a suggested name: the pattern that writes it, found by where its ( is (unnamed_drawn_suggested)', () => {
    const text =
      "// graph: reader\n(q:Question {title: 'Which?'}),\n(:Option {name: 'Large reader'}) , (:Option {name: 'B'})";
    const place = readNote([text])
      .graphs.get('reader')
      .boxes.find((b) => b.key === 'large_reader').suggested;
    assert.equal(span(text, { thing: 'large_reader' }), null, 'its name is not written');
    const s = spanOf(text, { thing: 'large_reader' }, place);
    assert.equal(text.slice(s.from, s.to), "(:Option {name: 'Large reader'})");
    assert.equal(spanOf(text, { thing: 'large_reader' }, { line: 1, character: 1 }), null, 'a ( with a name is not it');
    assert.equal(
      spanOf(text, { thing: 'large_reader' }, { line: 9, character: 1 }),
      null,
      'nor a place not in the block',
    );
    const named = text.replace("(:Option {name: 'Large", "(large_reader:Option {name: 'Large");
    assert.equal(
      span(named, { thing: 'large_reader' }),
      "(large_reader:Option {name: 'Large reader'})",
      'once written, it is found by its name',
    );
  });

  test('a drawn link, found in the block being edited: by its ends and type', () => {
    const r = readNote([BLOCK]);
    assert.equal(linkInBlock(r, 'reader', 1, BLOCK), 1);
    assert.equal(linkInBlock(r, 'reader', 1, '// graph: reader\n(large)-[:CITES]->(notes)'), 0);
    assert.equal(linkInBlock(r, 'reader', 0, '// graph: reader\n(x:T)'), -1);
  });
});

describe('renaming a property', () => {
  test('only the name changes: the value is kept exactly as written', () => {
    const text = BLOCK.replace('price: 300', 'price: 1.50');
    assert.equal(
      renameProperty(text, 'reader', { thing: 'large' }, 'price', 'cost').text,
      text.replace('price: 1.50', 'cost: 1.50'),
    );
    assert.equal(
      renameProperty(BLOCK, 'reader', { link: 1 }, 'where', 'page').text,
      BLOCK.replace("where: 'day 2'", "page: 'day 2'"),
    );
  });

  test('a name already used on the thing is refused: renaming onto it would lose its value', () => {
    const r = renameProperty(BLOCK, 'reader', { thing: 'large' }, 'price', 'name');
    assert.equal(r.ok, false);
    assert.match(r.reason, /already has a property called name/);
  });

  test('a property not in the thing’s map here is refused, saying where it is', () => {
    assert.match(
      renameProperty(BLOCK, 'reader', { thing: 'large' }, 'colour', 'hue').reason,
      /not written in its pattern here/,
    );
  });

  test('the id cannot be renamed, nor anything renamed to id', () => {
    assert.match(renameProperty(BLOCK, 'reader', { thing: 'large' }, 'id', 'x').reason, /name/);
    assert.match(renameProperty(BLOCK, 'reader', { thing: 'large' }, 'price', 'id').reason, /name/);
  });
});

describe('removing a property', () => {
  test('one set elsewhere — by SET, or in another block — is refused, not reported as removed', () => {
    const text = `${BLOCK}\nSET large.status = 'bought'`;
    const r = setProperty(text, 'reader', { thing: 'large' }, 'status', null);
    assert.equal(r.ok, false);
    assert.match(r.reason, /not written in its pattern here/);
  });
});
