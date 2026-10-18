// The page's session (editor spec §26, cc_undo_safe; §9, block_followed_not_its_copy). Say a copy of the block it edits
// is pasted beside it, so it cannot tell the two apart. Then undo says that, in the core's words. It never says that
// another program changed the block. The review of #465, 15 Oct 2026: the page gave every refusal of a step the words for a change made
// by another program.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { EditorSession, UNDO_OVER_THEIRS } from '../src/editor-session.ts';
import { PLAN } from './editor-store-support.js';

const sha = (bytes) => `"${createHash('sha256').update(bytes).digest('hex')}"`;
const fenced = (note) => note.slice(note.indexOf('```gql'), note.indexOf('```\nThe end') + 3);

test('a copy pasted beside the block: undo and redo say the session cannot tell the two apart', () => {
  const page = new EditorSession(PLAN, sha(PLAN));
  page.type({ text: page.text.replace("'Start'", "'Begin'"), start: 0, end: 0 });
  const w = page.write();
  assert.equal(w.ok, true);
  page.written(sha(w.note));
  const block = fenced(w.note);
  const pasted = w.note.replace(block, `${block}\n\n${block}`);
  assert.equal(page.changed(pasted, sha(pasted)), 'conflict');
  for (const step of [page.undo(), page.redo()]) {
    assert.equal(step.ok, false);
    assert.notEqual(step.reason, UNDO_OVER_THEIRS);
    assert.match(step.reason, /copy of this block/);
  }
});
