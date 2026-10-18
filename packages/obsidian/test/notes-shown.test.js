// Notes shown in the editor (editor spec §24, note_shown, note_callouts).
// - A thing's or link's `///` note shows in its details. It is rendered as Markdown by the one renderer the details use.
//   Raw HTML is never rendered.
// - A setting, off by default, draws each note on the drawing as a callout. A dashed line joins it to its thing. It is
//   drawn after the layout, so the layout is the same with it on or off.
// The tooltip (quick_info) shows the same note's first paragraph, with the same renderer. So this file proves the
// details, the tooltip and the callouts.
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { build, load, until, root } from './host/load-plugin.js';
import { show } from './host/card-notes.js';
import { tapKey } from './host/inspector-steps.js';
import { fence } from './host/notes.js';
import { clock, link, open, pointerOver, thing, tipOf } from './host/quick-info-steps.js';

before(() => build());

const PATH = 'Some note.md';
const GRAPH = `// graph: trip
/// The **start** of the trip.
///
/// Packed <b>already</b>, with <img src="https://example.com/t.gif">.
(start:Place {name: 'Start'}),
(mid:Place {name: 'Middle'}),
/// Why we go. See [[Plan]].
(start)-[:TO]->(mid)`;
const FILES = { [PATH]: ['# Trip', '', fence(GRAPH), ''].join('\n'), 'Plan.md': '# Plan' };
/** The saved data of a plugin whose setting draws callouts. */
const ON = { settings: { noteCallouts: 'on' } };
const SUMMARIES = { 'thing:start': 'The start of the trip.', 'link:0': 'Why we go. See Plan.' };

/** The card, drawn once the layout is done. */
async function drawn(env) {
  const el = await show(env);
  await until(() => !!el.querySelector('g.node'));
  return el;
}
const panelOf = (el) => el.querySelector('.thoughtknot-details');
const noteIn = (panel) => panel.querySelector('.thoughtknot-thing-note');
/** The link whose number is given, opened by the keyboard as a tap does. */
const tapLink = (el, n) => el.querySelector(`g.edge[data-link="${n}"]`).dispatch('keydown', { key: 'Enter' });

describe('note_shown: a note is shown in the details of its thing or link, as Markdown', () => {
  test('a thing’s note is handed whole to the details’ one renderer, from the note it is written in, and appears as in a note', async () => {
    const env = await load({ files: { ...FILES } });
    try {
      const el = await drawn(env);
      tapKey(el, 'start');
      await until(() => !!noteIn(panelOf(el)));
      const note = noteIn(panelOf(el));
      assert.ok(note.querySelector('strong'), 'bold appears');
      assert.equal(note.querySelector('strong').textContent, 'start');
      const handed = env.state.rendered.find((r) => r.markdown.startsWith('The **start** of the trip.'));
      assert.ok(handed, 'the note is rendered by the host');
      assert.ok(handed.sourcePath === PATH && handed.component, 'from its note, owned by a component of its own');
      assert.ok(handed.markdown.includes('\n\nPacked'), 'a bare /// line is a paragraph break');
      assert.equal(panelOf(el).querySelectorAll('.thoughtknot-thing-note').length, 1);
    } finally {
      env.uninstall();
    }
  });

  test('raw HTML in a note is never rendered: nothing is handed to the renderer as HTML, and no remote image is loaded', async () => {
    const env = await load({ files: { ...FILES } });
    try {
      const el = await drawn(env);
      tapKey(el, 'start');
      await until(() => !!noteIn(panelOf(el)));
      const note = noteIn(panelOf(el));
      assert.equal(note.querySelector('b'), null, 'HTML bold is shown as text');
      assert.equal(note.querySelector('img'), null, 'no image element from HTML');
      assert.ok(note.textContent.includes('<b>already</b>'), 'the HTML is shown as the text it is');
      const handed = env.state.rendered.map((r) => r.markdown).filter((m) => m.includes('Packed'));
      assert.ok(handed.length && handed.every((m) => !/<(b|img)\b/i.test(m)), 'escaped before it reaches Obsidian');
    } finally {
      env.uninstall();
    }
  });

  test('a link’s note is shown in the link’s details, its wikilink a link', async () => {
    const env = await load({ files: { ...FILES } });
    try {
      const el = await drawn(env);
      tapLink(el, 0);
      await until(() => !!noteIn(panelOf(el)));
      const note = noteIn(panelOf(el));
      assert.ok(note.textContent.includes('Why we go.'));
      assert.equal(note.querySelector('a.internal-link')?.getAttribute('data-href'), 'Plan');
    } finally {
      env.uninstall();
    }
  });

  test('a thing with no note shows no note section', async () => {
    const env = await load({ files: { ...FILES } });
    try {
      const el = await drawn(env);
      tapKey(el, 'mid');
      await until(() => !panelOf(el).hidden && panelOf(el).textContent.includes('Middle'));
      assert.equal(noteIn(panelOf(el)), null);
      assert.ok(!panelOf(el).textContent.includes('Why we go.'), 'a link’s note is not its end’s');
    } finally {
      env.uninstall();
    }
  });
});

