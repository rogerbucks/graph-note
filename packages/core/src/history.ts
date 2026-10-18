// The text's own undo history (editor spec §4, typing_keeps_focus): Obsidian redraws a block each time its text is
// written. Chromium empties a field's undo history whenever the field leaves the page. So the editor keeps its own.
// Each run of typing is one step, as a platform's undo groups it; anything else is a step of its own.

/** A text and its selection. */
export interface TextState {
  text: string;
  start: number;
  end: number;
}

/** How a state came about: typed a character at a time, or anything else (a paste, a fix, a comma added for you). */
export type Change = 'typing' | 'other';

/** How many steps are kept: enough to undo a session's work, never every keystroke of a long one. */
const LIMIT = 300;

const same = (a: TextState, b: TextState): boolean => a.text === b.text && a.start === b.start && a.end === b.end;

/** One character typed or deleted backwards at the caret, from one state to the next; null for any other change. */
function keystroke(from: TextState, to: TextState): { kind: 'insert' | 'delete'; ch: string } | null {
  if (from.start !== from.end || to.start !== to.end) return null;
  const c = from.start;
  if (to.text.length === from.text.length + 1 && to.start === c + 1)
    return to.text.slice(0, c) === from.text.slice(0, c) && to.text.slice(c + 1) === from.text.slice(c)
      ? { kind: 'insert', ch: to.text.charAt(c) }
      : null;
  if (to.text.length === from.text.length - 1 && to.start === c - 1)
    return to.text === from.text.slice(0, c - 1) + from.text.slice(c)
      ? { kind: 'delete', ch: from.text.charAt(c - 1) }
      : null;
  return null;
}

/** The states a text has been in, and where in them it now stands. */
export class TextHistory {
  private states: TextState[];
  private at = 0;
  /** The run of typing the last step belongs to, while it can still grow. */
  private run: 'insert' | 'delete' | null = null;

  constructor(initial: TextState) {
    this.states = [initial];
  }

  /** Starts again from a state, forgetting every step: for a text reloaded from the note. */
  reset(state: TextState): void {
    this.states = [state];
    this.at = 0;
    this.run = null;
  }

  /** Records the state the text is now in; a keystroke that carries on the run of typing before it joins its step. */
  record(state: TextState, change: Change): void {
    const top = this.states[this.at];
    if (top && same(top, state)) return;
    this.states.length = this.at + 1;
    const key = change === 'typing' && top ? keystroke(top, state) : null;
    if (key && key.kind === this.run && this.at > 0) this.states[this.at] = state;
    else {
      this.states.push(state);
      this.at++;
      if (this.states.length > LIMIT + 1) {
        this.states.shift();
        this.at--;
      }
    }
    // a new line ends the run it closes, as a platform's undo does
    this.run = key && !(key.kind === 'insert' && key.ch === '\n') ? key.kind : null;
  }

  /** The state before the last step, to show; null when there is none. */
  undo(): TextState | null {
    if (this.at === 0) return null;
    this.at--;
    this.run = null;
    return this.states[this.at] ?? null;
  }

  /** The state the last undo left, to show again; null when there is none. */
  redo(): TextState | null {
    if (this.at >= this.states.length - 1) return null;
    this.at++;
    this.run = null;
    return this.states[this.at] ?? null;
  }
}
