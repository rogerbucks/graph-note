// Quick info (editor spec §24, quick_info, quick_info_no_hover_only): pointing at a thing or a link for a moment shows a
// tooltip in the theme's style — its name, its kind, its first few properties, how many problems it has and the first
// paragraph of its note; the same tooltip opens by a long press on touch and when the thing has the keyboard focus, so
// nothing depends on hover (§5); and it never covers the thing it speaks of. The timers are held and let go by the test.
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { build, load, until, settled, root } from './host/load-plugin.js';
import { show, showIn } from './host/card-notes.js';
import { open as openPane } from './host/pane-notes.js';
import { fence } from './host/notes.js';
import {
  clock,
  link,
  open,
  overlap,
  pageRect,
  pointerOut,
  pointerOver,
  thing,
  tipOf,
  tipRect,
  touchDown,
  touchMove,
  touchUp,
} from './host/quick-info-steps.js';

before(() => build());

const PATH = 'Some note.md';
// start has five properties and a note of two paragraphs; the link has a note; "lost" is linked to nothing that is drawn
const GRAPH = `// graph: trip
/// The **start** of the trip.
///
/// Packed already.
(start:Place {name: 'Start', days: 3, mood: 'keen', colour: 'red', size: 'big'}),
(mid:Place {name: 'Middle'}),
/// Why we go. See [[Plan]].
(start)-[:TO {by: 'rail'}]->(mid),
(mid)-[:TO]->(nowhere)`;
const FILES = { [PATH]: ['# Trip', '', fence(GRAPH), ''].join('\n'), 'Plan.md': '# Plan' };

/** The card, drawn once the layout is done, and the held clock. */
async function drawn(env) {
  const el = await show(env);
  await until(() => !!el.querySelector('g.node'));
  return { el, time: clock(env) };
}
const text = (env) => tipOf(env).textContent;

