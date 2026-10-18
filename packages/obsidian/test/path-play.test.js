// Play stepping through a walked path in a drawing (editor spec §7, §11): on its own, at a pace the user sets, with a
// moving highlight on the current step and a dot running the link from the step before (path_autoplay); paused or
// stopped at any step; exported as an animated SVG (path_animation_export), refused before it starts when too large for
// the device (animation_export_fits); and, whenever the system asks for reduced motion, still or instant: no dot runs,
// and every animation in the plugin's styles stops (motion_reduced_respected).
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { build, load, until } from './host/load-plugin.js';
import { fence, labelled } from './host/notes.js';
import { show, styles } from './host/view-notes.js';

before(() => build());

const PATH = 'Some note.md';
const PACES = [500, 1000, 2000, 4000];
const TRIP = `// graph: trip
(home:Place {name: 'Home'}),
(park:Place {name: 'The park'}),
(cafe:Place {name: 'Cafe'}),
(home)-[:NEAR]->(park),
(tour:Path {title: 'Sunday walk'})`;
const WALKED = `${TRIP},
(tour)-[:STEP {seq: 1}]->(home),
(tour)-[:STEP {seq: 2}]->(park),
(tour)-[:STEP {seq: 3}]->(cafe)`;
const noteOf = (block) => ['# Trip', '', fence(block), ''].join('\n');
const nodeOf = (el, key) => el.querySelectorAll('g.node').find((n) => n.getAttribute('data-key') === key);
const said = (el) => el.querySelector('.thoughtknot-walk [aria-live]').textContent;
const select = (el, label) => el.querySelectorAll('select').find((s) => s.getAttribute('aria-label') === label);
const written = (env, ext) => [...env.state.files.keys()].filter((p) => p.endsWith(ext));

/** The window's timer for the steps of Play, run by hand: a wait of a pace is kept until `tick`; any other runs as ever. */
function handTimer(env) {
  const win = env.doc.defaultView,
    [set, clear] = [win.setTimeout, win.clearTimeout],
    waiting = new Map();
  let n = 0;
  win.setTimeout = (run, ms) => {
    if (!PACES.includes(ms)) return set(run, ms);
    waiting.set(`step ${++n}`, { ms, run });
    return `step ${n}`;
  };
  win.clearTimeout = (handle) => (waiting.has(handle) ? waiting.delete(handle) : clear(handle));
  return {
    get pending() {
      return [...waiting.values()].map((w) => w.ms);
    },
    tick() {
      assert.equal(waiting.size, 1, 'one step waits at a time');
      const [[handle, w]] = waiting;
      waiting.delete(handle);
      w.run();
    },
  };
}

/** The system asks for reduced motion, or not. */
const reduce = (env, on = true) =>
  (env.doc.defaultView.matchMedia = (q) => ({ media: q, matches: on && q === '(prefers-reduced-motion: reduce)' }));

async function playing(block = WALKED, options = {}) {
  const env = await load({ files: { [PATH]: noteOf(block) }, ...options });
  const timer = handTimer(env);
  const { el, ctx } = await show(env, env.state.files.get(PATH));
  return { env, timer, el, ctx };
}

