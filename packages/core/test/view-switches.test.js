// The View menu's four switches (editor spec §25): labels by zoom, busy hubs folded, groups folded and parallel links
// merged, each on or off (view_switches); starting from the plugin's settings, a style graph's merging, and a view's
// switches saved as shown (view_switch_defaults); and what a card's state of them folds, opens and saves, changing only
// the drawing (view_switch_view_only, untangle_data_untouched).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readNote } from '../src/drawing.ts';
import { DEFAULT_SETTINGS } from '../src/settings.ts';
import { readStyle } from '../src/style.ts';
import { styledDrawing } from '../src/style-source.ts';
import {
  LABEL_SCALE,
  SWITCH_NAMES,
  SWITCH_SETTINGS,
  VIEW_SWITCHES,
  ViewState,
  labelsHidden,
  startingSwitches,
} from '../src/view-switches.ts';

const star = (n) =>
  [
    '// graph: g',
    "(hub:Hub {name: 'Hub'}),",
    ...Array.from({ length: n }, (_, i) => `(leaf${i + 1}:Leaf {name: 'Leaf ${i + 1}'}),`),
    "(ann:Person {name: 'Ann'}),",
    "(bob:Person {name: 'Bob'}),",
    ...Array.from({ length: n }, (_, i) => `(hub)-[:HAS]->(leaf${i + 1}),`),
    '(ann)-[:KNOWS]->(bob)',
  ].join('\n');
const GROUPED = `// graph: g_style · STYLE g
(n1:Nudge {word: 'group', thing: 'ann', group: 'Friends'}),
(n2:Nudge {word: 'group', thing: 'bob', group: 'Friends'})`;

/** The drawing of graph g as its style draws it, with its style. */
function styledOf(...texts) {
  const reading = readNote(texts);
  const { style } = readStyle(texts, 'g', reading);
  return { drawing: styledDrawing(reading.graphs.get('g'), style, reading.world.g), style, reading };
}

describe('the four switches', () => {
  test('are labels by zoom, busy hubs folded, groups folded and parallel links merged, in that order', () => {
    assert.deepEqual(VIEW_SWITCHES, ['labels', 'hubs', 'groups', 'merge']);
    assert.deepEqual(
      VIEW_SWITCHES.map((s) => SWITCH_NAMES[s]),
      ['Labels by zoom', 'Busy hubs folded', 'Groups folded', 'Parallel links merged'],
    );
  });

  test('start from the settings: labels by zoom on, busy hubs folded on, groups folded off, links merged off', () => {
    assert.deepEqual(startingSwitches(DEFAULT_SETTINGS), { labels: true, hubs: true, groups: false, merge: false });
    const changed = { ...DEFAULT_SETTINGS, labelsByZoom: 'off', foldGroups: 'on' };
    assert.deepEqual(startingSwitches(changed), { labels: false, hubs: true, groups: true, merge: false });
    assert.deepEqual(SWITCH_SETTINGS, {
      labels: 'labelsByZoom',
      hubs: 'foldHubs',
      groups: 'foldGroups',
      merge: 'mergeLinks',
    });
  });

  test('links merged starts as the style graph merges them, and a view starts as it was saved as shown', () => {
    const { style } = styledOf(
      star(2),
      `${GROUPED},\n(r1:Links {merge: 'on'}),\n(w1:Shown {view: 'near', labels: 'off', merge: 'off', groups: 'on'})`,
    );
    assert.deepEqual(startingSwitches(DEFAULT_SETTINGS, style), {
      labels: true,
      hubs: true,
      groups: false,
      merge: true,
    });
    assert.deepEqual(startingSwitches(DEFAULT_SETTINGS, style, 'near'), {
      labels: false,
      hubs: true,
      groups: true,
      merge: false,
    });
  });
});

describe('labels by zoom', () => {
  test('hide link labels only while the drawing is shown too small to read them, under 11 pixels', () => {
    assert.ok(Math.abs(LABEL_SCALE - 11 / ((10.5 * 4) / 3)) < 1e-12);
    const on = { labels: true };
    assert.equal(labelsHidden(on, LABEL_SCALE - 0.01), true);
    assert.equal(labelsHidden(on, LABEL_SCALE), false);
    assert.equal(labelsHidden(on, 2), false);
    assert.equal(labelsHidden({ labels: false }, 0.25), false, 'off, every label is shown at any zoom');
  });
});

