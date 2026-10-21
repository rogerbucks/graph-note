// Lock the graph, as text (spec §8): the note with the graph's schema `block` written as a new block after the graph's last
// block. Both hosts' notes take their Lock from this one function, so the bytes written are the same (cc_same_bytes).
import { gqlSpans, graphOfBlock, insertBlockAfter, word } from '@thoughtknot/core';

/** `note` with `block` after the last block of `graph`, or null when the graph has no block left to put it after. */
export function lockedNote(note: string, graph: string, block: string): string | null {
  const last = gqlSpans(note)
    .filter((x) => graphOfBlock(x.text) === graph)
    .pop();
  const r = last ? insertBlockAfter(note, { line: last.open, text: last.text }, block) : null;
  return r?.ok ? r.note : null;
}

/** What is said when the graph could not be locked: its block changed meanwhile. */
export const lockFailed = (): string => word('pane.lock-failed');
