// What a note's graph blocks draw (spec §3): the boxes and links of each graph, as graph-spec-draw.py chooses them, and
// a graph with problems still drawn — what can be read is drawn, and the rest is listed as problems.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { gqlBlocks, readNote } from '../src/drawing.ts';

const fence = (body, info = 'gql') => '```' + info + '\n' + body + '\n```';

const QUESTION = `// graph: reader · SOURCE
(reader_question:Question {
    title: 'Which device should I read long PDFs on?'}),
(large_reader:Option {name: 'Large e-ink reader'}),
(tablet:Option       {name: 'Keep using the tablet'}),
(large_reader)-[:ANSWERS]->(reader_question),
(tablet)-[:ANSWERS]->(reader_question)`;

const REASONS = `// graph: reader · SOURCE
(easy_on_eyes:Reason {title: 'E-ink is easier on the eyes'}),
(easy_on_eyes)-[:FAVOURS]->(large_reader),
(easy_on_eyes)-[:COUNTS_AGAINST]->(tablet)`;

const SCHEMA = `// graph: reader · SOURCE
(reader_schema:GraphMeta {graph: 'reader', schema: 'reader@1'}),
(kind_option:Meta:ElementType {name: 'Option', kind: 'node', origin: 'source'}),
(kind_question:Meta:ElementType {name: 'Question', kind: 'node', origin: 'source'}),
(kind_reason:Meta:ElementType {name: 'Reason', kind: 'node', origin: 'source'}),
(link_answers:Meta:ElementType {name: 'ANSWERS', kind: 'edge', origin: 'source', reading: 'answers', reverse_name: 'answered by'}),
(link_favours:Meta:ElementType {name: 'FAVOURS', kind: 'edge', origin: 'source', reading: 'favours', reverse_name: 'favoured by'}),
(link_against:Meta:ElementType {name: 'COUNTS_AGAINST', kind: 'edge', origin: 'source', reading: 'counts against', reverse_name: 'is counted against by'})`;

describe('finding the graph blocks in a note', () => {
  test('each gql fence is a block, with the note line its fence opens on', () => {
    const note = [
      '# A note',
      '',
      fence('// graph: a\n(x:Thing)'),
      'text',
      '~~~~gql',
      '// graph: b',
      '(y:Thing)',
      '~~~~',
      fence('print(1)', 'python'),
    ].join('\n');
    assert.deepEqual(gqlBlocks(note), [
      { text: '// graph: a\n(x:Thing)', line: 3 },
      { text: '// graph: b\n(y:Thing)', line: 8 },
    ]);
  });

  test('a fence left open runs to the end of the note, as Markdown reads it', () => {
    assert.deepEqual(gqlBlocks('```gql\n// graph: a\n(x:Thing)'), [{ text: '// graph: a\n(x:Thing)', line: 1 }]);
  });

  test('a closing fence must be as long as the opening one, and of the same character', () => {
    assert.deepEqual(gqlBlocks('````gql\n(a)\n```\n~~~~\n(b)\n````'), [{ text: '(a)\n```\n~~~~\n(b)', line: 1 }]);
  });
});

