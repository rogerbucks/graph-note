// The device check notes. The device checklist (packages/obsidian/test/device-checklist.md) numbers every item. The
// test vault holds a note for each item after Before, in test-vault/Device checks/. Each note shows the case on a graph
// to try it on. This holds the two together, so a changed checklist fails here, loudly, until the notes follow it.
// It also holds:
// - each note's graph blocks to what the note says they read as, with the graph's own reader and checkers.
// - a view of a graph drawn FROM another note of the device checks put to that note's graph, as the plugin puts it.
// - the index to the notes it lists.
// Editor spec §3, tried first in a test vault.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { gqlBlocks, gqlSpans, styleOf } from '../packages/core/src/blocks.ts';
import { readNote } from '../packages/core/src/drawing.ts';
import { readStyle } from '../packages/core/src/style.ts';
import { viewsOf } from '../packages/core/src/views.ts';
import { parseView } from '../packages/core/src/view-profile.ts';
import { evaluate } from '../packages/core/src/view-evaluate.ts';
import { readSource, sourceFor } from '../packages/core/src/sources.ts';
import {
  CHECKLIST,
  CHECKLIST_URL,
  FOLDER,
  INDEX,
  LABELS,
  checklistSections,
  expectations,
  folderName,
  noteFiles,
  noted,
  partsOf,
  QUOTED,
  unescaped,
  withoutIds,
  withoutMarks,
  words,
} from './repository/device-checks.js';
import { testsForChanges } from '../scripts/changed-tests.mjs';
import { TEST_FILES, makeTestFiles, pathOf } from '../scripts/make-test-files.mjs';
import { repository } from './repository/scratch-repository.js';
import { ROOT, path, read, walk } from './repository/repo.js';

const gs = createRequire(import.meta.url)('@thoughtknot/graph-spec');
const sections = checklistSections();
const items = sections.flatMap((s) => s.items);
const wanted = noted(sections).flatMap((s) => s.items.map((item) => ({ item, folder: folderName(sections, s) })));
const stem = (file) => basename(file, '.md');
const numberOf = (file) => /^([A-Z]-\d\d) /.exec(stem(file))?.[1];
const notes = () => {
  const files = noteFiles();
  assert.ok(files.length > 0, `there are notes in ${FOLDER}`);
  return files.map((file) => ({ file, text: read(file) }));
};
/**
 * What a note may expect of its graph blocks, one `<!-- expect: … -->` line each:
 * - `clean`, or `problem "…"` for each problem.
 * - `hint "…"`.
 * - `check "…"` for a rule of the graph spec the checker fails.
 * - `refused "…"` for a view the profile refuses.
 * - `view-empty` for one that matches nothing.
 * - `parked N` and `overdue N` for the things drawn parked.
 * - the words in QUOTED, for a text the note quotes (test/device-check-quotes.test.js computes each).
 */
const KINDS = ['clean', 'problem', 'hint', 'check', 'refused', 'view-empty', 'parked', 'overdue', ...QUOTED];

describe('the checklist numbers every item', () => {
  test('each item has a number: its section’s letter, a dash and two digits', () => {
    assert.ok(items.length > 80, 'the checklist has its items');
    assert.deepEqual(
      items.filter((i) => !/^\*\*[A-Z]-\d\d\*\* \S/.test(i.text)).map((i) => i.text.slice(0, 60)),
      [],
    );
  });

  test('a number is used once in the whole checklist', () => {
    const numbers = items.map((i) => i.number);
    assert.deepEqual(
      numbers.filter((n, i) => numbers.indexOf(n) !== i),
      [],
    );
  });

  test('a section has one letter of its own, and its numbers run upward', () => {
    const letters = sections.filter((s) => s.items.length).map((s) => new Set(s.items.map((i) => i.number[0])));
    for (const l of letters) assert.equal(l.size, 1, 'one letter in a section');
    const all = letters.map((l) => [...l][0]);
    assert.equal(new Set(all).size, all.length, 'no letter is shared by two sections');
    for (const s of sections.filter((x) => x.items.length)) {
      const n = s.items.map((i) => Number(i.number.slice(2)));
      assert.deepEqual(
        n,
        [...n].sort((a, b) => a - b),
        s.heading,
      );
      assert.ok(n[0] === 1, `${s.heading} starts at 01`);
    }
  });

  test('the top of the checklist gives the scheme and the rule: a number never changes, a new item takes the next', () => {
    const top = words(read(CHECKLIST).split('\n## Before')[0]);
    assert.match(top, /A number never changes once given/);
    assert.match(top, /a new item takes the next number in its section/);
    for (const s of sections.filter((x) => x.items.length))
      assert.ok(top.includes(`${s.items[0].number[0]} ${s.heading.split(' — ')[0]}`), `${s.heading} is in the scheme`);
  });
});

