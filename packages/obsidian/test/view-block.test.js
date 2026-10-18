// A view in a note (editor spec §2, views_in_the_note; §7, view_is_query, view_profile, empty_view, fade_or_hide_in_style,
// styled_paths_and_views, styling_keeps_locked_rules, view_saved_as_shown).
// - A query block named as a view is drawn as the things it picks out of its graph, said in plain English.
// - What is outside it is faded or hidden as its style says. Looks are drawn with their legend.
// - A query outside the view profile is refused, saying what is allowed.
// - A view that matches nothing says so, with a way to change it, never a blank drawing.
// - How it is shown is saved in the style, when asked.
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { build, load, until } from './host/load-plugin.js';
import { fence, labelled } from './host/notes.js';
import { show } from './host/view-notes.js';
import { propertiesShown } from './host/details-read.js';

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
    .filter((g) => g.classList.contains('thoughtknot-faded'))
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
        el.querySelector('.thoughtknot-view-reading').textContent,
        /round_park: everything within 1 step of The park/,
      );
      assert.deepEqual(keys(el).sort(), ['cafe', 'home', 'lake', 'park']);
      assert.deepEqual(faded(el), ['lake']);
    } finally {
      env.uninstall();
    }
  });

  // layout_contained: a graph over a limit is shown as its text "with a banner saying why", a view's as a graph's
  test('over a size limit, is shown as its query with a banner saying which limit, never as bare code', async () => {
    const note = noteOf(DATA, NEAR);
    const env = await load({ files: { [PATH]: note } });
    Object.assign(env.plugin.layoutLimits, { things: 2 });
    try {
      const { el } = await show(env, note, 1);
      const banner = el.querySelector('.thoughtknot-banner');
      assert.ok(banner, 'a banner');
      assert.match(banner.textContent, /too large/i);
      assert.match(banner.textContent, /at most 2/);
      assert.match(el.querySelector('code').textContent, /round_park/);
    } finally {
      env.plugin.onunload();
      env.uninstall();
    }
  });

  // layout_contained: a note whose graph blocks are over the text limit is never read. So a view in it is shown as its
  // query under the same banner a graph gets, and never as a view that "matches nothing"
  for (const [limit, pad, said] of [
    ['10,000 lines', '// padding\n'.repeat(10_000), /holds? 10,0\d\d lines, and at most 10,000 are read/],
    [
      '512,000 bytes',
      `// ${'x'.repeat(1000)}\n`.repeat(520),
      /hold 5\d\d(\.\d)? kB of text, and at most 512 kB is read/,
    ],
  ])
    test(`in a note over the text limit of ${limit}, is its query under the “too large to read” banner, never “matches nothing”`, async () => {
      const { env, el } = await viewCard(noteOf(`${DATA}\n${pad}`, NEAR), 1);
      try {
        const banner = el.querySelector('.thoughtknot-banner');
        assert.ok(banner, 'a banner');
        assert.match(banner.textContent, /too large to read/i);
        assert.match(banner.textContent, said);
        assert.ok(banner.querySelector('[data-icon]'), 'an icon beside the words, never colour alone');
        assert.equal(banner.getAttribute('role'), 'alert');
        assert.match(el.querySelector('code').textContent, /round_park/, 'the query, as text');
        assert.doesNotMatch(el.textContent, /matches nothing/);
        assert.equal(el.querySelectorAll('g.node').length, 0);
      } finally {
        env.plugin.onunload();
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
      assert.ok(park.classList.contains('thoughtknot-look'), 'styled');
      assert.ok(park.classList.contains('thoughtknot-line-bold'));
      const legend = el.querySelector('.thoughtknot-legend');
      assert.match(legend.textContent, /where we meet/);
      assert.ok(legend.querySelector('.thoughtknot-swatch'), 'a swatch beside the words, never colour alone');
    } finally {
      env.uninstall();
    }
  });
});

describe('what a view card says and shows', () => {
  const WALKED = `${DATA},
(tour:Path {title: 'Walk'}),
(tour)-[:STEP {seq: 1}]->(home),
(tour)-[:STEP {seq: 2}]->(park),
(home)-[:LIKES {since: 2001}]->(park)`;
  const PATHVIEW = "// graph: trip · QUERY view walk\nMATCH (p:Path {id: 'tour'})-[:STEP]->(n) RETURN p, n";
  const HIDE = "// graph: trip_style · STYLE trip\n(o:ViewStyle {view: 'walk', outside: 'hide'})";

  test('in a hidden view, a link tapped shows its own properties, never another link’s', async () => {
    const { env, el } = await viewCard(noteOf(WALKED, PATHVIEW, HIDE), 1);
    try {
      for (const g of el.querySelectorAll('g.edge[data-link]')) {
        g.dispatch('keydown', { key: 'Enter' });
        const label = g.getAttribute('aria-label');
        const details = propertiesShown(el.querySelector('.thoughtknot-details')).join('\n');
        if (/STEP|step/i.test(label) && /Home/.test(label)) assert.match(details, /seq: 1/, label);
        if (/STEP|step/i.test(label) && /park/.test(label)) assert.match(details, /seq: 2/, label);
        assert.doesNotMatch(details, /since/, `${label}: no other link's properties`);
      }
    } finally {
      env.uninstall();
    }
  });

  test('a look given to a kind is drawn on each thing of that kind, and the legend lists only looks drawn', async () => {
    const style = [
      '// graph: trip_style · STYLE trip',
      "(a:Look {view: 'round_park', kind: 'Place', colour: 'purple', means: 'places'}),",
      "(b:Look {view: 'other', thing: 'lake', colour: 'orange', means: 'elsewhere'})",
    ].join('\n');
    const { env, el } = await viewCard(noteOf(DATA, NEAR, style), 1);
    try {
      const park = el.querySelectorAll('g.node').find((g) => g.getAttribute('data-key') === 'park');
      assert.ok(park.classList.contains('thoughtknot-look'));
      assert.match(park.getAttribute('aria-label'), /places/, 'its meaning said, never colour alone');
      assert.match(el.querySelector('.thoughtknot-legend').textContent, /places/);
      assert.doesNotMatch(el.querySelector('.thoughtknot-legend').textContent, /elsewhere/);
    } finally {
      env.uninstall();
    }
  });

  test('a thing outside the view is said to be outside it, never by its fading alone', async () => {
    const { env, el } = await viewCard(noteOf(DATA, NEAR), 1);
    try {
      const lake = el.querySelectorAll('g.node').find((g) => g.getAttribute('data-key') === 'lake');
      assert.match(lake.getAttribute('aria-label'), /outside the view/);
    } finally {
      env.uninstall();
    }
  });

  test('a write from the card is confirmed in words', async () => {
    const { env, el } = await viewCard(noteOf(DATA, NEAR), 1);
    try {
      labelled(el, 'Save as shown').click();
      await until(() => /:Shown/.test(env.state.files.get(PATH)));
      assert.match(env.state.notices.at(-1), /saved/i);
    } finally {
      env.uninstall();
    }
  });

  test('a view whose drawing cannot be laid out shows its text and why, never a blank card', async () => {
    const env = await load({ files: { [PATH]: noteOf(DATA, NEAR) } });
    try {
      env.plugin.layout = () => Promise.reject(new Error('no engine'));
      const { el } = await show(env, noteOf(DATA, NEAR), 1);
      assert.ok(el.querySelector('[role="alert"]'));
      assert.ok(el.querySelector('pre'));
    } finally {
      env.uninstall();
    }
  });
});