describe('quick_info: pointing at a thing or a link for a moment opens the tooltip', () => {
  test('pointing at a thing waits a moment, then shows its name, kind, first properties, problems and the first paragraph of its note', async () => {
    const env = await load({ files: { ...FILES } });
    try {
      const { el, time } = await drawn(env);
      pointerOver(thing(el, 'start'));
      assert.equal(open(env), false, 'not at once: for a moment');
      assert.ok(time.pending() > 0, 'a moment is waited for');
      time.fire();
      await until(() => open(env));
      const t = tipOf(env);
      assert.equal(t.getAttribute('role'), 'tooltip');
      assert.equal(t.querySelector('.thoughtknot-quick-name').textContent, 'Start');
      assert.ok(t.querySelector('.thoughtknot-quick-kind').textContent.includes('Place'));
      // the first three properties, in the order the details give them
      for (const p of ['colour: red', 'days: 3', 'mood: keen']) assert.ok(text(env).includes(p), p);
      assert.ok(!text(env).includes('size: big'), 'only the first few');
      // its note, the first paragraph only, as Markdown
      const note = t.querySelector('.thoughtknot-quick-note');
      assert.equal(note.querySelector('strong').textContent, 'start');
      assert.ok(!text(env).includes('Packed already.'), 'the first paragraph, not the rest');
    } finally {
      env.uninstall();
    }
  });

  test('it says how many problems the thing has, in words', async () => {
    const env = await load({ files: { ...FILES } });
    try {
      const { el, time } = await drawn(env);
      pointerOver(thing(el, 'mid')); // the link to a thing that is not there
      time.fire();
      await until(() => open(env));
      assert.match(text(env), /[1-9]\d* problems?/);
      pointerOut(thing(el, 'mid'));
      pointerOver(thing(el, 'start'));
      time.fire();
      await until(() => open(env) && text(env).includes('Start'));
      assert.match(text(env), /No problems/);
    } finally {
      env.uninstall();
    }
  });

  test('pointing at a link shows how it reads, its kind, its properties and its note', async () => {
    const env = await load({ files: { ...FILES } });
    try {
      const { el, time } = await drawn(env);
      pointerOver(link(el, 0));
      time.fire();
      await until(() => open(env));
      const t = tipOf(env);
      assert.ok(t.querySelector('.thoughtknot-quick-name').textContent.includes('Middle'));
      assert.ok(t.querySelector('.thoughtknot-quick-kind').textContent.includes('TO'));
      assert.ok(text(env).includes('by: rail'));
      assert.ok(text(env).includes('Why we go.'));
      assert.equal(t.querySelector('.thoughtknot-quick-note a.internal-link')?.getAttribute('data-href'), 'Plan');
    } finally {
      env.uninstall();
    }
  });

  test('a thing with no note shows no note part', async () => {
    const env = await load({ files: { ...FILES } });
    try {
      const { el, time } = await drawn(env);
      pointerOver(thing(el, 'mid'));
      time.fire();
      await until(() => open(env));
      assert.equal(tipOf(env).querySelector('.thoughtknot-quick-note'), null);
    } finally {
      env.uninstall();
    }
  });

  test('it stays only while the pointer stays: leaving before the moment is up opens nothing, and leaving closes it', async () => {
    const env = await load({ files: { ...FILES } });
    try {
      const { el, time } = await drawn(env);
      pointerOver(thing(el, 'start'));
      pointerOut(thing(el, 'start'));
      time.fire();
      await settled();
      assert.equal(open(env), false, 'the moment was cancelled');
      pointerOver(thing(el, 'start'));
      time.fire();
      await until(() => open(env));
      pointerOut(thing(el, 'start'));
      assert.equal(open(env), false);
    } finally {
      env.uninstall();
    }
  });

  test('a finger is not hovering: a touch arriving on a thing opens nothing by itself', async () => {
    const env = await load({ files: { ...FILES } });
    try {
      const { el, time } = await drawn(env);
      pointerOver(thing(el, 'start'), 'touch');
      time.fire();
      await settled();
      assert.equal(open(env), false);
    } finally {
      env.uninstall();
    }
  });

  test('its words are text, and the note is rendered by the one renderer, from its note, owned by a component of its own', async () => {
    const env = await load({ files: { ...FILES } });
    try {
      const { el, time } = await drawn(env);
      pointerOver(thing(el, 'start'));
      time.fire();
      await until(() => open(env));
      const handed = env.state.rendered.filter((r) => r.markdown === 'The **start** of the trip.');
      assert.ok(handed.length, 'the first paragraph is rendered by the host');
      assert.ok(handed.every((r) => r.sourcePath === PATH && r.component));
    } finally {
      env.uninstall();
    }
  });

  test('in the pane, as in a card', async () => {
    const env = await openPane();
    try {
      await until(() => !!env.el.querySelector('g.node'));
      const time = clock(env);
      pointerOver(thing(env.el, 'large'));
      time.fire();
      await until(() => open(env));
      assert.equal(tipOf(env).querySelector('.thoughtknot-quick-name').textContent, 'Large reader');
      pointerOut(thing(env.el, 'large'));
      thing(env.el, 'eyes').focus();
      await until(() => text(env).includes('Easy on the eyes'));
    } finally {
      env.uninstall();
    }
  });
});

