// What the block editor adds for you as you type (spec §4): the comma that parts one pattern from the next, and the colon
// of a link type written without one — the note's own editor adds them the same way (editor.ts) — and a closer typed
// where it is already there, stepped over.
import { colonFor, commaFor, gqlSpans, stepOver } from '@thoughtknot/core';

/**
 * Steps over a closer just typed where the same one already follows and closes what is open: the one that follows is taken
 * away, so the caret is past it. `before` is the field's text before the keystroke. Says whether it did. It is done before
 * the keystroke is recorded, so the history holds only text that was on screen, never the doubled closer.
 */
export function stepOverInField(t: HTMLTextAreaElement, before: string): boolean {
  const v = t.value,
    caret = t.selectionStart ?? v.length;
  const over = stepOver(before, v, caret);
  if (!over) return false;
  t.value = v.slice(0, over.from) + v.slice(over.to);
  t.setSelectionRange(caret, caret);
  return true;
}

/**
 * Adds the comma, when the ( just typed starts the next pattern on a new line and the line before is otherwise valid; or
 * the colon, when the ] just typed — or stepped over (`stepped`) — closes a link type written without one that matches one
 * type of the graph. `before` is the field's text before the keystroke, `note` the note, and `line` the line of the
 * block's opening fence: the blocks above it give the graph's types. Says whether it added one.
 */
export function addForYouInField(
  t: HTMLTextAreaElement,
  before: string,
  note: string,
  line: number,
  stepped = false,
): boolean {
  const v = t.value,
    caret = t.selectionStart ?? v.length;
  if (!stepped && (v.length !== before.length + 1 || v.slice(0, caret - 1) + v.slice(caret) !== before)) return false;
  const at = stepped ? null : commaFor(v, caret);
  if (at !== null) {
    t.value = v.slice(0, at) + ',' + v.slice(at);
    t.setSelectionRange(caret + 1, caret + 1);
    return true;
  }
  const earlier = gqlSpans(note)
    .filter((x) => x.open < line)
    .map((x) => x.text);
  const colon = colonFor(v, caret, earlier);
  if (!colon) return false;
  const was = v.slice(colon.from, colon.to);
  t.value = v.slice(0, colon.from) + colon.text + v.slice(colon.to);
  const moved = caret + colon.text.length - was.length;
  t.setSelectionRange(moved, moved);
  return true;
}
