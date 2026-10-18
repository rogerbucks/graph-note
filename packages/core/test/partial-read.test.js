// Reading a block as far as it can be read (spec §3) never holds the page (spec §9, layout_contained), and reads exactly
// as before: a failed block is read again on its own, not after every block before it; each line is found from an index
// of the block's lines; and a part that cannot be read is left out as it always was — proved against the old reading,
// kept here as the oracle, on random and adversarial notes. Only past a budget of reading again, which the Python reader
// keeps alike, is the rest of a badly broken block left out at once.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import gs from '@thoughtknot/graph-spec';
import { readNote } from '../src/drawing.ts';
import { bareNames, items, lineAt, lineIndex, without } from '../src/block-items.ts';
import { graphOf } from '../src/blocks.ts';
import { withNames } from '../src/name-gaps.ts';
import { prepare, readBlocks, REREAD_BUDGET } from '../src/partial-read.ts';
import { readerWork } from './reader-work.js';

/**
 * The oracle: the reading as it was before (10 Oct 2026), every block read again from a fresh store after each failure,
 * with no budget. Kept only here, to hold the reading to it.
 */
function oracle(texts, shared) {
  const { clean, problems, skip, gaps } = prepare(texts);
  for (let attempt = 0; ; attempt++) {
    const store = new gs.Store();
    for (const s of shared) {
      try {
        store.apply(s);
      } catch {
        /* types nothing */
      }
    }
    let failed = null;
    const commas = [];
    for (let i = 0; i < clean.length && !failed; i++) {
      if (skip.has(i)) continue;
      const before = store.commas.length,
        bareBefore = store.bares.length;
      try {
        store.apply(withNames(clean[i] ?? '', gaps[i]?.named ?? []));
      } catch (error) {
        failed = { block: i, error };
      }
      for (const c of store.commas.slice(before)) {
        const code = (clean[i] ?? '').split('\n')[c.line - 1] ?? '';
        commas.push({
          graph: c.graph,
          block: i,
          line: c.line,
          severity: 'warning',
          message: 'a comma is missing at the end of this line; it is read as if it were there',
          fix: 'add a comma at the end of the line',
          insert: { line: c.line - 1, character: code.trimEnd().length, text: ',' },
        });
      }
      const names = bareNames(clean[i] ?? '');
      for (const [k, b] of store.bares.slice(bareBefore).entries())
        commas.push({
          graph: b.graph,
          block: i,
          line: b.line,
          severity: 'warning',
          message: `[${b.written}] has no colon; it is read as the relationship type ${b.type}`,
          fix: `write it with its colon: [:${b.type}]`,
          replace: { written: b.written, with: [`:${b.type}`] },
          fixTitle: `Write the colon: [:${b.type}]`,
          ...(names[k] ? { span: names[k] } : {}),
        });
    }
    if (!failed)
      return { store, problems: problems.concat(commas).sort((a, b) => a.block - b.block || a.line - b.line) };
    const { block, error } = failed,
      text = clean[block] ?? '';
    const pe = error instanceof gs.ProfileError ? error : null;
    const line = pe?.line ?? 1;
    const problem = {
      graph: graphOf(text),
      block,
      line,
      severity: 'error',
      message: pe?.msg ?? 'this could not be read',
      fix: pe?.fix ?? 'check the line against the guide to writing a graph note',
    };
    const all = items(text);
    const opened = all.findIndex((it) => lineAt(text, it.from) === line),
      prior = all[opened - 1];
    if (pe?.msg === "unexpected '('" && prior && prior.comma === -1 && text[prior.to - 1] === ')') {
      const at = text.slice(0, prior.to).split('\n'),
        lastLine = (at[at.length - 1] ?? '').trim();
      problem.message = `${pe.msg} — a comma is missing at the end of the line before`;
      problem.fix = `add a comma at the end of the line before, after ${lastLine}`;
      problem.insert = { line: at.length - 1, character: (at[at.length - 1] ?? '').length, text: ',' };
    }
    const touching = all.filter((it) => lineAt(text, it.from) <= line && line <= lineAt(text, it.to - 1));
    const before = all.filter((it) => lineAt(text, it.from) <= line).pop();
    const drop = touching.length ? touching : before ? [before] : [];
    if (!drop.length || attempt > texts.length + all.length * 2) {
      skip.add(block);
      problems.push(problem);
      continue;
    }
    let chosen = drop;
    if (drop.length > 1) {
      chosen = [
        drop.find((it) => {
          try {
            new gs.Store().apply(without(text, all, [it]));
            return true;
          } catch (e) {
            return !(e instanceof gs.ProfileError && e.line === line);
          }
        }) ?? drop[0],
      ];
    }
    clean[block] = without(text, all, chosen);
    problems.push({ ...problem, dropped: chosen.map((it) => text.slice(it.from, it.to)).join('\n') });
  }
}