describe('quick_info_no_hover_only: the same tooltip by keyboard focus and by long press', () => {
  test('a thing that takes the keyboard focus shows it at once, and losing the focus closes it', async () => {
    const env = await load({ files: { ...FILES } });
    try {
      const { el } = await drawn(env);
      thing(el, 'start').focus();
      await until(() => open(env));
      assert.equal(tipOf(env).querySelector('.thoughtknot-quick-name').textContent, 'Start');
      thing(el, 'start').blur();
      assert.equal(open(env), false);
    } finally {
      env.uninstall();
    }
  });

  test('a link with the keyboard focus shows it too', async () => {
    const env = await load({ files: { ...FILES } });
    try {
      const { el } = await drawn(env);
      link(el, 0).focus();
      await until(() => open(env));
      assert.ok(text(env).includes('Why we go.'));
    } finally {
      env.uninstall();
    }
  });

  test('a click’s focus is not a keyboard’s: pressing on a thing does not open it by focus', async () => {
    const env = await load({ files: { ...FILES } });
    try {
      const { el } = await drawn(env);
      const vp = el.querySelector('.thoughtknot-viewport');
      vp.dispatch('pointerdown', {
        target: thing(el, 'start'),
        pointerId: 1,
        pointerType: 'mouse',
        clientX: 20,
        clientY: 20,
        button: 0,
      });
      thing(el, 'start').focus();
      await settled();
      assert.equal(open(env), false);
    } finally {
      env.uninstall();
    }
  });

  test('Escape closes it while the focus stays, so it can be dismissed', async () => {
    const env = await load({ files: { ...FILES } });
    try {
      const { el } = await drawn(env);
      thing(el, 'start').focus();
      await until(() => open(env));
      el.querySelector('.thoughtknot-viewport').dispatch('keydown', { target: thing(el, 'start'), key: 'Escape' });
      assert.equal(open(env), false);
    } finally {
      env.uninstall();
    }
  });

  test('a long press on touch shows it, and the lift after it opens no details', async () => {
    const env = await load({ files: { ...FILES } });
    try {
      const { el, time } = await drawn(env);
      touchDown(el, thing(el, 'start'));
      assert.equal(open(env), false, 'not until held');
      time.fire();
      await until(() => open(env));
      assert.equal(tipOf(env).querySelector('.thoughtknot-quick-name').textContent, 'Start');
      touchUp(el, thing(el, 'start'));
      assert.equal(el.querySelector('.thoughtknot-details').hidden, true, 'a long press is not a tap');
      assert.equal(open(env), true, 'and the tooltip stays to be read');
    } finally {
      env.uninstall();
    }
  });

  test('a tap is not a long press: lifted before the moment, it opens details and no tooltip', async () => {
    const env = await load({ files: { ...FILES } });
    try {
      const { el, time } = await drawn(env);
      touchDown(el, thing(el, 'start'));
      touchUp(el, thing(el, 'start'), { x: 21, y: 20 });
      time.fire();
      await settled();
      assert.equal(open(env), false);
      assert.equal(el.querySelector('.thoughtknot-details').hidden, false);
    } finally {
      env.uninstall();
    }
  });

  test('a hold on something with nothing to show opens no tooltip, and its lift is still a tap', async () => {
    const env = await load({ files: { ...FILES } });
    try {
      const { el, time } = await drawn(env);
      // a box the drawing's reading knows nothing of: no info to give
      const ghost = el.querySelector('svg').createEl('g', { cls: 'node', attr: { 'data-key': 'ghost', id: 'node99' } });
      const marks = () => JSON.stringify(el.querySelectorAll('g').map((g) => g.getAttribute('class')));
      const before = marks();
      touchDown(el, ghost);
      time.fire();
      await settled();
      assert.equal(open(env), false);
      touchUp(el, ghost, { x: 20, y: 20 });
      assert.notEqual(marks(), before, 'the lift went on to select it, as any tap does');
    } finally {
      env.uninstall();
    }
  });

  test('a finger that moves off is dragging, not holding', async () => {
    const env = await load({ files: { ...FILES } });
    try {
      const { el, time } = await drawn(env);
      touchDown(el, thing(el, 'start'));
      touchMove(el, thing(el, 'start'), { x: 80, y: 90 });
      time.fire();
      await settled();
      assert.equal(open(env), false);
    } finally {
      env.uninstall();
    }
  });

  test('a long press on a link shows its tooltip', async () => {
    const env = await load({ files: { ...FILES } });
    try {
      const { el, time } = await drawn(env);
      touchDown(el, link(el, 0));
      time.fire();
      await until(() => open(env));
      assert.ok(text(env).includes('Why we go.'));
    } finally {
      env.uninstall();
    }
  });

  test('a touch elsewhere closes it', async () => {
    const env = await load({ files: { ...FILES } });
    try {
      const { el, time } = await drawn(env);
      touchDown(el, thing(el, 'start'));
      time.fire();
      await until(() => open(env));
      touchUp(el, thing(el, 'start'));
      touchDown(el, el.querySelector('svg'), { x: 5, y: 5 }, 8);
      assert.equal(open(env), false);
    } finally {
      env.uninstall();
    }
  });
});

