// The block editor's parts on the page (spec §4, §9): the head with its picker and tools, the draft banner, on a phone the
// Drawing and Text tabs, the text field over its coloured picture, the fix and suggestion bars, the problems list and the
// announcer for screen readers — built once for each block shown, in the pane or in place in a drawing's card.
import { Platform, setIcon } from 'obsidian';
import type { PaneSession } from '@graph-note/core';

/** Where the editor sits: in the edit pane, with its own drawing, a picker and, on a phone, tabs; or in place, in a drawing's card. */
export type Layout = 'pane' | 'inline';

/** The editor's parts its code works with once they are built. */
export interface EditorParts {
  root: HTMLElement;
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
const nextId = (): string => `graph-note-text-${++ids}`;

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
 * Builds the editor of a session's block into a container: in the pane with its drawing, a picker when the note has
 * several graph blocks and, on a phone, tabs; in place, the text alone. `choose` opens another block of the note, and
 * `showDrawing` is called when the Drawing tab is chosen.
 */
export function buildEditor(
  container: HTMLElement,
  s: PaneSession,
  layout: Layout,
  on: { choose: (line: number) => void; showDrawing: () => void },
): EditorParts {
  const inline = layout === 'inline';
  const pane = container.createDiv({ cls: inline ? 'graph-note-pane graph-note-inline' : 'graph-note-pane' });

  const head = pane.createDiv({ cls: 'graph-note-pane-head' });
  const choices = s.choices();
  if (!inline && choices.length > 1) {
    const picker = head.createEl('select', { cls: 'dropdown', attr: { 'aria-label': 'Graph block' } });
    for (const c of choices) {
      const o = picker.createEl('option', { text: c.label, attr: { value: String(c.line) } });
      if (c.line === s.ref.line) o.setAttribute('selected', '');
    }
    picker.addEventListener('change', () => {
      on.choose(Number(picker.value));
    });
  }
  const tools = head.createDiv({ cls: 'graph-note-pane-tools' });

  const draft = pane.createDiv({ cls: 'graph-note-draft', attr: { role: 'status' } });
  draft.hidden = true;

  let drawingEl: HTMLElement | null, textEl: HTMLElement;
  if (inline) {
    drawingEl = null; // in place, the card's own drawing is the drawing
    textEl = pane.createDiv({ cls: 'graph-note-pane-text' });
  } else if (Platform.isPhone) {
    const tabs = pane.createDiv({ cls: 'graph-note-tabs', attr: { role: 'tablist' } });
    drawingEl = pane.createDiv({ cls: 'graph-note-pane-drawing', attr: { role: 'tabpanel' } });
    textEl = pane.createDiv({ cls: 'graph-note-pane-text', attr: { role: 'tabpanel' } });
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
    tab('Drawing', drawingEl, textEl, false);
    tab('Text', textEl, drawingEl, true);
    drawingEl.hidden = true;
  } else {
    drawingEl = pane.createDiv({ cls: 'graph-note-pane-drawing' });
    textEl = pane.createDiv({ cls: 'graph-note-pane-text' });
  }

  const editor = textEl.createDiv({ cls: 'graph-note-editor' });
  // a div, not a pre: inside a note, Obsidian's own code-block styles would wrap and pad it out of step with the field
  const overlay = editor.createDiv({ cls: 'graph-note-overlay', attr: { 'aria-hidden': 'true' } });
  const name = editor.createSpan({ cls: 'graph-note-sr', text: `Text of graph ${s.graph}`, attr: { id: nextId() } });
  const text = editor.createEl('textarea', {
    cls: 'graph-note-text',
    attr: {
      spellcheck: 'false',
      autocapitalize: 'off',
      autocomplete: 'off',
      autocorrect: 'off',
      wrap: 'off',
      // named by a hidden label, not aria-label: Obsidian shows a tooltip for every aria-label
      'aria-labelledby': name.id,
    },
  });
  text.value = s.text;
  const fixbar = textEl.createDiv({ cls: 'graph-note-fixbar', attr: { role: 'status', 'aria-live': 'polite' } });
  fixbar.hidden = true;
  const suggest = textEl.createDiv({
    cls: 'graph-note-suggestions',
    attr: { role: 'toolbar', 'aria-label': 'Suggestions' },
  });
  suggest.hidden = true;
  const sheetParent = Platform.isPhone && !inline ? pane.createDiv({ cls: 'graph-note-sheet' }) : textEl;
  const list = sheetParent.createDiv({
    cls: 'graph-note-pane-problems',
    attr: { role: 'region', 'aria-label': 'Problems', 'aria-live': 'polite' },
  });

  const announce = pane.createDiv({
    cls: 'graph-note-announce graph-note-sr',
    attr: { role: 'status', 'aria-live': 'polite' },
  });
  return { root: pane, text, overlay, fixbar, suggest, list, draft, drawing: drawingEl, tools, announce };
}

/** The head's tools: Done in place, Undo and Redo, and Lock the graph while the graph is a draft. */
export function showTools(
  tools: HTMLElement,
  o: { inline: boolean; draft: boolean; done: () => void; undo: () => void; redo: () => void; lock: () => void },
): void {
  tools.empty();
  if (o.inline) button(tools, 'Done', 'check', () => o.done(), 'Done');
  button(tools, 'Undo', 'undo-2', () => o.undo());
  button(tools, 'Redo', 'redo-2', () => o.redo());
  if (o.draft) button(tools, 'Lock the graph', 'lock', () => o.lock(), 'Lock the graph');
}
