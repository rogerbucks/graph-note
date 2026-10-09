// What a block's things are missing, and the fix that adds it (editor spec §4: name_from_text, text_from_name,
// suggested_name_unique): a thing given text but no name, a thing given a name but no text. The suggestion is shown as a
// warning with its fix and is never written unasked; the thing is drawn as if the suggestion were there. A thing with no
// text is drawn by its name, with a hint that offers the text.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { nameGaps, withNames } from '../src/name-gaps.ts';
import { readNote } from '../src/drawing.ts';

const graphOf = (text) => ({ text, graph: 'reader' });
/** The gaps of a single block of the graph `reader`. */
const gapsOf = (text) => nameGaps([graphOf(text)])[0];
const HEAD = `// graph: reader
(question:Question {title: 'Which device?'}),
(small_reader:Option {name: 'Small reader'}),
`;

describe('a thing given text but no name', () => {
  test('a warning on its line suggests a name in the style of the graph, with a fix that adds it after the (', () => {
    const { problems, named } = gapsOf(HEAD + "(:Option {name: 'Large reader'})");
    assert.deepEqual(problems, [
      {
        line: 4,
        severity: 'warning',
        message: 'this thing has no name; suggested: large_reader',
        fix: 'add the name large_reader after the (, or write one of your own',
        insert: { line: 3, character: 1, text: 'large_reader' },
        fixTitle: 'Add the name large_reader',
        span: { line: 3, character: 0, end: 32 },
      },
    ]);
    assert.deepEqual(named, [{ line: 3, character: 1, name: 'large_reader' }]);
  });

  test('text is the first of name, title, text and label, as the drawing chooses it', () => {
    for (const key of ['name', 'title', 'text', 'label']) {
      const { problems } = gapsOf(`// graph: reader\n(:Option {${key}: 'Large reader'})`);
      assert.equal(problems[0]?.message, 'this thing has no name; suggested: large_reader', key);
    }
  });

  test('a thing with no kind is found too, and one in a path', () => {
    const { problems } = gapsOf("// graph: reader\n({name: 'Eyes'})-[:FAVOURS]->(:Option {name: 'Large reader'})");
    assert.deepEqual(
      problems.map((p) => p.insert),
      [
        { line: 1, character: 1, text: 'eyes' },
        { line: 1, character: 30, text: 'large_reader' },
      ],
    );
  });

  test('the name is never one in the graph: not in this block, not in another block of the graph, not one just suggested', () => {
    const second = "// graph: reader\n(:Option {name: 'Large reader'}),\n(:Option {name: 'Large reader'})";
    const blocks = [
      graphOf("// graph: reader\n(large_reader:Option {name: 'Large reader'})"),
      graphOf(second),
      { text: "// graph: other\n(:Option {name: 'Large reader'})", graph: 'other' },
    ];
    const gaps = nameGaps(blocks);
    assert.deepEqual(
      gaps[1].named.map((n) => n.name),
      ['large_reader_2', 'large_reader_3'],
    );
    assert.deepEqual(
      gaps[2].named.map((n) => n.name),
      ['large_reader'],
      'another graph’s names do not count',
    );
  });

  test('a thing with neither a name nor any text gets no suggestion: the reader says what is wrong', () => {
    assert.deepEqual(gapsOf('// graph: reader\n(:Option),\n()').problems, []);
  });

  test('a thing whose properties cannot be read gets no suggestion either: the reader says what is wrong', () => {
    const text = "// graph: reader\n(x:T {y: }),\n(:Option {name: 'Large reader', price: }),\n(z:T {oops})";
    assert.deepEqual(gapsOf(text).problems, []);
  });

  test('a thing across several lines is found where its ( is', () => {
    const { named } = gapsOf("// graph: reader\n(:Option {\n  name: 'Large reader'\n})");
    assert.deepEqual(named, [{ line: 1, character: 1, name: 'large_reader' }]);
  });

  test('the name is never a word the language keeps for itself', () => {
    const { problems } = gapsOf("// graph: reader\n(:Option {name: 'Match'}),\n(:Option {name: 'Return'})");
    assert.deepEqual(
      problems.map((p) => p.insert.text),
      ['match_2', 'return_2'],
    );
  });

  test('a text with no ASCII letter in it is named from its kind, and from nothing without one', () => {
    const { problems } = gapsOf("// graph: reader\n(:Tag {name: '東京駅'}),\n(:Tag {name: '大阪'}),\n({name: '京都'})");
    assert.deepEqual(
      problems.map((p) => p.insert.text),
      ['tag', 'tag_2', 'thing'],
    );
  });

  test('a thing in a MATCH, in a comment or in a string is not one written without a name', () => {
    const text = [
      '// graph: reader',
      "// (:Option {name: 'In a comment'})",
      "MATCH (:Option {id: 'x'}),",
      "(:Option {id: 'y'})",
      'INSERT (a:Option {name: \'A (:Option {name: "inside"})\'})',
    ].join('\n');
    assert.deepEqual(gapsOf(text).problems, []);
  });

  test('the text is kept as it is: its name is only suggested, and withNames puts it in a copy for reading', () => {
    const text = HEAD + "(:Option {name: 'Large reader'})";
    const { named } = gapsOf(text);
    assert.equal(withNames(text, named), HEAD + "(large_reader:Option {name: 'Large reader'})");
    assert.equal(
      withNames(text.replace('(:Option {name', '                  {name'), named),
      text.replace('(:Option {name', '                  {name'),
      'a ( that is no longer there takes no name',
    );
  });
});

