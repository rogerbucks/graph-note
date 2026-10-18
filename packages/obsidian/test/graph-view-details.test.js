// Details on demand (spec §3). Tapping a box, a link or an estimated link shows what it is.
// So does reaching it from the keyboard. A tap near things reaches the nearest, and again the next.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { build } from './host/load-plugin.js';
import { fence, labelled } from './host/notes.js';
import { load, GRAPH, show, styles } from './host/view-notes.js';
import { groupsRead } from './host/details-read.js';

before(() => build());

describe('details on demand', () => {
  let env;
  before(async () => {
    env = await load();
  });
  after(() => env.uninstall());

  test('tapping a box shows its text, its kind, and its links in and out', async () => {
    const { el } = await show(env, fence(GRAPH));
    const box = el.querySelectorAll('g.node')[1];
    const vp = el.querySelector('.thoughtknot-viewport');
    vp.dispatch('pointerdown', {
      target: box,
      pointerId: 3,
      pointerType: 'touch',
      clientX: 20,
      clientY: 20,
      button: 0,
    });
    vp.dispatch('pointerup', { target: box, pointerId: 3, pointerType: 'touch', clientX: 21, clientY: 20, button: 0 });
    const panel = el.querySelector('.thoughtknot-details');
    assert.ok(!panel.hidden);
    const text = panel.textContent;
    for (const s of ['Large reader', 'Option']) assert.ok(text.includes(s), s);
    // its links read in words, grouped by type and direction (§25, details_links_listed)
    for (const s of ['answers Which device?', 'is favoured by Easy on the eyes'])
      assert.ok(groupsRead(panel).includes(s), s);
  });

  test('each box can be reached and opened from the keyboard', async () => {
    const { el } = await show(env, fence(GRAPH));
    const box = el.querySelectorAll('g.node')[0];
    assert.equal(box.getAttribute('tabindex'), '0');
    assert.equal(box.getAttribute('aria-label'), 'Question: Which device?');
    box.dispatch('keydown', { key: 'Enter' });
    assert.ok(el.querySelector('.thoughtknot-details').textContent.includes('Which device?'));
  });

  test('a problem on a box is shown with it', async () => {
    const { el } = await show(env, fence(GRAPH + ',\n(eyes)-[:FAVOURS]->(nowhere)'));
    el.querySelectorAll('g.node')[3].dispatch('keydown', { key: 'Enter' });
    assert.match(el.querySelector('.thoughtknot-details').textContent, /nowhere/);
  });
});

