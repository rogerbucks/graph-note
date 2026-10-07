// Help that finds and fixes problems (spec §8), in the shapes of the Language Server Protocol (spec §10), so a VS Code host
// can show them as its own: every problem in plain English, with its place and a fix where one exists; names, kinds and
// relationships suggested while typing — only the schema's in a locked graph; a near duplicate warned of in a draft; and
// each line read back in plain English.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readNote } from '../src/drawing.ts';
import { diagnostics, completions, readBack, textVersion, SEVERITY, KIND } from '../src/help.ts';

const BLOCK = `// graph: reader
(question:Question {title: 'Which device?'}),
(small_reader:Option {name: 'Small reader'}),
(large_reader:Option {name: 'Large reader'}),
(eyes:Reason {title: 'Easy on the eyes'}),
(price:Reason {title: 'Costs less'}),
(small_reader)-[:ANSWERS]->(question),
(large_reader)-[:ANSWERS]->(question),
(eyes)-[:FAVOURS]->(large_reader),
(price)-[:FAVOURS]->(small_reader)`;
const URI = 'file:///Some%20note.md';
const at = (line, character) => ({ line, character });

describe('problems, in plain English, with their place and a fix', () => {
  test('a near miss is a warning on the misspelt word, with a fix that changes just that word', () => {
    const text = BLOCK + ',\n(eyes)-[:FAVOURS]->(small_reeder)';
    const [d] = diagnostics(readNote([text]), 'reader', 0, text, URI);
    assert.deepEqual(d.range, { start: at(10, 20), end: at(10, 32) });
    assert.equal(d.severity, SEVERITY.Warning);
    assert.equal(d.source, 'graph-note');
    assert.equal(d.message, 'small_reeder is not in graph reader; it is drawn as an estimate of small_reader.');
    assert.deepEqual(d.data.fixes, [{
      title: 'Change small_reeder to small_reader', kind: 'quickfix', isPreferred: true,
      edit: { changes: { [URI]: [{ range: { start: at(10, 20), end: at(10, 32) }, newText: 'small_reader' }] } },
    }]);
  });

  test('a link between equals offers each of them as a fix', () => {
    const text = BLOCK.replace("(eyes:Reason", "(large_readers:Option {name: 'x'}),\n(eyes:Reason") + ',\n(eyes)-[:FAVOURS]->(large_readerx)';
    const [d] = diagnostics(readNote([text]), 'reader', 0, text, URI);
    assert.equal(d.severity, SEVERITY.Error);
    assert.deepEqual(d.data.fixes.map((f) => f.title), ['Change large_readerx to large_reader', 'Change large_readerx to large_readers']);
  });

  test('a near-miss relationship type is a warning on the type, with its fix', () => {
    const text = BLOCK + ',\n(eyes)-[:FAVORS]->(question)';
    const [d] = diagnostics(readNote([text]), 'reader', 0, text, URI);
    assert.deepEqual(d.range, { start: at(10, 9), end: at(10, 15) });
    assert.deepEqual(d.data.fixes[0].edit.changes[URI][0].newText, 'FAVOURS');
  });

  test('a line that cannot be read is an error over that line, with its fix in words where no edit can be made', () => {
    const text = BLOCK + ",\n  (broken:Reason {title: })";
    const [d] = diagnostics(readNote([text]), 'reader', 0, text, URI);
    assert.deepEqual(d.range, { start: at(10, 2), end: at(10, 27) });
    assert.equal(d.severity, SEVERITY.Error);
    assert.match(d.message, /^'\}' is not a value in the profile\.$/);
    assert.match(d.data.fix, /^Use 'text', a number/);
    assert.deepEqual(d.data.fixes, []);
  });

  test('every message is a sentence, and every problem has a place', () => {
    const text = BLOCK + ",\n(eyes)-[:FAVOURS]->(nowhere),\n(x:T {y: }),\n(eyes)-[:FAVORS]->(question)";
    const ds = diagnostics(readNote([text]), 'reader', 0, text, URI);
    assert.equal(ds.length, 3);
    for (const d of ds) {
      assert.match(d.message, /^[A-Z'a-z].*\.$/);
      assert.ok(d.range.end.character > d.range.start.character || d.range.end.line > d.range.start.line);
      assert.ok(d.data.fix, 'a fix, in words at least');
    }
  });

  test('only the problems of the block being edited are given', () => {
    const other = "// graph: reader\n(eyes)-[:FAVOURS]->(nowhere)";
    const r = readNote([BLOCK, other]);
    assert.deepEqual(diagnostics(r, 'reader', 0, BLOCK, URI), []);
    assert.equal(diagnostics(r, 'reader', 1, other, URI).length, 1);
  });
});

describe('a draft warns of near duplicates', () => {
  test('a kind one or two letters from a kind used more often is warned of, with the fix', () => {
    const text = BLOCK + ",\n(cost:Reasn {title: 'Heavy'})";
    const ds = diagnostics(readNote([text]), 'reader', 0, text, URI);
    const d = ds.find((x) => x.code === 'near-duplicate');
    assert.equal(d.severity, SEVERITY.Warning);
    assert.equal(d.message, 'The kind Reasn is one letter from Reason, already in the graph.');
    assert.deepEqual(d.range, { start: at(10, 6), end: at(10, 11) });
    assert.equal(d.data.fixes[0].edit.changes[URI][0].newText, 'Reason');
  });

  test('a locked graph does not warn: its schema says what is allowed', () => {
    const schema = `// graph: reader
(k1:Meta:ElementType {name: 'Reason', kind: 'node'}), (k2:Meta:ElementType {name: 'Reasn', kind: 'node'})`;
    const text = BLOCK + ",\n(cost:Reasn {title: 'Heavy'})";
    assert.equal(diagnostics(readNote([text, schema]), 'reader', 0, text, URI).filter((d) => d.code === 'near-duplicate').length, 0);
  });
});

describe('suggestions while typing', () => {
  const r = readNote([BLOCK]);
  const after = (typed) => { const text = BLOCK + ',\n' + typed; return completions(r, 'reader', text, text.length); };

  test('after an opening bracket, the names already in the graph, with their text', () => {
    const c = after('(sm');
    assert.equal(c.from, BLOCK.length + 3);
    assert.deepEqual(c.items, [{ label: 'small_reader', kind: KIND.Variable, detail: 'Option: Small reader' }]);
    assert.equal(after('(').items.length, 5);
  });

  test('after a colon in a node, the kinds already in the graph', () => {
    assert.deepEqual(after('(new_thing:').items.map((i) => [i.label, i.kind]), [['Option', KIND.Class], ['Question', KIND.Class], ['Reason', KIND.Class]]);
    assert.deepEqual(after('(new_thing:Re').items.map((i) => i.label), ['Reason']);
  });

  test('after the start of a link, the relationships already in the graph, with their readings', () => {
    assert.deepEqual(after('(eyes)-[:').items, [
      { label: 'ANSWERS', kind: KIND.Interface, detail: 'answers' },
      { label: 'FAVOURS', kind: KIND.Interface, detail: 'favours' },
    ]);
    assert.deepEqual(after('(eyes)-[:F').items.map((i) => i.label), ['FAVOURS']);
  });

  test('after the end of a link, the names again', () => {
    assert.deepEqual(after('(eyes)-[:FAVOURS]->(qu').items.map((i) => i.label), ['question']);
  });

  test('inside a string or a comment, nothing is suggested', () => {
    assert.deepEqual(after("(x:Reason {title: '(sm").items, []);
    assert.deepEqual(after('// see (sm').items, []);
  });

  test('in a locked graph, only the kinds and relationships its schema declares', () => {
    const schema = `// graph: reader
(k1:Meta:ElementType {name: 'Option', kind: 'node'}), (k2:Meta:ElementType {name: 'Reason', kind: 'node'}),
(e1:Meta:ElementType {name: 'FAVOURS', kind: 'edge', reading: 'favours'})`;
    const locked = readNote([BLOCK, schema]);
    const text = BLOCK + ',\n(n:';
    assert.deepEqual(completions(locked, 'reader', text, text.length).items.map((i) => i.label), ['Option', 'Reason']);
    const link = BLOCK + ',\n(eyes)-[:';
    assert.deepEqual(completions(locked, 'reader', link, link.length).items.map((i) => i.label), ['FAVOURS']);
  });
});

describe('read back in plain English', () => {
  test('each line says what it writes, in the words of the graph', () => {
    const lines = readBack(readNote([BLOCK]), 'reader', BLOCK);
    assert.equal(lines.get(0), undefined, 'the graph line needs no reading');
    assert.equal(lines.get(1), 'Which device? is a Question');
    assert.equal(lines.get(8), 'Easy on the eyes favours Large reader');
    assert.equal(lines.get(6), 'Small reader answers Which device?');
  });

  test('a line with several links reads each, and a SET says what it sets', () => {
    const text = BLOCK + ",\n(eyes)-[:FAVOURS]->(small_reader), (price)-[:FAVOURS]->(large_reader)\nSET large_reader.status = 'bought'";
    const lines = readBack(readNote([text]), 'reader', text);
    assert.equal(lines.get(10), 'Easy on the eyes favours Small reader; Costs less favours Large reader');
    assert.equal(lines.get(11), 'Large reader: status is bought');
  });

  test('a name the graph does not have is read as written, never guessed silently', () => {
    const text = BLOCK + ',\n(eyes)-[:FAVOURS]->(small_reeder)';
    assert.equal(readBack(readNote([text]), 'reader', text).get(10), 'Easy on the eyes favours small_reeder (not in the graph)');
  });
});

describe('a text version of the graph, for screen readers', () => {
  test('every thing, then every link, in sentences', () => {
    const t = textVersion(readNote([BLOCK]).graphs.get('reader'));
    assert.deepEqual(t.slice(0, 2), ['Graph reader: 5 things, 4 links.', 'Which device? is a Question.']);
    assert.ok(t.includes('Easy on the eyes favours Large reader.'));
    assert.equal(t.length, 2 + 4 + 4);
  });

  test('an estimated link is said to be a guess', () => {
    const t = textVersion(readNote([BLOCK + ',\n(eyes)-[:FAVOURS]->(small_reeder)']).graphs.get('reader'));
    assert.ok(t.includes('Estimated, not written: Easy on the eyes favours Small reader.'));
  });
});

describe('a missing comma', () => {
  test('its fix adds the comma at the end of the line before', () => {
    const text = BLOCK.replace("(large_reader:Option {name: 'Large reader'}),", "(large_reader:Option {name: 'Large reader'})");
    const d = diagnostics(readNote([text]), 'reader', 0, text, URI).find((x) => /comma is missing/.test(x.message));
    assert.deepEqual(d.data.fixes, [{
      title: 'Add the missing comma', kind: 'quickfix', isPreferred: true,
      edit: { changes: { [URI]: [{ range: { start: at(3, 44), end: at(3, 44) }, newText: ',' }] } },
    }]);
  });
});
