// The block editor's parts on the page (spec §4, §9): the head with its tools, the draft banner, on a phone the
// Drawing and Text tabs, the text field over its coloured picture, the fix and suggestion bars, the problems list and the
// announcer for screen readers — built once for each block shown, in the pane or in place in a drawing's card.
import { word } from '@thoughtknot/core';
import type { PaneSession } from '@thoughtknot/core';
import { isPhone, notice, readInHostDirection, setIcon } from '../host';

/** Where the editor sits: in the edit pane, with its own drawing, a picker and, on a phone, tabs; or in place, in a drawing's card. */
export type Layout = 'pane' | 'inline';

/** The editor's parts its code works with once they are built. */
export interface EditorParts {
  root: HTMLElement;
  /** The head, which holds the picker (block-picker.ts) and the tools. */
  head: HTMLElement;
  text: HTMLTextAreaElement;
  overlay: HTMLElement;
  fixbar: HTMLElement;
  suggest: HTMLElement;
  list: HTMLElement;
  draft: HTMLElement;
  drawing: HTMLElement | null;
  tools: HTMLElement;
  announce: HTMLElement;
}

let ids = 0;
/** An id no other editor on the page uses, for a label its field points at. */
const nextId = (): string => `thoughtknot-text-${++ids}`;

/** A button named for screen readers, with an icon and words when given. */
export function button(
  parent: HTMLElement,
  label: string,
  icon: string | null,
  onClick: () => void,
  text?: string,
): HTMLButtonElement {
  const b = parent.createEl('button', { attr: { 'aria-label': label, type: 'button' } });
  if (icon) setIcon(b, icon);
  if (text) b.createSpan({ text });
  b.addEventListener('click', onClick);
  return b;
}

/**
 * Builds the editor of a session's block into a container: in the pane with its drawing and, on a phone, tabs, its head
 * left for the picker (block-picker.ts); in place, the text alone. `showDrawing` is called when the Drawing tab is chosen.
 */
export function buildEditor(
  container: HTMLElement,
  s: PaneSession,
  layout: Layout,
  on: { showDrawing: () => void },
): EditorParts {
  const inline = layout === 'inline';
  const pane = readInHostDirection(
    container.createDiv({ cls: inline ? 'thoughtknot-pane thoughtknot-inline' : 'thoughtknot-pane' }),
  );

  const head = pane.createDiv({ cls: 'thoughtknot-pane-head' });
  const tools = head.createDiv({ cls: 'thoughtknot-pane-tools' });

  const draft = pane.createDiv({ cls: 'thoughtknot-draft', attr: { role: 'status' } });
  draft.hidden = true;

  let drawingEl: HTMLElement | null, textEl: HTMLElement;
  if (inline) {
    drawingEl = null; // in place, the card's own drawing is the drawing
    textEl = pane.createDiv({ cls: 'thoughtknot-pane-text' });
  } else if (isPhone()) {
    const tabs = pane.createDiv({ cls: 'thoughtknot-tabs', attr: { role: 'tablist' } });
    drawingEl = pane.createDiv({ cls: 'thoughtknot-pane-drawing', attr: { role: 'tabpanel' } });
    textEl = pane.createDiv({ cls: 'thoughtknot-pane-text', attr: { role: 'tabpanel' } });
    const tab = (label: string, panel: HTMLElement, other: HTMLElement, selected: boolean) => {
      const b = tabs.createEl('button', {
        text: label,
        attr: { role: 'tab', type: 'button', 'aria-selected': String(selected) },
      });
      b.addEventListener('click', () => {
        panel.hidden = false;
        other.hidden = true;
        for (const x of Array.from(tabs.querySelectorAll('button'))) x.setAttribute('aria-selected', String(x === b));
        if (panel === drawingEl) on.showDrawing();
      });
    };
    tab(word('editor.drawing-tab'), drawingEl, textEl, false);
    tab(word('editor.text-tab'), textEl, drawingEl, true);
    drawingEl.hidden = true;
  } else {
    drawingEl = pane.createDiv({ cls: 'thoughtknot-pane-drawing' });
    textEl = pane.createDiv({ cls: 'thoughtknot-pane-text' });
  }

  const editor = textEl.createDiv({ cls: 'thoughtknot-editor' });
  // a div, not a pre: inside a note, Obsidian's own code-block styles would wrap and pad it out of step with the field
  const overlay = editor.createDiv({ cls: 'thoughtknot-overlay', attr: { 'aria-hidden': 'true' } });
  const name = editor.createSpan({
    cls: 'thoughtknot-sr',
    text: word('editor.text-of', { graph: s.graph }),
    attr: { id: nextId() },
  });
  const text = editor.createEl('textarea', {
    cls: 'thoughtknot-text',
    attr: {
      spellcheck: 'false',
      autocapitalize: 'off',
      autocomplete: 'off',
      autocorrect: 'off',
      // named by a hidden label, not aria-label: Obsidian shows a tooltip for every aria-label
      'aria-labelledby': name.id,
    },
  });
  text.value = s.text;
  // the suggestions drop down under the caret, inside the field's frame: a list the field's own keys work, as a code
  // editor's does, so the hands never leave the keys (§4, keyboard_any_device)
  const suggest = editor.createDiv({
    cls: 'thoughtknot-suggestions',
    attr: { role: 'listbox', id: `${name.id}-suggestions`, 'aria-label': word('editor.suggestions') },
  });
  suggest.hidden = true;
  text.setAttribute('aria-autocomplete', 'list');
  text.setAttribute('aria-controls', suggest.id);
  const fixbar = textEl.createDiv({ cls: 'thoughtknot-fixbar', attr: { role: 'status', 'aria-live': 'polite' } });
  fixbar.hidden = true;
  const sheetParent = isPhone() && !inline ? pane.createDiv({ cls: 'thoughtknot-sheet' }) : textEl;
  const list = sheetParent.createDiv({
    cls: 'thoughtknot-pane-problems',
    attr: { role: 'region', 'aria-label': word('editor.problems'), 'aria-live': 'polite' },
  });

  const announce = pane.createDiv({
    cls: 'thoughtknot-announce thoughtknot-sr',
    attr: { role: 'status', 'aria-live': 'polite' },
  });
  return { root: pane, head, text, overlay, fixbar, suggest, list, draft, drawing: drawingEl, tools, announce };
}

