// Help that finds and fixes problems (spec §8), in the shapes of the Language Server Protocol (spec §10). So a VS Code
// host can show them as its own. Every problem is in plain English, with its place and a fix where one exists. Names,
// kinds and relationships are suggested while typing, only the schema's in a locked graph. A near duplicate is warned
// of in a draft. Each line is read back in plain English.
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
    assert.equal(d.source, 'thoughtknot');
    assert.equal(d.message, 'small_reeder is not in graph reader; it is drawn as an estimate of small_reader.');
    assert.deepEqual(d.data.fixes, [
      {
        title: 'Change small_reeder to small_reader',
        kind: 'quickfix',
        isPreferred: true,
        edit: { changes: { [URI]: [{ range: { start: at(10, 20), end: at(10, 32) }, newText: 'small_reader' }] } },
      },
    ]);
  });

  test('a link between equals offers each of them as a fix', () => {
    const text =
      BLOCK.replace('(eyes:Reason', "(large_readers:Option {name: 'x'}),\n(eyes:Reason") +
      ',\n(eyes)-[:FAVOURS]->(large_readerx)';
    const [d] = diagnostics(readNote([text]), 'reader', 0, text, URI);
    assert.equal(d.severity, SEVERITY.Error);
    assert.deepEqual(
      d.data.fixes.map((f) => f.title),
      ['Change large_readerx to large_reader', 'Change large_readerx to large_readers'],
    );
  });

  test('req:3.gql-escapes: an escape GQL does not name is an error, with the fix that doubles its backslash', () => {
    const text = BLOCK + ",\n(other:Reason {title: 'C:\\data'})";
    const [d] = diagnostics(readNote([text]), 'reader', 0, text, URI);
    assert.equal(d.severity, SEVERITY.Error);
    assert.equal(d.message, "'\\d' is not an escape GQL names.");
    assert.deepEqual(d.data.fixes, [
      {
        title: 'Double the backslash',
        kind: 'quickfix',
        isPreferred: true,
        edit: { changes: { [URI]: [{ range: { start: at(10, 25), end: at(10, 25) }, newText: '\\' }] } },
      },
    ]);
  });

  test('a near-miss relationship type is a warning on the type, with its fix', () => {
    const text = BLOCK + ',\n(eyes)-[:FAVORS]->(question)';
    const [d] = diagnostics(readNote([text]), 'reader', 0, text, URI);
    assert.deepEqual(d.range, { start: at(10, 9), end: at(10, 15) });
    assert.deepEqual(d.data.fixes[0].edit.changes[URI][0].newText, 'FAVOURS');
  });

  test('a line that cannot be read is an error over that line, with its fix in words where no edit can be made', () => {
    const text = BLOCK + ',\n  (broken:Reason {title: })';
    const [d] = diagnostics(readNote([text]), 'reader', 0, text, URI);
    assert.deepEqual(d.range, { start: at(10, 2), end: at(10, 27) });
    assert.equal(d.severity, SEVERITY.Error);
    assert.match(d.message, /^'\}' is not a value in the profile\.$/);
    assert.match(d.data.fix, /^Use 'text', a number/);
    assert.deepEqual(d.data.fixes, []);
  });

  test('problem_codes: a problem the reader raises carries its stable code, and its diagnostic gives it as code', () => {
    // editor spec §42: the code is the graph spec's (problem-codes.json), the same from the Python library
    const text = BLOCK + ',\n  (broken:Reason {title: })',
      reading = readNote([text]);
    assert.deepEqual(
      reading.problems.map((p) => p.code),
      ['GN207'],
    );
    const [d] = diagnostics(reading, 'reader', 0, text, URI);
    assert.equal(d.code, 'GN207');
    // a graph line the reader cannot read gives its code too
    const named = readNote(["// graph: reader-choice\n(a:T {name: 'A'})"]);
    assert.deepEqual(
      named.problems.map((p) => p.code),
      ['GN102'],
    );
  });

  test('every message is a sentence, and every problem has a place', () => {
    const text = BLOCK + ',\n(eyes)-[:FAVOURS]->(nowhere),\n(x:T {y: }),\n(eyes)-[:FAVORS]->(question)';
    const ds = diagnostics(readNote([text]), 'reader', 0, text, URI);
    assert.equal(ds.length, 3);
    for (const d of ds) {
      assert.match(d.message, /^[A-Z'a-z].*\.$/);
      assert.ok(d.range.end.character > d.range.start.character || d.range.end.line > d.range.start.line);
      assert.ok(d.data.fix, 'a fix, in words at least');
    }
  });

  test('only the problems of the block being edited are given', () => {
    const other = '// graph: reader\n(eyes)-[:FAVOURS]->(nowhere)';
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
    assert.equal(
      diagnostics(readNote([text, schema]), 'reader', 0, text, URI).filter((d) => d.code === 'near-duplicate').length,
      0,
    );
  });
});

