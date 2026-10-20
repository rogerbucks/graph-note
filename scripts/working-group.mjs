#!/usr/bin/env node
// How Sara (Claude) keeps up with the pinned "Working group" discussion (docs/agents/ROLES.md, "How Sara keeps up").
// The workflow working-group.yml runs it twice. First it decides whether Claude is needed at all. So a comment that
// does not name Sara costs nothing. Then it checks Claude's draft before another job posts it.
//
// Usage:
//   node scripts/working-group.mjs plan <discussion.json>
//       print the plan as JSON. In GitHub Actions, also write act=true or act=false to $GITHUB_OUTPUT.
//   node scripts/working-group.mjs check <discussion.json> <draft folder>
//       read reply.md and reply-to from the folder. Exit 1, listing the problems, when the draft may not be posted.
//       A folder with no reply.md means Sara chose to say nothing, which is fine.
// The discussion file is the `discussion` object GitHub's GraphQL API returns, with comments and their replies.
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Sara posts with the workflow's own token, so her comments come from GitHub's Actions bot and end with her name.
const BOT = /^github-actions(\[bot\])?$/;
const SIGNED = /(^|\n)— Sara\s*$/;
const NAMED = /\bSara\b/;
// An @ pings a GitHub account. Everyone here posts from Roger's account, so only Roger is ever pinged.
const MENTION = /(^|[^\w`])@([A-Za-z0-9-]+)/g;
const MAX_WORDS = 400;

/** Every comment and reply, oldest first, each with `topId`: the top-level comment a reply sits under. */
export function items(discussion) {
  return (discussion?.comments?.nodes ?? []).flatMap((c) => [
    { ...c, topId: c.id },
    ...(c.replies?.nodes ?? []).map((r) => ({ ...r, topId: c.id })),
  ]);
}

const login = (item) => item.author?.login ?? '';
const isSara = (item) => BOT.test(login(item)) && SIGNED.test(item.body ?? '');
const day = (date) => new Date(date).toISOString().slice(0, 10);

/**
 * Whether Sara should look now. She acts on comments that name her and came after her own last one. She keeps to one
 * comment a day (UTC), so once she has posted today, the next morning's run picks up what is left.
 */
export function plan(discussion, now = new Date()) {
  const all = items(discussion).sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  const mine = all.filter(isSara);
  const last = mine.at(-1);
  if (last && day(last.createdAt) === day(now)) return { act: false, reason: 'Sara already posted today', pending: [] };
  const since = last ? Date.parse(last.createdAt) : 0;
  const pending = all
    .filter((i) => !isSara(i) && Date.parse(i.createdAt) > since && NAMED.test(i.body ?? ''))
    .map((i) => ({ id: i.id, topId: i.topId, author: login(i), createdAt: i.createdAt, body: i.body }));
  if (!pending.length) return { act: false, reason: 'no one named Sara since her last comment', pending };
  return { act: true, reason: `${pending.length} comment(s) name Sara`, pending };
}

/** What stops a draft reply being posted, as plain sentences. None means it may go. */
export function checkReply({ body, replyTo }, discussion) {
  const problems = [];
  const tops = new Set((discussion?.comments?.nodes ?? []).map((c) => c.id));
  if (!tops.has(replyTo)) problems.push(`reply-to "${replyTo}" is not a top-level comment of this discussion`);
  if (!SIGNED.test(body)) problems.push('the reply is not signed "— Sara" on its last line');
  for (const [, , name] of body.matchAll(MENTION)) {
    if (name !== 'rogerbucks') problems.push(`the reply pings @${name}: write names without the @ sign`);
  }
  const words = body.split(/\s+/).filter(Boolean).length;
  if (words > MAX_WORDS) problems.push(`the reply is too long: ${words} words, at most ${MAX_WORDS}`);
  return problems;
}

function main([command, file, folder]) {
  const discussion = JSON.parse(readFileSync(file, 'utf8'));
  if (command === 'plan') {
    const p = plan(discussion);
    console.log(JSON.stringify(p, null, 2));
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `act=${p.act}\n`);
    return 0;
  }
  if (command === 'check') {
    const reply = join(folder, 'reply.md');
    if (!existsSync(reply)) {
      console.log('No draft: Sara has nothing to add.');
      return 0;
    }
    const replyTo = existsSync(join(folder, 'reply-to')) ? readFileSync(join(folder, 'reply-to'), 'utf8').trim() : '';
    const problems = checkReply({ body: readFileSync(reply, 'utf8'), replyTo }, discussion);
    for (const p of problems) console.error(`working-group: ${p}`);
    return problems.length ? 1 : 0;
  }
  console.error('usage: node scripts/working-group.mjs plan <discussion.json> | check <discussion.json> <folder>');
  return 2;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
