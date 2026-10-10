// Things parked for later in a drawing (editor spec §5, park_for_later, deferred_drawn; §8, parked_not_broken): a thing
// a Deferred defers is drawn dashed with a later mark, said so to screen readers; the badge counts parked things apart
// from problems, and those past their revisit date as overdue; and, while the card is edited, its details offer Park for
// later, which writes a Deferred saying what is needed and why it waits.
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { build, load, until, wait } from './host/load-plugin.js';
import { fence, labelled } from './host/notes.js';
import { PATH, show } from './host/card-notes.js';
import { styles } from './host/view-notes.js';
import { tapKey, text } from './host/inspector-steps.js';

before(() => build());

const PLAIN = `// graph: reader
(q:Question {title: 'Which device?'}),
(large:Option {name: 'Large reader'}),
(small:Option {name: 'Small reader'}),
(large)-[:ANSWERS]->(q)`;
const PARKED = `${PLAIN},
(later_small:Deferred {what: 'its price', why: 'the shop has not said', revisit_by: DATE '2999-01-01'}),
(later_small)-[:DEFERS]->(small)`;
const OVERDUE = PARKED.replace("'2999-01-01'", "'2000-01-01'");
const noteOf = (block) => ['# Reader', '', fence(block), ''].join('\n');
const nodeOf = (el, key) => el.querySelectorAll('g.node').find((n) => n.getAttribute('data-key') === key);