describe('a tap near things', () => {
  // tap_cycles_near (spec §3, slice 2; Roger, 7 Oct 2026: "clicking location that's near to one or more objects should
  // also cycle through those objects for selection"). A tap on or near boxes and links chooses the nearest.
  // A tap again in the same place chooses the next. The places are found from the same drawing the plugin shows.
  let env, areas, el, drawnAt;
  before(async () => {
    env = await load();
    const { readNote } = await import('../../core/src/drawing.ts');
    const [{ loadEngine }, { draw }] = await Promise.all([
      import('../../core/src/engine.ts'),
      import('../../core/src/render.ts'),
    ]);
    const { hitAreas } = await import('../../core/src/hits.ts');
    areas = hitAreas(draw(readNote([GRAPH]).graphs.get('reader'), await loadEngine()).svg);
    el = (await show(env, fence(GRAPH))).el;
    // a point in the drawing's own units, as the viewport's pixels
    drawnAt = (x, y) => {
      const svg = el.querySelector('svg.thoughtknot-svg'),
        vp = el.querySelector('.thoughtknot-viewport'),
        vb = areas.viewBox,
        w = Number(svg.getAttribute('width')),
        h = Number(svg.getAttribute('height'));
      return {
        clientX: parseFloat(vp.cssProps['--thoughtknot-x']) + ((x - vb.x) * w) / vb.width,
        clientY: parseFloat(vp.cssProps['--thoughtknot-y']) + ((y - vb.y) * h) / vb.height,
      };
    };
  });
  after(() => env.uninstall());

  const tapAt = (p) => {
    const vp = el.querySelector('.thoughtknot-viewport');
    vp.dispatch('pointerdown', { target: vp, pointerId: 7, pointerType: 'touch', button: 0, ...p });
    vp.dispatch('pointerup', { target: vp, pointerId: 7, pointerType: 'touch', button: 0, ...p });
  };
  const selected = () => el.querySelector('g.is-selected')?.getAttribute('id');

  test('a tap near a box, outside it, opens that box’s details', async () => {
    const { nearby } = await import('../../core/src/hits.ts');
    const box = areas.shapes.find((s) => s.kind === 'node');
    const xs = box.polygons[0].map(([x]) => x),
      ys = box.polygons[0].map(([, y]) => y);
    const x = Math.max(...xs) + 2,
      y = (Math.min(...ys) + Math.max(...ys)) / 2;
    assert.equal(nearby(areas, x, y, 0).length, 0, 'the point is outside every box and link');
    tapAt(drawnAt(x, y));
    assert.equal(selected(), box.id);
    assert.ok(!el.querySelector('.thoughtknot-details').hidden);
  });

  test('tapping again in the same place, where two are near, opens the next', async () => {
    const { nearby } = await import('../../core/src/hits.ts');
    const vb = areas.viewBox;
    let spot = null;
    for (let x = vb.x; x < vb.x + vb.width && !spot; x += 2)
      for (let y = vb.y; y < vb.y + vb.height && !spot; y += 2) {
        const ids = nearby(areas, x, y, 6);
        if (ids.length >= 2) spot = { x, y, ids };
      }
    assert.ok(spot, 'somewhere near two things');
    const p = drawnAt(spot.x, spot.y);
    tapAt(p);
    const first = selected();
    tapAt(p);
    const second = selected();
    assert.notEqual(first, second, 'the next of them');
    assert.ok(spot.ids.includes(first) && spot.ids.includes(second));
    for (let n = 2; n < spot.ids.length; n++) tapAt(p);
    tapAt(p);
    assert.equal(selected(), first, 'round to the first');
  });

  test('two quick taps near things, not on them, never zoom: a tap near things is never half of a double tap', async () => {
    const { nearby } = await import('../../core/src/hits.ts');
    const box = areas.shapes.find((s) => s.kind === 'node');
    const xs = box.polygons[0].map(([x]) => x),
      ys = box.polygons[0].map(([, y]) => y);
    const x = Math.max(...xs) + 2,
      y = (Math.min(...ys) + Math.max(...ys)) / 2;
    assert.equal(nearby(areas, x, y, 0).length, 0);
    const svg = el.querySelector('svg.thoughtknot-svg'),
      width = svg.getAttribute('width');
    const p = drawnAt(x, y),
      vp = el.querySelector('.thoughtknot-viewport');
    for (const t of [1000, 1100]) {
      vp.dispatch('pointerdown', { target: vp, pointerId: 8, pointerType: 'touch', button: 0, timeStamp: t, ...p });
      vp.dispatch('pointerup', { target: vp, pointerId: 8, pointerType: 'touch', button: 0, timeStamp: t + 40, ...p });
    }
    assert.equal(svg.getAttribute('width'), width, 'the drawing is the size it was');
  });

  // device check V-08 (Roger, 11 Oct 2026): "selecting by double-click also zooms".
  // A link is thin, so a click "on" it is nearly always a click near it.
  // But the mouse's double click was judged only by the element under the pointer.
  test('a double click near a box or link, not on it, selects it and never zooms', async () => {
    const { nearby } = await import('../../core/src/hits.ts');
    const box = areas.shapes.find((s) => s.kind === 'node');
    const xs = box.polygons[0].map(([x]) => x),
      ys = box.polygons[0].map(([, y]) => y);
    const x = Math.max(...xs) + 2,
      y = (Math.min(...ys) + Math.max(...ys)) / 2;
    assert.equal(nearby(areas, x, y, 0).length, 0);
    const svg = el.querySelector('svg.thoughtknot-svg'),
      width = svg.getAttribute('width'),
      vp = el.querySelector('.thoughtknot-viewport'),
      p = drawnAt(x, y);
    for (const id of [10, 11]) {
      vp.dispatch('pointerdown', { target: vp, pointerId: id, pointerType: 'mouse', button: 0, ...p });
      vp.dispatch('pointerup', { target: vp, pointerId: id, pointerType: 'mouse', button: 0, ...p });
    }
    vp.dispatch('dblclick', { target: vp, button: 0, ...p });
    assert.equal(svg.getAttribute('width'), width, 'the drawing is the size it was');
    assert.ok(selected(), 'and what is near is selected');
  });

  test('a tap far from everything opens nothing', () => {
    el.querySelector('.thoughtknot-details').hidden = true;
    const vb = areas.viewBox;
    tapAt(drawnAt(vb.x + vb.width + 400, vb.y + vb.height + 400));
    assert.ok(el.querySelector('.thoughtknot-details').hidden);
  });
});

