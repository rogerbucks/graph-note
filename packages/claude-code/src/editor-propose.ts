// Claude's proposal sent to the editor's server (spec §26, cc_claude_proposes): the one way Claude changes a note open
// in the pane. What leaves the mod is Claude's own input, as JSON, with the key the launcher made for this start. It is
// handed to the sender on its standard input. The sender is the shipped process `bin/propose-process.ts`, run through
// the host. The server makes the change set and holds it to the gate and the graph spec's check. Then it writes it
// beside the graph. Nothing here applies a change, and nothing here is told the note's text. What comes back is words:
// how many changes, or why not. No Node module is imported here: the sender is handed in. The words come from the
// catalogue, as Claude Code shows them in the chat too.
import { word } from '@thoughtknot/core';

/** What the sender is asked: where the server listens, the note's id, the proposer's key and the body to send. */
export interface ProposeRequest {
  port: number;
  note: string;
  key: string;
  body: string;
}

/** What the sender brings back: the server's status and its text. */
export interface ProposeReply {
  status: number;
  text: string;
}

/** What a proposal came to: how many changes the change set holds and its id, or why it was not made. */
export type ProposeOutcome = { ok: true; id: string; count: number } | { ok: false; why: string };

/** The words Claude is told: never the key, the address, the token or the note's text. */
export function sayProposed(outcome: ProposeOutcome): string {
  if (outcome.ok) return word('cc.propose.made', { count: outcome.count, id: outcome.id });
  return word('cc.propose.refused', { why: outcome.why.replace(/\.$/, '') });
}

/** The reason in a refusal's JSON, else a plain account of the status. */
function whyOf(reply: ProposeReply): string {
  try {
    const why = (JSON.parse(reply.text) as { why?: unknown }).why;
    if (typeof why === 'string' && why) return why;
  } catch {
    // not JSON: the status speaks
  }
  if (reply.status !== 0) return word('cc.propose.status', { status: String(reply.status) });
  return reply.text || word('cc.propose.unreached');
}

/** Sends `input` as a proposal to the server at `link`, with `key`, through `send`. */
export async function sendProposal(
  send: (request: ProposeRequest) => Promise<ProposeReply>,
  link: string,
  key: string,
  input: unknown,
): Promise<ProposeOutcome> {
  const url = new URL(link);
  const note = new URLSearchParams(url.hash.slice(1)).get('note') ?? '';
  let reply: ProposeReply;
  try {
    reply = await send({ port: Number(url.port), note, key, body: JSON.stringify(input) ?? 'null' });
  } catch {
    return { ok: false, why: word('cc.propose.unreached') };
  }
  if (reply.status !== 200) return { ok: false, why: whyOf(reply) };
  try {
    const made = JSON.parse(reply.text) as { id?: unknown; count?: unknown };
    if (typeof made.id === 'string' && typeof made.count === 'number')
      return { ok: true, id: made.id, count: made.count };
  } catch {
    // an answer that is not one is not a proposal made
  }
  return { ok: false, why: word('cc.propose.no-account') };
}