describe('a thing given a name but no text', () => {
  test('a hint on the name suggests the text from it, with a fix that adds {name: …} after its kind', () => {
    const { problems, named } = gapsOf('// graph: reader\n(large_reader:Option)');
    assert.deepEqual(problems, [
      {
        line: 2,
        severity: 'hint',
        message: "the thing large_reader has no text; suggested: 'Large reader'",
        fix: "add {name: 'Large reader'} to it, or write other text",
        insert: { line: 1, character: 20, text: " {name: 'Large reader'}" },
        fixTitle: "Add the text 'Large reader'",
        span: { line: 1, character: 1, end: 13 },
      },
    ]);
    assert.deepEqual(named, []);
  });

  test('where the thing already has braces, the property goes inside them', () => {
    const at = (written) => gapsOf(`// graph: reader\n${written}`).problems[0]?.insert;
    assert.deepEqual(at('(a_b:Option {price: 5})'), { line: 1, character: 13, text: "name: 'A b', " });
    assert.deepEqual(at('(a_b:Option { price: 5 })'), { line: 1, character: 13, text: "name: 'A b'," });
    assert.deepEqual(at('(a_b:Option {})'), { line: 1, character: 13, text: "name: 'A b'" });
  });

  test('a thing with a kind and no braces, and one with two kinds, take the property at the end of the kinds', () => {
    const at = (written) => gapsOf(`// graph: reader\n${written}`).problems[0]?.insert?.character;
    assert.equal(at('(a_b:Option:Extra )'), 17);
    assert.equal(at('(a_b)-[:R]->(c_d:Option)'), 23);
  });

  test('a thing that has text, is only named again, is found by MATCH, is part of a schema, or has a name of another type is left alone', () => {
    const text = [
      '// graph: reader',
      "(a:T {label: 'A'}), (b:T {text: 'B'}), (c:T {title: 'C'}),",
      '(a)-[:R]->(b),',
      "(s:ElementType {kind: 'node', other: 1}),",
      '(n:T {name: 5})',
    ].join('\n');
    assert.deepEqual(gapsOf(text).problems, []);
  });
});

