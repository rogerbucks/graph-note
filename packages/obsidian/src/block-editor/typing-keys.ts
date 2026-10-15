// What typing in the block editor's field does (spec §4): each change is read, the caret moving moves the help with it,
// Tab takes the inline match or else the first suggestion, Enter takes the inline match, Escape puts it away, and undo
// and redo — by key, by the Edit menu or by a phone's gesture — step through the editor's own history in place of the
// field's.
import type { Component } from 'obsidian';
import type { Change, CompletionItem, PaneSession } from '@graph-note/core';
import type { FieldHistory, Step } from './editor-history';
import { sayRefused } from './editor-layout';
import type { EditorParts } from './editor-layout';
import type { TextHelp } from './text-help';

/** What the editor does for each thing done in the field. */
export interface Typing {
  typed: () => void;
  caretMoved: () => void;
  /** The suggestion Tab takes, if there is one. */
  first: () => CompletionItem | undefined;
  accept: (item: CompletionItem) => void;
  step: (e: Event, which: Step) => void;
  /** Takes the inline match, if one is shown — a closer only for Tab, never for Enter; says whether it did. */
  takeInline: (key: 'Tab' | 'Enter') => boolean;
  /** Puts the inline match away, if one is shown; says whether it did. */
  dismissInline: () => boolean;
}

/** What the editor itself does when the field is typed in, a suggestion is taken, or the text is changed by a step. */
export interface FieldActions {
  typed: (change?: Change) => void;
  caretMoved: () => void;
  accept: (item: CompletionItem) => void;
  /** The field's text was changed to another, by undo or redo. */
  changed: () => void;
}

/** What is done in a block's field, put together from its help, its undo history and what the editor does for each. */
export function fieldTyping(
  el: EditorParts,
  s: PaneSession,
  help: TextHelp,
  undoes: FieldHistory,
  act: FieldActions,
): Typing {
  return {
    typed: () => act.typed(),
    caretMoved: act.caretMoved,
    first: () => help.first(),
    accept: act.accept,
    step: (e, which) => {
      if (!undoes.started) return;
      e.preventDefault();
      if (undoes.step(el.text, which)) act.changed();
      else {
        // nothing to take back, the history having started again since the block changed outside the editor (§9)
        const why = s.stepRefusal(which);
        if (why) sayRefused(el.announce, why);
      }
    },
    takeInline: (key) => help.takeInline(el.text, () => act.typed('other'), key === 'Enter'),
    dismissInline: () => help.dismissInline(el, s),
  };
}

/** The step a key asks for: Command or Control with Z undoes, with Shift as well redoes, and Control with Y redoes. */
function stepOfKey(e: KeyboardEvent): Step | null {
  const key = e.key.toLowerCase(),
    mod = e.metaKey || e.ctrlKey;
  if (mod && key === 'z') return e.shiftKey ? 'redo' : 'undo';
  if (e.ctrlKey && !e.metaKey && key === 'y') return 'redo';
  return null;
}

/** Watches what is done in the field, for as long as `owner` is loaded. */
export function watchTyping(owner: Component, text: HTMLTextAreaElement, on: Typing): void {
  owner.registerDomEvent(text, 'input', () => on.typed());
  owner.registerDomEvent(text, 'keyup', () => on.caretMoved());
  owner.registerDomEvent(text, 'click', () => on.caretMoved());
  // the inline match shows only while the field has the focus
  owner.registerDomEvent(text, 'focus', () => on.caretMoved());
  owner.registerDomEvent(text, 'blur', () => on.caretMoved());
}

/** Watches the keys and input events that take a suggestion or ask for undo or redo. */
export function watchKeys(owner: Component, text: HTMLTextAreaElement, on: Typing): void {
  // WebKit ends a composition, then sends the Enter that committed it with isComposing false: so a composition just
  // ended counts as composing for the next key, and until the next tick
  let composedJustNow = false;
  owner.registerDomEvent(text, 'compositionend', () => {
    composedJustNow = true;
    window.setTimeout(() => (composedJustNow = false), 0);
  });
  owner.registerDomEvent(text, 'keydown', (e: KeyboardEvent) => {
    const composing = e.isComposing || composedJustNow;
    composedJustNow = false;
    // the inline match first; with none shown, each key does what it did
    if (e.key === 'Escape' && on.dismissInline()) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    const plain = !(e.shiftKey || e.ctrlKey || e.metaKey || e.altKey || composing);
    if ((e.key === 'Tab' || e.key === 'Enter') && plain && on.takeInline(e.key)) {
      e.preventDefault();
      return;
    }
    const first = on.first();
    if (e.key === 'Tab' && !e.shiftKey && first) {
      e.preventDefault();
      on.accept(first);
      return;
    }
    const which = stepOfKey(e);
    if (which) on.step(e, which);
  });
  // the Edit menu's Undo and Redo, and a phone's undo gesture, arrive as these
  owner.registerDomEvent(text, 'beforeinput', (e: InputEvent) => {
    if (e.inputType === 'historyUndo') on.step(e, 'undo');
    else if (e.inputType === 'historyRedo') on.step(e, 'redo');
  });
}
