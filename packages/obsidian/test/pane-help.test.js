// The help in the edit pane (spec §4, §8): problems marked where they are with their fixes on that line, every problem
// listed with a sign as well as a colour, names, kinds and relationships suggested while typing, and new problems
// announced to screen readers.
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { build, wait } from './host/load-plugin.js';
import { labelled } from './host/notes.js';
import { READER, NOTE, open, textarea, type, note } from './host/pane-notes.js';

before(() => build());

describe('problems, in place', () => {
  test('a problem is marked where it is, and its fix is offered on that line', async () => {
    const env = await open();
    try {
      const typo = READER + ',\n(eyes)-[:FAVOURS]->(larg)';
      type(env.el, typo);
      await wait(400);
      const mark = env.el.querySelector('.graph-note-overlay .graph-note-problem');
      assert.equal(mark.textContent, 'larg');
      assert.match(mark.className, /is-warning/);
      const here = env.el.querySelector('.graph-note-fixbar');
      assert.ok(!here.hidden, 'the caret is on that line, so its fix is offered there');
      assert.match(here.textContent, /larg is not in graph reader/);
      labelled(here, 'Change larg to large').click();
      assert.equal(textarea(env.el).value, READER + ',\n(eyes)-[:FAVOURS]->(large)');
      await wait(400);
      assert.equal(note(env), NOTE.replace(READER, READER + ',\n(eyes)-[:FAVOURS]->(large)'));
    } finally {
      env.uninstall();
    }
  });

  // spec §3 and §4 (9 Oct 2026): a comment after code names the rule, and one click puts it on its own line
  test('a comment after code on its line is offered one fix, which puts it on its own line', async () => {
    const env = await open();
    try {
      const typed = READER + ', // the reader graph';
      type(env.el, typed, typed.length);
      await wait(400);
      const here = env.el.querySelector('.graph-note-fixbar');
      assert.ok(!here.hidden);
      assert.match(here.textContent, /a comment must be on a line of its own/i);
      labelled(here, 'Put the comment on its own line').click();
      assert.equal(textarea(env.el).value, READER + ',\n// the reader graph');
      await wait(400);
      assert.equal(note(env), NOTE.replace(READER, READER + ',\n// the reader graph'));
    } finally {
      env.uninstall();
    }
  });

  test('every problem is listed with its line, and each line marked with a sign as well as a colour', async () => {
    const env = await open();
    try {
      type(env.el, READER + ',\n(eyes)-[:FAVOURS]->(nowhere),\n(x:T {y: })');
      await wait(400);
      const items = env.el.querySelectorAll('.graph-note-pane-problems li').map((li) => li.textContent);
      assert.equal(items.length, 2);
      assert.match(items[0], /^Line 7: /);
      assert.ok(env.el.querySelectorAll('.graph-note-overlay .graph-note-line-sign').length >= 2);
    } finally {
      env.uninstall();
    }
  });
});

describe('suggestions while typing', () => {
  test('names, kinds and relationships already in the graph are offered, and choosing one writes it in', async () => {
    const env = await open();
    try {
      type(env.el, READER + ',\n(eyes)-[:F');
      const bar = env.el.querySelector('.graph-note-suggestions');
      assert.ok(!bar.hidden);
      const chip = labelled(bar, 'FAVOURS — favours');
      assert.ok(chip);
      chip.click();
      assert.equal(textarea(env.el).value, READER + ',\n(eyes)-[:FAVOURS');
      type(env.el, READER + ',\n(eyes)-[:FAVOURS]->(la');
      assert.deepEqual(
        bar.querySelectorAll('button').map((b) => b.getAttribute('aria-label')),
        ['large — Option: Large reader'],
      );
    } finally {
      env.uninstall();
    }
  });

  test('Tab takes the first suggestion from the keyboard', async () => {
    const env = await open();
    try {
      type(env.el, READER + ',\n(eyes)-[:FAVOURS]->(qu');
      const ev = textarea(env.el).dispatch('keydown', { key: 'Tab' });
      assert.ok(ev.defaultPrevented);
      assert.equal(textarea(env.el).value, READER + ',\n(eyes)-[:FAVOURS]->(question');
    } finally {
      env.uninstall();
    }
  });

  test('with nothing to suggest, the bar is hidden and Tab is left alone', async () => {
    const env = await open();
    try {
      type(env.el, READER + ",\n(x:Reason {title: 'abc");
      assert.ok(env.el.querySelector('.graph-note-suggestions').hidden);
      assert.equal(textarea(env.el).dispatch('keydown', { key: 'Tab' }).defaultPrevented, false);
    } finally {
      env.uninstall();
    }
  });
});

describe('problems announced', () => {
  test('a new problem is announced to screen readers, and the focus stays in the text', async () => {
    const env = await open();
    try {
      const live = env.el.querySelector('.graph-note-announce');
      assert.equal(live.getAttribute('aria-live'), 'polite');
      textarea(env.el).focus();
      type(env.el, READER + ',\n(eyes)-[:FAVOURS]->(nowhere)');
      assert.match(live.textContent, /^1 new problem: no thing called nowhere/i);
      assert.equal(env.doc.activeElement, textarea(env.el));
      type(env.el, READER + ',\n(eyes)-[:FAVOURS]->(nowhere)\n');
      assert.equal(live.textContent, '', 'the same problem is not announced again');
    } finally {
      env.uninstall();
    }
  });
});
