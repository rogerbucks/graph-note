// The words the device check notes quote from Obsidian's screen: a pane's read-back of a line, an estimated link's label
// and its tap text, a box's details, an export's footer and file name. A note that quotes one says so in an
// `<!-- expect: … -->` line, and this computes the text with the real function (readBack, the layout source, the
// estimate's explanation, details(), the export footer and plan) from the note's own graph blocks, and holds the note to
// it exactly, so a note's prose cannot drift from what the code writes. It also holds the huge graph V-10 carries and the
// dense one V-11's script makes to the layout limits, and the filler that puts a card below the fold (editor spec §3,
// tried first in a test vault).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { gqlBlocks, graphOfBlock } from '../packages/core/src/blocks.ts';
import { readNote } from '../packages/core/src/drawing.ts';
import { footerText } from '../packages/core/src/export.ts';
import { exportPlan } from '../packages/core/src/export-plan.ts';
import { exportScope } from '../packages/core/src/export-scope.ts';
import { readBack } from '../packages/core/src/help.ts';
import { drawingSource } from '../packages/core/src/layout.ts';
import { details } from '../packages/core/src/render.ts';
import { linkGroups } from '../packages/core/src/details-nav.ts';
import { DEFAULT_SETTINGS } from '../packages/core/src/settings.ts';
import { toStandard } from '../packages/core/src/strictness.ts';
import { LAYOUT_LIMITS, READ_LIMITS, tooLarge } from '../packages/core/src/layout-limits.ts';
import { FOLDER, QUOTED, expectations, noteFiles, partsOf } from './repository/device-checks.js';
import { read } from './repository/repo.js';

const DAY = '2026-10-11';
const notes = () => {
  const files = noteFiles();
  assert.ok(files.length > 0, `there are notes in ${FOLDER}`);
  return files.map((file) => ({ file, text: read(file) }));
};

/** The notice the plugin shows after "Convert this note to standard GQL" (main.ts convertToStandard), from what toStandard gives. */
const noticeOf = (done) =>
  !done.ok
    ? `Not converted: ${done.reason}`
    : done.changed
      ? `Converted ${done.changed} departure${done.changed === 1 ? '' : 's'} to standard GQL.`
      : 'This note is already standard GQL.';

