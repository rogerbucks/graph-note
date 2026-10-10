// A view in a note (editor spec §2, views_in_the_note; §7, view_is_query, view_profile, empty_view, fade_or_hide_in_style,
// styled_paths_and_views, styling_keeps_locked_rules, view_saved_as_shown): a query block named as a view is drawn as
// the things it picks out of its graph, said in plain English; what is outside it faded or hidden as its style says;
// looks drawn with their legend; a query outside the view profile refused, saying what is allowed; a view that matches
// nothing said so, with a way to change it, never a blank drawing; and how it is shown saved, when asked, in the style.
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { build, load, until } from './host/load-plugin.js';
import { fence, labelled } from './host/notes.js';
import { show } from './host/view-notes.js';

before(() => build());

const PATH = 'Some note.md';
const DATA = `// graph: trip
(home:Place {name: 'Home'}),
(park:Place {name: 'The park'}),
(cafe:Place {name: 'Cafe'}),
(lake:Place {name: 'The lake'}),
(home)-[:NEAR]->(park), (park)-[:NEAR]->(cafe), (cafe)-[:NEAR]->(lake)`;
const NEAR = "// graph: trip · QUERY view round_park\nMATCH (n {id: 'park'})-[]-{1,1}(m) RETURN n, m";
const noteOf = (...blocks) => ['# Trip', '', ...blocks.flatMap((b) => [fence(b), '']), ''].join('\n');
const keys = (el) => el.querySelectorAll('g.node').map((g) => g.getAttribute('data-key'));
const faded = (el) =>
  el
    .querySelectorAll('g.node')
    .filter((g) => g.classList.contains('graph-note-faded'))
    .map((g) => g.getAttribute('data-key'));

async function viewCard(note, n) {
  const env = await load({ files: { [PATH]: note } });
  const { el } = await show(env, note, n);
  return { env, el };
}

describe('a view', () => {
  test('is drawn from its graph, said in plain English, with the things outside it faded by default', async () => {
    const { env, el } = await viewCard(noteOf(DATA, NEAR), 1);
    try {
      assert.match(
        el.querySelector('.graph-note-view-reading').textContent,
        /round_park: everything within 1 step of The park/,
      );
      assert.deepEqual(keys(el).sort(), ['cafe', 'home', 'lake', 'park']);
      assert.deepEqual(faded(el), ['lake']);
    } finally {
      env.uninstall();
    }
  });

  test('hides the things outside it when its style says hide', async () => {
    const style = "// graph: trip_style · STYLE trip\n(o:ViewStyle {view: 'round_park', outside: 'hide'})";
    const { env, el } = await viewCard(noteOf(DATA, NEAR, style), 1);
    try {
      assert.deepEqual(keys(el).sort(), ['cafe', 'home', 'park']);
      assert.deepEqual(faded(el), []);
    } finally {
      env.uninstall();
    }
  });

  test('Hide others writes the choice into the style graph, never the data', async () => {
    const note = noteOf(DATA, NEAR);
    const { env, el } = await viewCard(note, 1);
    try {
      labelled(el, 'Hide others').click();
      await until(() => /outside: 'hide'/.test(env.state.files.get(PATH)));
      const now = env.state.files.get(PATH);
      assert.ok(now.includes(fence(DATA)), 'the data block is untouched');
      assert.match(now, /STYLE trip[\s\S]*:ViewStyle \{view: 'round_park', outside: 'hide'\}/);
    } finally {
      env.uninstall();
    }
  });

  test('draws the looks its style gives, each colour in the legend with what it means', async () => {
    const style =
      "// graph: trip_style · STYLE trip\n(l:Look {view: 'round_park', thing: 'park', colour: 'purple', line: 'bold', means: 'where we meet'})";
    const { env, el } = await viewCard(noteOf(DATA, NEAR, style), 1);
    try {
      const park = el.querySelectorAll('g.node').find((g) => g.getAttribute('data-key') === 'park');
      assert.ok(park.classList.contains('graph-note-look'), 'styled');
      assert.ok(park.classList.contains('graph-note-line-bold'));
      const legend = el.querySelector('.graph-note-legend');
      assert.match(legend.textContent, /where we meet/);
      assert.ok(legend.querySelector('.graph-note-swatch'), 'a swatch beside the words, never colour alone');
    } finally {
      env.uninstall();
    }
  });
});

describe('a view that cannot be drawn', () => {
  test('a query outside the view profile is refused, saying what is allowed, and its text shown', async () => {
    const bad = "// graph: trip · QUERY view odd\nMATCH (n) WHERE n.name STARTS WITH 'C' RETURN n";
    const { env, el } = await viewCard(noteOf(DATA, bad), 1);
    try {
      assert.equal(el.querySelector('svg'), null);
      assert.match(el.querySelector('[role="alert"]').textContent, /hand-picked/i);
      assert.ok(el.querySelector('pre'), 'the query, as written');
    } finally {
      env.uninstall();
    }
  });

  test('a view that matches nothing says so and offers to change it: never a blank drawing', async () => {
    const none = "// graph: trip · QUERY view nobody\nMATCH (n) WHERE n.id IN ['zed'] RETURN n";
    const { env, el } = await viewCard(noteOf(DATA, none), 1);
    try {
      assert.equal(el.querySelector('svg'), null);
      assert.match(el.querySelector('.graph-note-empty').textContent, /zed/);
      assert.ok(labelled(el, 'Change the view'));
    } finally {
      env.uninstall();
    }
  });
});

describe('a view saved as shown', () => {
  test('Save as shown writes its zoom and position into the style graph, and the view reopens the same', async () => {
    const { env, el } = await viewCard(noteOf(DATA, NEAR), 1);
    try {
      labelled(el, 'Zoom in').click();
      labelled(el, 'Zoom in').click();
      // how it is shown: the drawing's size, and its place in the viewport
      const shownAs = (card) => {
        const vp = card.querySelector('.graph-note-viewport');
        return [
          card.querySelector('svg').getAttribute('width'),
          vp.cssProps['--graph-note-x'],
          vp.cssProps['--graph-note-y'],
        ];
      };
      const before = shownAs(el);
      labelled(el, 'Save as shown').click();
      await until(() => /:Shown/.test(env.state.files.get(PATH)));
      // the style block is written after the graph's data, so the view is now the third block
      const now = env.state.files.get(PATH);
      const at = now
        .split('```gql')
        .slice(1)
        .findIndex((b) => b.includes('QUERY view'));
      const again = await show(env, now, at);
      assert.deepEqual(shownAs(again.el), before);
    } finally {
      env.uninstall();
    }
  });
});
