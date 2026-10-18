// The slice board's stylesheet:
// - CSS only.
// - Light and dark colour tokens that agree.
// - The altitude switch done with radio inputs and `:checked ~` selectors.
// - A layout that holds at 400px.
// - The source written one rule and one declaration to a line, as Prettier writes CSS.
// Spec §12, requirements_checked_in_ci.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { ALTITUDES, BOARD_CSS } from '../scripts/slice-board-style.mjs';

/** The declarations of the rule whose selector is written exactly so (a list of selectors, one to a line). */
const rule = (selector) => {
  const at = `\n${BOARD_CSS}`.indexOf(`\n${selector} {`);
  assert.ok(at >= 0, `the stylesheet holds ${selector}`);
  const text = BOARD_CSS.slice(at);
  return text.slice(text.indexOf('{') + 1, text.indexOf('}'));
};
const names = (block) => [...block.matchAll(/(--[a-z0-9-]+):/g)].map((m) => m[1]).sort();
const MEDIA_DARK = ':root:not([data-theme="light"])';
const FORCED_DARK = ':root[data-theme="dark"]';

describe('the altitudes', () => {
  test('are Overview, Working and Full, by their ids', () => {
    assert.deepEqual(ALTITUDES, [
      ['overview', 'Overview'],
      ['working', 'Working'],
      ['full', 'Full'],
    ]);
  });

  test('switch by CSS alone: the checked radio shows its view, and the focused one is outlined', () => {
    for (const [id] of ALTITUDES) {
      assert.match(BOARD_CSS, new RegExp(`#alt-${id}:checked ~ \\.view-${id} \\{\\n  display: block;`));
      assert.match(
        BOARD_CSS,
        new RegExp(`#alt-${id}:focus-visible ~ \\.switch label\\[for="alt-${id}"\\] \\{\\n  outline:`),
      );
    }
    assert.match(rule('.view'), /display:\s*none/);
    assert.match(rule('.alt'), /opacity:\s*0/, 'the radio is hidden but stays focusable, never display: none');
  });

  test('show the pull requests panel on every one, Full included', () => {
    assert.match(rule('.prs'), /display:\s*none/);
    for (const [id] of ALTITUDES) assert.match(BOARD_CSS, new RegExp(`#alt-${id}:checked ~ \\.prs`));
  });
});

describe('the colours', () => {
  test('are custom properties on :root, with the dark values under the media query and under data-theme', () => {
    const light = /^:root \{([^}]*)\}/m.exec(BOARD_CSS)[1];
    for (const token of ['--bg', '--text', '--proved', '--part', '--open'])
      assert.match(light, new RegExp(`${token}:`));
    assert.match(light, /color-scheme: light/);
    assert.match(
      BOARD_CSS,
      /@media \(prefers-color-scheme: dark\) \{\n {2}:root:not\(\[data-theme="light"\]\) \{[^}]*color-scheme: dark/,
    );
    assert.match(rule(FORCED_DARK), /color-scheme: dark/);
    assert.match(rule('body'), /background:\s*var\(--bg\)/);
    const outsideTokens = BOARD_CSS.replace(/:root[^{]*\{[^}]*\}/g, '');
    assert.doesNotMatch(outsideTokens, /#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i, 'a colour is written only as a token');
  });

  test('the light and both dark token sets define exactly the same custom properties', () => {
    const light = names(/^:root \{([^}]*)\}/m.exec(BOARD_CSS)[1]);
    assert.ok(light.length > 10);
    assert.deepEqual(names(/:root:not\(\[data-theme="light"\]\) \{([^}]*)\}/.exec(BOARD_CSS)[1]), light);
    assert.deepEqual(names(rule(FORCED_DARK)), light);
  });

  test('the two dark sets give the same values', () => {
    const values = (block) => block.replace(/\s+/g, ' ').trim();
    assert.equal(
      values(/:root:not\(\[data-theme="light"\]\) \{([^}]*)\}/.exec(BOARD_CSS)[1]),
      values(rule(FORCED_DARK)),
    );
  });

  test('each of proved, part and open has a text, a background and a segment colour', () => {
    for (const status of ['proved', 'part', 'open']) {
      assert.match(BOARD_CSS, new RegExp(`--${status}-bg:`));
      assert.match(BOARD_CSS, new RegExp(`--${status}-text:`));
      assert.match(BOARD_CSS, new RegExp(`\\.seg-${status} \\{\\n  fill: var\\(--${status}\\);`));
    }
  });
});

describe('the layout', () => {
  test('holds at 400px: a 16px gutter, and nothing wider than the screen outside its own scroll box', () => {
    assert.match(rule('.banner,\n.board'), /padding:\s*0 16px/);
    assert.match(BOARD_CSS, /max-width:\s*100%/);
    assert.match(rule('.scroll'), /overflow-x:\s*auto/);
  });

  test('wraps a long rule and proof, and sets counts in tabular figures', () => {
    assert.match(rule('.rule,\n.proves'), /overflow-wrap:\s*anywhere/);
    assert.match(rule('.meta'), /font-variant-numeric:\s*tabular-nums/);
    assert.match(rule('.big'), /font-variant-numeric:\s*tabular-nums/);
  });

  test('is a stylesheet with no outside request, font or image', () => {
    assert.doesNotMatch(BOARD_CSS, /@import|url\(|@font-face|https?:\/\//);
  });
});

describe('the source', () => {
  test('is written as Prettier writes CSS: one declaration to a line, one selector to a line, no line over 120', () => {
    const lines = BOARD_CSS.split('\n');
    assert.deepEqual(
      lines.filter((l) => (l.match(/;/g) ?? []).length > 1),
      [],
      'more than one declaration on a line',
    );
    assert.deepEqual(
      lines.filter((l) => l.endsWith('{') && l.includes(', ')),
      [],
      'more than one selector on a line',
    );
    assert.deepEqual(
      lines.filter((l) => (l.match(/\{/g) ?? []).length > 1 || (l.includes('{') && l.includes('}'))),
      [],
      'more than one rule on a line',
    );
    assert.deepEqual(
      lines.filter((l) => l.length > 120),
      [],
    );
    assert.ok(lines.length > 150, 'one rule is not folded into another to save lines');
  });
});