/** What a store holds, to compare: each graph's nodes and edges, in order. */
const held = (store) =>
  JSON.stringify(
    Object.entries(store.graphs).map(([g, graph]) => [
      g,
      [...graph.nodes].map(([k, n]) => [k, [...n.labels], n.props]),
      graph.edges,
    ]),
  );

let seed = 20261010;
const rand = (n) => {
  seed = (seed * 1103515245 + 12345) >>> 0;
  return seed % n;
};
const pick = (xs) => xs[rand(xs.length)];

/** The parts a random block is made of: things written well and badly, links, SET, MATCH, comments, emoji, and junk. */
const PARTS = [
  (i) => `(t${i}:Thing {name: 'Thing ${i}'})`,
  (i) => `(t${i}:Thing:Extra {title: 'Title ${i} 🙂'})`,
  (i) => `(t${i}:Thing {name 'no colon ${i}'})`,
  (i) => `(:Thing {name: 'Unnamed ${i}'})`,
  (i) => `(t${i}:Thing)`,
  (i) => `(t${rand(i + 1)})-[:LINKS]->(t${rand(i + 1)})`,
  (i) => `(t${rand(i + 1)})-[links]->(t${rand(i + 1)})`,
  (i) => `(t${i % 3}:Thing {name: 'again'})`,
  () => `(nowhere)-[:LINKS]->(t0)`,
  (i) => `(t${i}:Thing {name: 'unclosed'}`,
  () => `)(`,
  (i) => `SET t${rand(i + 1)}.status = 'done'`,
  () => `SET ghost.status = 'x'`,
];

/** A random note of 1 to 3 blocks, of one or two graphs, with parts joined by commas, missing commas or line breaks. */
function randomNote() {
  const blocks = [];
  for (let b = 0, n = 1 + rand(3); b < n; b++) {
    const lines = [];
    let line = [];
    for (let i = 0, parts = 1 + rand(14); i < parts; i++) {
      line.push(pick(PARTS)(i + b * 20));
      if (rand(3) === 0) {
        lines.push(line.join(pick([', ', ' ', ',  '])) + pick([',', ',', '', ', // a comment']));
        line = [];
      }
    }
    if (line.length) lines.push(line.join(', '));
    const head = rand(4) === 0 ? "MATCH (t0:Thing {id: 't0'})\nINSERT " : '';
    blocks.push(`// graph: ${pick(['g', 'g', 'h'])}\n${head}${lines.join('\n')}`);
  }
  return blocks;
}

describe('the line of a character, from an index of the lines', () => {
  test('is the line lineAt gives, for every character, line break and end', () => {
    for (const text of ['', 'one', 'a\nb', '\n\nx\n', 'first\nsecond line\n\nfourth', 'é😀\nx']) {
      const at = lineIndex(text);
      for (let pos = 0; pos <= text.length + 1; pos++)
        assert.equal(at(pos), lineAt(text, pos), `${JSON.stringify(text)} @${pos}`);
    }
  });
});

