// Estimated links (spec §3): a near miss of a name or a relationship type is drawn as a guess — dashed, marked with a
// warning in words — never written to the note, never guessed between equals, and explained in a sentence when tapped.
// Only near misses are estimated, never links nobody wrote.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readNote } from '../src/drawing.ts';
import { drawingSource, layoutSource } from '../src/layout.ts';

const BASE = `// graph: reader
(question:Question {title: 'Which device?'}),
(small_reader:Option {name: 'Small reader'}),
(large_reader:Option {name: 'Large reader'}),
(eyes:Reason {title: 'Easy on the eyes'}),
(price:Reason {title: 'Costs less'}),
(small_reader)-[:ANSWERS]->(question),
(large_reader)-[:ANSWERS]->(question),
(eyes)-[:FAVOURS]->(large_reader),
(price)-[:FAVOURS]->(small_reader)`;

const read = (extra) => readNote([BASE + extra]);
const g = (r) => r.graphs.get('reader');

describe('a near miss of a name', () => {
  test('a link to a thing one or two letters from exactly one thing is drawn to it, as an estimate', () => {
    const r = read(',\n(eyes)-[:FAVOURS]->(small_reeder)');
    assert.deepEqual(g(r).estimates, [
      {
        kind: 'name',
        block: 0,
        line: 11,
        from: 'eyes',
        type: 'FAVOURS',
        reading: 'favours',
        to: 'small_reader',
        written: 'small_reeder',
        taken: 'small_reader',
        explain:
          'Line 11 links to small_reeder, which is not in graph reader. It was taken to mean small_reader, one letter away. To fix it, change small_reeder to small_reader.',
      },
    ]);
  });

  test('either end may be the near miss, and two letters away still counts', () => {
    const r = read(',\n(eyez)-[:FAVOURS]->(smal_readr)');
    const [e] = g(r).estimates;
    assert.deepEqual([e.from, e.to], ['eyes', 'small_reader']);
    assert.equal(
      e.explain,
      'Line 11 links to eyez and smal_readr, which are not in graph reader. They were taken to mean eyes, one letter away, and small_reader, two letters away. To fix it, change eyez to eyes and smal_readr to small_reader.',
    );
  });

  test('the estimate is listed as a problem too, with its fix', () => {
    const r = read(',\n(eyes)-[:FAVOURS]->(small_reeder)');
    assert.equal(r.problems.length, 1);
    assert.equal(r.problems[0].severity, 'warning');
    assert.match(r.problems[0].message, /small_reeder.*not in graph reader.*estimate of small_reader/);
    assert.equal(r.problems[0].fix, 'change small_reeder to small_reader');
  });

  test('where two things are equally close there is no guess: nothing is drawn, and the problem lists them', () => {
    const r = readNote([
      BASE.replace('(eyes:Reason', "(large_readers:Option {name: 'x'}),\n(eyes:Reason") +
        ',\n(eyes)-[:FAVOURS]->(large_readerx)',
    ]);
    assert.deepEqual(g(r).estimates, []);
    const p = r.problems.find((x) => /large_readerx/.test(x.message));
    assert.match(p.message, /large_reader and large_readers are equally close/);
    assert.match(p.fix, /large_reader or large_readers/);
    assert.equal(p.severity, 'error');
  });

  test('of a nearer and a further match, the nearer is the estimate', () => {
    const r = readNote([
      BASE.replace('(eyes:Reason', "(small_rider:Option {name: 'x'}),\n(eyes:Reason") +
        ',\n(eyes)-[:FAVOURS]->(small_readr)',
    ]);
    assert.equal(g(r).estimates[0].to, 'small_reader');
  });

  test('a name three or more letters from everything is not estimated', () => {
    const r = read(',\n(eyes)-[:FAVOURS]->(tiny_tablet)');
    assert.deepEqual(g(r).estimates, []);
    assert.match(r.problems[0].message, /tiny_tablet/);
    assert.equal(r.problems[0].severity, 'error');
  });
});

describe('a near miss of a relationship type', () => {
  test('a type one or two letters from exactly one other type in the graph is drawn as that type, as an estimate', () => {
    const r = read(',\n(eyes)-[:FAVORS]->(small_reader)');
    const d = g(r);
    assert.deepEqual(
      d.estimates.map((e) => [e.kind, e.written, e.taken, e.reading, e.from, e.to]),
      [['type', 'FAVORS', 'FAVOURS', 'favours', 'eyes', 'small_reader']],
    );
    assert.match(
      d.estimates[0].explain,
      /^Line 11 uses the relationship FAVORS, which is not in graph reader\. It was taken to mean FAVOURS, one letter away\. To fix it, change FAVORS to FAVOURS\.$/,
    );
    assert.equal(r.problems[0].severity, 'warning');
  });

  test('in a draft, the type written less often is the near miss; written as often, there is no guess', () => {
    const once = read(',\n(eyes)-[:FAVORS]->(small_reader)');
    assert.equal(g(once).estimates[0].taken, 'FAVOURS');
    const equal = readNote([BASE.replace('(eyes)-[:FAVOURS]->(large_reader)', '(eyes)-[:FAVORS]->(large_reader)')]);
    assert.deepEqual(g(equal).estimates, []);
  });

  test('in a locked graph, a type its schema declares is never estimated, and one it does not declare is', () => {
    const schema = `// graph: reader
(t1:Meta:ElementType {name: 'ANSWERS', kind: 'edge', reading: 'answers'}),
(t2:Meta:ElementType {name: 'FAVOURS', kind: 'edge', reading: 'favours'}),
(t3:Meta:ElementType {name: 'FAVOURED', kind: 'edge', reading: 'is favoured'})`;
    const declared = readNote([BASE + ',\n(eyes)-[:FAVOURED]->(small_reader)', schema]);
    assert.deepEqual(g(declared).estimates, []);
    const undeclared = readNote([BASE + ',\n(eyes)-[:FAVOURZ]->(small_reader)', schema]);
    assert.deepEqual(
      g(undeclared).estimates.map((e) => e.taken),
      ['FAVOURS'],
    );
  });
});

