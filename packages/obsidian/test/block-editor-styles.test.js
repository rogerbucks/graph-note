// The block editor in a drawing's card, as it looks (editor spec §4, "In place"): as tall as its text, its coloured
// picture never a code block, and the theme's hover and focus styles never reaching the box (inline_untouched_by_theme).
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { build, load, until } from './host/load-plugin.js';
import { rules, winner } from './host/cascade.js';
import { labelled } from './host/notes.js';
import { PATH, READER, NOTE, show } from './host/card-notes.js';

before(() => build());

describe('the text in the card fits its text', () => {
  // the try-out of 8 Oct 2026: the box in the card had a tall empty area under the text that the caret could land in, and
  // the note's own code styles wrapped the coloured picture of the text out of step with the field under it
  test('the coloured picture is not a code block, so the note’s own code styles never reach it', async () => {
    const env = await load({ files: { [PATH]: NOTE } });
    try {
      const el = await show(env);
      labelled(el, 'Edit here').click();
      await until(() => !!el.querySelector('textarea'));
      assert.notEqual(el.querySelector('.graph-note-overlay').tagName, 'PRE');
      assert.equal(el.querySelector('textarea').getAttribute('rows'), String(READER.split('\n').length + 1));
    } finally {
      env.uninstall();
    }
  });

  test('in the card the box keeps no height of its own: as tall as its text, and one line to type on', () => {
    const css = readFileSync(new URL('../../../styles.css', import.meta.url), 'utf8');
    assert.match(css, /\.graph-note-pane\.graph-note-inline\s*\{[^}]*height:\s*auto;/);
    assert.match(
      css,
      /\.graph-note-inline \.graph-note-editor,\s*\.graph-note-inline \.graph-note-overlay\s*\{[^}]*min-height:\s*0;/,
    );
    // the picture sets the height (long_lines_wrap): one more row past its text, to type on
    assert.match(css, /\.graph-note-overlay::after\s*\{[^}]*content:\s*' ';/);
  });
});

describe('the box in the card, untouched by the theme', () => {
  // inline_untouched_by_theme (spec §4, 8 Oct 2026): the in-place box looks the same whether hovered, focused or neither,
  // and its accessible name raises no tooltip.
  const styles = readFileSync(new URL('../../../styles.css', import.meta.url), 'utf8');

  // the try-out of 8 Oct 2026: Obsidian shows a tooltip for any aria-label, so hovering the field showed "Text of graph trip"
  test('the field is named for a screen reader by a hidden label, so no tooltip shows on hover', async () => {
    const env = await load({ files: { [PATH]: NOTE } });
    try {
      const el = await show(env);
      labelled(el, 'Edit here').click();
      await until(() => !!el.querySelector('textarea'));
      const t = el.querySelector('textarea');
      assert.equal(t.getAttribute('aria-label'), null);
      const label = el.querySelector(`#${t.getAttribute('aria-labelledby')}`);
      assert.equal(label?.textContent, 'Text of graph reader');
      assert.ok(label.classList.contains('graph-note-sr'));
    } finally {
      env.uninstall();
    }
  });

  // the try-out of 8 Oct 2026: on mouse hover the box went flat grey and hid the coloured text under it. Obsidian's app.css
  // styles every textarea, and textarea:hover (0,1,1) outweighed .graph-note-text (0,1,0). These are the rules it gives
  // every textarea, as shipped in the Mac app on 8 Oct 2026, cut to the properties that would show.
  const OBSIDIAN = `
    textarea { background: var(--background-modifier-form-field); border: var(--input-border-width) solid var(--background-modifier-border);
      color: var(--text-normal); font-family: inherit; padding: var(--input-padding); font-size: var(--font-ui-small);
      border-radius: var(--input-radius); outline: none; }
    @media (hover: hover) {
      textarea:hover { background-color: var(--background-modifier-form-field-hover); border-color: var(--background-modifier-border-hover); }
    }
    textarea:active, textarea:focus { border-color: var(--background-modifier-border-focus); }
    textarea:active, textarea:focus, textarea:focus-visible { box-shadow: 0 0 0 var(--input-border-width-focus) var(--background-modifier-border-focus); }
    textarea { line-height: var(--line-height-tight); border-radius: var(--textarea-radius, var(--input-radius)); padding: var(--textarea-padding, var(--input-padding)); }
  `;
  const all = [...rules(OBSIDIAN, 'obsidian'), ...rules(styles, 'graph-note')];
  const field = (states, inline) => ({
    tag: 'textarea',
    classes: ['graph-note-text'],
    states,
    ancestors: [
      { tag: 'div', classes: ['graph-note-editor'] },
      { tag: 'div', classes: ['graph-note-pane-text'] },
      { tag: 'div', classes: inline ? ['graph-note-pane', 'graph-note-inline'] : ['graph-note-pane'] },
      { tag: 'div', classes: ['markdown-rendered'] },
    ],
  });
  const LOOK = [
    'background-color',
    'border-color',
    'border-width',
    'border-radius',
    'box-shadow',
    'outline',
    'color',
    'padding',
    'font-family',
    'font-size',
    'line-height',
  ];

  for (const states of [[], ['hover'], ['focus'], ['active'], ['focus', 'focus-visible'], ['hover', 'focus']]) {
    test(`the field keeps the plugin’s look: ${states.join(' and ') || 'at rest'}`, () => {
      for (const inline of [false, true]) {
        const el = field(states, inline);
        for (const property of LOOK) {
          const won = winner(all, el, property);
          assert.equal(won?.source, 'graph-note', `${property} comes from ${won?.selector} (${won?.source})`);
        }
        assert.equal(winner(all, el, 'background-color').value, 'transparent');
        assert.equal(winner(all, el, 'color').value, 'transparent');
      }
    });
  }
});