describe('quick_info: it never covers the thing, whichever way it was opened', () => {
  /** Opens the tooltip for `g` by the way given, and gives the rectangles of the thing and of the tooltip. */
  async function placed(way, key) {
    const env = await load({ files: { ...FILES } });
    const { el, time } = await drawn(env);
    const g = key.startsWith('link') ? link(el, Number(key.slice(4))) : thing(el, key);
    if (way === 'hover') {
      pointerOver(g);
      time.fire();
    } else if (way === 'focus') g.focus();
    else {
      touchDown(el, g);
      time.fire();
    }
    await until(() => open(env));
    return { env, thing: pageRect(el, g), tip: tipRect(env) };
  }
  for (const way of ['hover', 'focus', 'long press'])
    for (const key of ['start', 'mid', 'link0'])
      test(`${way}, on ${key}`, async () => {
        const { env, thing: box, tip } = await placed(way, key);
        try {
          assert.ok(!overlap(box, tip), `tooltip ${JSON.stringify(tip)} clear of ${JSON.stringify(box)}`);
          assert.ok(tip.left >= 0 && tip.top >= 0, 'and on the page');
        } finally {
          env.uninstall();
        }
      });

  test('it is moved to the thing it speaks of: shown for another thing, it is placed again', async () => {
    const env = await load({ files: { ...FILES } });
    try {
      const { el, time } = await drawn(env);
      pointerOver(thing(el, 'start'));
      time.fire();
      await until(() => open(env));
      const first = tipRect(env);
      pointerOut(thing(el, 'start'));
      pointerOver(thing(el, 'mid'));
      time.fire();
      await until(() => open(env) && text(env).includes('Middle'));
      assert.ok(!overlap(pageRect(el, thing(el, 'mid')), tipRect(env)));
      assert.notDeepEqual(tipRect(env), first);
    } finally {
      env.uninstall();
    }
  });
});

describe('quick_info: it is the theme’s, and goes with its card', () => {
  test('its box and words use the theme’s colours, never a fixed one, and it is above the full-screen layer', () => {
    const css = readFileSync(`${root}styles.css`, 'utf8');
    const rule = /\.thoughtknot-quick-info\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
    assert.match(rule, /background:\s*var\(--/);
    assert.match(rule, /color:\s*var\(--/);
    assert.match(rule, /position:\s*fixed/);
    assert.match(rule, /z-index:\s*var\(--gn-layer-tooltip\)/);
    assert.ok(!/#[0-9a-f]{3,8}\b/i.test(rule), 'no fixed colour');
  });

  test('the tooltip is made of text, never HTML', () => {
    const src = readFileSync(`${root}packages/core/src/display/graph-view/quick-info.ts`, 'utf8');
    assert.ok(!/innerHTML|outerHTML|insertAdjacentHTML/.test(src));
  });

  test('when the card goes, so does its tooltip', async () => {
    const env = await load({ files: { ...FILES } });
    try {
      const children = [];
      const el = await showIn(env, 'reading', { children });
      await until(() => !!el.querySelector('g.node'));
      const time = clock(env);
      pointerOver(thing(el, 'start'));
      time.fire();
      await until(() => open(env));
      for (const card of children) card.unload();
      assert.equal(tipOf(env), null, 'taken off the page');
    } finally {
      env.uninstall();
    }
  });
});
