// The page's keyboard help (spec §26, cc_keyboard; WCAG 2.2 AA, spec §11). Plain DOM.
// - The skip link to the note.
// - Keeping the keyboard where it was when part of the page is drawn again. A change on disk or a decision does that.

/** The controls and targets the keyboard can rest on. */
const RESTING = 'a[href], button, input, select, textarea, [tabindex]';

/** The words that name an element for the keyboard's place: its own label, else its text. */
const nameOf = (el: Element): string => el.getAttribute('aria-label') ?? el.textContent?.trim() ?? '';

/** Makes `link` move the focus to the note (`#gn-page`), without putting an address in the history. */
export function skipLink(doc: Document, link: HTMLElement): void {
  link.addEventListener('click', (event) => {
    event.preventDefault();
    doc.getElementById('gn-page')?.focus();
  });
}

/**
 * Runs `redraw`, which empties and makes again what is in `root`. Then it gives the focus back to the control that had
 * it. That is the same kind of element with the same name, counting the ones of that name in the same order. A control
 * that is gone is not guessed at, and the focus outside `root` is not touched.
 */
export async function keepFocus(root: HTMLElement, redraw: () => Promise<void>): Promise<void> {
  const active = root.ownerDocument.activeElement;
  let place: { tag: string; name: string; n: number } | null = null;
  if (active && root.contains(active)) {
    const tag = active.localName;
    const name = nameOf(active);
    const same = Array.from(root.querySelectorAll(RESTING)).filter((e) => e.localName === tag && nameOf(e) === name);
    place = { tag, name, n: same.indexOf(active) };
  }
  await redraw();
  if (!place) return;
  const { tag, name, n } = place;
  const again = Array.from(root.querySelectorAll<HTMLElement>(RESTING)).filter(
    (e) => e.localName === tag && nameOf(e) === name,
  );
  again[n]?.focus();
}