describe('Play steps through a path on its own', () => {
  // proves: path_autoplay
  test('at the pace set, one step at a time, marked and said, and it stops at the last step', async () => {
    const { env, timer, el } = await playing();
    try {
      labelled(el, 'Play Sunday walk').click();
      assert.equal(said(el), 'Step 1 of 3: Home');
      assert.deepEqual(timer.pending, [2000], 'two seconds a step until the pace is set');
      timer.tick();
      assert.equal(said(el), 'Step 2 of 3: The park');
      assert.ok(nodeOf(el, 'park').classList.contains('thoughtknot-step-current'));
      assert.ok(!nodeOf(el, 'home').classList.contains('thoughtknot-step-current'));
      timer.tick();
      assert.equal(said(el), 'Step 3 of 3: Cafe');
      assert.deepEqual(timer.pending, [], 'it stops at the last step');
      assert.ok(labelled(el, 'Play on'), 'and offers to play again');
    } finally {
      env.uninstall();
    }
  });

  // proves: path_autoplay
  test('the pace the user chooses is the pace it plays at, taken at once', async () => {
    const { env, timer, el } = await playing();
    try {
      labelled(el, 'Play Sunday walk').click();
      const pace = select(el, 'Pace');
      assert.deepEqual(
        pace.querySelectorAll('option').map((o) => o.textContent),
        ['Half a second a step', '1 second a step', '2 seconds a step', '4 seconds a step'],
      );
      pace.value = '500';
      pace.dispatch('change');
      assert.deepEqual(timer.pending, [500]);
      timer.tick();
      assert.deepEqual(timer.pending, [500]);
    } finally {
      env.uninstall();
    }
  });

  // proves: path_autoplay
  test('Pause holds it at any step, Play on plays on from there, and Stop takes it away', async () => {
    const { env, timer, el } = await playing();
    try {
      labelled(el, 'Play Sunday walk').click();
      timer.tick();
      labelled(el, 'Pause').click();
      assert.deepEqual(timer.pending, []);
      assert.equal(said(el), 'Step 2 of 3: The park', 'paused on its step');
      labelled(el, 'Play on').click();
      assert.equal(said(el), 'Step 2 of 3: The park');
      assert.deepEqual(timer.pending, [2000]);
      labelled(el, 'Stop playing').click();
      assert.deepEqual(timer.pending, []);
      assert.ok(!el.querySelectorAll('g.node').some((n) => n.classList.contains('thoughtknot-step-current')));
      assert.ok(labelled(el, 'Play Sunday walk'), 'Play is offered again');
    } finally {
      env.uninstall();
    }
  });

  // proves: path_autoplay
  test('a step taken by hand pauses it, and a card that goes stops it', async () => {
    const { env, timer, el, ctx } = await playing();
    try {
      labelled(el, 'Play Sunday walk').click();
      labelled(el, 'Next step').click();
      assert.equal(said(el), 'Step 2 of 3: The park');
      assert.deepEqual(timer.pending, [], 'paused');
      labelled(el, 'Play on').click();
      assert.deepEqual(timer.pending, [2000]);
      for (const c of ctx.children) c.unload();
      assert.deepEqual(timer.pending, [], 'nothing waits once the card is gone');
    } finally {
      env.uninstall();
    }
  });
});

describe('the moving highlight', () => {
  // proves: path_autoplay, links_show_flow
  test('the step now on is outlined, and a dot runs the link from the step before it', async () => {
    const { env, timer, el } = await playing();
    try {
      labelled(el, 'Play Sunday walk').click();
      assert.deepEqual(el.querySelectorAll('.thoughtknot-path-runner'), [], 'no step before the first');
      timer.tick();
      const link = el.querySelectorAll('g.edge').find((g) => g.getAttribute('data-link') === '0');
      const runners = el.querySelectorAll('.thoughtknot-path-runner');
      assert.equal(runners.length, 1);
      assert.ok(link.querySelectorAll('path').includes(runners[0]), 'on the link from home to the park');
      timer.tick();
      assert.deepEqual(el.querySelectorAll('.thoughtknot-path-runner'), [], 'no link joins the park and the cafe');
    } finally {
      env.uninstall();
    }
  });

  // proves: path_autoplay, links_show_flow
  test('the dot runs a link guessed from a near miss of its type too, which has no data-link', async () => {
    const guessed = `// graph: trip
(home:Place {name: 'Home'}),
(park:Place {name: 'The park'}),
(cafe:Place {name: 'Cafe'}),
(home)-[:NEAR]->(park),
(cafe)-[:NEAR]->(home),
(park)-[:NEER]->(cafe),
(tour:Path {title: 'Sunday walk'}),
(tour)-[:STEP {seq: 1}]->(home),
(tour)-[:STEP {seq: 2}]->(park),
(tour)-[:STEP {seq: 3}]->(cafe)`;
    const { env, timer, el } = await playing(guessed);
    try {
      labelled(el, 'Play Sunday walk').click();
      timer.tick();
      timer.tick();
      const link = el.querySelectorAll('g.edge').find((g) => g.getAttribute('id') === 'edge3');
      assert.ok(link.getAttribute('data-estimate') !== null, 'the misspelt link is drawn as a guess');
      const runners = el.querySelectorAll('.thoughtknot-path-runner');
      assert.equal(runners.length, 1);
      assert.ok(link.querySelectorAll('path').includes(runners[0]), 'on the guessed link from the park to the cafe');
    } finally {
      env.uninstall();
    }
  });
});

describe('still or instant whenever the system asks for reduced motion', () => {
  // proves: motion_reduced_respected
  test('each step is marked at once and said, and no dot runs', async () => {
    const { env, timer, el } = await playing();
    try {
      reduce(env);
      labelled(el, 'Play Sunday walk').click();
      timer.tick();
      assert.equal(said(el), 'Step 2 of 3: The park');
      assert.ok(nodeOf(el, 'park').classList.contains('thoughtknot-step-current'));
      assert.deepEqual(el.querySelectorAll('.thoughtknot-path-runner'), []);
    } finally {
      env.uninstall();
    }
  });

  // proves: motion_reduced_respected
  test('every animation in the plugin’s styles stops under reduced motion', () => {
    const css = styles.replace(/\/\*[\s\S]*?\*\//g, '');
    const at = css.indexOf('@media (prefers-reduced-motion: reduce)');
    assert.ok(at > 0, 'the styles say what reduced motion stops');
    const still = css.slice(at);
    const moving = [...css.slice(0, at).matchAll(/([^{}]+)\{[^}]*\banimation:\s*(?!none)[^}]*\}/g)].map((m) =>
      m[1].trim(),
    );
    assert.ok(moving.length >= 4, `the moving rules: ${moving.join(' | ')}`);
    for (const selector of moving)
      for (const one of selector.split(',').map((s) => s.trim()))
        assert.ok(still.includes(one), `${one} is still under reduced motion`);
    assert.match(still, /animation: none/);
  });
});

