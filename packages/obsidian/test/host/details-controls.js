// The controls of a card's details, as the read-only tests check them: every one that can be pressed or typed in, by
// its name, and pressing in turn those that should only find the way round the drawing (§25), so one that wrote to the
// note would show when the test then checks the note is unchanged.
import assert from 'node:assert/strict';

const SELECTOR = [
  '.graph-note-details button',
  '.graph-note-details input',
  '.graph-note-details select',
  '.graph-note-details textarea',
  '.graph-note-details [role="button"]',
].join(', ');

/** A control's name: its label, its words, its class or its tag. */
const nameOf = (c) => c.getAttribute('aria-label') || c.textContent || c.getAttribute('class') || c.tagName;

/** Every control in `el`'s details, as elements. */
export const controlsIn = (el) => el.querySelectorAll(SELECTOR);

/** Every control in `el`'s details, by name. */
export const controls = (el) => controlsIn(el).map(nameOf);

/**
 * Presses every control of the details but those named in `kept`, each a button and never a field, the details opened
 * again by `reopen` before each, as pressing one draws other details; and opens them once more after. Returns the names
 * of the controls left, those in `kept`, for the test to hold to what it expects.
 */
export function pressTheRest(el, kept, reopen) {
  const press = (name) => {
    const c = controlsIn(el).find((x) => nameOf(x) === name);
    assert.ok(c, `${name} is there`);
    assert.equal(c.localName, 'button', `${name} is a button, never a field`);
    c.click();
  };
  reopen();
  const rest = controlsIn(el).filter((c) => !kept.includes(nameOf(c)));
  const names = rest.map(nameOf);
  for (const name of names) {
    reopen();
    press(name);
  }
  // and the controls a choice in the body brings, such as the trail's Back: each pressed after that choice
  const choice = rest.find((c) => !c.closest('.graph-note-details-head'));
  if (choice) {
    reopen();
    press(nameOf(choice));
    const more = controls(el).filter((n) => !kept.includes(n) && !names.includes(n));
    for (const name of more) {
      reopen();
      press(nameOf(choice));
      press(name);
    }
  }
  reopen();
  return controls(el).filter((n) => kept.includes(n));
}
