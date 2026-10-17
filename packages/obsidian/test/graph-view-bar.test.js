// A drawing's bar and card (spec §3, §8): the problems badge, Fit, zoom, Full screen and Edit, each in words and an icon;
// the problems and the completeness report behind the badge; and each bar and its details framed in their own card.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { build } from './host/load-plugin.js';
import { fence, labelled } from './host/notes.js';
import { load, styles, GRAPH, show } from './host/view-notes.js';

before(() => build());

describe('the bar', () => {
  let env;
  before(async () => {
    env = await load();
  });
  after(() => env.uninstall());

  test('the drawing carries a problems badge, Fit, zoom out, zoom in, Full screen and Edit', async () => {
    const { el } = await show(env, fence(GRAPH));
    const bar = el.querySelector('.graph-note-bar');
    assert.equal(bar.getAttribute('role'), 'toolbar');
    for (const label of ['No problems', 'Fit', 'Zoom out', 'Zoom in', 'Full screen', 'Edit here', 'Edit in pane'])
      assert.ok(labelled(bar, label), label);
  });

  test('each control says what it is in words and an icon, not by colour', async () => {
    const { el } = await show(env, fence(GRAPH));
    for (const b of el.querySelector('.graph-note-bar').querySelectorAll('button')) {
      assert.ok(b.getAttribute('aria-label'), 'a name for screen readers');
      assert.ok(b.getAttribute('data-icon'), `an icon on ${b.getAttribute('aria-label')}`);
    }
    assert.match(labelled(el, 'No problems').textContent, /No problems/, 'the badge says its count in words');
  });

  test('in Live Preview the bar leaves room for Obsidian’s own edit-block button, which appears at the block’s top right on hover', () => {
    assert.match(styles, /\.cm-embed-block \.graph-note-bar\s*\{\s*padding-inline-end:\s*var\(--gn-space-9\);/);
  });

  test('touch targets are at least 44 points', () => {
    assert.match(styles, /\.graph-note-bar button\s*\{[^}]*min-width:\s*44px;[^}]*min-height:\s*44px;/);
  });

  test('Edit asks the plugin to open the edit pane on this block', async () => {
    const opened = [];
    env.plugin.openEditor = (target) => opened.push(target);
    const { el } = await show(env, fence(GRAPH));
    labelled(el, 'Edit in pane').click();
    assert.equal(opened.length, 1);
    assert.deepEqual(
      { path: opened[0].path, line: opened[0].line, graph: opened[0].graph },
      { path: 'Some note.md', line: 0, graph: 'reader' },
    );
  });
});