describe('note_shown: a note is shown in the tooltip of its thing or link, as Markdown', () => {
  /** The tooltip opened by a hover on `g` of the card drawn. */
  async function hovered(env, pick) {
    const el = await drawn(env);
    const time = clock(env);
    pointerOver(pick(el));
    time.fire();
    await until(() => open(env));
    return tipOf(env).querySelector('.thoughtknot-quick-note');
  }

  test('a thing’s tooltip shows the first paragraph of its note rendered as Markdown, from its note, by the one renderer', async () => {
    const env = await load({ files: { ...FILES } });
    try {
      const note = await hovered(env, (el) => thing(el, 'start'));
      assert.equal(note.querySelector('strong').textContent, 'start');
      assert.ok(!note.textContent.includes('Packed'), 'the first paragraph only');
      const handed = env.state.rendered.filter((r) => r.markdown === 'The **start** of the trip.');
      assert.ok(handed.length && handed.every((r) => r.sourcePath === PATH && r.component));
    } finally {
      env.uninstall();
    }
  });

  test('a link’s tooltip shows its note, its wikilink a link', async () => {
    const env = await load({ files: { ...FILES } });
    try {
      const note = await hovered(env, (el) => link(el, 0));
      assert.ok(note.textContent.includes('Why we go.'));
      assert.equal(note.querySelector('a.internal-link')?.getAttribute('data-href'), 'Plan');
    } finally {
      env.uninstall();
    }
  });

  test('raw HTML in the first paragraph is never rendered: it is shown as the text it is, and no remote image loads', async () => {
    const graph = '// graph: g\n/// Hot <b>loud</b> <img src="https://example.com/t.gif">.\n(a:T {name: \'A\'})';
    const env = await load({ files: { [PATH]: ['# Trip', '', fence(graph), ''].join('\n') } });
    try {
      const note = await hovered(env, (el) => thing(el, 'a'));
      assert.equal(note.querySelector('b'), null);
      assert.equal(note.querySelector('img'), null);
      assert.ok(note.textContent.includes('<b>loud</b>'));
      const handed = env.state.rendered.map((r) => r.markdown).filter((m) => m.includes('Hot'));
      assert.ok(handed.length && handed.every((m) => !/<(b|img)\b/i.test(m)), 'escaped before it reaches Obsidian');
    } finally {
      env.uninstall();
    }
  });
});

/** A box’s outline, as a box of the drawing’s own units: from its polygon, path or ellipse, with the graph group’s transform. */
function boxOf(el, key) {
  const g = el.querySelectorAll('g.node').find((n) => n.getAttribute('data-key') === key);
  const t = el.querySelector('g.graph')?.getAttribute('transform') ?? '';
  const [sx, sy = sx] = (/scale\(([^)]*)\)/.exec(t)?.[1] ?? '1').split(/[ ,]+/).map(Number);
  const [tx, ty] = (/translate\(([^)]*)\)/.exec(t)?.[1] ?? '0 0').split(/[ ,]+/).map(Number);
  const xs = [],
    ys = [];
  const take = (nums) => {
    for (let i = 0; i + 1 < nums.length; i += 2) {
      xs.push(sx * (nums[i] + tx));
      ys.push(sy * (nums[i + 1] + ty));
    }
  };
  const nums = (s) => (s.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
  for (const p of g.querySelectorAll('polygon')) take(nums(p.getAttribute('points')));
  for (const p of g.querySelectorAll('path')) take(nums(p.getAttribute('d')));
  for (const e of g.querySelectorAll('ellipse')) {
    const [cx, cy, rx, ry] = ['cx', 'cy', 'rx', 'ry'].map((a) => Number(e.getAttribute(a)));
    take([cx - rx, cy - ry, cx + rx, cy + ry]);
  }
  return { left: Math.min(...xs), right: Math.max(...xs), top: Math.min(...ys), bottom: Math.max(...ys) };
}
const callouts = (el) => el.querySelectorAll('g.thoughtknot-callout');
const numbers = (n, ...attrs) => attrs.map((a) => Number(n.getAttribute(a)));

