// The plain-English check of every document and code comment (spec §41, plain_docs_auto). Written for readers with
// ADHD: short sentences, short paragraphs, headings to scan by, and no filler words. Misses that were there when the
// check came in are counted in quality/plain-docs.json, a file at a time. A count may fall, never rise. A file the
// record does not list must have none. Scoring: scripts/plain-docs.mjs.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  DOC_LIMITS,
  blocksOf,
  commentMisses,
  commentsOf,
  documentMisses,
  fillerIn,
  lowered,
  overRecord,
  projectMisses,
  sentencesIn,
} from '../scripts/plain-docs.mjs';
import { ROOT, read } from './repository/repo.js';

const RECORD = JSON.parse(read('quality/plain-docs.json'));
const long = (n) => `${Array.from({ length: n }, (_, i) => `w${i}`).join(' ')}.`;

describe('the check itself', () => {
  test('finds a sentence over 25 words, and lets one of 25 through', () => {
    assert.equal(documentMisses(long(DOC_LIMITS.sentenceWords)).length, 0);
    assert.match(documentMisses(long(26))[0].what, /a sentence of 26 words, over 25/);
  });

  test('finds a paragraph over 80 words, even when its sentences are short', () => {
    const para = Array.from({ length: 9 }, () => long(10)).join(' ');
    assert.match(
      documentMisses(para)
        .map((m) => m.what)
        .join(),
      /a paragraph of 90 words, over 80/,
    );
  });

  test('asks for a heading after 400 words, once for each stretch', () => {
    const half = Array.from({ length: 12 }, () => long(20)).join('\n\n');
    const misses = documentMisses(`# Page\n\n${half}\n\n${half}`).filter((m) => /no heading/.test(m.what));
    assert.equal(misses.length, 1);
    assert.equal(documentMisses(`# Page\n\n${half}\n\n## Part\n\n${half}`).length, 0);
  });

  test('names filler words and what to write instead, as whole words only', () => {
    assert.deepEqual(fillerIn('Use it, e.g. here, in order to win'), ['e.g.', 'in order to']);
    assert.deepEqual(fillerIn('A viaduct is not filler'), []);
    assert.match(documentMisses('Simply press it.')[0].what, /“simply”: write “leave it out”/);
  });

  test('a reader’s page must read at grade 9 or lower; other pages need not', () => {
    const hard =
      'Notwithstanding the aforementioned considerations, the configuration necessitates comprehensive reconsideration.';
    assert.ok(documentMisses(hard, { reader: true }).some((m) => /grade/.test(m.what)));
    assert.ok(!documentMisses(hard).some((m) => /grade/.test(m.what)));
  });

  test('leaves out code, tables, comments and addresses, and counts inline code as one word', () => {
    const page = [
      '```js',
      long(40),
      '```',
      '| a | b |',
      `| ${long(40)} | x |`,
      `<!-- ${long(40)} -->`,
      'See `a very long piece of inline code with many words in it` at https://example.com/a/b/c today.',
    ].join('\n');
    assert.deepEqual(documentMisses(page), []);
    assert.deepEqual(
      blocksOf(page).map((b) => b.text),
      ['See code at today.'],
    );
  });

  test('a list item is its own paragraph, with its own line', () => {
    const blocks = blocksOf('Intro line.\n\n- one\n- two\n  goes on\n');
    assert.deepEqual(
      blocks.map((b) => [b.kind, b.line, b.text]),
      [
        ['paragraph', 1, 'Intro line.'],
        ['item', 3, 'one'],
        ['item', 4, 'two goes on'],
      ],
    );
  });

  test('a sentence runs across line breaks; a full stop and a capital end it', () => {
    assert.deepEqual(sentencesIn('One goes\non here. Two ends: Three starts'), [
      'One goes\non here.',
      'Two ends:',
      'Three starts',
    ]);
  });

  test('reads whole-line comments in JavaScript, TypeScript, CSS and Python, joining a run into one', () => {
    const js = ['// One sentence', '// goes on.', 'const a = 1; // a short note', '/**', ' * A block.', ' */'].join(
      '\n',
    );
    assert.deepEqual(
      commentsOf(js, 'a.ts').map((c) => [c.line, c.text]),
      [
        [1, 'One sentence goes on.'],
        [4, 'A block.'],
      ],
    );
    assert.deepEqual(
      commentsOf('# A Python note.\nx = 1\n', 'a.py').map((c) => c.text),
      ['A Python note.'],
    );
    assert.deepEqual(commentsOf('// eslint-disable-next-line no-console\n', 'a.js'), []);
  });

  test('a comment keeps to 25 words a sentence and uses no filler', () => {
    assert.deepEqual(commentMisses(`// ${long(25)}`, 'a.js'), []);
    assert.equal(commentMisses(`// ${long(26)}`, 'a.js').length, 1);
    assert.match(commentMisses('// Done via the queue.', 'a.js')[0].what, /“via”: write “through”/);
  });

  test('a count may fall but never rise, and a file not recorded must have none', () => {
    const misses = { 'a.md': [1, 2], 'b.js': [1], 'c.js': [1, 2, 3] };
    const over = overRecord(misses, { 'a.md': 2, 'c.js': 2 });
    assert.deepEqual(
      over.map((o) => [o.file, o.count, o.recorded]),
      [
        ['b.js', 1, 0],
        ['c.js', 3, 2],
      ],
    );
    assert.deepEqual(lowered({ 'a.md': [1] }, { 'a.md': 2, 'gone.js': 4 }), { 'a.md': 1 });
    assert.deepEqual(lowered({ 'a.md': [1, 2, 3] }, { 'a.md': 2 }), { 'a.md': 2 }, 'never raised');
  });
});

describe('the project’s own documents and comments', () => {
  const misses = projectMisses(ROOT);

  test('no file has more misses than its record allows', () => {
    const over = overRecord(misses, RECORD.counts).map(
      (o) =>
        `${o.file}: ${o.count} misses, over the ${o.recorded} recorded. ` +
        o.misses
          .slice(0, 5)
          .map((m) => `line ${m.line}: ${m.what}`)
          .join(' · '),
    );
    assert.deepEqual(over, []);
  });

  test('the reader pages, the wiki and the community files have no misses at all', () => {
    const clean = /^(README|CODE_OF_CONDUCT|TRADEMARKS|AGENTS)\.md$|^wiki\//;
    assert.deepEqual(
      Object.keys(RECORD.counts).filter((f) => clean.test(f)),
      [],
    );
  });
});
