// How Sara keeps up with the pinned "Working group" discussion (docs/agents/ROLES.md, "How Sara keeps up"). Checked
// here: when she is woken, the one-comment-a-day pace, and what a reply must look like before it is posted.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { checkReply, items, plan } from '../scripts/working-group.mjs';

const comment = (id, login, createdAt, body, replies = []) => ({
  id,
  author: { login },
  createdAt,
  body,
  replies: { nodes: replies },
});
const discussion = (...nodes) => ({ id: 'D_1', comments: { nodes } });
const NOW = new Date('2026-10-21T07:30:00Z');
const SARA = 'Agreed.\n\n— Sara';

describe('reading the working group discussion', () => {
  test('lists comments and their replies, each reply under its top-level comment', () => {
    const d = discussion(
      comment('C1', 'rogerbucks', '2026-10-20T13:27:00Z', 'Hello', [
        comment('R1', 'rogerbucks', '2026-10-20T13:40:00Z', 'Hi'),
      ]),
    );
    assert.deepEqual(
      items(d).map(({ id, topId }) => [id, topId]),
      [
        ['C1', 'C1'],
        ['R1', 'C1'],
      ],
    );
  });
});

describe('when Sara is woken', () => {
  test('acts on a comment that names Sara and came after her last one', () => {
    const d = discussion(
      comment('C1', 'github-actions', '2026-10-20T09:00:00Z', SARA),
      comment('C2', 'rogerbucks', '2026-10-20T13:30:00Z', 'Sara and Charles, please reply.\n\n— Eve'),
    );
    const p = plan(d, NOW);
    assert.equal(p.act, true);
    assert.deepEqual(
      p.pending.map((i) => i.id),
      ['C2'],
    );
  });

  test('stays asleep when no one named Sara since her last comment', () => {
    const d = discussion(
      comment('C1', 'rogerbucks', '2026-10-20T08:00:00Z', 'Sara, a question.'),
      comment('C2', 'github-actions', '2026-10-20T09:00:00Z', SARA),
      comment('C3', 'rogerbucks', '2026-10-20T10:00:00Z', 'Charles, the tests please.\n\n— Eve'),
    );
    assert.equal(plan(d, NOW).act, false);
  });

  test('matches the whole name only, so Sarah does not wake her', () => {
    const d = discussion(comment('C1', 'rogerbucks', '2026-10-20T08:00:00Z', 'Ask Sarah.'));
    assert.equal(plan(d, NOW).act, false);
  });

  test('never counts her own comments as asking her something', () => {
    const d = discussion(comment('C1', 'github-actions', '2026-10-20T08:00:00Z', 'Sara here.\n\n— Sara'));
    assert.equal(plan(d, NOW).act, false);
  });

  test('keeps to one comment a day: once Sara posted today (UTC), she waits for tomorrow', () => {
    const d = discussion(
      comment('C1', 'github-actions', '2026-10-21T06:00:00Z', SARA),
      comment('C2', 'rogerbucks', '2026-10-21T07:00:00Z', 'Sara, one more thing.'),
    );
    const p = plan(d, NOW);
    assert.equal(p.act, false);
    assert.match(p.reason, /already posted today/);
  });

  test('finds a name in a reply too', () => {
    const d = discussion(
      comment('C1', 'rogerbucks', '2026-10-20T08:00:00Z', 'Kick-off', [
        comment('R1', 'rogerbucks', '2026-10-20T12:00:00Z', 'Sara, can you own this?'),
      ]),
    );
    const p = plan(d, NOW);
    assert.equal(p.act, true);
    assert.deepEqual(
      p.pending.map(({ id, topId }) => [id, topId]),
      [['R1', 'C1']],
    );
  });
});

describe('a reply before it is posted', () => {
  const d = discussion(
    comment('C1', 'rogerbucks', '2026-10-20T08:00:00Z', 'Sara?', [comment('R1', 'rogerbucks', '2026-10-20T09:00:00Z', 'x')]),
  );

  test('passes when it answers under a top-level comment and is signed by Sara', () => {
    assert.deepEqual(checkReply({ body: SARA, replyTo: 'C1' }, d), []);
  });

  test('must answer under a top-level comment of this discussion, never a reply or another discussion', () => {
    assert.match(checkReply({ body: SARA, replyTo: 'R1' }, d).join('\n'), /top-level comment/);
    assert.match(checkReply({ body: SARA, replyTo: 'C9' }, d).join('\n'), /top-level comment/);
  });

  test('must be signed "— Sara"', () => {
    assert.match(checkReply({ body: 'Agreed.', replyTo: 'C1' }, d).join('\n'), /signed/);
  });

  test('pings no one but Roger: names go without the @ sign', () => {
    assert.match(checkReply({ body: `@eve hello\n\n— Sara`, replyTo: 'C1' }, d).join('\n'), /@eve/);
    assert.deepEqual(checkReply({ body: `@rogerbucks one choice for you.\n\n— Sara`, replyTo: 'C1' }, d), []);
  });

  test('stays short: one batched comment, not an essay', () => {
    const long = `${'word '.repeat(1000)}\n\n— Sara`;
    assert.match(checkReply({ body: long, replyTo: 'C1' }, d).join('\n'), /too long/);
  });
});