describe('a thing given a name but no text, and what else says it has some', () => {
  test('a thing given its text by a SET, in its block or in another, has it', () => {
    assert.deepEqual(gapsOf("// graph: reader\n(a:T)\nSET a.name = 'Alpha'").problems, []);
    const blocks = [
      graphOf('// graph: reader\n(a:T)'),
      graphOf("// graph: reader\nMATCH (a:T {id: 'a'})\nSET a.title = 'Alpha'"),
    ];
    assert.deepEqual(nameGaps(blocks)[0].problems, []);
    assert.equal(
      gapsOf('// graph: reader\n(a:T)\nSET a.price = 5').problems.length,
      1,
      'a SET of something else is no text',
    );
  });

  test('a thing written again with its text, in another path or block of the graph, has it', () => {
    const again = "// graph: reader\n(a:T),\n(b:T)-[:R]->(a {name: 'Alpha'})";
    assert.deepEqual(
      gapsOf(again).problems.map((p) => p.line),
      [3],
    );
    const blocks = [graphOf('// graph: reader\n(a:T)'), graphOf("// graph: reader\n(a:T {name: 'Alpha'})")];
    assert.deepEqual(nameGaps(blocks)[0].problems, []);
  });

  test('the fix writes the key the kind’s other things use for their text: title for a Question, else name', () => {
    const lines = ["(q1:Question {title: 'One'}),", "(q2:Question {title: 'Two'}),", '(q3:Question),', '(o_1:Option)'];
    const { problems } = gapsOf(['// graph: reader', ...lines].join('\n'));
    assert.deepEqual(
      problems.map((p) => p.insert.text),
      [" {title: 'Q3'}", " {name: 'O 1'}"],
    );
    assert.equal(problems[0].fixTitle, "Add the text 'Q3'");
    assert.equal(problems[0].fix, "add {title: 'Q3'} to it, or write other text");
  });

  test('the most used key wins, across the blocks of the graph, and a tie goes to the first of name, title, text, label', () => {
    const blocks = [
      graphOf(
        "// graph: reader\n(q1:Question {text: 'One'}),\n(q2:Question {text: 'Two'}),\n(q3:Question {name: 'Three'})",
      ),
      graphOf('// graph: reader\n(q4:Question)'),
      graphOf("// graph: reader\n(t1:Tie {title: 'One'}),\n(t2:Tie {label: 'Two'}),\n(t3:Tie)"),
    ];
    const gaps = nameGaps(blocks);
    assert.equal(gaps[1].problems[0].insert.text, " {text: 'Q4'}");
    assert.equal(gaps[2].problems[0].insert.text, " {title: 'T3'}");
  });
});

describe('read with the suggestions shown', () => {
  test('a thing without a name is drawn as if it had the one suggested, the rest of the graph untouched, and the note not changed', () => {
    const text = HEAD + "(:Option {name: 'Large reader'}),\n(small_reader)-[:ANSWERS]->(question)";
    const r = readNote([text]);
    assert.equal(r.problems.filter((p) => /has no name/.test(p.message)).length, 1);
    const [p] = r.problems;
    assert.equal(p?.graph, 'reader');
    assert.equal(p?.block, 0);
    assert.equal(p?.line, 4);
    assert.equal(p?.severity, 'warning');
    assert.deepEqual(
      r.graphs.get('reader').boxes.map((b) => b.key),
      ['question', 'small_reader', 'large_reader'],
    );
    assert.deepEqual(r.texts, [text]);
  });

  test('a path with an unnamed end still draws its other end and the link', () => {
    const text = HEAD + "(small_reader)-[:ANSWERS]->(:Option {name: 'Large reader'})";
    const d = readNote([text]).graphs.get('reader');
    assert.deepEqual(
      d.links.map((l) => [l.from, l.to]),
      [['small_reader', 'large_reader']],
    );
  });

  test('a thing with a name and no text is drawn by its name, with its hint', () => {
    const r = readNote(['// graph: reader\n(large_reader:Option)']);
    assert.deepEqual(r.graphs.get('reader').boxes, [{ key: 'large_reader', kind: 'Option', text: 'large_reader' }]);
    assert.equal(r.problems.length, 1);
    assert.equal(r.problems[0]?.severity, 'hint');
    assert.equal(r.problems[0]?.message, "the thing large_reader has no text; suggested: 'Large reader'");
  });

  test('a graph written with names and texts has none of these problems', () => {
    const r = readNote([HEAD + "(large_reader:Option {name: 'Large reader'})"]);
    assert.deepEqual(r.problems, []);
  });

  test('a suggested name is taken by a thing in a later block of the same graph', () => {
    const r = readNote([
      "// graph: reader\n(:Option {name: 'Large reader'})",
      "// graph: reader\n(large_reader:Option {name: 'Another'})",
    ]);
    assert.equal(r.problems[0]?.message, 'this thing has no name; suggested: large_reader_2');
    assert.deepEqual([...r.graphs.get('reader').boxes.map((b) => b.key)].sort(), ['large_reader', 'large_reader_2']);
  });
});