describe('what a graph draws', () => {
  test('boxes in the order they were written, each with its kinds and its text', () => {
    const { graphs, problems } = readNote([QUESTION]);
    assert.deepEqual(problems, []);
    assert.deepEqual(graphs.get('reader').boxes, [
      { key: 'reader_question', kind: 'Question', text: 'Which device should I read long PDFs on?' },
      { key: 'large_reader', kind: 'Option', text: 'Large e-ink reader' },
      { key: 'tablet', kind: 'Option', text: 'Keep using the tablet' },
    ]);
  });

  test('the text is the name, else the title, the text or the label, else the id', () => {
    const block = `// graph: g
(a:T {name: 'by name', title: 'not this'}), (b:T {title: 'by title', text: 'not this'}), (c:T {text: 'by text'}),
(d:T {label: 'by label'}), (e:T {name: ''}), (f:T {name: 3})`;
    assert.deepEqual(
      readNote([block])
        .graphs.get('g')
        .boxes.map((b) => b.text),
      ['by name', 'by title', 'by text', 'by label', 'e', 'f'],
    );
  });

  test('a thing with several kinds shows them sorted, joined by a dot', () => {
    assert.equal(
      readNote(['// graph: g\n(a:Zeta:Alpha {name: "x"})'.replace(/"/g, "'")]).graphs.get('g').boxes[0].kind,
      'Alpha · Zeta',
    );
  });

  test('links read in the words of the schema, even one written later in the note', () => {
    const { graphs } = readNote([QUESTION, REASONS, SCHEMA]);
    assert.deepEqual(graphs.get('reader').links, [
      { from: 'large_reader', type: 'ANSWERS', reading: 'answers', to: 'reader_question' },
      { from: 'tablet', type: 'ANSWERS', reading: 'answers', to: 'reader_question' },
      { from: 'easy_on_eyes', type: 'FAVOURS', reading: 'favours', to: 'large_reader' },
      { from: 'easy_on_eyes', type: 'COUNTS_AGAINST', reading: 'counts against', to: 'tablet' },
    ]);
  });

  test('a draft reads a link in its type’s own words', () => {
    const { graphs } = readNote([QUESTION, REASONS]);
    assert.deepEqual(
      graphs.get('reader').links.map((l) => l.reading),
      ['answers', 'answers', 'favours', 'counts against'],
    );
  });

  test('the schema’s own nodes are not drawn', () => {
    const { graphs } = readNote([QUESTION, SCHEMA]);
    assert.deepEqual(
      graphs.get('reader').boxes.map((b) => b.key),
      ['reader_question', 'large_reader', 'tablet'],
    );
  });

  test('a block draws the graph as built by the blocks up to it, so a note can grow its graph in steps', () => {
    const step1 = readNote([QUESTION, REASONS], 0).graphs.get('reader');
    assert.equal(step1.boxes.length, 3);
    assert.equal(readNote([QUESTION, REASONS], 1).graphs.get('reader').boxes.length, 4);
  });

  test('queries, excerpts, change sets and blocks with no graph line are not data, and are not drawn', () => {
    const blocks = [
      '// graph: g · QUERY\nMATCH (n) RETURN n',
      '// excerpt\n(a:T)',
      '// graph: g · excerpt — an example\n(a:T)',
      '(a:T)',
    ];
    const { graphs, problems } = readNote(blocks);
    assert.equal(graphs.size, 0);
    assert.deepEqual(problems, []);
  });

  test('several graphs in one note are drawn apart', () => {
    const { graphs } = readNote(['// graph: one\n(a:T)', '// graph: two\n(b:T)']);
    assert.deepEqual([...graphs.keys()], ['one', 'two']);
  });
});

describe('a graph with problems is still drawn', () => {
  test('a path that cannot be read is left out, and the rest of its block is drawn', () => {
    const block = `// graph: g
(a:T {name: 'A'}),
(b:T {name: 'B' oops}),
(c:T {name: 'C'}),
(a)-[:R]->(c)`;
    const { graphs, problems } = readNote([block]);
    assert.deepEqual(
      graphs.get('g').boxes.map((b) => b.key),
      ['a', 'c'],
    );
    assert.equal(graphs.get('g').links.length, 1);
    assert.equal(problems.length, 1);
    assert.deepEqual({ block: problems[0].block, line: problems[0].line }, { block: 0, line: 3 });
    assert.ok(problems[0].message && problems[0].fix);
  });

  test('a link to a thing that is not in the graph is left out and listed, with its line', () => {
    const block = '// graph: g\n(a:T),\n(b:T),\n(a)-[:R]->(nowhere),\n(a)-[:R]->(b)';
    const { graphs, problems } = readNote([block]);
    assert.deepEqual(
      graphs.get('g').links.map((l) => l.to),
      ['b'],
    );
    assert.equal(problems.length, 1);
    assert.equal(problems[0].line, 4);
    assert.match(problems[0].message, /nowhere/);
  });

  test('a block whose graph line is wrong is listed, and the other blocks are drawn', () => {
    const { graphs, problems } = readNote(['// graph: not-one-word\n(a:T)', '// graph: g\n(b:T)']);
    assert.deepEqual([...graphs.keys()], ['g']);
    assert.deepEqual(
      problems.map((p) => [p.block, p.line]),
      [[0, 1]],
    );
  });

  test('every bad path in a block is listed, each once', () => {
    const block = '// graph: g\n(a:T {x: }),\n(b:T),\n(c:T {y: }),\n(d:T)';
    const { graphs, problems } = readNote([block]);
    assert.deepEqual(
      graphs.get('g').boxes.map((b) => b.key),
      ['b', 'd'],
    );
    assert.deepEqual(
      problems.map((p) => p.line),
      [2, 4],
    );
  });

  test('a problem in a block after the one drawn does not hide it', () => {
    const { graphs, problems } = readNote(['// graph: g\n(a:T)', '// graph: g\n(b:T {oops'], 0);
    assert.equal(graphs.get('g').boxes.length, 1);
    assert.deepEqual(problems, []);
  });

  test('a comma inside a string or a property map does not split a path', () => {
    const block = "// graph: g\n(a:T {name: 'one, two', note: 'it\\'s, so'}),\n(b:T {bad: }),\n(c:T)";
    const { graphs } = readNote([block]);
    assert.deepEqual(
      graphs.get('g').boxes.map((b) => [b.key, b.text]),
      [
        ['a', 'one, two'],
        ['c', 'c'],
      ],
    );
  });
});

describe('which blocks are graphs', () => {
  test('a data block with a graph line draws its graph; anything else is code', async () => {
    const { graphOfBlock } = await import('../src/drawing.ts');
    assert.equal(graphOfBlock('// graph: reader · SOURCE\n(a:T)'), 'reader');
    assert.equal(graphOfBlock('\n\n// graph: g\n(a:T)'), 'g');
    for (const code of [
      '// graph: g · QUERY\nMATCH (n) RETURN n',
      '// graph: s · SCHEMA s@1\n(a:T)',
      '// graph: g · excerpt\n(a:T)',
      '// graph: g · CHANGE SET c1 · against 0123456789abcdef · by ann\n(a:T)',
      'MATCH (n) RETURN n',
      '',
      '// graph: not-one-word\n(a)',
    ]) {
      assert.equal(graphOfBlock(code), null, code);
    }
  });
});

describe('a missing comma', () => {
  const block = "// graph: g\n(a:T {name: 'A'}),\n(b:T {name: 'B'})\n(c:T {name: 'C'}),\n(a)-[:R]->(b)";

  test('a line break between two complete patterns is read as the comma: everything is drawn', () => {
    const { graphs } = readNote([block]);
    assert.deepEqual(
      graphs.get('g').boxes.map((b) => b.key),
      ['a', 'b', 'c'],
    );
    assert.deepEqual(
      graphs.get('g').links.map((l) => [l.from, l.to]),
      [['a', 'b']],
    );
    assert.deepEqual(graphs.get('g').estimates, []);
  });

  test('it is a warning on the line missing the comma, whose fix adds it', () => {
    const { problems } = readNote([block]);
    assert.equal(problems.length, 1);
    const [p] = problems;
    assert.deepEqual([p.line, p.severity], [3, 'warning']);
    assert.equal(p.message, 'a comma is missing at the end of this line; it is read as if it were there');
    assert.equal(p.fix, 'add a comma at the end of the line');
    assert.deepEqual(
      p.insert,
      { line: 2, character: 17, text: ',' },
      'the edit that adds it: 0-based line and character in the block',
    );
  });

  test('when the next line is not otherwise valid, it is left out, and the problem still says the comma is missing', () => {
    const broken = "// graph: g\n(a:T {name: 'A'}),\n(b:T {name: 'B'})\n(c:T {name: }),\n(a)-[:R]->(b)";
    const { graphs, problems } = readNote([broken]);
    assert.deepEqual(
      graphs.get('g').boxes.map((b) => b.key),
      ['a', 'b'],
    );
    assert.deepEqual(
      graphs.get('g').links.map((l) => [l.from, l.to]),
      [['a', 'b']],
    );
    assert.ok(problems.some((p) => p.line === 4 && p.severity === 'error'));
  });
});

describe('a relationship type written without its colon', () => {
  // req:3.bare-link-type: read as the graph's one type of that name, ignoring case, and reported with a fix
  const FIRST = "// graph: g\n(r:Reason {title: 'Sun'}),\n(o:Option {name: 'Coast'}),\n(r)-[:FAVOURS]->(o)";
  const BARE = "// graph: g\n(s:Reason {title: 'Quiet'}),\n(s)-[favours]->(o)";

  test('is drawn as that type, with a warning whose fix writes the colon, as the graph spells the type', () => {
    const r = readNote([FIRST, BARE]);
    assert.deepEqual(
      r.graphs.get('g').links.map((l) => l.type),
      ['FAVOURS', 'FAVOURS'],
    );
    assert.deepEqual(r.problems, [
      {
        graph: 'g',
        block: 1,
        line: 3,
        severity: 'warning',
        message: '[favours] has no colon; it is read as the relationship type FAVOURS',
        fix: 'write it with its colon: [:FAVOURS]',
        replace: { written: 'favours', with: [':FAVOURS'] },
        fixTitle: 'Write the colon: [:FAVOURS]',
        span: { line: 2, character: 5, end: 12 },
      },
    ]);
  });

  test('the fix covers only the name: with spaces in the brackets, after the same words in a string, or twice on a line', () => {
    const spans = (block) => readNote([FIRST, block]).problems.map((p) => p.span);
    assert.deepEqual(spans("// graph: g\n(s:Reason {title: 'Quiet'}),\n(s)-[ favours ]->(o)"), [
      { line: 2, character: 6, end: 13 },
    ]);
    assert.deepEqual(spans("// graph: g\n(s:Reason {title: 'see [favours'})-[favours]->(o)"), [
      { line: 1, character: 36, end: 43 },
    ]);
    assert.deepEqual(spans("// graph: g\n(s:Reason {title: 'Quiet'}),\n(s)-[favours]->(o), (s)-[favours]->(r)"), [
      { line: 2, character: 5, end: 12 },
      { line: 2, character: 25, end: 32 },
    ]);
  });

  test('a first use is an error: it is not drawn, and says to write the colon', () => {
    const r = readNote([BARE.replace('(o)', "(o:Option {name: 'Coast'})")]);
    assert.equal(r.problems[0]?.severity, 'error');
    assert.match(
      r.problems[0]?.message ?? '',
      /\[favours\] has no colon, and graph g has no relationship type called favours/,
    );
  });
});

describe('a schema whose types its GraphMeta does not declare', () => {
  // graph spec model §5: each ElementType is linked from the GraphMeta by DECLARES. A graph locked by an earlier build
  // has none: it is told so, with a fix that adds them.
  const DATA = "// graph: g\n(a:Book {title: 'A'}),\n(p:Person {name: 'P'})";
  const OLD = [
    '// graph: g',
    "(g_schema:GraphMeta {graph: 'g', schema: 'g@1'}),",
    "(kind_book:Meta:ElementType {name: 'Book', kind: 'node', origin: 'source'}),",
    "(kind_person:Meta:ElementType {name: 'Person', kind: 'node', origin: 'source'})",
  ].join('\n');

  test('is a warning on the first type it leaves out, whose fix adds every DECLARES missing from that block', () => {
    const r = readNote([DATA, OLD]);
    assert.deepEqual(r.problems, [
      {
        graph: 'g',
        block: 1,
        line: 3,
        severity: 'warning',
        message: 'the schema does not declare Book and Person: its GraphMeta must DECLARE each type (§5)',
        fix: 'add a DECLARES link from g_schema to each',
        insert: {
          line: 3,
          character: OLD.split('\n')[3].length,
          text: ',\n(g_schema)-[:DECLARES]->(kind_book),\n(g_schema)-[:DECLARES]->(kind_person)',
        },
        fixTitle: 'Declare each type',
      },
    ]);
    const fixed = OLD + ',\n(g_schema)-[:DECLARES]->(kind_book),\n(g_schema)-[:DECLARES]->(kind_person)';
    assert.deepEqual(readNote([DATA, fixed]).problems, []);
  });

  test('with no GraphMeta at all, the fix writes one too', () => {
    const none = OLD.replace("(g_schema:GraphMeta {graph: 'g', schema: 'g@1'}),\n", '');
    const [p] = readNote([DATA, none]).problems;
    assert.equal(p.message, 'the schema has no GraphMeta to declare Book and Person: each type must be declared (§5)');
    assert.equal(
      p.insert.text,
      ",\n(g_schema:GraphMeta {graph: 'g', schema: 'g@1'}),\n(g_schema)-[:DECLARES]->(kind_book),\n(g_schema)-[:DECLARES]->(kind_person)",
    );
    const fixed = none + p.insert.text;
    assert.deepEqual(readNote([DATA, fixed]).problems, []);
  });

  test('a draft, or a schema that declares each type, has no such warning', () => {
    assert.deepEqual(readNote([DATA]).problems, []);
  });
});
