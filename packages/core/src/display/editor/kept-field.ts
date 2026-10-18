// The block editor's field, kept across redraws (spec §4). Obsidian redraws a block's card each time its text is
// written. So the field moves into each new card, or comes back to the page in the same one. It keeps its scroll, its
// selection and its focus. They are given back whenever it is on the page again, until the person goes elsewhere.
import { Lifecycle } from '../lifecycle';

/** How long a field taken off the page, while typed in, is waited for to come back: a safety stop, not the rule. */
const REFOCUS_FOR_MS = 30_000;

/** Keeps the field's focus and scroll for the editor whose field `current` gives, through each move and redraw. */
export class KeptField extends Lifecycle {
  /**
   * Whether the field is being typed in, and where it was scrolled to. Kept here, not read from the page. Obsidian
   * takes the old card off the page before the new one asks for the editor. By then the field has lost both.
   */
  private kept = { focused: false, top: 0, left: 0 };
  private refocusTimer: number | null = null;
  private readonly current: () => HTMLTextAreaElement | undefined;

  constructor(current: () => HTMLTextAreaElement | undefined) {
    super();
    this.current = current;
  }

  override onunload(): void {
    // no timer outlives the editor
    if (this.refocusTimer !== null) window.clearTimeout(this.refocusTimer);
    this.refocusTimer = null;
  }

  /** The field is being typed in. */
  typedIn(): void {
    this.kept.focused = true;
  }

  /** The field is left: taken off the page, as Done does in place. */
  leave(): void {
    this.kept.focused = false;
  }

  /** Moves the editor into a container, with its field's scroll, selection and focus. */
  move(
    root: HTMLElement,
    container: HTMLElement,
    t: HTMLTextAreaElement | undefined,
    overlay: HTMLElement | undefined,
  ) {
    const focused = this.kept.focused || (t && activeDocument.activeElement === t),
      a = t?.selectionStart ?? 0,
      b = t?.selectionEnd ?? 0;
    container.appendChild(root);
    if (!t) return;
    t.scrollTop = this.kept.top;
    t.scrollLeft = this.kept.left;
    if (overlay) {
      overlay.scrollTop = this.kept.top;
      overlay.scrollLeft = this.kept.left;
    }
    if (focused) this.refocus(t, a, b);
  }

  /** Watches a new field: its scroll kept, with the coloured picture's following it; its focus kept, as below. */
  watch(text: HTMLTextAreaElement, overlay: HTMLElement): void {
    this.registerDomEvent(text, 'scroll', () => {
      overlay.scrollTop = text.scrollTop;
      overlay.scrollLeft = text.scrollLeft;
      this.kept.top = text.scrollTop;
      this.kept.left = text.scrollLeft;
    });
    this.registerDomEvent(text, 'focus', () => (this.kept.focused = true));
    // Left on purpose only if, once things settle, the field is still on the page without the focus. A field taken off
    // the page is still being typed in, however it comes back. It may come in a new card handed the editor. Or the same
    // card is put back as it was, as reading view does with no drawing in between (Roger's Mac, 9 Oct 2026). So its
    // focus is given back whenever it is on the page again, until the person goes elsewhere.
    // Chromium says blur while the field is still on the page, then takes it off. So it is judged a moment later. That
    // is once the taking off is done, but before anything is drawn or put back.
    this.registerDomEvent(text, 'blur', () => {
      const a = text.selectionStart,
        b = text.selectionEnd;
      queueMicrotask(() => {
        if (!text.isConnected) {
          if (this.kept.focused) this.refocus(text, a, b);
        } else if (text.ownerDocument.activeElement !== text) this.kept.focused = false;
      });
    });
    // the person going to anything else ends it
    this.registerDomEvent(activeDocument, 'focusin', (e: FocusEvent) => {
      if (e.target !== text) this.kept.focused = false;
    });
  }

  /**
   * Gives the field back its focus and selection. In Live Preview Obsidian draws a block into a card that goes on the page
   * only after. Nothing off the page can take the focus. So it waits for the field to be on the page, a couple of
   * seconds at most. It gives it back only if nothing else has taken the focus meanwhile.
   */
  private refocus(t: HTMLTextAreaElement, a: number, b: number): void {
    if (this.refocusTimer !== null) window.clearTimeout(this.refocusTimer);
    this.refocusTimer = null;
    const started = Date.now();
    const attempt = () => {
      this.refocusTimer = null;
      if (!this.kept.focused || this.current() !== t) return;
      if (t.isConnected) {
        const doc = t.ownerDocument,
          now = doc.activeElement;
        if (now && now !== doc.body && now !== t) return;
        t.focus({ preventScroll: true });
        t.setSelectionRange(a, b);
        return;
      }
      // a field that never comes back, such as one whose note was closed, stops being waited for
      if (Date.now() - started < REFOCUS_FOR_MS) this.refocusTimer = window.setTimeout(attempt, 16);
    };
    attempt();
  }
}
