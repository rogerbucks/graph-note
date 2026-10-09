// Completing as you type in the block editor (spec §4, autocomplete): the best match shown inline as ghost text after the
// caret in the coloured picture, never in the field until accepted with Tab or Enter, dismissed with Escape, and taken
// back by one undo — in the pane and in the card.
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { build, load, until, wait } from './host/load-plugin.js';
import { labelled } from './host/notes.js';
import { PATH as CARD_PATH, NOTE as CARD_NOTE, READER as CARD_READER, show } from './host/card-notes.js';
import { READER, open, textarea, type, note } from './host/pane-notes.js';

before(() => build());

/** The ghost text shown in the coloured picture, or null when there is none. */
const ghost = (el) => el.querySelector('.graph-note-overlay .graph-note-ghost')?.textContent ?? null;
/** Types into the pane's field with the focus in it, as a person does. */
function typeFocused(el, value, caret = value.length) {
  textarea(el).focus();
  type(el, value, caret);
}
const key = (el, k, more = {}) => textarea(el).dispatch('keydown', { key: k, ...more });

/** A brace just opened: the closer is the match, there is no name to suggest, and no word to complete. */
const OPEN = '(z:Option {';

describe('the best match, shown inline', () => {
  test('a bracket just typed shows its closer as ghost text after the caret, and the field holds only what was typed', async () => {
    const env = await open();
    try {
      typeFocused(env.el, READER + ',\n' + OPEN);
      assert.equal(ghost(env.el), '}');
      assert.equal(textarea(env.el).value, READER + ',\n' + OPEN, 'never in the field until accepted');
    } finally {
      env.uninstall();
    }
  });

  test('it is never written to the note unasked', async () => {
    const env = await open();
    try {
      typeFocused(env.el, READER + ',\n' + OPEN);
      key(env.el, 'Enter'); // at a closer-only ghost, Enter is a new line, which the browser makes: it takes nothing
      assert.equal(textarea(env.el).value, READER + ',\n' + OPEN);
      await wait(400);
      assert.ok(note(env).includes(READER + ',\n' + OPEN + '\n```'), 'the note has what was typed');
      assert.equal(note(env).includes('{}'), false);
      typeFocused(env.el, READER + ',\n(z:Opt');
      textarea(env.el).dispatch('compositionend');
      key(env.el, 'Enter'); // the Enter that commits an IME composition on WebKit, not composing for the browser
      assert.equal(textarea(env.el).value, READER + ',\n(z:Opt');
      await wait(400);
      assert.equal(note(env).includes('(z:Option'), false);
    } finally {
      env.uninstall();
    }
  });

  test('a kind, a relationship type, a property name and a value already used are completed the same way', async () => {
    const env = await open();
    try {
      for (const [typed, shown] of [
        ['(z:Opt', 'ion'],
        ['(large)-[:ANS', 'WERS'],
        ['(z:Option {na', 'me: '],
        ["(z:Option {name: 'La", "rge reader'"],
        ['MA', 'TCH'],
      ]) {
        typeFocused(env.el, READER + ',\n' + typed);
        assert.equal(ghost(env.el), shown, typed);
      }
    } finally {
      env.uninstall();
    }
  });

  test('the ghost takes no room of its own, so the text after it stays under the field’s', () => {
    const css = readFileSync(new URL('../../../styles.css', import.meta.url), 'utf8');
    assert.match(css, /\.graph-note-ghost\s*\{[^}]*display:\s*inline-block;[^}]*width:\s*0;/);
    assert.match(css, /\.graph-note-ghost\s*\{[^}]*color:\s*var\(--text-faint\)/);
  });

  test('nothing is shown while the field has no focus, or with a selection, or with text after the caret', async () => {
    const env = await open();
    try {
      const t = textarea(env.el),
        typed = READER + ',\n' + OPEN;
      t.value = typed;
      t.setSelectionRange(typed.length, typed.length);
      t.dispatch('input');
      assert.equal(ghost(env.el), null, 'no focus');
      t.focus();
      t.dispatch('keyup');
      assert.equal(ghost(env.el), '}');
      t.setSelectionRange(typed.length - 3, typed.length);
      t.dispatch('keyup');
      assert.equal(ghost(env.el), null, 'a selection');
      t.setSelectionRange(typed.length - 3, typed.length - 3);
      t.dispatch('keyup');
      assert.equal(ghost(env.el), null, 'text after the caret');
      t.setSelectionRange(typed.length, typed.length);
      t.dispatch('keyup');
      assert.equal(ghost(env.el), '}', 'and back again');
    } finally {
      env.uninstall();
    }
  });
});