describe('estimates are only ever guesses', () => {
  test('never written: the note’s text and the graph as read are unchanged', () => {
    const text = BASE + ',\n(eyes)-[:FAVOURS]->(small_reeder)';
    const r = readNote([text]);
    assert.equal(r.texts[0], text);
    assert.equal(r.world.reader.edges.length, 4, 'the graph holds only what was written');
    assert.ok(!g(r).links.some((l) => l.to === 'small_reader' && l.from === 'eyes'));
  });

  test('only near misses: a thing nothing links to is never linked by a guess', () => {
    const r = read(",\n(lonely:Reason {title: 'Nobody links here'})");
    assert.deepEqual(g(r).estimates, []);
  });

  test('a graph with no near misses lays out exactly as graph_svg.py would — the estimates add to the drawing, not the layout source', () => {
    const clean = readNote([BASE]);
    assert.equal(drawingSource(g(clean), 'LR'), layoutSource(g(clean), 'LR').source);
  });

  test('in the drawing an estimate is dashed and marked with a warning sign and the word "estimated"', () => {
    const r = read(',\n(eyes)-[:FAVOURS]->(small_reeder),\n(eyes)-[:FAVORS]->(question)');
    const src = drawingSource(g(r), 'LR');
    const dashed = src.split('\n').filter((l) => /style="dashed"/.test(l));
    assert.equal(dashed.length, 2);
    for (const l of dashed) assert.match(l, /label="⚠ favours \(estimated\)"/);
    assert.match(src, /"eyes" -> "small_reader"/);
    assert.doesNotMatch(
      layoutSource(g(r), 'LR').source,
      /"eyes" -> "small_reader"/,
      'what Python would draw is untouched',
    );
  });
});

describe('how near (decided 7 Oct 2026): one letter under eight characters, two from eight, ignoring case and underscores', () => {
  const graph = (ids, link) =>
    readNote([`// graph: g\n${ids.map((i) => `(${i}:T)`).join(',\n')},\n${link}`]).graphs.get('g');

  test('a name shorter than three characters is never estimated', () => {
    assert.deepEqual(graph(['a', 'c', 'abc'], '(abc)-[:R]->(b)').estimates, []);
    assert.deepEqual(graph(['ab', 'abc'], '(abc)-[:R]->(ac)').estimates, []);
  });

  test('a name of three characters may be estimated, one letter away', () => {
    assert.equal(graph(['cat', 'dog'], '(dog)-[:R]->(cot)').estimates[0]?.to, 'cat');
  });

  test('under eight characters, two letters away is too far', () => {
    assert.deepEqual(graph(['tablet', 'eyes'], '(eyes)-[:R]->(tbalet)').estimates, []);
  });

  test('from eight characters, two letters away is near', () => {
    assert.equal(graph(['large_reader', 'eyes'], '(eyes)-[:R]->(lrge_readr)').estimates[0]?.to, 'large_reader');
  });

  test('case and underscores do not count: a name differing only in them is estimated, and says so', () => {
    const [e] = graph(['large_reader', 'eyes'], '(eyes)-[:R]->(LargeReader)').estimates;
    assert.equal(e.to, 'large_reader');
    assert.match(e.explain, /taken to mean large_reader, which differs only in case or underscores\./);
  });

  test('the same rule holds for relationship types', () => {
    const d = readNote([
      `// graph: g\n(a:T),\n(b:T),\n(a)-[:FAVOURS]->(b),\n(b)-[:FAVOURS]->(a),\n(a)-[:FAVOURZZ]->(b)`,
    ]).graphs.get('g');
    assert.deepEqual(d.estimates, [], 'FAVOURZZ is seven letters from FAVOURS’ seven: two letters is too far');
    const e = readNote([
      `// graph: g\n(a:T),\n(b:T),\n(a)-[:FAVOURS]->(b),\n(b)-[:FAVOURS]->(a),\n(a)-[:favours]->(b)`,
    ]).graphs.get('g');
    assert.equal(e.estimates[0]?.taken, 'FAVOURS');
  });
});