describe('suggestions while typing', () => {
  const r = readNote([BLOCK]);
  const after = (typed) => {
    const text = BLOCK + ',\n' + typed;
    return completions(r, 'reader', text, text.length);
  };

  test('after an opening bracket, the names already in the graph, with their text', () => {
    const c = after('(sm');
    assert.equal(c.from, BLOCK.length + 3);
    assert.deepEqual(c.items, [{ label: 'small_reader', kind: KIND.Variable, detail: 'Option: Small reader' }]);
    assert.equal(after('(').items.length, 5);
  });

  test('after a colon in a node, the kinds already in the graph', () => {
    assert.deepEqual(
      after('(new_thing:').items.map((i) => [i.label, i.kind]),
      [
        ['Option', KIND.Class],
        ['Question', KIND.Class],
        ['Reason', KIND.Class],
      ],
    );
    assert.deepEqual(
      after('(new_thing:Re').items.map((i) => i.label),
      ['Reason'],
    );
  });

  test('after the start of a link, the relationships already in the graph, with their readings', () => {
    assert.deepEqual(after('(eyes)-[:').items, [
      { label: 'ANSWERS', kind: KIND.Interface, detail: 'answers' },
      { label: 'FAVOURS', kind: KIND.Interface, detail: 'favours' },
    ]);
    assert.deepEqual(
      after('(eyes)-[:F').items.map((i) => i.label),
      ['FAVOURS'],
    );
  });

  test('a relationship brings its colon: after -[ the types are offered as :TYPE, so the colon is never typed', () => {
    const c = after('(eyes)-[');
    assert.deepEqual(
      c.items.map((i) => [i.label, i.insertText]),
      [
        ['ANSWERS', ':ANSWERS'],
        ['FAVOURS', ':FAVOURS'],
      ],
    );
    const f = after('(eyes)-[FA');
    assert.deepEqual(
      f.items.map((i) => i.insertText),
      [':FAVOURS'],
      'a bare start of the name is taken over by the suggestion',
    );
    assert.equal(f.from, BLOCK.length + 2 + '(eyes)-['.length);
  });

  test('a kind brings its colon: after a new thing’s name, the kinds are offered as :Kind, added after the name', () => {
    const typed = '(new_thing';
    const c = after(typed);
    const kinds = c.items.filter((i) => i.kind === KIND.Class);
    assert.deepEqual(
      kinds.map((i) => [i.label, i.insertText, i.from]),
      [
        ['Option', ':Option', BLOCK.length + 2 + typed.length],
        ['Question', ':Question', BLOCK.length + 2 + typed.length],
        ['Reason', ':Reason', BLOCK.length + 2 + typed.length],
      ],
    );
  });

  test('after the name of a thing already in the graph, no kinds: it is a reference, not a new thing', () => {
    assert.deepEqual(
      after('(eyes').items.filter((i) => i.kind === KIND.Class),
      [],
    );
  });

  test('after the end of a link, the names again', () => {
    assert.deepEqual(
      after('(eyes)-[:FAVOURS]->(qu').items.map((i) => i.label),
      ['question'],
    );
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
    assert.deepEqual(
      completions(locked, 'reader', text, text.length).items.map((i) => i.label),
      ['Option', 'Reason'],
    );
    const link = BLOCK + ',\n(eyes)-[:';
    assert.deepEqual(
      completions(locked, 'reader', link, link.length).items.map((i) => i.label),
      ['FAVOURS'],
    );
  });
});