/** Every text the real functions give for a note’s blocks, by the kind of text it is. */
function computed({ file, text }) {
  const blocks = gqlBlocks(text);
  const texts = blocks.map((b) => b.text);
  const reading = readNote(texts, texts.length - 1, [], undefined, DAY);
  const graphs = [...reading.graphs.entries()];
  const vaultPath = file.replace(/^test-vault\//, '');
  const first = graphs[0]?.[0];
  const plan = first
    ? exportPlan({
        scope: exportScope(reading, { graph: first }),
        format: 'svg',
        note: vaultPath,
        date: DAY,
        noteClassification: null,
        settings: DEFAULT_SETTINGS,
      })
    : {};
  return {
    readback: graphs.flatMap(([g]) =>
      texts.filter((t) => graphOfBlock(t) === g).flatMap((t) => [...readBack(reading, g, t).values()]),
    ),
    label: graphs.flatMap(([, d]) => [...drawingSource(d, 'LR').matchAll(/label="([^"]*)"/g)].map((m) => m[1])),
    tap: graphs.flatMap(([, d]) =>
      d.estimates.map((e) => e.explain.replace(/^Line \d+/, `Line ${(blocks[e.block]?.line ?? 0) + e.line}`)),
    ),
    detail: graphs.flatMap(([g, d]) =>
      d.boxes.flatMap((b) => {
        const x = details(reading, g, b.key);
        // the links as the details list them: grouped by type and direction, in words (§25, linkGroups)
        const groups = linkGroups(reading, g, b.key);
        return [
          `${b.key} | text: ${x.text}`,
          `${b.key} | kind: ${x.kind}`,
          ...groups.map((l) => `${b.key} | Links ${l.direction}: ${l.words}`),
        ];
      }),
    ),
    footer: [footerText(vaultPath, DAY).replace('11 Oct 2026', '<D Mon YYYY>')],
    'export-file': 'go' in plan ? [plan.go.fileName.replace(DAY, '<YYYY-MM-DD>')] : [],
    notice: [noticeOf(toStandard(text))],
  };
}

/** What a quote looks like in a note’s words, by the kind of text it quotes, so one quoted without a marker is found. */
const LOOKS = {
  detail: /\bLinks (out|in):/,
  footer: /\bFrom \S.*\.md, exported\b/,
  label: /\(estimated\)/,
  readback: /—[A-Z_]+→/,
  tap: /\bLine \d+ (links to|uses)\b/,
  'export-file': /-\d{4}-\d\d-\d\d\.svg|<YYYY-MM-DD>/,
  notice: /\b(Converted \d+ departures?|Not converted:)/,
};

describe('what a note quotes from Obsidian’s screen is what the code writes', () => {
  test('each quote a note marks is computed by the real function from the note’s own blocks, and is said in its result', () => {
    let marked = 0;
    for (const note of notes()) {
      const all = computed(note);
      const said = partsOf(note.text).part(0);
      for (const e of expectations(note.text).filter((x) => QUOTED.includes(x.word))) {
        marked++;
        assert.ok(
          all[e.word].includes(e.text),
          `${note.file}: ${e.word} “${e.text}” is not what the code writes; it writes ${JSON.stringify(all[e.word])}`,
        );
        const shown = e.word === 'detail' ? e.text.split(' | ').slice(1).join(' | ') : e.text;
        assert.ok(said.includes(shown), `${note.file}: You should see does not quote “${shown}”`);
      }
    }
    assert.ok(marked >= 10, 'the notes quote the screen');
  });

  test('a note whose result quotes one of these texts marks it, so it is held to the code', () => {
    for (const note of notes()) {
      const said = partsOf(note.text).part(0);
      const marks = new Set(expectations(note.text).map((e) => e.word));
      for (const [word, looks] of Object.entries(LOOKS))
        if (looks.test(said)) assert.ok(marks.has(word), `${note.file} quotes a ${word} and does not mark it`);
    }
  });

  test('every kind of quote is used by some note, so none of the checks above is idle', () => {
    const used = new Set(notes().flatMap(({ text }) => expectations(text).map((e) => e.word)));
    for (const word of QUOTED) assert.ok(used.has(word), `no note quotes a ${word}`);
  });
});

/** The script in a note’s js block, run, with the lines it prints; and the graph block those lines make. */
function printed(number, graph) {
  const note = notes().find(({ file }) => file.includes(`/${number} `));
  const code = /```js\n([\s\S]*?)\n\s*```/.exec(note.text)?.[1];
  assert.ok(code, `${number} has a script`);
  const lines = [];
  new Function('console', code.replace(/^ {3}/gm, ''))({ log: (s) => lines.push(s) });
  const block = `// graph: ${graph} · SOURCE\n${lines.join('\n')}`;
  const reading = readNote([block]);
  return { reading, drawing: reading.graphs.get(graph) };
}

describe('the diagram sets up its case', () => {
  test('the huge graph is in its note, over the limit on things and under the read limits, and the dense one stays under both', () => {
    const note = notes().find(({ file }) => file.includes('/V-10 '));
    const block = gqlBlocks(note.text).find((b) => graphOfBlock(b.text) === 'huge').text;
    assert.ok(Buffer.byteLength(block) < READ_LIMITS.bytes, `${Buffer.byteLength(block)} bytes`);
    assert.ok(block.split('\n').length < READ_LIMITS.lines, `${block.split('\n').length} lines`);
    const reading = readNote([block]);
    assert.equal(reading.tooLarge, undefined, 'a huge graph is read, then refused by the layout limits');
    assert.deepEqual(reading.problems, []);
    const huge = reading.graphs.get('huge');
    assert.ok(huge.boxes.length > LAYOUT_LIMITS.things, `${huge.boxes.length} things`);
    assert.equal(tooLarge(huge, LAYOUT_LIMITS)?.limit, 'things');
    const dense = printed('V-11', 'tangle');
    assert.equal(dense.reading.tooLarge, undefined);
    assert.deepEqual(dense.reading.problems, []);
    assert.ok(dense.drawing.boxes.length < LAYOUT_LIMITS.things && dense.drawing.links.length < LAYOUT_LIMITS.links);
    assert.ok(dense.drawing.links.length > 4000, 'the dense graph is dense');
    assert.equal(tooLarge(dense.drawing, LAYOUT_LIMITS), null);
  });

  test('the huge graph is real: graph theory and this project, linked where they meet, not numbered fillers', () => {
    const note = notes().find(({ file }) => file.includes('/V-10 '));
    const block = gqlBlocks(note.text).find((b) => graphOfBlock(b.text) === 'huge').text;
    for (const label of ['Person', 'Theorem', 'Algorithm', 'Vertex', 'Requirement', 'Workstream', 'Wave', 'SourceFile'])
      assert.match(block, new RegExp(`^\\(\\w+:${label} `, 'm'), label);
    assert.match(block, /^\(gt_euler_trails\)-\[:ANSWERS\]->\(gt_konigsberg\),$/m);
    assert.match(block, /^\(\w+\)-\[:DRAWS_WITH\]->\(gt_graphviz\),$/m, 'the project meets the theory');
    assert.doesNotMatch(block, /name: 'Thing \d+'/);
  });

  test('a note that needs a card far down starts it below the fold, with sixty lines above its block', () => {
    for (const number of ['I-02', 'I-04']) {
      const note = notes().find(({ file }) => file.includes(`/${number} `));
      const { at, lines } = partsOf(note.text);
      const above = lines.slice(
        at[1],
        lines.findIndex((l) => l.startsWith('```gql')),
      );
      assert.ok(above.filter((l) => l.trim()).length >= 60, `${number}: lines above the block`);
    }
  });

  test('the scripts say how they are run: with node, and where the output goes', () => {
    const note = notes().find(({ file }) => file.includes('/V-11 '));
    assert.match(partsOf(note.text).part(2), /run `node make-\w+\.mjs \| pbcopy`/);
  });
});
