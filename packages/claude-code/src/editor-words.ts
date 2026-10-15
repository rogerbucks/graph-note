// What `/graph edit` says and understands (spec §26, workstream C2 and C3): the outcome of a call, the words of the pane's
// answer, the command line, and who may say yes. None holds the address, the token or the note's text
// (cc_transcript_clean).
import { notePath } from './graph-view.ts';

/**
 * What `/graph edit` came to: the note it opened, or why it could not. A note held back by the gate says so in `held`:
 * `asks` waits for `confirm` (a yes), `refused` has no yes (the highest classification, a credential, or a note or
 * settings that could not be read), and neither is drawn in its place.
 */
export type EditOutcome =
  { ok: true; title: string; reused: boolean } | { ok: false; why: string; held?: 'asks' | 'refused' };

/** What a `confirm` from anything but the person typing is told. */
export const NOT_THE_PERSON =
  'Only the person typing can say yes to opening a note above the level set for Claude: a command from anything else is refused.';
/** What an `edit` of a note above the level, from anything but the person typing, is told. */
export const NOT_THE_PERSON_ASKING =
  'Only the person typing can say yes to that, and this command did not come from them, so it is not opened.';

/**
 * Whether a command came from the person typing in the composer: the host's `origin.kind` is exactly `composer`. A
 * plugin, a peer, a channel, a coordinator, a schedule, a bridge, an origin not known and none at all are not them.
 */
export function fromPerson(origin: unknown): boolean {
  return typeof origin === 'object' && origin !== null && (origin as { kind?: unknown }).kind === 'composer';
}

/** The words of the pane's answer: which note, and nothing of the address, the token or the note's text. */
export function sayEdit(outcome: EditOutcome): string {
  if (outcome.ok) {
    const open = outcome.reused ? 'The editor is already open for' : 'The editor is ready for';
    return `${open} ${outcome.title}. The link to open in the browser pane is in the Graph editor pane, and is not shown here.`;
  }
  const why = /[.!?]$/.test(outcome.why) ? outcome.why : `${outcome.why}.`;
  if (outcome.held === 'asks')
    return `${why} Nothing was opened or shown. Say /graph confirm to open it anyway; anything else leaves it closed.`;
  if (outcome.held === 'refused') return `${why} Nothing was opened or shown.`;
  return `The editor was not started: ${why} The drawing /graph gives is shown instead.`;
}

/** Whether the arguments are `/graph confirm`, the user's yes to the question the last `/graph edit` asked. */
export function confirmArgs(args: string): boolean {
  return args.trim() === 'confirm';
}

/** The words for a server that has stopped, with the reason. */
export function sayStopped(reason: string): string {
  return `The editor stopped: ${reason}.`;
}

/** The note named after `/graph edit`, or null when the arguments are not that command; '' when no note was named. */
export function editArgs(args: string): string | null {
  const m = /^edit(?:\s+([\s\S]*))?$/.exec(args.trim());
  return m ? notePath(m[1] ?? '') : null;
}
