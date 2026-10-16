// A proposal from Claude, made into the change set the note will hold (spec §26, cc_claude_proposes; §17 and §19): what
// Claude sends through the mod is its changes and what it read, nothing else, and is read as a model's answer is read
// (`changesIn`): things and links to add, a property to change, a thing or link to take out, and never a Person, a Model or
// a Step, so no text of Claude's declares an author. The editor declares the proposer, the Model named Claude in the
// settings, as the first addition, and writes the proposal only if the graph spec's own check passes it. The note comes
// back with the change set beside its graph and every other byte kept: the graph itself is never touched, and changes
// only when a person accepts a change on the card. Pure: the store writes what this returns, under its lock.
import {
  CLAUDE,
  basisOf,
  changeSetId,
  changesIn,
  gqlSpans,
  graphOfBlock,
  READ_LIMITS,
  makeProposal,
  noteWithProposal,
  sha256,
} from '@graph-note/core';
import type { GateSettings } from '@graph-note/core';

/** A proposal made into the note's new text, or why it cannot be, with the status the server answers with. */
export type Proposed =
  { ok: true; text: string; id: string; count: number } | { ok: false; status: number; why: string };

/** The most changes one proposal holds, and the most things it says it read. */
const MOST_CHANGES = 50;
const MOST_READ = 20;

const no = (status: number, why: string): Proposed => ({ ok: false, status, why });
const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** The name the proposer goes by: the model named Claude among those set up, as it is written there, else `Claude`. */
export function proposerName(settings: GateSettings): string {
  const model = settings.aiModels.find((m) => m.name.trim().toLowerCase() === CLAUDE.toLowerCase());
  const name = model?.name.trim() ?? '';
  return /^[A-Za-z_]\w*$/.test(name) ? name : CLAUDE;
}

/** What Claude said it read: a list of short texts, each one line (any run of spaces or breaks one space), or why not. */
function readOf(given: unknown): string[] | string {
  if (given === undefined) return [];
  if (!Array.isArray(given) || given.length > MOST_READ || given.some((r) => typeof r !== 'string' || r.length > 200))
    return `what it read is a list of at most ${MOST_READ} short texts`;
  // \x85 is the next-line character, which `\s` leaves out and some readers take for a line break
  return (given as string[]).map((r) => r.replace(/[\s\x85]+/g, ' ').trim()).filter(Boolean);
}

/** The most characters of any text in a change, and of a reason; the most proposals waiting; room left in the note. */
const MOST_VALUE = 1000;
const MOST_REASON = 500;
const MOST_OPEN = 10;
const ROOM_BYTES = 8000;
const ROOM_LINES = 100;

/** Why a change holds a text that is too long, or null: a value, a name or any text in it, and its reason. */
function tooLong(changes: unknown[]): string | null {
  const longest = (v: unknown): number =>
    typeof v === 'string' ? v.length : v && typeof v === 'object' ? Math.max(0, ...Object.values(v).map(longest)) : 0;
  for (const c of changes) {
    const reason = c && typeof c === 'object' ? (c as { reason?: unknown }).reason : undefined;
    if (typeof reason === 'string' && reason.length > MOST_REASON)
      return `A reason is too long: at most ${MOST_REASON} characters.`;
    if (longest(c) > MOST_VALUE && !(typeof reason === 'string' && reason.length > MOST_VALUE))
      return `A value in a change is too long: at most ${MOST_VALUE} characters.`;
  }
  return null;
}

/** How many of Claude's proposals the note holds with a change still waiting. */
const openIn = (note: string): number =>
  gqlSpans(note).filter((s) => {
    const id = changeSetId(s.text)?.id ?? '';
    return id.startsWith('claude_') && s.text.split('\n').some((l) => l.trim() !== '' && !l.trim().startsWith('//'));
  }).length;

/**
 * The note with Claude's proposal written beside its graph. `body` is the request's JSON, `proposer` the name in the
 * change set's header, `at` the time. Refused, with a status and plain words, when the body is not changes alone, the
 * changes cannot be read, the note has no graph, the same proposal is in the note already, or the check fails it.
 */
export function proposalInto(note: string, body: string, proposer: string, at: string): Proposed {
  let given: unknown;
  try {
    given = JSON.parse(body);
  } catch {
    return no(422, 'A proposal is JSON: {"changes": [ … ]}.');
  }
  if (!isRecord(given)) return no(422, 'A proposal is JSON: {"changes": [ … ]}.');
  const extra = Object.keys(given).filter((k) => k !== 'changes' && k !== 'read');
  if (extra.length)
    return no(422, `A proposal takes only changes, and what Claude read; it was given ${extra.join(', ')}.`);
  const read = readOf(given.read);
  if (typeof read === 'string') return no(422, `A proposal says ${read}.`);
  if (Array.isArray(given.changes) && given.changes.length > MOST_CHANGES)
    return no(422, `A proposal holds at most ${MOST_CHANGES} changes.`);
  const long = Array.isArray(given.changes) ? tooLong(given.changes) : null;
  if (long) return no(422, long);
  if (openIn(note) >= MOST_OPEN)
    return no(409, `${MOST_OPEN} proposals are waiting for a decision: they need to be accepted or rejected first.`);
  const changes = changesIn(JSON.stringify({ changes: given.changes }));
  if ('unread' in changes) return no(422, `The changes could not be read: ${changes.unread}.`);
  const graph = gqlSpans(note)
    .map((s) => graphOfBlock(s.text))
    .find((g) => g !== null);
  if (!graph) return no(422, 'This note has no graph to propose changes to.');
  const basis = basisOf(note, graph);
  const id = `claude_${sha256(`${basis} ${JSON.stringify(changes)}`).slice(0, 10)}`;
  if (gqlSpans(note).some((s) => changeSetId(s.text)?.id === id))
    return no(409, 'This proposal is already in the note, waiting to be decided.');
  const proposal = makeProposal({ id, graph, by: { name: proposer, kind: 'model' }, at, read, basis, changes });
  if ('refused' in proposal) return no(422, `The proposal was refused: ${proposal.refused}.`);
  const text = noteWithProposal(note, proposal);
  if (typeof text !== 'string') return no(422, `The proposal was refused: ${text.refused}.`);
  // the note keeps room for the decisions, which are written into it too
  if (
    Buffer.byteLength(text) > READ_LIMITS.bytes - ROOM_BYTES ||
    text.split('\n').length > READ_LIMITS.lines - ROOM_LINES
  )
    return no(413, 'This note is too large to take a proposal: it needs room left for the decisions.');
  return { ok: true, text, id, count: changes.length };
}
