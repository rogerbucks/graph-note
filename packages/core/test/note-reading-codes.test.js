// Editor spec §42, problem_codes: every problem the drawing reader finds in a note or its style graph carries a stable
// code. The graph spec reader's own problems keep its codes (problem-codes.json). What the core finds beyond them takes
// a code from src/drawing-problem-codes.json, whose numbering goes on from that table. The code is the diagnostic's
// code. A Problem without one does not typecheck.
// - The sources are scanned, so every code passed is in a table, and every code the core is given is passed.
// - Each code's words are in the catalogue, and in the file that passes it.
// - The notes of drawing-problem-cases.json give their codes. The Python drawing reader reads them too.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readNote } from '../src/drawing.ts';
import { readBlocks } from '../src/partial-read.ts';
import { readStyle } from '../src/style.ts';
import { diagnostics } from '../src/help.ts';
import { SOURCE_WORDS } from '../src/source-words.ts';

const json = (rel) => JSON.parse(readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8'));
const TABLE = json('../src/drawing-problem-codes.json');
const READER = json('../../graph-spec/src/reader/problem-codes.json');
const CASES = json('./drawing-problem-cases.json');
const SRC = fileURLToPath(new URL('../src/', import.meta.url));
const BY_CODE = new Map(TABLE.codes.map((c) => [c.code, c]));
const READER_CODES = new Set(READER.codes.map((c) => c.code));

const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : e.name.endsWith('.ts') ? [join(dir, e.name)] : [],
  );

/** Each core source file, and the codes it passes as literals. */
const SOURCES = walk(SRC).map((file) => {
  const text = readFileSync(file, 'utf8');
  return { file: file.slice(SRC.length), text, codes: [...text.matchAll(/'(GN\d{3})'/g)].map((m) => m[1]) };
});

/** The problems of a case: of its style graph where it names one, else of the note. */
const problemsOf = (c) => (c.style ? readStyle(c.blocks, c.style, readNote(c.blocks)) : readNote(c.blocks)).problems;

describe('editor spec §42, problem_codes: the drawing reader’s table', () => {
  test('every code is GN7 or GN8 and two digits, given once, apart from the reader’s, with its words and readers', () => {
    assert.match(TABLE.about, /never reused/);
    assert.equal(BY_CODE.size, TABLE.codes.length, 'no code given twice');
    for (const c of TABLE.codes) {
      assert.match(c.code, /^GN[78]\d\d$/);
      assert.ok(!READER_CODES.has(c.code), `${c.code} is the reader's too`);
      assert.ok(c.section === null || /^\d+$/.test(c.section), c.code);
      assert.ok(c.libraries.length && c.libraries.every((l) => l === 'core' || l === 'py'), c.code);
      assert.ok(c.words.length, c.code);
      for (const key of c.words) assert.equal(typeof SOURCE_WORDS[key], 'string', `${c.code}: ${key}`);
    }
  });
});

describe('editor spec §42, problem_codes: every code the core passes', () => {
  test('each is in the drawing reader’s table for the core, or is the graph spec reader’s', () => {
    const bad = SOURCES.flatMap((s) =>
      s.codes
        .filter((c) => !READER_CODES.has(c) && !BY_CODE.get(c)?.libraries.includes('core'))
        .map((c) => `${s.file} ${c}`),
    );
    assert.deepEqual(bad, []);
  });

  test('every code the table gives the core is passed, beside the words it is said with', () => {
    const wrong = TABLE.codes
      .filter((c) => c.libraries.includes('core'))
      .filter((c) => {
        const at = SOURCES.filter((s) => s.codes.includes(c.code));
        return !at.length || !c.words.some((key) => at.some((s) => s.text.includes(`'${key}'`)));
      })
      .map((c) => c.code);
    assert.deepEqual(wrong, []);
  });
});

describe('editor spec §42, problem_codes: each note gives its codes', () => {
  test('the cases cover many codes, each one a table gives', () => {
    for (const c of CASES.cases)
      for (const code of c.codes) assert.ok(BY_CODE.has(code) || READER_CODES.has(code), `${c.name}: ${code}`);
    assert.ok(new Set(CASES.cases.flatMap((c) => c.codes)).size >= 10);
  });

  test('every problem of every case carries a code, and the codes are the case’s', () => {
    const wrong = CASES.cases
      .map((c) => ({ c, got: problemsOf(c).map((p) => p.code) }))
      .filter(({ c, got }) => JSON.stringify(got) !== JSON.stringify(c.codes))
      .map(({ c, got }) => `${c.name}: ${got.join(' ')}`);
    assert.deepEqual(wrong, []);
  });

  test('a case the Python reader reads too gives the same codes from readBlocks, as it reads them', () => {
    const wrong = CASES.cases
      .filter((c) => c.readers.includes('py') && !c.style)
      .map((c) => ({ c, got: readBlocks(c.blocks, []).problems.map((p) => p.code) }))
      .filter(({ c, got }) => JSON.stringify(got) !== JSON.stringify(c.codes))
      .map(({ c, got }) => `${c.name}: ${got.join(' ')}`);
    assert.deepEqual(wrong, []);
  });

  test('the diagnostic gives the problem’s code', () => {
    const text = CASES.cases[0].blocks[0];
    const d = diagnostics(readNote([text]), 'g', 0, text, 'file:///note.md');
    assert.deepEqual(
      d.map((x) => x.code),
      ['GN701'],
    );
  });
});
