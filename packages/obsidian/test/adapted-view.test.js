// A shared view adapted for its viewer (editor spec §39, adapted_for_viewer). A profile changes how a shared view is
// shown to its viewer alone, never what it holds. A label says the view is adapted, with the original one tap away.
// Show as shared lasts the session, resets itself and is never saved.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { build, load } from './host/load-plugin.js';
import { labelled } from './host/notes.js';
import { show } from './host/view-notes.js';
import { NOTE, PATH, cardOf } from './host/profile-notes.js';

before(() => build());

const MINE = { profile: { settings: { density: 'compact', cues: 'icons' } } };
/** The facts a card shows: each box's words, and each link's ends. */
const facts = (el) => ({
  things: el.querySelectorAll('g.node').map((n) => `${n.getAttribute('data-key')}: ${n.textContent}`),
  links: el.querySelectorAll('g.edge').length,
});
const label = (el) => el.querySelector('.thoughtknot-adapted span').textContent;

test('two viewers see the same facts, the label shows, and show-as-shared resets next session', async () => {
  const mine = await load({ files: { [PATH]: NOTE }, data: MINE });
  const theirs = await load({ files: { [PATH]: NOTE } });
  let kept;
  try {
    const { el } = await show(mine, NOTE);
    const { el: other } = await show(theirs, NOTE);
    assert.deepEqual(facts(el), facts(other), 'the same facts for both viewers');
    assert.ok(facts(el).things.length > 0);
    assert.equal(label(el), 'Adapted for you');
    assert.ok(cardOf(el).classList.contains('thoughtknot-density-compact'));
    assert.equal(cardOf(other), null, 'the other viewer sees no label and no adapting');

    // one tap: shown as shared, for this session, in this card and the next
    labelled(el, 'Show as shared').click();
    assert.equal(label(el), 'Shown as everyone sees it, for this session');
    assert.ok(!cardOf(el).classList.contains('thoughtknot-density-compact'));
    assert.ok(labelled(el, 'Show adapted for you'), 'the adapted view one tap back');
    const { el: again } = await show(mine, NOTE);
    assert.equal(label(again), 'Shown as everyone sees it, for this session');
    assert.deepEqual(facts(again), facts(other));
    kept = mine.state.data;
    assert.ok(!JSON.stringify(kept).includes('shared'), 'never saved');
  } finally {
    mine.uninstall();
    theirs.uninstall();
  }
  // the next session is adapted again
  const next = await load({ files: { [PATH]: NOTE }, data: kept ?? MINE });
  try {
    const { el } = await show(next, NOTE);
    assert.equal(label(el), 'Adapted for you');
    assert.ok(cardOf(el).classList.contains('thoughtknot-cues-icons'));
  } finally {
    next.uninstall();
  }
});
