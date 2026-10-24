// What the profile tests in Obsidian share (editor spec §39). They share a note with a walked path and four things due,
// and the settings page and its rows. They share the window's timer for Play, run by hand. Test support only — nothing
// here ships.
import assert from 'node:assert/strict';
import { fence } from './notes.js';
import { settled } from './load-plugin.js';

export const PATH = 'Trip.md';
export const TRIP = `// graph: trip
(home:Place {name: 'Home'}),
(park:Place {name: 'The park'}),
(cafe:Place {name: 'Cafe'}),
(home)-[:NEAR]->(park),
(pack:Task {name: 'Pack the bag', due: '2026-01-01'}),
(map:Task {name: 'Print the map', due: '2026-01-02'}),
(call:Task {name: 'Call the cafe', due: '2026-01-03'}),
(rain:Task {name: 'Check the rain', due: '2026-01-04'}),
(tour:Path {title: 'Sunday walk'}),
(tour)-[:STEP {seq: 1}]->(home),
(tour)-[:STEP {seq: 2}]->(park),
(tour)-[:STEP {seq: 3}]->(cafe)`;
export const NOTE = ['# Trip', '', fence(TRIP), ''].join('\n');

/** The settings page as Obsidian shows it: the plugin's one tab, displayed. */
export function page(env) {
  const tab = env.state.settingTabs[0];
  tab.display();
  return tab.containerEl;
}
/** A row of the settings page by its name. */
export const row = (el, name) =>
  el
    .querySelectorAll('.setting-item')
    .find(
      (r) =>
        !r.classList.contains('setting-item-heading') && r.querySelector('.setting-item-name')?.textContent === name,
    );
/** A value chosen, or typed, in a row of the settings page. */
export async function set(env, name, value) {
  const r = row(page(env), name);
  assert.ok(r, `${name} is on the page`);
  const field = r.querySelector('select') ?? r.querySelector('input');
  field.value = String(value);
  field.dispatch(field.tagName === 'SELECT' ? 'change' : 'input');
  await settled();
}
/** A row's action pressed, by the row's name. */
export async function press(env, name) {
  row(page(env), name).querySelector('button').click();
  await settled();
}

/** The card a drawing is in: the element the profile marks. */
export const cardOf = (el) => el.querySelector('.thoughtknot-adapted')?.parentElement ?? null;
/** The things due as the card shows them. */
export const dueShown = (el) => {
  const due = el.querySelector('.thoughtknot-due');
  return !due || due.hidden ? [] : due.querySelectorAll('li').map((li) => li.textContent);
};

const PACES = [500, 1000, 2000, 4000];
/** The window's timer for the steps of Play, run by hand: a wait of a pace is kept, any other runs as ever. */
export function handTimer(env) {
  const win = env.doc.defaultView,
    [setT, clear] = [win.setTimeout, win.clearTimeout],
    waiting = new Map();
  let n = 0;
  win.setTimeout = (run, ms) => {
    if (!PACES.includes(ms)) return setT(run, ms);
    waiting.set(`step ${++n}`, { ms, run });
    return `step ${n}`;
  };
  win.clearTimeout = (handle) => (waiting.has(handle) ? waiting.delete(handle) : clear(handle));
  return {
    get pending() {
      return [...waiting.values()].map((w) => w.ms);
    },
    tick() {
      const [[handle, w]] = waiting;
      waiting.delete(handle);
      w.run();
    },
  };
}
