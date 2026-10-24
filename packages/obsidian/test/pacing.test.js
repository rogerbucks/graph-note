// Pacing worked out from the session (editor spec §39, pacing_automatic). A change of pace comes from what this
// session shows. It applies at once, with an indicator that says why, and one tap overrides it. The override feeds
// back into what is detected. A change to the profile itself waits for the owner's approval.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { build, load } from './host/load-plugin.js';
import { labelled } from './host/notes.js';
import { show } from './host/view-notes.js';
import { NOTE, PATH, handTimer, page, press, row, set } from './host/profile-notes.js';

before(() => build());

const pace = (el) => el.querySelectorAll('select').find((s) => s.getAttribute('aria-label') === 'Pace').value;
const indicator = (el) => el.querySelector('.thoughtknot-pacing');
/** Steps back by hand three times, a step on between each: three signals of the same kind in a row. */
function stepBackThrice(el, timer) {
  labelled(el, 'Play Sunday walk').click();
  timer.tick();
  for (let i = 0; i < 3; i++) {
    labelled(el, 'Previous step').click();
    if (i < 2) labelled(el, 'Next step').click();
  }
}
const LEARNED = 'Pacing: Calm, because you stepped back a few times';

test('a pacing change shows its indicator and reason, one tap overrides it, and the profile itself changes only on approval', async () => {
  const env = await load({ files: { [PATH]: NOTE } });
  try {
    await set(env, 'Density', 'compact'); // a profile of the person's own
    const timer = handTimer(env);
    let { el } = await show(env, NOTE);
    stepBackThrice(el, timer);
    assert.equal(indicator(el).hidden, false, 'the change shows at once');
    assert.equal(indicator(el).textContent.startsWith('Pace: calm, because you stepped back a few times'), true);
    assert.equal(pace(el), '4000', 'and applies at once');

    // the profile has not changed: what was learned waits on the settings page
    assert.equal(env.state.data.profile.settings.pacing, undefined);
    assert.ok(row(page(env), `Approve: ${LEARNED}`), 'it waits for approval');

    // one tap keeps the usual pace
    labelled(el, 'Keep my usual pace').click();
    assert.equal(indicator(el).hidden, true);
    assert.equal(pace(el), '2000');
    assert.equal(env.state.data.profile.settings.pacing, undefined, 'and the profile is still as it was');

    // only approval changes the profile: the next card plays calm from the start
    await press(env, `Approve: ${LEARNED}`);
    assert.ok(row(page(env), `Roll back: ${LEARNED}`), 'shown in the review of what was learned');
    ({ el } = await show(env, NOTE));
    labelled(el, 'Play Sunday walk').click();
    assert.equal(pace(el), '4000');
  } finally {
    env.uninstall();
  }
});

test('an override feeds back: the same signals no longer change the pace this session', async () => {
  const env = await load({ files: { [PATH]: NOTE } });
  try {
    await set(env, 'Density', 'compact');
    const timer = handTimer(env);
    let { el } = await show(env, NOTE);
    stepBackThrice(el, timer);
    labelled(el, 'Keep my usual pace').click();
    labelled(el, 'Stop playing').click();
    stepBackThrice(el, timer);
    assert.equal(indicator(el).hidden, true, 'three more no longer change it');
    assert.equal(pace(el), '2000');
  } finally {
    env.uninstall();
  }
});