/**
 * The head's tools: Done in place, Open again while the editor is stopped by a copy of its block (`again`, §9), Undo and
 * Redo, and Lock the graph while the graph is a draft. An Undo or Redo with nothing to take back since the block changed
 * outside the editor (`why`, §9) keeps its name, so voice control still finds it, is marked unavailable and described
 * by why, and pressed it says so.
 */
export function showTools(
  tools: HTMLElement,
  o: {
    inline: boolean;
    draft: boolean;
    why: { undo: string | null; redo: string | null };
    done: () => void;
    undo: () => void;
    redo: () => void;
    lock: () => void;
    again: (() => void) | null;
  },
): void {
  tools.empty();
  if (o.inline)
    button(tools, word('editor.done'), 'check', () => o.done(), word('editor.done')).addClass('thoughtknot-primary');
  const again = o.again;
  if (again) button(tools, word('editor.open-again'), 'refresh-cw', () => again(), word('editor.open-again'));
  const step = (label: string, icon: string, why: string | null, onClick: () => void) => {
    const b = button(tools, label, icon, onClick);
    if (!why) return;
    b.setAttribute('aria-disabled', 'true');
    b.setAttribute('aria-description', why);
  };
  step(word('editor.undo'), 'undo-2', o.why.undo, () => o.undo());
  step(word('editor.redo'), 'redo-2', o.why.redo, () => o.redo());
  if (o.draft) button(tools, word('editor.lock'), 'lock', () => o.lock(), word('editor.lock'));
}

/** What the tools say of Undo and Redo, to draw them again only when it changes. */
export const toolsSaid = (why: { undo: string | null; redo: string | null }): string => `${why.undo}\n${why.redo}`;

/**
 * Says why Undo or Redo was refused (§9): in a notice, and to screen readers, cleared first and said on the next frame,
 * so the same words said again are heard again.
 */
export function sayRefused(announce: HTMLElement, reason: string): void {
  notice(reason);
  announce.setText('');
  window.requestAnimationFrame(() => announce.setText(reason));
}