describe('a long line wraps, in the pane and in place', () => {
  // long_lines_wrap (spec §4, Roger, 18 Oct 2026): a long line ran off the right of the box, cut off, with its
  // plain-English note after it. The field and its coloured picture wrap alike, the note sits out of the flow so it never
  // adds a row the field does not have, and the picture, not the field, sets the box's height.
  const all = rules(readFileSync(new URL('../../../styles.css', import.meta.url), 'utf8'), 'graph-note');
  const inEditor = (tag, cls, inline) => ({
    tag,
    classes: [cls],
    states: [],
    ancestors: [
      { tag: 'div', classes: ['graph-note-editor'] },
      { tag: 'div', classes: ['graph-note-pane-text'] },
      { tag: 'div', classes: inline ? ['graph-note-pane', 'graph-note-inline'] : ['graph-note-pane'] },
    ],
  });
  const won = (el, property) => winner(all, el, property)?.value;

  test('the field and its picture wrap alike, each row of the picture over the row of the field it shows', () => {
    for (const inline of [false, true])
      for (const [tag, cls] of [
        ['textarea', 'graph-note-text'],
        ['div', 'graph-note-overlay'],
      ]) {
        const el = inEditor(tag, cls, inline);
        assert.equal(won(el, 'white-space'), 'pre-wrap', `${cls} white-space`);
        assert.equal(won(el, 'overflow-wrap'), 'anywhere', `${cls} overflow-wrap`);
        assert.equal(won(el, 'overflow'), 'hidden', `${cls} overflow`);
      }
  });

  test('the picture sets the box’s height, the field laid over it; the note at a line’s end takes no room', () => {
    for (const inline of [false, true]) {
      assert.equal(won(inEditor('div', 'graph-note-overlay', inline), 'position'), 'relative');
      assert.equal(won(inEditor('textarea', 'graph-note-text', inline), 'position'), 'absolute');
      const end = {
        tag: 'span',
        classes: ['graph-note-line-end'],
        states: [],
        ancestors: [inEditor('div', 'graph-note-overlay', inline)],
      };
      assert.equal(won(end, 'position'), 'absolute');
      assert.equal(won(end, 'white-space'), 'pre');
    }
  });

  test('the field is never told not to wrap, and each line’s note is out of the flow of its text', async () => {
    const env = await load({ files: { [PATH]: NOTE } });
    try {
      const el = await show(env);
      labelled(el, 'Edit here').click();
      await until(() => !!el.querySelector('.graph-note-readback'));
      assert.equal(el.querySelector('textarea').getAttribute('wrap'), null);
      const backs = el.querySelectorAll('.graph-note-readback');
      assert.ok(backs.length > 0);
      for (const b of backs) assert.ok(b.parentElement.classList.contains('graph-note-line-end'), b.textContent);
    } finally {
      env.uninstall();
    }
  });
});