describe('a card’s state of the switches', () => {
  test('turning labels by zoom needs no new layout; every other switch does', () => {
    const state = new ViewState(startingSwitches(DEFAULT_SETTINGS));
    assert.equal(state.turn('labels', false), false);
    assert.equal(state.turn('groups', true), true);
    assert.equal(state.turn('groups', true), false, 'turned to what it was: nothing to do');
    assert.deepEqual(state.switches, { labels: false, hubs: true, groups: true, merge: false });
    assert.deepEqual(state.saved(), { labels: 'off', hubs: 'on', groups: 'on', merge: 'off' });
  });

  test('folds the drawing as its switches say, and opens a hub or a group again, and folds it again', () => {
    const { drawing } = styledOf(star(13), GROUPED);
    const state = new ViewState({ labels: true, hubs: true, groups: true, merge: false });
    const folded = state.folded(drawing);
    assert.deepEqual(folded.folding.hubs, [['hub', 13]]);
    assert.deepEqual(folded.folding.groups, [['Friends', ['ann', 'bob'], true]]);
    assert.deepEqual(state.hub(drawing, 'hub'), { links: 13, folded: true });
    assert.equal(state.hub(drawing, 'ann'), null, 'ann is no busy hub');
    state.open({ hub: 'hub' });
    state.open({ group: 'Friends' });
    assert.deepEqual(state.hub(drawing, 'hub'), { links: 13, folded: false });
    assert.equal(state.folded(drawing).folding, undefined);
    state.fold({ hub: 'hub' });
    assert.deepEqual(state.folded(drawing).folding.hubs, [['hub', 13]]);
    assert.deepEqual(state.plan?.hubs, [['hub', 13]], 'the last plan is kept, for what a tap on its stub opens');
  });

  test('a hub’s details count the links in its stub, and offer nothing with hubs unfolded or the hub in a folded box', () => {
    // two busy hubs joined: the link between them is in the first one's stub, so the second's holds 12
    const two = [
      star(13),
      ...Array.from({ length: 12 }, (_, i) => `(m${i}:Leaf {name: 'More ${i}'})`),
      "(hub2:Hub {name: 'Second hub'})",
      ...Array.from({ length: 12 }, (_, i) => `(hub2)-[:HAS]->(m${i})`),
      '(hub)-[:NEAR]->(hub2)',
    ].join(',\n');
    const { drawing } = styledOf(two);
    const state = new ViewState({ labels: true, hubs: true, groups: false, merge: false });
    assert.deepEqual(state.hub(drawing, 'hub'), { links: 14, folded: true });
    assert.deepEqual(state.hub(drawing, 'hub2'), { links: 12, folded: true }, 'the links actually in its stub');
    state.turn('hubs', false);
    assert.equal(state.hub(drawing, 'hub'), null, 'hubs not folded: nothing to open or fold');
    const boxed = styledOf(star(13), `${GROUPED},\n(n3:Nudge {word: 'group', thing: 'hub', group: 'Centre'})`).drawing;
    const grouped = new ViewState({ labels: true, hubs: true, groups: true, merge: false });
    assert.equal(grouped.hub(boxed, 'hub'), null, 'a hub inside a folded box is drawn as the box');
    grouped.open({ group: 'Centre' });
    assert.deepEqual(grouped.hub(boxed, 'hub'), { links: 13, folded: true });
  });

  test('turning a switch on again folds what was opened again', () => {
    const { drawing } = styledOf(star(13));
    const state = new ViewState({ labels: true, hubs: true, groups: false, merge: false });
    state.open({ hub: 'hub' });
    state.turn('hubs', false);
    state.turn('hubs', true);
    assert.deepEqual(state.folded(drawing).folding.hubs, [['hub', 13]]);
  });

  test('changes the drawing only: the drawing given and the note as read are as they were', () => {
    const { drawing, reading } = styledOf(star(13), GROUPED);
    const before = JSON.stringify([drawing, [...reading.graphs], reading.problems]);
    const state = new ViewState({ labels: true, hubs: true, groups: true, merge: true });
    state.folded(drawing);
    state.open({ hub: 'hub' });
    state.folded(drawing);
    assert.equal(JSON.stringify([drawing, [...reading.graphs], reading.problems]), before);
    assert.equal(drawing.folding, undefined);
  });
});
