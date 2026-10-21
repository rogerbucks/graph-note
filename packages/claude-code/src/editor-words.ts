// What `/graph edit` says and understands (spec §26, workstream C2 and C3). That is the outcome of a call, the words of
// the pane's answer, the command line, and who may say yes. None holds the address, the token or the note's text
// (cc_transcript_clean).
import { notePath } from './graph-view.ts';
import type { SpawnedEnd } from './editor-spawn.ts';
import { word } from '@thoughtknot/core';

/**
 * What `/graph edit` came to: the note it opened, or why it could not. A note held back by the gate says so in `held`.
 * - `asks` waits for `confirm` (a yes).
 * - `refused` has no yes. That is the highest classification, a credential, or a note or settings that could not be
 *   read.
 * Neither is drawn in its place.
 */
export type EditOutcome =
  { ok: true; title: string; reused: boolean } | { ok: false; why: string; held?: 'asks' | 'refused' };

/** What a `confirm` from anything but the person typing is told. */
export const notThePerson = (): string => word('cc.editor.not-the-person');
/** What an `edit` of a note above the level, from anything but the person typing, is told. */
export const notThePersonAsking = (): string => word('cc.editor.not-the-person-asking');

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
    return word(outcome.reused ? 'cc.editor.already-open' : 'cc.editor.ready', { title: outcome.title });
  }
  const why = /[.!?]$/.test(outcome.why) ? outcome.why : `${outcome.why}.`;
  if (outcome.held === 'asks') return word('cc.editor.asks', { why });
  if (outcome.held === 'refused') return word('cc.editor.refused', { why });
  return word('cc.editor.not-started', { why });
}

/** Whether the arguments are `/graph confirm`, the user's yes to the question the last `/graph edit` asked. */
export function confirmArgs(args: string): boolean {
  return args.trim() === 'confirm';
}

/** How a process ended, as said in brackets: by its signal, else its exit code. */
export const sayEndCode = (end: SpawnedEnd): string =>
  end.code === null
    ? word('cc.editor.signal', { signal: end.signal ?? word('cc.editor.signal-unknown') })
    : word('cc.exit-code', { code: end.code });

/** Why a server's process ended, in words: by its signal, else with its exit code. */
export const sayEnded = (end: SpawnedEnd): string =>
  end.signal
    ? word('cc.editor.ended-by', { signal: end.signal })
    : word('cc.editor.exited', { code: String(end.code) });

/** The words for a server that has stopped, with the reason. */
export function sayStopped(reason: string): string {
  return word('cc.editor.stopped', { reason });
}

/** The note named after `/graph edit`, or null when the arguments are not that command; '' when no note was named. */
export function editArgs(args: string): string | null {
  const m = /^edit(?:\s+([\s\S]*))?$/.exec(args.trim());
  return m ? notePath(m[1] ?? '') : null;
}