describe('accepting with Tab or Enter', () => {
  test('Tab writes the match, and a closer just opened leaves the caret inside', async () => {
    const env = await open();
    try {
      typeFocused(env.el, READER + ',\n' + OPEN);
      assert.ok(key(env.el, 'Tab').defaultPrevented);
      assert.equal(textarea(env.el).value, READER + ',\n' + OPEN + '}');
      assert.equal(textarea(env.el).selectionStart, (READER + ',\n' + OPEN).length);
      assert.equal(ghost(env.el), null);
    } finally {
      env.uninstall();
    }
  });

  test('Enter accepts a match that is shown, and the caret goes after what was added', async () => {
    const env = await open();
    try {
      typeFocused(env.el, READER + ',\n(z:Opt');
      assert.ok(key(env.el, 'Enter').defaultPrevented);
      assert.equal(textarea(env.el).value, READER + ',\n(z:Option');
      assert.equal(textarea(env.el).selectionStart, textarea(env.el).value.length);
    } finally {
      env.uninstall();
    }
  });

  test('with no match shown, Enter is a new line as before, and Shift-Tab, Control-Enter and a composing Enter leave it alone', async () => {
    const env = await open();
    try {
      typeFocused(env.el, READER + ',\n(z:Zzz)');
      assert.equal(ghost(env.el), null);
      assert.equal(key(env.el, 'Enter').defaultPrevented, false);
      typeFocused(env.el, READER + ',\n(z:Opt');
      assert.equal(key(env.el, 'Tab', { shiftKey: true }).defaultPrevented, false);
      assert.equal(key(env.el, 'Enter', { ctrlKey: true }).defaultPrevented, false);
      assert.equal(key(env.el, 'Enter', { isComposing: true }).defaultPrevented, false);
      assert.equal(textarea(env.el).value, READER + ',\n(z:Opt');
    } finally {
      env.uninstall();
    }
  });

  test('the suggestions row keeps working: Tab still takes a name, where the match would only close the bracket', async () => {
    const env = await open();
    try {
      typeFocused(env.el, READER + ',\n(eyes)-[:FAVOURS]->(qu');
      assert.equal(ghost(env.el), null, 'a name to suggest comes before a closer');
      assert.ok(key(env.el, 'Tab').defaultPrevented);
      assert.equal(textarea(env.el).value, READER + ',\n(eyes)-[:FAVOURS]->(question');
    } finally {
      env.uninstall();
    }
  });

  test('an accepted match reaches the note like anything typed', async () => {
    const env = await open();
    try {
      typeFocused(env.el, READER + ',\n(z:Option {na');
      key(env.el, 'Tab');
      await wait(400);
      assert.ok(note(env).includes(READER + ',\n(z:Option {name: \n```'));
    } finally {
      env.uninstall();
    }
  });
});