describe('estimated links', () => {
  let env;
  before(async () => {
    env = await load();
  });
  after(() => env.uninstall());
  const TYPO = fence(GRAPH + ',\n(eyes)-[:FAVOURS]->(tablett)');

  test('a near miss is drawn as a guess: one more link, dashed, with a warning sign and the word estimated', async () => {
    const { el } = await show(env, TYPO);
    const edges = el.querySelectorAll('g.edge');
    assert.equal(edges.length, 5);
    const guess = edges[4];
    assert.equal(guess.getAttribute('data-estimate'), '0');
    assert.ok(
      guess.querySelectorAll('path').some((p) => p.getAttribute('stroke-dasharray')),
      'dashed',
    );
    assert.match(guess.textContent, /⚠ favours \(estimated\)/);
    assert.ok(labelled(el, '1 problem'), 'and counted behind the badge');
  });

  test('tapping an estimated link explains it in a sentence, on the note’s own line', async () => {
    const { el } = await show(env, TYPO);
    const guess = el.querySelectorAll('g.edge')[4],
      vp = el.querySelector('.thoughtknot-viewport');
    vp.dispatch('pointerdown', {
      target: guess,
      pointerId: 4,
      pointerType: 'mouse',
      clientX: 30,
      clientY: 30,
      button: 0,
    });
    vp.dispatch('pointerup', {
      target: guess,
      pointerId: 4,
      pointerType: 'mouse',
      clientX: 30,
      clientY: 30,
      button: 0,
    });
    assert.equal(
      el
        .querySelector('.thoughtknot-details')
        .textContent.includes(
          'Line 9 links to tablett, which is not in graph reader. It was taken to mean tablet, one letter away. To fix it, change tablett to tablet.',
        ),
      true,
    );
  });

  // device check V-06 (Roger, 11 Oct 2026): "I can't click on the estimated link" — it is chosen as any link is
  test('tapping an estimated link selects it as any link is selected: marked, pressed, and only it', async () => {
    const { el } = await show(env, TYPO);
    const edges = el.querySelectorAll('g.edge'),
      guess = edges[4],
      vp = el.querySelector('.thoughtknot-viewport');
    assert.equal(guess.getAttribute('aria-pressed'), 'false', 'a button that can be pressed, before it is');
    edges[0].dispatch('keydown', { key: 'Enter' });
    const at = { target: guess, pointerId: 6, pointerType: 'mouse', clientX: 9, clientY: 9, button: 0 };
    vp.dispatch('pointerdown', at);
    vp.dispatch('pointerup', at);
    assert.ok(guess.classList.contains('is-selected'), 'drawn heavier, as a selected link is');
    assert.equal(guess.getAttribute('aria-pressed'), 'true');
    assert.deepEqual(
      el.querySelectorAll('g.is-selected').map((g) => g.getAttribute('id')),
      [guess.getAttribute('id')],
      'the link selected before is not any more',
    );
  });

  test('the pointer shows an estimated link can be clicked, as it shows a written one can', async () => {
    const { rules, winner } = await import('./host/cascade.js');
    const all = rules(styles, 'styles.css');
    const svg = { tag: 'svg', classes: ['thoughtknot-svg'] };
    const edge = (attrs) => ({ tag: 'g', classes: ['edge'], attrs, ancestors: [svg] });
    assert.equal(winner(all, edge({ 'data-link': '0' }), 'cursor')?.value, 'pointer');
    assert.equal(winner(all, edge({ 'data-estimate': '0' }), 'cursor')?.value, 'pointer');
  });

  test('an estimated link can be reached and explained from the keyboard', async () => {
    const { el } = await show(env, TYPO);
    const guess = el.querySelectorAll('g.edge')[4];
    assert.equal(guess.getAttribute('tabindex'), '0');
    assert.match(guess.getAttribute('aria-label'), /^Estimated link: Easy on the eyes favours Tablet/);
    guess.dispatch('keydown', { key: 'Enter' });
    assert.match(el.querySelector('.thoughtknot-details').textContent, /taken to mean tablet/);
  });
});

describe('details of a link', () => {
  let env;
  before(async () => {
    env = await load();
  });
  after(() => env.uninstall());

  test('tapping a link shows its reading, the things at either end, and its properties', async () => {
    const { el } = await show(
      env,
      fence(GRAPH.replace('(eyes)-[:FAVOURS]->(large)', "(eyes)-[:FAVOURS {strength: 'strong'}]->(large)")),
    );
    const link = el.querySelectorAll('g.edge')[2];
    const vp = el.querySelector('.thoughtknot-viewport');
    vp.dispatch('pointerdown', {
      target: link,
      pointerId: 5,
      pointerType: 'touch',
      clientX: 40,
      clientY: 40,
      button: 0,
    });
    vp.dispatch('pointerup', { target: link, pointerId: 5, pointerType: 'touch', clientX: 40, clientY: 40, button: 0 });
    const panel = el.querySelector('.thoughtknot-details');
    assert.ok(!panel.hidden);
    for (const s of ['Easy on the eyes', 'favours', 'Large reader', 'FAVOURS', 'strength', 'strong'])
      assert.ok(panel.textContent.includes(s), s);
    assert.ok(link.classList.contains('is-selected'), 'the link is marked as selected');
  });

  test('each link can be reached and opened from the keyboard, and is named for screen readers', async () => {
    const { el } = await show(env, fence(GRAPH));
    const link = el.querySelectorAll('g.edge')[0];
    assert.equal(link.getAttribute('tabindex'), '0');
    assert.equal(link.getAttribute('aria-label'), 'Link: Large reader answers Which device?');
    link.dispatch('keydown', { key: 'Enter' });
    assert.match(el.querySelector('.thoughtknot-details').textContent, /answers/);
  });
});