describe('every checklist item after Before has one note, and every note has an item', () => {
  test('there are as many notes as items, none for Before, and each number is on one note', () => {
    const files = noteFiles();
    assert.equal(files.length, wanted.length);
    for (const { item } of wanted) {
      const n = item.text.match(/^\*\*([A-Z]-\d\d)\*\*/)[1];
      assert.equal(files.filter((f) => numberOf(f) === n).length, 1, `${n} has exactly one note`);
    }
    for (const f of files)
      assert.ok(
        wanted.some((w) => w.item.number === numberOf(f)),
        `${f} has no checklist item`,
      );
    assert.deepEqual(
      files.filter((f) => /\/B-\d\d /.test(f)),
      [],
    );
  });

  test('a note is in the folder of its section, numbered in checklist order, and named by its number and a short title', () => {
    const files = noteFiles();
    for (const { item, folder } of wanted) {
      const file = files.find((f) => numberOf(f) === item.number);
      assert.equal(dirname(file), `${FOLDER}/${folder}`, item.number);
      assert.match(
        stem(file),
        /^[A-Z]-\d\d [A-Za-z0-9][A-Za-z0-9 ,'’()-]{2,60}$/,
        `${item.number}: number, then a short title`,
      );
    }
    assert.deepEqual(
      walk(FOLDER)
        .map((f) => dirname(f))
        .filter((d) => d !== FOLDER && !wanted.some((w) => d === `${FOLDER}/${w.folder}`)),
      [],
    );
  });

  test('a note’s title and first line are its number and short title, as its file is named', () => {
    for (const { file, text } of notes()) assert.equal(text.split('\n')[0], `# ${stem(file)}`, file);
  });

  test('a note carries no front matter', () => {
    for (const { file, text } of notes()) assert.ok(!text.startsWith('---'), file);
  });
});

describe('what each note holds, in the order it is read', () => {
  test('the expected result, then the diagram, then the steps, the checklist line and the way back', () => {
    for (const { file, text } of notes()) {
      const { lines, at } = partsOf(text);
      assert.ok(
        at.every((i) => i > 0),
        `${file} has every label: ${LABELS.join(', ')}`,
      );
      assert.deepEqual(
        at,
        [...at].sort((a, b) => a - b),
        `${file}: the labels are in order`,
      );
      for (const label of LABELS)
        assert.equal(lines.filter((l) => l.startsWith(`**${label}:**`)).length, 1, `${file}: ${label} once`);
    }
  });

  test('the expected result is said in words, and the steps are numbered', () => {
    for (const { file, text } of notes()) {
      const { part } = partsOf(text);
      assert.ok(words(part(0)).length > 60, `${file}: You should see`);
      assert.match(part(2), /^1\. \S/m, `${file}: Do this numbers its steps`);
    }
  });

  test('the diagram holds the graph blocks and the expectations, and no graph block is anywhere else', () => {
    for (const { file, text } of notes()) {
      const { at, part } = partsOf(text);
      const spans = gqlSpans(text);
      assert.ok(spans.length >= 1, `${file} has a graph to try`);
      for (const s of spans) assert.ok(s.open > at[1] && s.close < at[2], `${file}: a graph block outside the diagram`);
      assert.ok(expectations(part(1)).length >= 1, `${file} says what its blocks read as`);
      assert.equal(
        expectations(text).length,
        expectations(part(1)).length,
        `${file}: expectations only in the diagram`,
      );
    }
  });

  test('the checklist line is the item’s own words, device marks aside, so the note fails when the item changes', () => {
    const byNumber = new Map(items.map((i) => [i.number, i]));
    for (const { file, text } of notes()) {
      const quoted = partsOf(text)
        .part(3)
        .split('\n')
        .filter((l) => l.startsWith('>'))
        .map((l) => l.replace(/^>\s?/, ''))
        .join(' ');
      const item = byNumber.get(numberOf(file));
      const plain = (t) => words(withoutMarks(withoutIds(unescaped(t))));
      assert.equal(plain(quoted), plain(item.text), file);
      assert.equal(words(unescaped(quoted)), words(withoutIds(unescaped(quoted))), `${file}: no requirement ids`);
    }
  });

  test('a note whose words name a button only Live Preview has says to open the note in Live Preview, first', () => {
    // reading view hides Edit, Edit here, Park, Record and Lock, and the rest that write into the block
    const BUTTONS = /\b(Edit|Hide others|Save as shown|Make a view|Park|Record|Lock)\b/;
    const reading = new Set(['Z-09']);
    let named = 0;
    for (const { file, text } of notes()) {
      const { part } = partsOf(text);
      if (!BUTTONS.test(part(0)) && !BUTTONS.test(part(2))) continue;
      named++;
      const first = part(2).split('\n').filter(Boolean)[1] ?? '';
      const view = reading.has(numberOf(file)) ? 'reading view' : 'Live Preview';
      assert.ok(first.startsWith(`0. Open this note in ${view}`), `${file}: step 0 is to open it in ${view}: ${first}`);
    }
    assert.ok(named > 30, 'the buttons are named in many notes');
  });

  test('the way back is a link to the checklist on GitHub, naming the item’s number to look for', () => {
    for (const { file, text } of notes()) {
      const back = partsOf(text).part(4);
      assert.ok(back.includes(`](${CHECKLIST_URL})`), `${file} links the checklist`);
      assert.ok(back.includes(`[${numberOf(file)} in the device checklist]`), `${file} names its number`);
    }
    assert.ok(read(CHECKLIST) && path(CHECKLIST).endsWith(CHECKLIST_URL.split('/blob/main/')[1]));
  });
});

/**
 * What the note’s graph blocks read as, with the graph’s own reader and checker. That is:
 * - the problems the reader and the style blocks’ reader give. A hint is no problem, so is listed apart.
 * - the rules of the graph spec the checker fails.
 * - each view block parsed.
 */
function readingOf(text) {
  const texts = gqlBlocks(text).map((b) => b.text);
  const reading = readNote(texts, texts.length - 1, [], undefined, '2026-10-11');
  const all = [...reading.problems];
  for (const g of new Set(texts.map(styleOf).filter(Boolean))) all.push(...readStyle(texts, g, reading).problems);
  const checks = Object.keys(reading.whole).flatMap((g) =>
    gs
      .check(reading.whole, g)
      .filter(([, ok]) => !ok)
      .map(([rule]) => rule),
  );
  const views = viewsOf(texts).map((v) => ({
    ...v,
    spec: parseView(v.query),
    reading: sourced(texts, v.graph) ?? reading,
  }));
  const messages = (hint) => all.filter((p) => (p.severity === 'hint') === hint).map((p) => p.message);
  return { reading, problems: messages(false), hints: messages(true), checks, views };
}

/**
 * The reading a view of `graph` is put to when its note draws the graph FROM another note of the device checks. That is
 * editor spec §7, view_of_another_note. It is read there as the plugin reads it. Else null, for the note's own reading.
 */
function sourced(texts, graph) {
  const s = sourceFor(texts, graph);
  const file = s && 'target' in s && noteFiles().find((f) => stem(f) === s.target);
  return (file && readSource(s, { found: file, text: read(file) }).reading) || null;
}

/** Each expected text found in the messages, and each message expected: nothing missing and nothing unexpected. */
function matches(messages, expected, what) {
  const missing = expected.filter((e) => !messages.some((m) => m.includes(e.text)));
  const surprising = messages.filter((m) => !expected.some((e) => m.includes(e.text)));
  return { missing: missing.map((e) => `${what} “${e.text}”`), surprising: surprising.map((m) => `${what} ${m}`) };
}

describe('each note’s graph blocks read as the note says they do', () => {
  test('every expectation is one this test knows', () => {
    for (const { file, text } of notes())
      for (const e of expectations(text)) assert.ok(KINDS.includes(e.word), `${file}: ${e.raw}`);
  });

  test('a note that expects clean reads with no problems at all; one that expects problems has exactly those', () => {
    for (const { file, text } of notes()) {
      const expected = expectations(text);
      const clean = expected.filter((e) => e.word === 'clean');
      const wantProblems = expected.filter((e) => e.word === 'problem');
      assert.ok(
        clean.length + wantProblems.length >= 1 && !(clean.length && wantProblems.length),
        `${file}: clean, or problems`,
      );
      assert.ok(clean.length <= 1, `${file}: clean once`);
      const { reading, problems } = readingOf(text);
      assert.equal(reading.tooLarge, undefined, `${file}: read`);
      const { missing, surprising } = matches(problems, wantProblems, 'problem');
      assert.deepEqual({ file, missing, surprising }, { file, missing: [], surprising: [] });
    }
  });

  test('a hint it expects is offered, and is no problem; one it does not expect is not offered', () => {
    for (const { file, text } of notes()) {
      const { hints } = readingOf(text);
      const { missing, surprising } = matches(
        hints,
        expectations(text).filter((e) => e.word === 'hint'),
        'hint',
      );
      assert.deepEqual({ file, missing, surprising }, { file, missing: [], surprising: [] });
    }
  });

  test('the graph spec’s checker fails the rules a note expects, and no other', () => {
    for (const { file, text } of notes()) {
      const { checks } = readingOf(text);
      const { missing, surprising } = matches(
        checks,
        expectations(text).filter((e) => e.word === 'check'),
        'rule',
      );
      assert.deepEqual({ file, missing, surprising }, { file, missing: [], surprising: [] });
    }
  });

  test('a view block parses as one of the five kinds, unless the note expects its refusal', () => {
    for (const { file, text } of notes()) {
      const { views } = readingOf(text);
      const refusals = expectations(text).filter((e) => e.word === 'refused');
      const refused = views.filter((v) => 'refused' in v.spec);
      assert.equal(refused.length, refusals.length, `${file}: refused views`);
      refused.forEach((v, i) => assert.ok(v.spec.refused.includes(refusals[i].text), `${file}: ${v.spec.refused}`));
      const empty = views.filter((v) => !('refused' in v.spec) && evaluate(v.spec, v.reading, v.graph).empty);
      assert.equal(
        empty.length,
        expectations(text).filter((e) => e.word === 'view-empty').length,
        `${file}: views matching nothing`,
      );
    }
  });

  test('things parked, and those overdue, are as many as the note says', () => {
    for (const { file, text } of notes()) {
      const boxes = [...readingOf(text).reading.graphs.values()].flatMap((g) => g.boxes.filter((b) => b.deferred));
      const say = (word) => expectations(text).find((e) => e.word === word)?.count ?? 0;
      assert.equal(boxes.length, say('parked'), `${file}: parked`);
      assert.equal(boxes.filter((b) => b.deferred.overdue).length, say('overdue'), `${file}: overdue`);
    }
  });

  test('the notes between them show every kind of expectation, so none of the checks above is idle', () => {
    const used = new Set(notes().flatMap(({ text }) => expectations(text).map((e) => e.word)));
    for (const word of KINDS) assert.ok(used.has(word), `no note expects ${word}`);
  });
});

describe('the index lists every note, in order', () => {
  const index = () => read(INDEX);
  const expectedLinks = () =>
    wanted.map(({ item, folder }) => {
      const file = noteFiles().find((f) => numberOf(f) === item.number);
      return `${FOLDER.replace('test-vault/', '')}/${folder}/${stem(file)}`;
    });

  test('its first line is its title, and it links each note as a wiki link, once, in checklist order', () => {
    assert.equal(index().split('\n')[0], '# Device checks');
    const links = [...index().matchAll(/\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g)].map((m) => m[1]);
    assert.deepEqual(links, expectedLinks());
  });

  test('a heading for each section stands over its notes, named as its folder is', () => {
    const headings = [...index().matchAll(/^## (.+)$/gm)].map((m) => m[1]);
    assert.deepEqual(
      headings,
      noted(sections).map((s) => folderName(sections, s)),
    );
  });

  test('it says how many checks there are, and where the checklist is', () => {
    assert.ok(index().includes(`${wanted.length} checks`), 'the number of checks');
    assert.ok(index().includes(`](${CHECKLIST_URL})`), 'the link to the checklist');
  });
});

describe('the notes are committed, and a clean session keeps them', () => {
  const tracked = () =>
    execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '--', FOLDER], {
      cwd: ROOT,
      encoding: 'utf8',
    })
      .split('\n')
      .filter(Boolean);

  test('git would commit every note and the index, and nothing in the folder but notes', () => {
    const files = tracked();
    for (const f of [...noteFiles(), INDEX]) assert.ok(files.includes(f), `${f} can be committed`);
    // The small images and the PDF the generator makes are kept too (test/test-files.test.js holds them to it). The
    // large GIF is made at set-up and ignored.
    assert.deepEqual(
      files.filter((f) => !f.endsWith('.md')).sort(),
      TEST_FILES.filter((e) => !e.large && e.dir.startsWith('Device checks/'))
        .map((e) => `test-vault/${pathOf(e)}`)
        .sort(),
    );
    const stray = [
      `${FOLDER}/pasted image.png`,
      `${FOLDER}/01 Viewing/pasted image.png`,
      `${FOLDER}/.obsidian/workspace.json`,
    ];
    const ignored = spawnSync('git', ['check-ignore', '--stdin'], {
      cwd: ROOT,
      input: stray.join('\n'),
      encoding: 'utf8',
    });
    assert.deepEqual(ignored.stdout.split('\n').filter(Boolean), stray);
  });

  test('reset-test-vault restores a note changed in a session and removes what the session added, in the folder too', () => {
    const files = Object.fromEntries([...noteFiles(), INDEX].map((f) => [f, readFileSync(path(f), 'utf8')]));
    const repo = repository([{ '.gitignore': readFileSync(path('.gitignore'), 'utf8'), ...files }]);
    try {
      const [note] = noteFiles();
      const at = (f) => join(repo.dir, f);
      for (const f of ['main.js', 'manifest.json', 'styles.css']) writeFileSync(at(f), 'build\n'); // the reset copies the build in
      makeTestFiles(at('test-vault'), { large: false }); // the small test files, as committed here
      repo.commit({}, 'test files');
      writeFileSync(at(note), `${files[note]}\nTyped in a session.\n`);
      writeFileSync(at(`${FOLDER}/Untitled.md`), 'new');
      mkdirSync(at(`${FOLDER}/A folder`));
      writeFileSync(at(`${FOLDER}/A folder/note.md`), 'x');
      const run = spawnSync(process.execPath, [path('scripts/reset-test-vault.mjs'), '--root', repo.dir], {
        encoding: 'utf8',
      });
      assert.equal(run.status, 0, run.stdout + run.stderr);
      assert.equal(readFileSync(at(note), 'utf8'), files[note]);
      for (const gone of ['Untitled.md', 'A folder'])
        assert.ok(!existsSync(at(`${FOLDER}/${gone}`)), `${gone} is removed`);
      assert.equal(repo.git('status', '--porcelain', '--', FOLDER), '');
      assert.equal(
        repo.git('ls-files', '--', FOLDER).split('\n').length,
        noteFiles().length + 1 + TEST_FILES.filter((e) => !e.large && e.dir.startsWith('Device checks/')).length,
      );
    } finally {
      repo.done();
    }
  });
});

describe('a changed note or checklist runs these tests, and nothing else', () => {
  const THIS = 'test/device-check-notes.test.js';
  const QUOTES = 'test/device-check-quotes.test.js';
  const tracked = [THIS, QUOTES, 'test/test-vault.test.js'];

  test('the checklist runs the two tests of the notes; a note in the vault runs those and the test vault’s', () => {
    assert.deepEqual(testsForChanges([CHECKLIST], tracked), { all: false, files: [THIS, QUOTES] });
    for (const changed of [noteFiles()[0], INDEX, 'scripts/reset-test-vault.mjs'])
      assert.deepEqual(testsForChanges([changed], tracked), {
        all: false,
        files: [THIS, QUOTES, 'test/test-vault.test.js'],
      });
  });
});
