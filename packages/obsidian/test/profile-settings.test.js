// A personal profile set on the settings page (editor spec §39, profile_settings). A profile sets density, chunk size,
// visual cues, reminders and pacing. Each changes how the graph is shown to the person, and nothing in the note.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { build, load } from './host/load-plugin.js';
import { labelled } from './host/notes.js';
import { show } from './host/view-notes.js';
import { NOTE, PATH, cardOf, dueShown, handTimer, set } from './host/profile-notes.js';

before(() => build());

test('changing each profile setting changes the display accordingly', async () => {
  const env = await load({ files: { [PATH]: NOTE } });
  const drawn = async () => (await show(env, NOTE)).el;
  try {
    let el = await drawn();
    assert.equal(cardOf(el), null, 'with no profile, the card is as everyone sees it');
    assert.deepEqual(dueShown(el), []);

    await set(env, 'Density', 'compact');
    el = await drawn();
    assert.ok(cardOf(el).classList.contains('thoughtknot-density-compact'));
    await set(env, 'Density', 'roomy');
    el = await drawn();
    assert.ok(cardOf(el).classList.contains('thoughtknot-density-roomy'));
    assert.ok(!cardOf(el).classList.contains('thoughtknot-density-compact'));

    await set(env, 'Visual cues', 'icons');
    el = await drawn();
    assert.ok(cardOf(el).classList.contains('thoughtknot-cues-icons'));

    // reminders: gently, all four due within a chunk of twelve; a chunk of three shows three and says the rest
    assert.equal(dueShown(el).length, 4);
    assert.equal(el.querySelector('.thoughtknot-due-said').textContent, 'When you have a moment:');
    await set(env, 'Things at a time', 3);
    el = await drawn();
    assert.deepEqual(dueShown(el), [
      'Pack the bag (due 2026-01-01)',
      'Print the map (due 2026-01-02)',
      'Call the cafe (due 2026-01-03)',
    ]);
    assert.match(el.querySelector('.thoughtknot-due').textContent, /and 1 more$/);
    await set(env, 'Reminders', 'firm');
    el = await drawn();
    assert.ok(el.querySelector('.thoughtknot-due').classList.contains('thoughtknot-due-firm'));
    assert.equal(el.querySelector('.thoughtknot-due-said').textContent, 'Due now:');
    await set(env, 'Reminders', 'off');
    el = await drawn();
    assert.deepEqual(dueShown(el), []);

    // pacing: a path plays at the profile's pace
    await set(env, 'Pacing', 'calm');
    el = await drawn();
    const timer = handTimer(env);
    labelled(el, 'Play Sunday walk').click();
    assert.deepEqual(timer.pending, [4000], 'calm: four seconds a step');

    assert.equal(env.state.files.get(PATH), NOTE, 'the note is unchanged');
    assert.equal(env.state.data.profile.settings.pacing, 'calm', 'kept with the plugin, never in the vault');
  } finally {
    env.uninstall();
  }
});
