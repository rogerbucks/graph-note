// The controls of a card's details, as the read-only tests check them: every one that can be pressed or typed in, by
// its name, and pressing in turn those that should only find the way round the drawing (§25), so one that wrote to the
// note would show when the test then checks the note is unchanged.
import assert from 'node:assert/strict';

const SELECTOR = [
  '.thoughtknot-details button',
  '.thoughtknot-details input',
  '.thoughtknot-details select',
  '.thoughtknot-details textarea',
  '.thoughtknot-details [role="button"]',
].join(', ');

/** A control's name: its label, its words, its class or its tag. */
const nameOf = (c) => c.getAttribute('aria-label') || c.textContent || c.getAttribute('class') || c.tagName;

/** Every control in `el`'s details, as elements. */
export const controlsIn = (el) => el.querySelectorAll(SELECTOR);

/** Every control in `el`'s details, by name. */
export const controls = (el) => controlsIn(el).map(nameOf);

/**
 * Holds the details `reopen` opens to exactly the controls named in `all`, in order, so a control nobody expected fails
 * the test; then presses every one of them but those named in `kept`, each a button and never a field, the details
 * opened again before each, as pressing one draws other details. After a choice in the body it presses the trail's Back
 * and then its Forward, and every other control the choice brings. It opens the details once more after, and returns
 * the names of the controls left, those in `kept`, for the test to hold to what it expects.
 */
export function pressTheRest(el, kept, reopen, all) {
  const press = (name) => {
    const c = controlsIn(el).find((x) => nameOf(x) === name);
    assert.ok(c, `${name} is there`);
    assert.equal(c.localName, 'button', `${name} is a button, never a field`);
    c.click();
  };
  const starting = (words) => controls(el).find((n) => n.startsWith(words));
  reopen();
  assert.deepEqual(controls(el), all, 'the details hold these controls and no others');
  const rest = controlsIn(el).filter((c) => !kept.includes(nameOf(c)));
  const names = rest.map(nameOf);
  for (const name of names) {
    reopen();
    press(name);
  }
  // after a choice in the body: the trail's Back, then its Forward, and each other control the choice brings
  const choice = rest.find((c) => !c.closest('.thoughtknot-details-head'));
  if (choice) {
    reopen();
    press(nameOf(choice));
    const more = controls(el).filter((n) => !kept.includes(n) && !names.includes(n));
    const back = starting('Back to ');
    assert.ok(back, 'a choice gives the trail a step back');
    press(back);
    const forward = starting('Forward to ');
    assert.ok(forward, 'and, once back, a step forward');
    press(forward);
    for (const name of more.filter((n) => n !== back)) {
      reopen();
      press(nameOf(choice));
      press(name);
    }
  }
  reopen();
  return controls(el).filter((n) => kept.includes(n));
}
