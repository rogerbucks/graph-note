// What typing in the block editor's field does (spec §4): each change is read, the caret moving moves the help with it,
// Tab takes the inline match or else the first suggestion, Enter takes the inline match, Escape puts it away, and undo and redo — by key, by the Edit menu or by a phone's gesture — step through the
// editor's own history in place of the field's.
import type { Component } from 'obsidian';
import type { CompletionItem } from '@graph-note/core';
import type { Step } from './editor-history';

/** What the editor does for each thing done in the field. */
export interface Typing {
  typed: () => void;
  caretMoved: () => void;
  /** The suggestion Tab takes, if there is one. */
  first: () => CompletionItem | undefined;
  accept: (item: CompletionItem) => void;
  step: (e: Event, which: Step) => void;
  /** Takes the inline match, if one is shown; says whether it did. */
  takeInline: () => boolean;
  /** Puts the inline match away, if one is shown; says whether it did. */
  dismissInline: () => boolean;
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
  owner.registerDomEvent(text, 'keydown', (e: KeyboardEvent) => {
    // the inline match first; with none shown, each key does what it did
    if (e.key === 'Escape' && on.dismissInline()) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    const plain = !(e.shiftKey || e.ctrlKey || e.metaKey || e.altKey || e.isComposing);
    if ((e.key === 'Tab' || e.key === 'Enter') && plain && on.takeInline()) {
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
