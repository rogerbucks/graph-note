// What can be done with a selected thing, in one rail of its details (editor spec §25, thing_controls). The details are
// the same in 2D and in 3D, so the rail is too (Roger, 24 Oct 2026): Centre here, Show only this and its neighbours,
// with one step fewer or more under it, the shortest path, Move and a hub's fold. Each is an icon and its words.
// The built plugin, loaded against the stand-ins for the page.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { build, until } from './host/load-plugin.js';
import { fence } from './host/notes.js';
import { load, GRAPH, show } from './host/view-notes.js';

before(() => build());

const ISLAND = `${GRAPH},\n(island:Reason {title: 'Left on its own'})`;
const thing = (el, key) => el.querySelector(`g.node[data-key="${key}"]`);
const tap = (el, g) => {
  const vp = el.querySelector('.thoughtknot-viewport');
  const init = { target: g, pointerId: 3, pointerType: 'touch', clientX: 20, clientY: 20, button: 0 };
  vp.dispatch('pointerdown', init);
  vp.dispatch('pointerup', { ...init, clientX: 21 });
};
const said = (el) => el.querySelector('.thoughtknot-untangle')?.textContent ?? '';
const withText = (el, tag, text) => el.querySelectorAll(tag).find((b) => b.textContent.includes(text));

let env, el;
before(async () => {
  env = await load();
  el = (await show(env, fence(ISLAND))).el;
  tap(el, thing(el, 'large'));
});
after(() => env.uninstall());
const details = () => el.querySelector('.thoughtknot-details');

// proves: thing_controls
test('its details offer it in one rail, with one step fewer or more under it, from 1 to 3 steps', async () => {
  const rail = () => details().querySelector('.thoughtknot-untangle-offers');
  const reach = () => rail().querySelector('.thoughtknot-untangle-reach');
  assert.equal(rail().getAttribute('role'), 'toolbar');
  assert.equal(rail().getAttribute('aria-label'), 'What to do with Large reader');
  assert.ok(reach().hidden, 'no steps to choose while the whole graph is shown');
  withText(details(), 'button', 'Show only this and its neighbours').click();
  await until(() => !thing(el, 'tablet'));
  const steps = () => reach().querySelector('.thoughtknot-untangle-steps').textContent;
  const fewer = () => reach().querySelectorAll('button')[0],
    more = () => reach().querySelectorAll('button')[1];
  assert.ok(!reach().hidden);
  assert.equal(steps(), '1 step out');
  assert.ok(fewer().disabled, 'no fewer than one step');
  more().click();
  assert.match(said(el), /within 2 steps of it/);
  await until(() => !!thing(el, 'tablet'));
  more().click();
  assert.match(said(el), /within 3 steps of it/);
  assert.equal(steps(), '3 steps out');
  assert.ok(more().disabled, 'no more than three steps');
  fewer().click();
  assert.equal(steps(), '2 steps out');
  withText(details(), 'button', 'Show the whole graph').click();
  await until(() => !!thing(el, 'island'));
  assert.ok(reach().hidden);
});
