// A gql block shown as code (spec §4, "colour"): a query is coloured text with a copy button. In Live Preview Obsidian
// puts its own "Edit this block" button at the block's top right. The copy button must sit beside it, never on it
// (device check V-03, 11 Oct 2026: the two icons were stacked at the top right).
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { build } from './host/load-plugin.js';
import { rules, winner } from './host/cascade.js';
import { fence } from './host/notes.js';
import { load, styles, GRAPH, show } from './host/view-notes.js';

before(() => build());

const QUERY = `// graph: reader · QUERY
MATCH (r:Reason)-[:FAVOURS]->(o:Option) RETURN o.name, count(r)`;

const all = rules(styles, 'styles.css');
/** The copy button as the page holds it: in a code block, in a block of Live Preview or of reading view. */
const copyButton = (...around) => ({
  tag: 'button',
  classes: ['copy-code-button'],
  ancestors: [{ tag: 'pre', classes: ['language-gql', 'thoughtknot-code'] }, ...around],
});
const livePreview = { tag: 'div', classes: ['cm-embed-block', 'markdown-rendered'] };
const readingView = { tag: 'div', classes: ['block-language-gql'] };

describe('a query block shown as code', () => {
  let env;
  before(async () => {
    env = await load();
  });
  after(() => env.uninstall());

  test('is a code block holding one copy button, named for a screen reader and drawn with an icon', async () => {
    const { el } = await show(env, `${fence(GRAPH)}\n\n${fence(QUERY)}`, 1);
    const code = el.querySelector('pre.thoughtknot-code');
    assert.ok(code, 'shown as code, not drawn');
    const buttons = code.querySelectorAll('button.copy-code-button');
    assert.equal(buttons.length, 1);
    assert.equal(buttons[0].getAttribute('aria-label'), 'Copy');
    assert.ok(buttons[0].getAttribute('data-icon'));
  });
});

describe('the copy button beside Obsidian’s edit-block button', () => {
  // The edit-block button is Obsidian's, at the top right of the block in Live Preview and shown on hover. The bar leaves
  // it var(--gn-space-9) of room (styles.css); the copy button, which Obsidian also puts at the top right, steps clear of it.
  test('in Live Preview it is moved in from the right edge by the room the edit-block button takes', () => {
    const moved = winner(all, copyButton(livePreview), 'inset-inline-end');
    assert.ok(moved, 'a rule moves it');
    assert.match(moved.value, /var\(--gn-space-9\)/, 'by the room the bar leaves for the same button');
    assert.match(moved.value, /^calc\(/, 'and a little more, so the two do not touch');
  });

  test('in reading view, where Obsidian shows no edit-block button, it stays where Obsidian puts it', () => {
    assert.equal(winner(all, copyButton(readingView), 'inset-inline-end'), undefined);
  });

  test('the same in light and dark themes and at phone width: only the theme’s sizes, no colour, theme or width', () => {
    const rule = all.find((r) => r.selectors.some((s) => /copy-code-button/.test(s)));
    assert.ok(rule, 'a rule for the copy button');
    assert.ok(
      rule.selectors.every((s) => !/theme-|is-mobile|is-phone|is-tablet/.test(s)),
      'not scoped to a theme or a device',
    );
    assert.deepEqual(
      rule.declarations.map((d) => d.property),
      ['inset-inline-end'],
      'it moves the button and does nothing else',
    );
    const at = styles.indexOf(rule.selectors[0]);
    const above = styles.slice(0, at);
    assert.equal(above.split('{').length, above.split('}').length, 'at the top level, in no @media block');
  });

  test('the edit-block button is left to Obsidian: the plugin styles nothing of its own for it', () => {
    const named = all.filter((r) => r.selectors.some((s) => /edit-block-button/.test(s)));
    assert.deepEqual(named, []);
  });
});