describe('a view in reading view', () => {
  test('is read-only: it offers neither Fade or Hide others nor Save as shown', async () => {
    const env = await load({ files: { [PATH]: noteOf(DATA, NEAR) } });
    try {
      const note = noteOf(DATA, NEAR);
      const host = env.doc.body.createDiv({ cls: 'markdown-reading-view' });
      const inner = host.createDiv({ cls: 'markdown-preview-view markdown-rendered' });
      const el = inner.createDiv({ cls: 'block-language-gql' });
      const { fakeContext } = await import('./host/fake-obsidian.js');
      const fences = note.split('\n').flatMap((l, i) => (/^```gql/.test(l) ? [i] : []));
      await env.state.processors.get('gql')(NEAR, el, fakeContext(note, fences[1]));
      await until(() => !!el.querySelector('svg'));
      assert.equal(labelled(el, 'Hide others'), undefined);
      assert.equal(labelled(el, 'Save as shown'), undefined);
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
      assert.match(el.querySelector('.thoughtknot-empty').textContent, /zed/);
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
        const vp = card.querySelector('.thoughtknot-viewport');
        return [
          card.querySelector('svg').getAttribute('width'),
          vp.cssProps['--thoughtknot-x'],
          vp.cssProps['--thoughtknot-y'],
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

  // proves: zoom_fit_recomputed
  test('a zoom saved as shown is kept when the card is made before it is laid out: 0.48 with a fit of 0.3 opens at 0.48', async () => {
    const widthOf = (card) => Number(card.querySelector('svg').getAttribute('width'));
    const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-6, `${msg}: ${a} ≈ ${b}`);
    const style = "// graph: trip_style · STYLE trip\n(s1:Shown {view: 'round_park', zoom: 0.48, x: 0, y: 0})";
    const note = noteOf(DATA, NEAR, style);
    const wide = await load({ files: { [PATH]: note }, width: 1e6 });
    let d;
    try {
      d = widthOf((await show(wide, noteOf(DATA, NEAR), 1)).el); // its natural width: a fit above natural size
    } finally {
      wide.uninstall();
    }
    const env = await load({ files: { [PATH]: note }, width: 0 }); // made before it has a size, as a card not yet placed
    try {
      const { el } = await show(env, note, 1);
      env.doc.width = 0.3 * d;
      env.doc.observers.forEach((o) => o.cb([])); // laid out: the fit is 0.3
      near(widthOf(el), 0.48 * d, 'as it was saved');
    } finally {
      env.uninstall();
    }
  });

  // proves: untangle_legend
  test('Save as shown writes the legend’s choices too, and the view reopens with them; choosing alone writes nothing', async () => {
    const note = noteOf(DATA, NEAR);
    const { env, el } = await viewCard(note, 1);
    try {
      const nearLine = (card) => card.querySelector('.thoughtknot-filter button.thoughtknot-filter-type');
      const hiddenLinks = (card) =>
        card.querySelectorAll('g.edge').filter((g) => g.classList.contains('thoughtknot-hidden')).length;
      labelled(el, 'Filter by kind or link').click();
      nearLine(el).click();
      nearLine(el).click();
      assert.match(nearLine(el).textContent, /hidden/);
      assert.equal(hiddenLinks(el), 3, 'every NEAR link hidden');
      assert.equal(env.state.files.get(PATH), note, 'choosing in the legend writes nothing');
      labelled(el, 'Save as shown').click();
      await until(() => /legend: 'type:NEAR hidden'/.test(env.state.files.get(PATH)));
      const now = env.state.files.get(PATH);
      const at = now
        .split('```gql')
        .slice(1)
        .findIndex((b) => b.includes('QUERY view'));
      const again = await show(env, now, at);
      assert.match(nearLine(again.el).textContent, /hidden/, 'the legend stands as it was saved');
      assert.equal(hiddenLinks(again.el), 3, 'and the drawing with it');
    } finally {
      env.uninstall();
    }
  });
});