describe('a played path exported as an animated SVG', () => {
  // proves: path_animation_export
  test('Export as an animated SVG offers the path in the Export form, and writes it playing', async () => {
    const { env, el } = await playing();
    try {
      labelled(el, 'Play Sunday walk').click();
      labelled(el, 'Export as an animated SVG').click();
      const form = el.querySelector('.thoughtknot-export');
      assert.equal(select(form, 'What to export').value, 'path:tour');
      assert.equal(select(form, 'Format').value, 'svg');
      assert.equal(select(form, 'Pace').value, '2000', 'the pace it was playing at');
      labelled(form, 'Export it').click();
      await until(() => written(env, '.svg').length === 1);
      const svg = env.state.files.get(written(env, '.svg')[0]);
      assert.match(svg, /@keyframes thoughtknot-step-/);
      assert.match(svg, /animation: thoughtknot-step-\d+ 6s step-end infinite/);
      assert.match(svg, /@media \(prefers-reduced-motion: reduce\)/);
      assert.match(svg, /path Sunday walk/);
    } finally {
      env.uninstall();
    }
  });

  // proves: path_animation_export
  test('Export as an animated SVG always opens the form on the path: pressed again, or with the form already open', async () => {
    const { env, el } = await playing();
    try {
      const forms = () => el.querySelectorAll('.thoughtknot-export');
      labelled(el, 'Play Sunday walk').click();
      labelled(el, 'Export as an animated SVG').click();
      labelled(el, 'Export as an animated SVG').click();
      assert.equal(forms().length, 1, 'still open, once');
      assert.equal(select(forms()[0], 'What to export').value, 'path:tour');
      // the bar's Export closes the form, and opens it again on the whole diagram; the path's button puts the path back
      labelled(el.querySelector('.thoughtknot-bar'), 'Export').click();
      assert.equal(forms().length, 0);
      labelled(el.querySelector('.thoughtknot-bar'), 'Export').click();
      assert.equal(select(forms()[0], 'What to export').value, 'whole');
      labelled(el, 'Export as an animated SVG').click();
      assert.equal(forms().length, 1);
      assert.equal(select(forms()[0], 'What to export').value, 'path:tour');
    } finally {
      env.uninstall();
    }
  });

  // proves: path_animation_export
  test('a pace that is not one Play steps at is refused, and nothing is written', async () => {
    const { env } = await playing();
    try {
      const out = await env.plugin.exportGraph({
        path: PATH,
        graph: 'trip',
        format: 'svg',
        theme: 'light',
        walk: { id: 'tour', pace: 3 },
      });
      assert.match(out.stopped, /3 is not a pace a path plays at/);
      assert.deepEqual(written(env, '.svg'), []);
    } finally {
      env.uninstall();
    }
  });

  // proves: animation_export_fits
  test('one too large for the phone is refused before it starts, saying why and what would make it fit', async () => {
    const steps = Array.from({ length: 201 }, (_, i) => `(tour)-[:STEP {seq: ${i + 1}}]->(${i % 2 ? 'park' : 'home'})`);
    const { env, el } = await playing(`${TRIP},\n${steps.join(',\n')}`, { mobile: true });
    try {
      let laid = 0;
      const layout = env.plugin.layoutForExport.bind(env.plugin);
      env.plugin.layoutForExport = (...a) => (laid++, layout(...a));
      labelled(el, 'Play Sunday walk').click();
      labelled(el, 'Export as an animated SVG').click();
      labelled(el.querySelector('.thoughtknot-export'), 'Export it').click();
      await until(() =>
        /animated SVG was not made/.test(el.querySelector('.thoughtknot-export-said')?.textContent ?? ''),
      );
      const words = el.querySelector('.thoughtknot-export-said').textContent;
      assert.match(words, /the path has 201 steps, more than the 200 an animated SVG can play smoothly on this phone/);
      assert.match(words, /Nothing was saved\. To make it fit, export a path of 200 steps or fewer/);
      assert.equal(laid, 0, 'no layout was asked for');
      assert.deepEqual(written(env, '.svg'), []);
    } finally {
      env.uninstall();
    }
  });
});