describe('the same reading as before, only faster', () => {
  const same = (texts, shared = []) => {
    const now = readBlocks(texts, shared, Infinity),
      then = oracle(texts, shared);
    // the old reading named no departure from standard GQL, added after it for strictness (spec §21), and gave no
    // problem's code, added after it too (editor spec §42, problem_codes)
    const unnamed = (problems) => problems.map(({ departure: _, code: _code, ...p }) => p);
    assert.deepEqual(unnamed(now.problems), unnamed(then.problems), texts.join('\n---\n'));
    assert.equal(held(now.store), held(then.store), texts.join('\n---\n'));
    return now.problems.filter((p) => p.severity === 'error');
  };

  test('on 400 random notes, every problem and every thing read is what the old reading gave', () => {
    let broken = 0,
      many = 0;
    for (let n = 0; n < 400; n++) {
      const errors = same(randomNote());
      if (errors.length) broken++;
      if (errors.length >= 4) many++;
    }
    // the notes are hard enough to prove something: most have parts left out, many several
    assert.ok(broken > 250, `${broken} notes with parts left out`);
    assert.ok(many > 80, `${many} notes with four or more`);
  });

  test('on adversarial notes: every line broken, many parts on one line, a shared schema, a block left out whole', () => {
    const shared = [
      "// graph: s · SCHEMA s\n(k:Meta:ElementType {name: 'LINKS', kind: 'edge', reading: 'links'})",
      '// graph: bad · SCHEMA bad\n(',
    ];
    const things = (n, f) => Array.from({ length: n }, (_, i) => f(i));
    for (const texts of [
      [`// graph: g\n${things(60, (i) => `(t${i}:Thing {name 'x'}),`).join('\n')}`],
      [`// graph: g\n${things(40, (i) => `(t${i}:T {name${i % 7 ? ':' : ''} 'x'})`).join(', ')}`],
      [`// graph: g\n(a:T)\n(b:T)\n(c:T {name 'x'})\n(d:T)`, `// graph: g\n(a)-[:R]->(b), (zz)-[:R]->(a)`],
      [`// graph: g · schema s\n(a:T), (b:T), (a)-[links]->(b), (a)-[nope]->(b)`],
      [`// graph: g\n${things(30, (i) => (i % 2 ? `(t${i}:T)` : `)(`)).join(',\n')}`],
      [`// graph: g\n(a:T {name: 'é😀'}), (b:T {name 'é😀'}), (c:T)`, '// graph: q · QUERY\nMATCH (n) RETURN n'],
    ])
      same(texts, shared);
  });
});

/** A block of `n` things on their own lines, `broken` saying which are written with their colon missing. */
const block = (n, broken, text = (i) => `Thing number ${i}`) =>
  `// graph: g\n(ok:Thing {name: 'Readable'}),\n${Array.from({ length: n }, (_, i) => `(n${i}:Thing {name${broken(i) ? '' : ':'} '${text(i)}'}),`).join('\n')}`;

/**
 * Reads a broken block, and asserts it kept to the budget of reading again (spec §9, reading_contained). By the work,
 * which is what the budget holds: the reader handed the block once as written, then at most the budget's units again,
 * each read again and each trial charged its length, then once more, so no more than the budget and two of the block's
 * length; counted, so the same on every machine, under any load and under coverage. With controls, so a reader the
 * counter cannot see fails rather than passes: the broken block was seen read at least twice, once whole, and the
 * `mended` block is seen read whole. That nothing else grows unseen, the whole read costing under twice as many whole
 * reads of `mended` as the budget allows, is counted in instructions by the reading_limits benchmark
 * (scripts/benchmarks/reading-limits.mjs): a test asserts the work done, never the time taken (spec §12,
 * quality_ratchet, 12 Oct 2026).
 */