describe('read back in plain English', () => {
  test('each line says what it writes, in the words of the graph', () => {
    const lines = readBack(readNote([BLOCK]), 'reader', BLOCK);
    assert.equal(lines.get(0), undefined, 'the graph line needs no reading');
    assert.equal(lines.get(1), 'Which device? is a Question');
    assert.equal(
      lines.get(8),
      'Easy on the eyes —FAVOURS→ Large reader',
      'a draft’s types have no words of their own yet',
    );
    assert.equal(lines.get(6), 'Small reader —ANSWERS→ Which device?');
  });

  test('a line with several links reads each, and a SET says what it sets', () => {
    const text =
      BLOCK +
      ",\n(eyes)-[:FAVOURS]->(small_reader), (price)-[:FAVOURS]->(large_reader)\nSET large_reader.status = 'bought'";
    const lines = readBack(readNote([text]), 'reader', text);
    assert.equal(lines.get(10), 'Easy on the eyes —FAVOURS→ Small reader; Costs less —FAVOURS→ Large reader');
    assert.equal(lines.get(11), 'Large reader: status is bought');
  });

  test('a name the graph does not have is read as written, never guessed silently', () => {
    const text = BLOCK + ',\n(eyes)-[:FAVOURS]->(small_reeder)';
    assert.equal(
      readBack(readNote([text]), 'reader', text).get(10),
      'Easy on the eyes —FAVOURS→ small_reeder (not in the graph)',
    );
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
    const text = BLOCK.replace(
      "(large_reader:Option {name: 'Large reader'}),",
      "(large_reader:Option {name: 'Large reader'})",
    );
    const d = diagnostics(readNote([text]), 'reader', 0, text, URI).find((x) => /comma is missing/.test(x.message));
    assert.deepEqual(d.data.fixes, [
      {
        title: 'Add the missing comma',
        kind: 'quickfix',
        isPreferred: true,
        edit: { changes: { [URI]: [{ range: { start: at(3, 44), end: at(3, 44) }, newText: ',' }] } },
      },
    ]);
  });
});

test('a pattern written over several lines is read back beside its last line', () => {
  const text = "// graph: g\n(q:Question {\n    title: 'Which device?'}),\n(a:Option {name: 'A'})";
  const lines = readBack(readNote([text]), 'g', text);
  assert.equal(lines.get(1), undefined);
  assert.equal(lines.get(2), 'Which device? is a Question');
  assert.equal(lines.get(3), 'A is an Option');
});

describe('a relationship type written without its colon', () => {
  test('its fix writes the colon, as the graph spells the type, in place of what was written', () => {
    const first = "// graph: g\n(r:Reason {title: 'Sun'}),\n(o:Option {name: 'Coast'}),\n(r)-[:FAVOURS]->(o)";
    const bare = "// graph: g\n(s:Reason {title: 'Quiet'}),\n(favours)-[favours]->(o)".replace('(favours)', '(s)');
    const [d] = diagnostics(readNote([first, bare]), 'g', 1, bare, 'note.md');
    assert.equal(d.severity, SEVERITY.Warning);
    assert.deepEqual(d.range, { start: { line: 2, character: 5 }, end: { line: 2, character: 12 } });
    const [fix] = d.data.fixes;
    assert.equal(fix.title, 'Write the colon: [:FAVOURS]');
    assert.deepEqual(fix.edit.changes['note.md'], [{ range: d.range, newText: ':FAVOURS' }]);
  });
});

describe('reading back a link whose type has no reading of its own', () => {
  // the try-out: "Drive hope How should we get to Sydney?" read badly; a type with no reading shows itself, as an arrow
  test('is shown by its type, as an arrow, until the type is given a reading', () => {
    const text =
      "// graph: g\n(drive:Option {name: 'Drive'}),\n(q:Question {title: 'Where to?'}),\n(drive)-[:HOPE]->(q)";
    assert.equal(readBack(readNote([text]), 'g', text).get(3), 'Drive —HOPE→ Where to?');
  });

  test('a type its schema gives a reading is read in those words', () => {
    const text =
      "// graph: g\n(drive:Option {name: 'Drive'}),\n(q:Question {title: 'Where to?'}),\n(drive)-[:HOPE]->(q)";
    const schema =
      "// graph: g\n(t:ElementType {name: 'HOPE', kind: 'edge', reading: 'is hoped for by', reverse_name: 'hopes for'})";
    assert.equal(readBack(readNote([text, schema], 0), 'g', text).get(3), 'Drive is hoped for by Where to?');
  });
});

