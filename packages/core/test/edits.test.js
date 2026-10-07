// Edits made from the pane (spec §8, §9, §12): locking a draft writes its schema as a new block, written last, which the
// graph's own checks then pass; and every edit round-trips — applied and read back it gives the graph intended, and
// undone it gives the note's original bytes.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import gs from '@graph-note/graph-spec';
import { gqlBlocks, readNote } from '../src/drawing.ts';
import { isDraft, lockBlock, reverseGuess } from '../src/lock.ts';
import { insertBlockAfter, replaceBlock, History } from '../src/store.ts';

const DRAFT = `// graph: reader · SOURCE
(question:Question {title: 'Which device?'}),
(large:Option {name: 'Large reader'}),
(eyes:Reason {title: 'Easy on the eyes'}),
(large)-[:ANSWERS]->(question),
(eyes)-[:FAVOURS]->(large),
(eyes)-[:COUNTS_AGAINST]->(question)`;
const NOTE = `# Reader\n\n\`\`\`gql\n${DRAFT}\n\`\`\`\n\nAfter.\n`;

describe('Lock the graph', () => {
  test('a graph with no schema is a draft, and one with a schema is not', () => {
    assert.equal(isDraft(readNote([DRAFT]), 'reader'), true);
    const locked = readNote([DRAFT, lockBlock(readNote([DRAFT]), 'reader', '2026-10-07')]);
    assert.equal(isDraft(locked, 'reader'), false);
  });

  test('locking writes a schema block: every kind and relationship, with its readings both ways', () => {
    const block = lockBlock(readNote([DRAFT]), 'reader', '2026-10-07');
    assert.equal(block, `// graph: reader · SOURCE
// ── The schema: locked 2026-10-07 from the data above ──
// The reverse readings are guesses — check each one.
(reader_schema:GraphMeta {graph: 'reader', schema: 'reader@1'}),

// ── Kinds of thing ──
(kind_option:Meta:ElementType {name: 'Option', kind: 'node', origin: 'source'}),
(kind_question:Meta:ElementType {name: 'Question', kind: 'node', origin: 'source'}),
(kind_reason:Meta:ElementType {name: 'Reason', kind: 'node', origin: 'source'}),

// ── Relationship types, with their readings both ways ──
(link_answers:Meta:ElementType {name: 'ANSWERS', kind: 'edge', origin: 'source', reading: 'answers', reverse_name: 'is answered by'}),
(link_counts_against:Meta:ElementType {name: 'COUNTS_AGAINST', kind: 'edge', origin: 'source', reading: 'counts against', reverse_name: 'is counted against by'}),
(link_favours:Meta:ElementType {name: 'FAVOURS', kind: 'edge', origin: 'source', reading: 'favours', reverse_name: 'is favoured by'})`);
  });

  test('the locked graph passes the spec’s own type check, as the Python and JavaScript libraries run it', () => {
    const blocks = [DRAFT, lockBlock(readNote([DRAFT]), 'reader', '2026-10-07')];
    const store = gs.read(blocks), w = gs.worldFromStore(store);
    const t5 = gs.check(w, 'reader').find(([label]) => label.startsWith('§5'));
    assert.deepEqual(t5, ['§5: every element has a declared type', true]);
  });

  test('a schema node’s id never clashes with a thing already in the graph', () => {
    const clash = DRAFT.replace("(large:Option", "(kind_option:Option {name: 'clash'}),\n(large:Option");
    const block = lockBlock(readNote([clash]), 'reader', '2026-10-07');
    assert.match(block, /\(kind_option_2:Meta:ElementType \{name: 'Option'/);
    assert.doesNotThrow(() => gs.read([clash, block]));
  });

  test('a reading the graph already declares in its own words is kept', () => {
    assert.equal(reverseGuess('answers'), 'is answered by');
    assert.equal(reverseGuess('favours'), 'is favoured by');
    assert.equal(reverseGuess('cites'), 'is cited by');
    assert.equal(reverseGuess('decides'), 'is decided by');
    assert.equal(reverseGuess('counts against'), 'is counted against by');
    assert.equal(reverseGuess('relates to'), 'is related to by');
    assert.equal(reverseGuess('is part of'), 'has part');
  });

  test('the schema block goes into the note after the graph’s last block, and nothing else changes', () => {
    const block = lockBlock(readNote([DRAFT]), 'reader', '2026-10-07');
    const b = gqlBlocks(NOTE)[0];
    const r = insertBlockAfter(NOTE, { line: b.line - 1, text: b.text }, block);
    assert.equal(r.ok, true);
    assert.equal(r.note, NOTE.replace('```\n\nAfter.', '```\n\n```gql\n' + block + '\n```\n\nAfter.'));
    assert.deepEqual(gqlBlocks(r.note).map((x) => x.text), [DRAFT, block]);
  });
});

describe('every edit round-trips', () => {
  test('applied and read back, an edit gives the graph intended; undone, the original bytes', () => {
    const h = new History();
    let note = NOTE, b = gqlBlocks(note)[0], ref = { line: b.line - 1, text: b.text };
    const edits = [
      DRAFT + ",\n(price:Reason {title: 'Costs more'}),\n(price)-[:COUNTS_AGAINST]->(large)",
      DRAFT.replace("title: 'Easy on the eyes'", "title: 'Easier on the eyes'"),
      DRAFT.replace('(eyes)-[:FAVOURS]->(large),\n', ''),
    ];
    for (const text of edits) {
      const r = replaceBlock(note, ref, text);
      assert.equal(r.ok, true);
      const back = readNote(gqlBlocks(r.note).map((x) => x.text)).graphs.get('reader');
      const want = readNote([text]).graphs.get('reader');
      assert.deepEqual(back, want, 'read back, the graph intended');
      h.record(ref.text, r.ref.text);
      note = r.note; ref = r.ref;
    }
    for (let step; (step = h.undo());) { const r = replaceBlock(note, ref, step); note = r.note; ref = r.ref; }
    assert.equal(note, NOTE, 'undone, the original bytes');
  });
});