describe('each bar and its details belong to their own drawing', () => {
  // bar_and_details_belong (spec §3, slice 1; Roger, 7 Oct 2026: "the tool strip is not visibly connected to the graphic,
  // which makes it less than obvious which tool strip belongs to which diagram. Also, the same applies to the info
  // window."): with several drawings in one note, each bar and each details card sit inside their own drawing's card. How
  // plain that is in a theme is the device check's to judge.
  const rule = (sel) =>
    new RegExp(`(^|\\n)${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`).exec(styles)?.[2] ?? '';
  let env;
  before(async () => {
    env = await load();
  });
  after(() => env.uninstall());

  test('with two drawings in a note, each bar and each details card sit inside their own drawing’s card', async () => {
    const OTHER = "// graph: trip\n(home:Place {name: 'Home'}), (walk:Leg {name: 'Walk'}), (walk)-[:STARTS_AT]->(home)";
    const note = [fence(GRAPH), 'Between the two.', fence(OTHER)].join('\n\n');
    const cards = [(await show(env, note, 0)).el, (await show(env, note, 1)).el];
    const box = cards[1].querySelectorAll('g.node')[0];
    const vp = cards[1].querySelector('.graph-note-viewport');
    vp.dispatch('pointerdown', { target: box, pointerId: 4, pointerType: 'touch', clientX: 5, clientY: 5, button: 0 });
    vp.dispatch('pointerup', { target: box, pointerId: 4, pointerType: 'touch', clientX: 5, clientY: 5, button: 0 });
    cards.forEach((el, i) => {
      const card = el.querySelector('.graph-note-view');
      assert.equal(el.querySelectorAll('.graph-note-view').length, 1, `one card for drawing ${i + 1}`);
      // compared by identity: a failing equal on two fake elements would print the whole page
      assert.ok(card.children[0]?.classList.contains('graph-note-bar'), 'the bar is the card’s header');
      assert.ok(el.querySelector('.graph-note-bar').closest('.graph-note-view') === card, 'the bar is inside the card');
      const details = el.querySelector('.graph-note-details');
      assert.ok(details.closest('.graph-note-view') === card, 'the details are inside the card');
      const order = card.children.map((c) => c.getAttribute('class') ?? '');
      assert.ok(
        order.findIndex((c) => c.includes('graph-note-details')) >
          order.findIndex((c) => c.includes('graph-note-viewport')),
        'the details sit under the drawing',
      );
      assert.equal(details.hidden, i === 0, i === 0 ? 'the other drawing shows no details' : 'the tapped one does');
    });
  });

  test('the card has its own border round the bar, the drawing and the details, with the bar as a header strip', () => {
    const card = rule('.graph-note-view');
    assert.match(card, /border:\s*1px solid var\(--gn-border(-focus)?\)/);
    assert.match(card, /border-radius:/);
    assert.match(card, /overflow:\s*hidden/);
    const bar = rule('.graph-note-view > .graph-note-bar');
    assert.match(bar, /background:\s*var\(--gn-bg-alt\)/);
    assert.match(bar, /border-bottom:\s*1px solid/);
    assert.match(
      rule('.graph-note-view > .graph-note-problems,\n.graph-note-view > .graph-note-details'),
      /border-top:\s*1px solid/,
    );
  });

  // Roger chose A, 8 Oct 2026: the theme's ordinary border is too faint to tie a bar to its drawing (1.32 : 1 on white,
  // 1.38 : 1 on Obsidian's dark), so the card and the bar's rule take the theme's focus border, still the theme's own
  test('the card and the bar’s rule are drawn in the theme’s focus border, which stands out from the page in light and dark', () => {
    assert.match(rule('.graph-note-view'), /border:\s*1px solid var\(--gn-border-focus\)/);
    assert.match(rule('.graph-note-view > .graph-note-bar'), /border-bottom:\s*1px solid var\(--gn-border-focus\)/);
    // Obsidian's default themes, as the app ships them (8 Oct 2026): the page, its ordinary border and its focus border
    const themes = { light: ['#ffffff', '#e0e0e0', '#bdbdbd'], dark: ['#1e1e1e', '#363636', '#555555'] };
    const lum = (hex) => {
      const [r, g, b] = [1, 3, 5].map((i) => {
        const c = parseInt(hex.slice(i, i + 2), 16) / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const contrast = (a, b) => {
      const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
      return (hi + 0.05) / (lo + 0.05);
    };
    for (const [theme, [page, plain, focus]] of Object.entries(themes)) {
      assert.ok(contrast(page, focus) >= 1.8, `${theme}: ${contrast(page, focus).toFixed(2)} : 1`);
      assert.ok(
        contrast(page, focus) > contrast(page, plain) * 1.35,
        `${theme}: plainly stronger than the ordinary border`,
      );
    }
  });
});

describe('help behind the badge', () => {
  let env;
  before(async () => {
    env = await load();
  });
  after(() => env.uninstall());

  test('the completeness report is behind the badge: covered, deferred and missing, with a fix for each gap', async () => {
    const rule =
      GRAPH +
      ",\n(every_option_answers:Cardinality {kind: 'Option', relationship: 'ANSWERS', direction: 'out', min: 1, says: 'every option answers the question'}),\n(spare:Option {name: 'Spare'})";
    const { el } = await show(env, fence(rule));
    const badge = labelled(el, '1 gap');
    assert.ok(badge, 'the badge counts the gap');
    badge.click();
    const panel = el.querySelector('.graph-note-problems');
    assert.match(panel.textContent, /Completeness/);
    assert.match(panel.textContent, /every option answers the question: 2 of 3 covered, 1 missing/);
    assert.match(panel.textContent, /Spare: add a ANSWERS link/);
  });

  test('many problems are grouped by kind, the worst first', async () => {
    const many =
      GRAPH +
      ',\n' +
      Array.from({ length: 6 }, (_, i) => `(eyes)-[:FAVOURS]->(gone_${i})`).join(',\n') +
      ',\n' +
      Array.from({ length: 4 }, (_, i) => `(x${i}:T {v: })`).join(',\n') +
      ',\n(eyes)-[:FAVOURS]->(tablett)';
    const { el } = await show(env, fence(many));
    const groups = el.querySelectorAll('.graph-note-problems details');
    assert.ok(groups.length >= 2, 'grouped');
    const titles = groups.map((g) => g.querySelector('summary').textContent);
    assert.match(titles[0], /^Error/);
    assert.match(titles[titles.length - 1], /^Warning/);
    assert.match(titles.join('|'), /6 × .*not in the graph/);
  });

  test('a few problems are listed one by one, each with a sign as well as its words', async () => {
    const { el } = await show(env, fence(GRAPH + ',\n(eyes)-[:FAVOURS]->(nowhere),\n(eyes)-[:FAVOURS]->(tablett)'));
    const items = el.querySelectorAll('.graph-note-problems li');
    assert.equal(items.length, 2);
    assert.ok(
      items.every((li) => /^(✖ Error|⚠ Warning)/.test(li.textContent)),
      items.map((li) => li.textContent).join('|'),
    );
  });

  test('the drawing has a text version for screen readers: every thing and every link, in sentences', async () => {
    const { el } = await show(env, fence(GRAPH));
    const vp = el.querySelector('.graph-note-viewport');
    const sr = el.querySelector(`#${vp.getAttribute('aria-describedby')}`);
    assert.ok(sr.classList.contains('graph-note-sr'));
    assert.match(sr.textContent, /Graph reader: 4 things, 4 links\./);
    assert.match(sr.textContent, /Easy on the eyes favours Large reader\./);
  });
});

describe('one frame: the bar and the details belong to their drawing', () => {
  let env;
  before(async () => {
    env = await load();
  });
  after(() => env.uninstall());

  test('the bar, the drawing and the details sit in one framed card, the bar as its header strip', async () => {
    const { el } = await show(env, fence(GRAPH));
    const card = el.querySelector('.graph-note-view');
    for (const part of ['.graph-note-bar', '.graph-note-viewport', '.graph-note-details', '.graph-note-problems'])
      assert.ok(card.querySelector(part), part);
    assert.equal(card.children[0].className, 'graph-note-bar', 'the bar comes first, at the top edge');
    assert.match(
      styles,
      /\.graph-note-view\s*\{[^}]*border:\s*1px solid var\(--gn-border(-focus)?\);[^}]*border-radius:/,
    );
    assert.match(
      styles,
      /\.graph-note-view > \.graph-note-bar\s*\{[^}]*background:\s*var\(--gn-bg-alt\);[^}]*border-bottom:/,
    );
  });

  test('the box whose details are open is marked as selected, by a heavier outline as well as for screen readers', async () => {
    const { el } = await show(env, fence(GRAPH));
    const [first, second] = el.querySelectorAll('g.node');
    first.dispatch('keydown', { key: 'Enter' });
    assert.ok(first.classList.contains('is-selected'));
    assert.equal(first.getAttribute('aria-pressed'), 'true');
    second.dispatch('keydown', { key: 'Enter' });
    assert.ok(!first.classList.contains('is-selected'), 'one at a time');
    assert.ok(second.classList.contains('is-selected'));
    const panel = el.querySelector('.graph-note-details');
    assert.equal(panel.getAttribute('aria-label'), 'Details of Large reader');
    labelled(panel, 'Close details').click();
    assert.ok(!second.classList.contains('is-selected'), 'closing the details clears the mark');
    assert.match(styles, /\.graph-note-svg g\.is-selected > :is\(path, polygon\)\s*\{[^}]*stroke-width:\s*3;/);
  });
});