describe('note_callouts: a setting draws notes as callouts, joined to their thing by a dashed line, off by default', () => {
  test('off by default: the drawing holds no callout, and the setting says Off, in the Drawing section', async () => {
    const env = await load({ files: { ...FILES } });
    try {
      const el = await drawn(env);
      assert.equal(callouts(el).length, 0);
      const tab = env.state.settingTabs[0];
      tab.display();
      const row = tab.containerEl
        .querySelectorAll('.setting-item')
        .find((r) => r.querySelector('.setting-item-name')?.textContent === 'Draw notes as callouts');
      assert.ok(row, 'the setting is on the page');
      assert.equal(row.querySelector('select').value, 'off');
    } finally {
      env.uninstall();
    }
  });

  test('on: a callout for each note, saying its summary, joined by a line from its thing or link', async () => {
    const env = await load({ files: { ...FILES }, data: ON });
    try {
      const el = await drawn(env);
      const all = callouts(el);
      assert.deepEqual(all.map((c) => c.getAttribute('data-for')).sort(), ['link:0', 'thing:start']);
      for (const c of all) {
        const words = c
          .querySelectorAll('text tspan')
          .map((t) => t.textContent)
          .join(' ');
        assert.equal(words, SUMMARIES[c.getAttribute('data-for')], c.getAttribute('data-for'));
        assert.ok(c.querySelector('line.thoughtknot-callout-line'), 'joined by a line');
        assert.ok(c.querySelector('rect.thoughtknot-callout-box'), 'in a box of its own');
      }
    } finally {
      env.uninstall();
    }
  });

  test('on: a thing’s callout is joined to its box, and no callout leaves the drawing', async () => {
    const env = await load({ files: { ...FILES }, data: ON });
    try {
      const el = await drawn(env);
      const c = callouts(el).find((x) => x.getAttribute('data-for') === 'thing:start');
      const [x1, y1] = numbers(c.querySelector('line'), 'x1', 'y1');
      const b = boxOf(el, 'start'),
        slack = 2;
      assert.ok(x1 >= b.left - slack && x1 <= b.right + slack && y1 >= b.top - slack && y1 <= b.bottom + slack);
      const [vx, vy, vw, vh] = el.querySelector('svg').getAttribute('viewBox').split(/[ ,]+/).map(Number);
      for (const k of callouts(el)) {
        const [x, y, w, h] = numbers(k.querySelector('rect'), 'x', 'y', 'width', 'height');
        assert.ok(x >= vx && y >= vy && x + w <= vx + vw && y + h <= vy + vh, k.getAttribute('data-for'));
      }
    } finally {
      env.uninstall();
    }
  });

  test('on: the layout is the same as off, each box where it was, and nothing but the callouts is added to the drawing', async () => {
    /** What the drawing holds of the layout, with callouts or without. */
    async function layout(data) {
      const env = await load({ files: { ...FILES }, data });
      try {
        const el = await drawn(env);
        return {
          boxes: ['start', 'mid'].map((key) => boxOf(el, key)),
          viewBox: el.querySelector('svg').getAttribute('viewBox'),
          nodes: el.querySelectorAll('g.node').length,
          edges: el.querySelectorAll('g.edge').length,
          callouts: callouts(el).length,
        };
      } finally {
        env.uninstall();
      }
    }
    const off = await layout(null),
      on = await layout(ON);
    assert.equal(off.callouts, 0);
    assert.equal(on.callouts, 2);
    assert.deepEqual({ ...on, callouts: 0 }, off);
  });

  test('a callout’s words are text, never HTML, however the note is written', async () => {
    const files = {
      [PATH]: ['# Trip', '', fence("// graph: g\n/// <img src=x> <b>loud</b> & more\n(a:T {name: 'A'})"), ''].join(
        '\n',
      ),
    };
    const env = await load({ files, data: ON });
    try {
      const el = await drawn(env);
      const c = callouts(el)[0];
      assert.equal(c.querySelector('img, b'), null);
      assert.ok(c.textContent.includes('<b>loud</b>'));
    } finally {
      env.uninstall();
    }
  });

  test('the line is dashed and the box and words use the theme’s colours, in the style sheet', () => {
    const css = readFileSync(`${root}styles.css`, 'utf8');
    const rule = (name) => new RegExp(`\\.${name}\\s*\\{([^}]*)\\}`).exec(css)?.[1] ?? '';
    assert.match(rule('thoughtknot-callout-line'), /stroke-dasharray:\s*\d/);
    for (const name of ['thoughtknot-callout-box', 'thoughtknot-callout-text'])
      assert.match(rule(name), /var\(--/, name);
    assert.ok(
      !/#[0-9a-f]{3,8}\b/i.test(rule('thoughtknot-callout-box') + rule('thoughtknot-callout-text')),
      'no fixed colour',
    );
  });
});
