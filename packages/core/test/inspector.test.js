// The inspector (editor spec §14, slice 1 since 7 Oct 2026): every property of the selected thing or link, each edited,
// added or removed — as text, in the block where the thing or link is written (§2, edits are text) — with each value
// checked against its type before it is written, and the names already used on things of the same kind offered first.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readNote } from '../src/drawing.ts';
import { parseValue, setProperty, propertyNames, propertiesOf } from '../src/inspector.ts';

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
    assert.deepEqual(parseValue('datetime', '2026-10-07T21:30:00+10:00'), { ok: true, gql: "DATETIME '2026-10-07T21:30:00+10:00'" });
    assert.deepEqual(parseValue('boolean', 'true'), { ok: true, gql: 'TRUE' });
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
    assert.deepEqual(propertiesOf(readNote([BLOCK]), 'reader', { link: 1 }), [{ key: 'where', value: 'day 2', type: 'text' }]);
  });
});

describe('edits are text, in the block where the thing is written', () => {
  test('changing a value rewrites it in place, and nothing else', () => {
    const r = setProperty(BLOCK, 'reader', { thing: 'large' }, 'price', '320');
    assert.equal(r.text, BLOCK.replace('price: 300', 'price: 320'));
  });

  test('adding a property appends it to the thing’s map, or gives the thing a map', () => {
    assert.equal(setProperty(BLOCK, 'reader', { thing: 'large' }, 'colour', "'grey'").text, BLOCK.replace("ordered: DATE '2026-10-01'}", "ordered: DATE '2026-10-01', colour: 'grey'}"));
    assert.equal(setProperty(BLOCK.replace("(small:Option {name: 'Small reader'})", '(small:Option)'), 'reader', { thing: 'small' }, 'price', '99').text,
      BLOCK.replace("(small:Option {name: 'Small reader'})", '(small:Option {price: 99})'));
  });

  test('removing a property takes it out of the map, and an emptied map with it', () => {
    assert.equal(setProperty(BLOCK, 'reader', { thing: 'large' }, 'price', null).text, BLOCK.replace('price: 300, ', ''));
    assert.equal(setProperty(BLOCK, 'reader', { thing: 'small' }, 'name', null).text, BLOCK.replace("(small:Option {name: 'Small reader'})", '(small:Option)'));
  });

  test('a link’s properties are edited in its own brackets', () => {
    assert.equal(setProperty(BLOCK, 'reader', { link: 1 }, 'where', "'day 3'").text, BLOCK.replace("where: 'day 2'", "where: 'day 3'"));
    assert.equal(setProperty(BLOCK, 'reader', { link: 0 }, 'weight', '2').text, BLOCK.replace('(large)-[:ANSWERS]->(q)', '(large)-[:ANSWERS {weight: 2}]->(q)'));
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