describe('a thing parked for later, drawn', () => {
  test('is drawn dashed, with a later mark on the drawing, and said so to screen readers', async () => {
    const env = await load({ files: { [PATH]: noteOf(PARKED) } });
    try {
      const el = await show(env);
      const g = nodeOf(el, 'small');
      assert.ok(g.classList.contains('graph-note-parked'), 'marked as parked');
      assert.ok(
        g.querySelectorAll('text').some((t) => /⏳ later/.test(t.textContent)),
        'a later mark, in words as well as a sign',
      );
      assert.match(g.getAttribute('aria-label'), /parked for later: its price/i);
      assert.ok(!nodeOf(el, 'large').classList.contains('graph-note-parked'), 'only the thing parked');
      assert.match(styles, /\.graph-note-parked\s+(?:path|polygon)[^{]*\{[^}]*stroke-dasharray/);
    } finally {
      env.uninstall();
    }
  });

  test('past its revisit date it is marked overdue, in words', async () => {
    const env = await load({ files: { [PATH]: noteOf(OVERDUE) } });
    try {
      const el = await show(env);
      const g = nodeOf(el, 'small');
      assert.ok(g.classList.contains('is-overdue'));
      assert.ok(g.querySelectorAll('text').some((t) => /⏳ overdue/.test(t.textContent)));
    } finally {
      env.uninstall();
    }
  });
});

describe('the badge', () => {
  test('counts things parked for later apart from problems', async () => {
    const env = await load({ files: { [PATH]: noteOf(PARKED) } });
    try {
      const el = await show(env);
      const badge = el.querySelector('.graph-note-badge');
      assert.match(badge.getAttribute('aria-label'), /^No problems, 1 parked$/);
    } finally {
      env.uninstall();
    }
  });

  test('says how many parked things are overdue, and lists them behind it', async () => {
    const env = await load({ files: { [PATH]: noteOf(OVERDUE) } });
    try {
      const el = await show(env);
      const badge = el.querySelector('.graph-note-badge');
      assert.match(badge.getAttribute('aria-label'), /^No problems, 1 parked, 1 overdue$/);
      const items = el.querySelectorAll('li').map((li) => li.textContent);
      assert.ok(
        items.some((t) => /Small reader/.test(t) && /overdue/i.test(t) && /its price/.test(t)),
        items.join(' | '),
      );
    } finally {
      env.uninstall();
    }
  });

  test('with nothing parked, says nothing of parking', async () => {
    const env = await load({ files: { [PATH]: noteOf(PLAIN) } });
    try {
      const el = await show(env);
      assert.equal(el.querySelector('.graph-note-badge').getAttribute('aria-label'), 'No problems');
    } finally {
      env.uninstall();
    }
  });
});

describe('Park for later, while the card is edited', () => {
  test('writes a Deferred saying what is needed and why it waits', async () => {
    const env = await load({ files: { [PATH]: noteOf(PLAIN) } });
    try {
      const el = await show(env);
      labelled(el, 'Edit here').click();
      await until(() => !!el.querySelector('textarea'));
      tapKey(el, 'small');
      await until(() => !!labelled(el, 'Park for later'));
      labelled(el, 'Park for later').click();
      const input = (name) => el.querySelectorAll('input').find((x) => x.getAttribute('aria-label') === name);
      input('What is needed').value = 'its price';
      input('Why it waits').value = 'the shop has not said';
      input('Revisit by').value = '2999-01-01';
      labelled(el, 'Park it').click();
      await until(() => /:Deferred/.test(text(el)));
      assert.match(text(el), /\(later_small:Deferred \{\s*what: 'its price',\s*why: 'the shop has not said'/);
      assert.match(text(el), /\(later_small\)-\[:DEFERS\]->\(small\)/);
      await until(() => /:Deferred/.test(env.state.files.get(PATH)), 3000);
    } finally {
      env.uninstall();
    }
  });

  test('the form takes the focus to its first field, and its fields and buttons are big enough to touch', async () => {
    const env = await load({ files: { [PATH]: noteOf(PLAIN) } });
    try {
      const el = await show(env);
      labelled(el, 'Edit here').click();
      await until(() => !!el.querySelector('textarea'));
      tapKey(el, 'small');
      await until(() => !!labelled(el, 'Park for later'));
      labelled(el, 'Park for later').click();
      const first = el.querySelectorAll('input').find((x) => x.getAttribute('aria-label') === 'What is needed');
      assert.ok(env.doc.activeElement === first);
      assert.match(styles, /\.graph-note-park :is\(button, input\)\s*\{[^}]*min-height:\s*44px/);
    } finally {
      env.uninstall();
    }
  });

  test('a thing written in another block of its graph is parked from this one', async () => {
    const two = [
      '# Reader',
      '',
      fence(PLAIN),
      '',
      fence("// graph: reader\n(tiny:Option {name: 'Tiny reader'})"),
      '',
    ].join('\n');
    const env = await load({ files: { [PATH]: two } });
    try {
      // the second block, whose card draws the whole graph so far
      const { show: showBlock } = await import('./host/view-notes.js');
      const { el } = await showBlock(env, two, 1);
      labelled(el, 'Edit here').click();
      await until(() => !!el.querySelector('textarea'));
      tapKey(el, 'small');
      await until(() => !!labelled(el, 'Park for later'));
      labelled(el, 'Park for later').click();
      const input = (name) => el.querySelectorAll('input').find((x) => x.getAttribute('aria-label') === name);
      input('What is needed').value = 'its price';
      input('Why it waits').value = 'not said';
      labelled(el, 'Park it').click();
      await until(() => /:Deferred/.test(text(el)));
      assert.match(text(el), /-\[:DEFERS\]->\(small\)/);
    } finally {
      env.uninstall();
    }
  });

  test('without what is needed and why, writes nothing and says what is missing', async () => {
    const env = await load({ files: { [PATH]: noteOf(PLAIN) } });
    try {
      const el = await show(env);
      labelled(el, 'Edit here').click();
      await until(() => !!el.querySelector('textarea'));
      tapKey(el, 'small');
      await until(() => !!labelled(el, 'Park for later'));
      labelled(el, 'Park for later').click();
      labelled(el, 'Park it').click();
      await wait(50);
      assert.doesNotMatch(text(el), /Deferred/);
      assert.match(el.querySelector('.graph-note-park [role="alert"]').textContent, /what is needed/i);
    } finally {
      env.uninstall();
    }
  });

  test('is offered only while the card is edited: reading a drawing never changes it', async () => {
    const env = await load({ files: { [PATH]: noteOf(PLAIN) } });
    try {
      const el = await show(env);
      tapKey(el, 'small');
      await wait(20);
      assert.equal(labelled(el, 'Park for later'), undefined);
    } finally {
      env.uninstall();
    }
  });
});