describe('a name or a text suggested for a thing', () => {
  // a thing with text and no name, and a thing with a name and no text (editor spec §4)
  const apply = (text, action) => {
    const lines = text.split('\n');
    const { range, newText } = action.edit.changes[URI][0];
    const line = lines[range.start.line];
    lines[range.start.line] = line.slice(0, range.start.character) + newText + line.slice(range.end.character);
    return lines.join('\n');
  };
  const UNNAMED = BLOCK + ",\n(:Option {name: 'Medium reader'})";

  test('a thing with text and no name has a warning showing the name, whose fix writes it after the (', () => {
    const [d] = diagnostics(readNote([UNNAMED]), 'reader', 0, UNNAMED, URI);
    assert.equal(d.severity, SEVERITY.Warning);
    assert.equal(d.message, 'This thing has no name; suggested: medium_reader.');
    assert.deepEqual(d.range, { start: at(10, 0), end: at(10, 33) });
    assert.deepEqual(d.data.fixes, [
      {
        title: 'Add the name medium_reader',
        kind: 'quickfix',
        isPreferred: true,
        edit: { changes: { [URI]: [{ range: { start: at(10, 1), end: at(10, 1) }, newText: 'medium_reader' }] } },
      },
    ]);
  });

  test('after the fix is applied the thing has its name, and nothing is left to suggest', () => {
    const [d] = diagnostics(readNote([UNNAMED]), 'reader', 0, UNNAMED, URI);
    const fixed = apply(UNNAMED, d.data.fixes[0]);
    assert.equal(fixed, BLOCK + ",\n(medium_reader:Option {name: 'Medium reader'})");
    const after = readNote([fixed]);
    assert.deepEqual(diagnostics(after, 'reader', 0, fixed, URI), []);
    assert.ok(after.graphs.get('reader').boxes.some((b) => b.key === 'medium_reader'));
  });

  test('a thing with a name and no text has a hint showing the text, whose fix adds it as the name property', () => {
    const text = BLOCK + ',\n(medium_reader:Option)';
    const [d] = diagnostics(readNote([text]), 'reader', 0, text, URI);
    assert.equal(d.severity, SEVERITY.Hint);
    assert.equal(d.message, "The thing medium_reader has no text; suggested: 'Medium reader'.");
    assert.deepEqual(d.range, { start: at(10, 1), end: at(10, 14) });
    assert.equal(d.data.fixes[0].title, "Add the text 'Medium reader'");
    const fixed = apply(text, d.data.fixes[0]);
    assert.equal(fixed, BLOCK + ",\n(medium_reader:Option {name: 'Medium reader'})");
    assert.deepEqual(diagnostics(readNote([fixed]), 'reader', 0, fixed, URI), []);
  });

  test('a suggestion is only ever offered: the text handed to the reading is never changed', () => {
    const r = readNote([UNNAMED]);
    assert.deepEqual(r.texts, [UNNAMED]);
    const ds = diagnostics(r, 'reader', 0, UNNAMED, URI);
    assert.equal(ds.length, 1);
    assert.match(ds[0].message, /suggested: medium_reader/);
  });
});

// editor spec §4, unnamed_drawn_suggested: nothing is written until the thing's own fix is accepted. So a name only
// suggested is never offered to be typed into the note, nor named in a fix for something else
describe('a name only suggested is never offered as a word to write', () => {
  const TEXT = "// graph: g\n(a:X {name: 'A'}),\n(:X {name: 'Small reader'}),\n(a)-[:R]->(a)";
  const labels = (text, caret = text.length) =>
    completions(readNote([text]), 'g', text, caret).items.map((i) => i.insertText ?? i.label);

  test('the names offered after a ( leave out a thing drawn under a suggested name', () => {
    assert.deepEqual(labels(TEXT + ',\n(a)-[:R]->(sm'), [':X'], 'only the kind a new thing could take');
    assert.deepEqual(labels(TEXT + ',\n(a)-[:R]->('), ['a']);
    assert.ok(!labels(TEXT + ',\n(a)-[:R]->(sm').includes('small_reader'));
  });

  test('once the name is written it is offered, as any name is', () => {
    const named = TEXT.replace('(:X', '(small_reader:X');
    assert.deepEqual(labels(named + ',\n(a)-[:R]->(sm'), ['small_reader']);
  });

  test('an inline completion never finishes a name to the suggested one', async () => {
    const { inlineCompletion } = await import('../src/autocomplete.ts');
    const text = TEXT + ',\n(a)-[:R]->(sm';
    const found = inlineCompletion(readNote([text]), 'g', text, text.length);
    assert.ok(!found || !found.add.includes('all_reader'), JSON.stringify(found));
  });

  test('a near miss of the name is no estimate, so no fix changes a word to it', () => {
    const text = TEXT.replace(',\n(a)-[:R]->(a)', ',\n(a)-[:R]->(smal_reader)');
    const r = readNote([text]);
    assert.deepEqual(r.graphs.get('g').estimates, []);
    const [p] = r.problems.filter((x) => x.message.includes('smal_reader') && !x.suggested);
    assert.match(p.message, /^no thing called smal_reader in graph g/);
    assert.equal(p.replace, undefined, 'no word to change');
    assert.ok(!r.problems.some((x) => /small_reader/.test(x.fix) && x.suggested === undefined), 'no fix names it');
    const fixes = diagnostics(r, 'g', 0, text, URI).flatMap((d) => d.data.fixes.map((f) => f.title));
    assert.ok(!fixes.some((t) => t.includes('small_reader') && !t.startsWith('Add the name')), fixes.join(' | '));
  });
});