function inBudget(text, mended) {
  const work = readerWork(() => readNote([text]));
  assert.ok(work.calls >= 2, `the control: ${work.calls} reads seen, where a broken block is read at least twice`);
  assert.ok(work.longest >= text.length, `the control: the block as written, ${text.length} units, seen read whole`);
  assert.ok(
    readerWork(() => readNote([mended])).units >= mended.length,
    'the control: the mended block seen read whole',
  );
  assert.ok(
    work.units <= REREAD_BUDGET + 2 * text.length,
    `${work.units} units handed to the reader in ${work.calls} reads, over the budget and two reads of ${text.length}`,
  );
  return work.out;
}

describe('the worst cases under the size limits are read in time (spec §9: about half a second on a desktop)', () => {
  test('2,000 things, 1 in 40 missing a colon', () => {
    const r = inBudget(
      block(2000, (i) => i % 40 === 39),
      block(2000, () => false),
    );
    assert.ok(r.graphs.get('g').boxes.length > 1000);
  });

  // 9,000 things written without a name, each named in work linear in them, never in their square, and what the editor
  // reads back as each key is typed costing less than reading the note: both counted in instructions by the benchmarks
  // (scripts/benchmarks/naming.mjs and keystroke.mjs), on every release, as a test asserts the work done, never the
  // time taken (spec §12, quality_ratchet, 12 Oct 2026)

  test('6,000 things on one line, the last broken: the part at fault is looked for within the budget', () => {
    const line = Array.from({ length: 6000 }, (_, i) => `(n${i}:T {name${i === 5999 ? '' : ':'} 'x'})`).join(', ');
    const text = `// graph: g\n${line}`;
    inBudget(text, text.replace("{name '", "{name: '"));
  });

  test('nearly 512 kB with every line broken: past the budget the rest is left out at once, and said so', () => {
    const everyLine = () => true,
      longText = (i) => `Thing number ${i} of many`;
    const r = inBudget(
      block(9800, everyLine, longText),
      block(9800, () => false, longText),
    );
    assert.ok(
      r.graphs.get('g').boxes.some((b) => b.key === 'ok'),
      'what was read before is still drawn',
    );
    assert.ok(r.problems.some((p) => /left out from this line on/.test(p.message)));
  });
});

describe('the budget of reading again', () => {
  test('is four million UTF-16 units, the Python reader’s too', () => {
    assert.equal(REREAD_BUDGET, 4_000_000);
  });

  test('is held by counting what the reader is handed, and the count sees a small note read: a reader it missed would fail', () => {
    const small = "// graph: g\n(a:A {name: 'a'}), (b:B {name: 'b'}), (a)-[:R]->(b)";
    const work = readerWork(() => readNote([small]));
    assert.equal(work.out.graphs.get('g').boxes.length, 2);
    assert.ok(work.calls >= 1, 'a read is seen');
    assert.ok(work.longest >= small.length - '// graph: g\n'.length, 'the block seen whole');
  });

  test('a note of ordinary size, with dozens of problems, never comes near it: each part is left out alone', () => {
    const r = readNote([block(200, (i) => i % 5 === 0)]);
    assert.equal(r.problems.filter((p) => p.severity === 'error').length, 40);
    assert.equal(
      r.problems.some((p) => /left out from this line on/.test(p.message)),
      false,
    );
  });

  test('past it, the rest of the block from the failing line is left out, with the comma before it', () => {
    const text = block(6, (i) => i >= 2);
    const length = text.length;
    const { problems, store } = readBlocks([text], [], 2 * length);
    const errors = problems.filter((p) => p.severity === 'error');
    assert.equal(errors.length, 3, 'two parts left out alone, then the rest');
    assert.match(errors[2].message, /left out from this line on$/);
    assert.equal(errors[2].dropped.split('\n').length, 2, 'the last two parts');
    assert.deepEqual(
      [...store.graphs.g.nodes.values()].map((n) => n.props.id),
      ['ok', 'n0', 'n1'],
    );
  });
});