describe('dismissing with Escape', () => {
  test('Escape hides the match until the next typing, and is left alone when there is none', async () => {
    const env = await open();
    try {
      typeFocused(env.el, READER + ',\n(z:Zzz');
      assert.equal(key(env.el, 'Escape').defaultPrevented, true);
      assert.equal(ghost(env.el), null);
      textarea(env.el).dispatch('keyup');
      assert.equal(ghost(env.el), null, 'moving the caret does not bring it back');
      assert.equal(key(env.el, 'Tab').defaultPrevented, false, 'and it cannot be accepted');
      assert.equal(key(env.el, 'Escape').defaultPrevented, false, 'nothing to dismiss: Escape is for others');
      type(env.el, READER + ',\n(z:Opt');
      assert.equal(ghost(env.el), 'ion', 'typing brings the matches back');
    } finally {
      env.uninstall();
    }
  });
});

describe('one undo takes an accepted match back', () => {
  test('Undo returns to what was typed, with the caret where it was, and the next undo goes on from there', async () => {
    const env = await open();
    try {
      const t = textarea(env.el);
      typeFocused(env.el, READER + ',\n(z:Option {na');
      key(env.el, 'Tab');
      assert.equal(t.value, READER + ',\n(z:Option {name: ');
      assert.ok(key(env.el, 'z', { metaKey: true }).defaultPrevented);
      assert.equal(t.value, READER + ',\n(z:Option {na', 'one undo takes back all of it');
      assert.equal(t.selectionStart, t.value.length);
      key(env.el, 'z', { metaKey: true });
      assert.equal(t.value, READER, 'the next takes back what was typed before it');
    } finally {
      env.uninstall();
    }
  });
});

describe('typing the closer that is already there', () => {
  /** A `}` typed at the caret just before the one that closes the brace, as a person types it. */
  async function typeStep(env) {
    typeFocused(env.el, READER + ',\n' + OPEN);
    key(env.el, 'Tab');
    typeFocused(env.el, READER + ',\n' + OPEN + '}}', (READER + ',\n' + OPEN).length + 1);
  }

  test('steps over it: the text keeps one, and the caret goes past it', async () => {
    const env = await open();
    try {
      await typeStep(env);
      const t = textarea(env.el);
      assert.equal(t.value, READER + ',\n' + OPEN + '}');
      assert.equal(t.selectionStart, t.value.length);
    } finally {
      env.uninstall();
    }
  });

  test('one undo goes back to what was on screen before, never to a doubled closer that was not', async () => {
    const env = await open();
    try {
      await typeStep(env);
      const t = textarea(env.el);
      assert.ok(key(env.el, 'z', { metaKey: true }).defaultPrevented);
      assert.equal(t.value, READER + ',\n' + OPEN + '}', 'the text as it was before the closer was typed');
      assert.equal(t.selectionStart, (READER + ',\n' + OPEN).length, 'with the caret where it was');
    } finally {
      env.uninstall();
    }
  });

  test('a ] stepped over still gets the colon added for you, and one undo takes back only the colon', async () => {
    const env = await open();
    try {
      const t = textarea(env.el),
        before = READER + ',\n(eyes)-[favours]->(question)';
      const at = before.lastIndexOf(']');
      typeFocused(env.el, before, at);
      typeFocused(env.el, before.slice(0, at) + ']' + before.slice(at), at + 1);
      assert.equal(t.value, READER + ',\n(eyes)-[:FAVOURS]->(question)');
      assert.equal(t.selectionStart, (READER + ',\n(eyes)-[:FAVOURS]').length);
      key(env.el, 'z', { metaKey: true });
      assert.equal(t.value, before, 'the colon taken back, the closer still stepped over');
    } finally {
      env.uninstall();
    }
  });
});

