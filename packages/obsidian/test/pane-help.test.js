// The help in the edit pane (spec §4, §8): problems marked where they are with their fixes on that line, every problem
// listed with a sign as well as a colour, names, kinds and relationships suggested while typing, and new problems
// announced to screen readers.
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { build, until, wait } from './host/load-plugin.js';
import { labelled } from './host/notes.js';
import { READER, NOTE, open, textarea, type, note } from './host/pane-notes.js';

before(() => build());

describe('problems, in place', () => {
  test('the keyboard going from the field to a fix on its line lands on it: the bar is not drawn again as it goes', async () => {
    const env = await open();
    try {
      type(env.el, READER + ',\n(eyes)-[:FAVOURS]->(larg)');
      const fixOf = () => labelled(env.el.querySelector('.graph-note-fixbar'), 'Change larg to large');
      await until(() => !!fixOf());
      textarea(env.el).focus();
      const fix = fixOf();
      fix.focus();
      assert.ok(fix.isConnected, 'the fix is still on the page');
      assert.ok(env.doc.activeElement === fix, 'the fix has the focus');
    } finally {
      env.uninstall();
    }
  });

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

/** The suggestions offered now: each option's name and what it is, as the list shows them; none while it is closed. */
const offered = (el) => {
  const list = el.querySelector('.graph-note-suggestions');
  return list.hidden
    ? []
    : list.querySelectorAll('[role="option"]').map((o) =>
        [o.querySelector('.graph-note-suggestion-name'), o.querySelector('.graph-note-suggestion-detail')]
          .map((x) => x?.textContent ?? '')
          .filter(Boolean)
          .join(' — '),
      );
};
/** The option the field points at as the one Enter or Tab takes. */
const active = (el) => {
  const id = textarea(el).getAttribute('aria-activedescendant');
  return id ? el.querySelectorAll('[role="option"]').find((o) => o.getAttribute('id') === id) : undefined;
};
const key = (el, k, more = {}) => textarea(el).dispatch('keydown', { key: k, ...more });

describe('suggestions while typing', () => {
  test('names, kinds and relationships already in the graph drop down under the caret, and choosing one writes it in', async () => {
    const env = await open();
    try {
      type(env.el, READER + ',\n(eyes)-[:F');
      const list = env.el.querySelector('.graph-note-suggestions');
      assert.equal(list.getAttribute('role'), 'listbox');
      assert.ok(list.closest('.graph-note-editor'), 'it drops down inside the field, where the caret is');
      assert.equal(textarea(env.el).getAttribute('aria-controls'), list.getAttribute('id'));
      assert.equal(textarea(env.el).getAttribute('aria-autocomplete'), 'list');
      assert.deepEqual(offered(env.el), ['FAVOURS — favours']);
      list.querySelector('[role="option"]').click();
      assert.equal(textarea(env.el).value, READER + ',\n(eyes)-[:FAVOURS');
      type(env.el, READER + ',\n(eyes)-[:FAVOURS]->(la');
      assert.deepEqual(offered(env.el), ['large — Option: Large reader']);
    } finally {
      env.uninstall();
    }
  });

  test('the keyboard works the list: the arrows move, Enter takes the one chosen, and the hands never leave the keys', async () => {
    const env = await open();
    try {
      type(env.el, READER + ',\n(eyes)-[:FAVOURS]->(');
      const all = offered(env.el);
      assert.ok(all.length >= 2, all.join(' | '));
      assert.equal(active(env.el)?.getAttribute('aria-selected'), 'true', 'the first is chosen to start');
      const first = active(env.el);
      assert.ok(key(env.el, 'ArrowDown').defaultPrevented, 'the caret stays; the choice moves');
      const second = active(env.el);
      assert.ok(second && second !== first);
      assert.equal(first.getAttribute('aria-selected'), 'false');
      assert.ok(key(env.el, 'ArrowUp').defaultPrevented);
      assert.ok(active(env.el) === first);
      key(env.el, 'ArrowUp');
      assert.ok(
        active(env.el) === env.el.querySelectorAll('[role="option"]').at(-1),
        'up from the first wraps to the last',
      );
      key(env.el, 'ArrowDown');
      key(env.el, 'ArrowDown');
      const name = second.querySelector('.graph-note-suggestion-name').textContent;
      assert.ok(key(env.el, 'Enter').defaultPrevented, 'Enter takes it, no new line');
      assert.equal(textarea(env.el).value, READER + `,\n(eyes)-[:FAVOURS]->(${name}`);
    } finally {
      env.uninstall();
    }
  });

  test('Tab takes the one chosen from the keyboard', async () => {
    const env = await open();
    try {
      type(env.el, READER + ',\n(eyes)-[:FAVOURS]->(qu');
      const ev = key(env.el, 'Tab');
      assert.ok(ev.defaultPrevented);
      assert.equal(textarea(env.el).value, READER + ',\n(eyes)-[:FAVOURS]->(question');
    } finally {
      env.uninstall();
    }
  });

  test('once the word is the one chosen, Tab and Enter are left alone, so the keyboard can leave the field or end the line', async () => {
    const env = await open();
    try {
      type(env.el, READER + ',\n(eyes)-[:FAVOURS]->(qu');
      assert.ok(key(env.el, 'Tab').defaultPrevented);
      assert.equal(textarea(env.el).value, READER + ',\n(eyes)-[:FAVOURS]->(question');
      assert.equal(key(env.el, 'Tab').defaultPrevented, false);
      assert.equal(key(env.el, 'Enter').defaultPrevented, false);
      assert.equal(textarea(env.el).value, READER + ',\n(eyes)-[:FAVOURS]->(question');
    } finally {
      env.uninstall();
    }
  });

  test('Escape closes the list, and the arrows then move the caret; typing opens it again, as does Control+Space', async () => {
    const env = await open();
    try {
      type(env.el, READER + ',\n(eyes)-[:FAVOURS]->(');
      assert.ok(offered(env.el).length);
      assert.ok(key(env.el, 'Escape').defaultPrevented);
      assert.deepEqual(offered(env.el), []);
      assert.equal(textarea(env.el).getAttribute('aria-activedescendant'), null);
      assert.equal(key(env.el, 'ArrowDown').defaultPrevented, false, 'the arrows are the caret’s again');
      assert.equal(key(env.el, 'Tab').defaultPrevented, false, 'Tab leaves the field');
      assert.ok(key(env.el, ' ', { ctrlKey: true }).defaultPrevented);
      assert.ok(offered(env.el).length, 'Control+Space opens it');
      key(env.el, 'Escape');
      type(env.el, READER + ',\n(eyes)-[:FAVOURS]->(l');
      assert.ok(offered(env.el).length, 'typing opens it');
    } finally {
      env.uninstall();
    }
  });

  test('moving the caret by the keys or a click closes the list, so the arrows and Tab work as in any field', async () => {
    const env = await open();
    try {
      type(env.el, READER + ',\n(eyes)-[:FAVOURS]->(');
      assert.ok(offered(env.el).length);
      key(env.el, 'ArrowLeft');
      assert.deepEqual(offered(env.el), []);
      type(env.el, READER + ',\n(eyes)-[:FAVOURS]->(');
      textarea(env.el).dispatch('click');
      assert.deepEqual(offered(env.el), []);
    } finally {
      env.uninstall();
    }
  });

  test('with nothing to suggest, the list is hidden and Tab is left alone', async () => {
    const env = await open();
    try {
      type(env.el, READER + ",\n(x:Reason {title: 'abc");
      assert.ok(env.el.querySelector('.graph-note-suggestions').hidden);
      assert.equal(key(env.el, 'Tab').defaultPrevented, false);
    } finally {
      env.uninstall();
    }
  });
});

// editor spec §4, unnamed_drawn_suggested: nothing is written until a thing's own fix is accepted, so a name only
// suggested is neither offered to be typed nor named in a fix for a near miss
describe('a name only suggested', () => {
  const UNNAMED = READER + ",\n(:Option {name: 'Small reader'})";

  test('is not offered while typing, though the names already written are', async () => {
    const env = await open();
    try {
      type(env.el, UNNAMED + ',\n(eyes)-[:FAVOURS]->(sm');
      const shown = offered(env.el);
      assert.ok(!shown.some((l) => /small_reader/.test(l)), shown.join(' | '));
      type(env.el, UNNAMED + ',\n(eyes)-[:FAVOURS]->(la');
      assert.deepEqual(offered(env.el), ['large — Option: Large reader']);
    } finally {
      env.uninstall();
    }
  });

  test('is not the fix of a near miss: the fix bar and the problem list say only that there is no such thing', async () => {
    const env = await open();
    try {
      type(env.el, UNNAMED + ',\n(eyes)-[:FAVOURS]->(smal_reader)');
      await wait(400);
      const here = env.el.querySelector('.graph-note-fixbar');
      assert.ok(!here.hidden, 'the caret is on that line, so its problem is there');
      assert.match(here.textContent, /No thing called smal_reader in graph reader/);
      assert.ok(!/small_reader/.test(here.textContent), here.textContent);
      assert.equal(labelled(here, 'Change smal_reader to small_reader'), undefined, 'no fix that writes it');
      const items = env.el.querySelectorAll('.graph-note-pane-problems li').map((li) => li.textContent);
      assert.ok(
        items.some((t) => /smal_reader/.test(t)),
        items.join(' | '),
      );
      assert.ok(
        !items.some((t) => /smal_reader/.test(t) && /small_reader/.test(t)),
        'the list names no estimate of it: ' + items.join(' | '),
      );
      assert.equal(env.el.querySelectorAll('.graph-note-pane-problems li').length, 2, 'it and the unnamed thing');
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