describe('what Enter takes and what it leaves', () => {
  test('Enter never takes a closer: it is a new line, and Tab still takes the closer', async () => {
    const env = await open();
    try {
      typeFocused(env.el, READER + ',\n' + OPEN);
      assert.equal(ghost(env.el), '}');
      assert.equal(key(env.el, 'Enter').defaultPrevented, false);
      assert.ok(key(env.el, 'Tab').defaultPrevented);
      assert.equal(textarea(env.el).value, READER + ',\n' + OPEN + '}');
    } finally {
      env.uninstall();
    }
  });

  test('the Enter that follows a composition ending, as WebKit sends it with isComposing false, takes nothing; the next does', async () => {
    const env = await open();
    try {
      typeFocused(env.el, READER + ',\n(z:Opt');
      textarea(env.el).dispatch('compositionend');
      assert.equal(key(env.el, 'Enter').defaultPrevented, false);
      assert.equal(textarea(env.el).value, READER + ',\n(z:Opt');
      assert.ok(key(env.el, 'Enter').defaultPrevented, 'a later plain Enter takes the word again');
      assert.equal(textarea(env.el).value, READER + ',\n(z:Option');
    } finally {
      env.uninstall();
    }
  });
});

describe('the case being typed', () => {
  // a kind or type written in another case is replaced by the declared spelling, by the suggestions row, in one step;
  // the inline match offers only what the typed letters begin exactly, so it never writes an undeclared spelling
  test('a kind in another case is no inline match; Tab takes the declared kind in its place, and one undo takes it back', async () => {
    const env = await open();
    try {
      const t = textarea(env.el);
      typeFocused(env.el, READER + ',\n(z:op');
      assert.equal(ghost(env.el), null);
      assert.ok(key(env.el, 'Tab').defaultPrevented);
      assert.equal(t.value, READER + ',\n(z:Option');
      key(env.el, 'z', { metaKey: true });
      assert.equal(t.value, READER + ',\n(z:op');
    } finally {
      env.uninstall();
    }
  });

  test('a relationship type or a property name in another case is no inline match either', async () => {
    const env = await open();
    try {
      typeFocused(env.el, READER + ',\n(large)-[:an');
      assert.equal(ghost(env.el), null);
      key(env.el, 'Tab');
      assert.equal(textarea(env.el).value, READER + ',\n(large)-[:ANSWERS');
      typeFocused(env.el, READER + ',\n(z:Option {NA');
      assert.notEqual(ghost(env.el), 'me: ', 'NA is not na');
    } finally {
      env.uninstall();
    }
  });
});

describe('the suggestions row, as before', () => {
  test('after a bare ( the names are suggested, no closer is shown, and Tab takes the first name', async () => {
    const env = await open();
    try {
      typeFocused(env.el, READER + ',\n(');
      assert.equal(ghost(env.el), null);
      assert.ok(key(env.el, 'Tab').defaultPrevented);
      assert.equal(textarea(env.el).value, READER + ',\n(eyes');
    } finally {
      env.uninstall();
    }
  });
});

describe('in the card', () => {
  test('the same: ghost text in the card’s picture, Tab or Enter to accept, Escape to dismiss, one undo to take back', async () => {
    const env = await load({ files: { [CARD_PATH]: CARD_NOTE } });
    try {
      const el = await show(env);
      labelled(el, 'Edit here').click();
      await until(() => !!el.querySelector('textarea'));
      const t = el.querySelector('textarea'),
        shown = () => el.querySelector('.graph-note-overlay .graph-note-ghost')?.textContent ?? null,
        press = (k, more = {}) => t.dispatch('keydown', { key: k, ...more });
      const typed = CARD_READER + ',\n(z:Opt';
      t.value = typed;
      t.setSelectionRange(typed.length, typed.length);
      t.dispatch('input');
      assert.equal(shown(), 'ion');
      assert.equal(press('Escape').defaultPrevented, true);
      assert.equal(shown(), null);
      t.value = typed + 'i';
      t.setSelectionRange(typed.length + 1, typed.length + 1);
      t.dispatch('input');
      assert.equal(shown(), 'on');
      assert.ok(press('Enter').defaultPrevented);
      assert.equal(t.value, CARD_READER + ',\n(z:Option');
      assert.ok(press('z', { ctrlKey: true }).defaultPrevented);
      assert.equal(t.value, typed + 'i');
    } finally {
      env.uninstall();
    }
  });
});
