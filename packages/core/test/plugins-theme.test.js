// A plug-in's theme tokens (editor spec §44, plugin_theme_tokens): a plug-in inherits the core's design tokens, and may
// add tokens of its own for what it adds, each named under its own id, with a light and a dark colour that each meet the
// locked contrast on the background it sits on. A token that does not is refused, saying why, and leaves nothing behind.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { EXTENSION_POINTS, PLUGIN_API, pluginRegistry } from '../src/plugins.ts';
import { themeTokenContract } from '../src/plugins-contract.ts';
import { LOCKED_CONTRAST, THEME_TOKENS, contrastRatio, themeTokenCss } from '../src/theme-tokens.ts';

/** A plug-in that adds the tokens `tokens` and keeps what it was given. */
const theming = (tokens, id = 'acme.tags') => {
  const seen = {};
  return {
    seen,
    plugin: {
      id,
      version: '0.1.0',
      api: PLUGIN_API,
      uses: ['theme'],
      register: (points) => {
        seen.points = points;
        for (const t of tokens) points.theme.add(t);
      },
    },
  };
};

const TAG = { name: '--gn-plugin-acme-tags-tag', light: '#1a5fb4', dark: '#99c1f1' };

describe('a plug-in’s theme tokens', () => {
  test('the theme is an extension point, and a plug-in using it inherits every core token', () => {
    assert.ok(EXTENSION_POINTS.includes('theme'));
    const { seen, plugin } = theming([]);
    pluginRegistry().register(plugin);
    assert.deepEqual([...seen.points.theme.core], Object.keys(THEME_TOKENS));
    assert.ok(seen.points.theme.core.includes('--gn-text-normal') && seen.points.theme.core.includes('--gn-bg'));
    assert.equal(seen.points.exports, undefined, 'and nothing its manifest does not name');
  });

  test('a token in light and dark that meets the locked contrast is added, sitting on the page unless it says', () => {
    const registry = pluginRegistry();
    const alt = { name: '--gn-plugin-acme-tags-mark', light: '#555', dark: '#bbb', on: '--gn-bg-alt', part: 'line' };
    registry.register(theming([TAG, alt]).plugin);
    assert.deepEqual(registry.themeTokens(), [TAG, alt]);
    registry.themeTokens().pop();
    assert.equal(registry.themeTokens().length, 2, 'what the registry hands out cannot change what it holds');
  });

  for (const [why, token, said] of [
    ['a core token’s name', { ...TAG, name: '--gn-text-normal' }, /--gn-plugin-acme-tags-/],
    ['another plug-in’s name', { ...TAG, name: '--gn-plugin-other-tag' }, /--gn-plugin-acme-tags-/],
    ['a name with capitals', { ...TAG, name: '--gn-plugin-acme-tags-Tag' }, /--gn-plugin-acme-tags-/],
    ['a colour that is not #rrggbb or #rgb', { ...TAG, dark: 'blue' }, /"blue" is not a colour/],
    ['a background that is not a core background', { ...TAG, on: '--gn-accent' }, /--gn-bg or --gn-bg-alt/],
  ])
    test(`a token with ${why} is refused, saying why`, () => {
      assert.throws(() => pluginRegistry().register(theming([token]).plugin), said);
    });

  test('a light value short of the locked contrast in the light theme is refused, naming the theme and the ratio', () => {
    const pale = { ...TAG, light: '#aaaaaa' };
    assert.ok(contrastRatio('#aaaaaa', '#ffffff') < LOCKED_CONTRAST.text);
    assert.throws(
      () => pluginRegistry().register(theming([pale]).plugin),
      /--gn-plugin-acme-tags-tag reaches 2\.\d+:1 on --gn-bg in the light theme, short of the locked 4\.5:1 for text/,
    );
  });

  test('a dark value short of the locked contrast in the dark theme is refused, and a line is held to 3:1', () => {
    const dim = { ...TAG, dark: '#444444' };
    assert.throws(
      () => pluginRegistry().register(theming([dim]).plugin),
      /in the dark theme, short of the locked 4\.5:1/,
    );
    const line = { ...TAG, light: '#949494', dark: '#5f5f5f', part: 'line' };
    assert.ok(contrastRatio('#949494', '#ffffff') >= 3 && contrastRatio('#949494', '#ffffff') < 4.5);
    assert.throws(
      () => pluginRegistry().register(theming([line]).plugin),
      /dark theme, short of the locked 3:1 for a line/,
    );
    const fine = { ...line, dark: '#7a7a7a' };
    const registry = pluginRegistry();
    registry.register(theming([fine]).plugin);
    assert.deepEqual(registry.themeTokens(), [fine]);
  });

  test('a refused token leaves nothing behind, and a name is added only once, by one plug-in', () => {
    const registry = pluginRegistry();
    assert.throws(() =>
      registry.register(theming([TAG, { ...TAG, name: '--gn-plugin-acme-tags-x', light: '#eee' }]).plugin),
    );
    assert.deepEqual(registry.themeTokens(), []);
    assert.deepEqual(registry.plugins(), []);
    const shared = { ...TAG, name: '--gn-plugin-acme-tags-x-y' };
    registry.register(theming([TAG, shared]).plugin);
    assert.throws(() => registry.register(theming([TAG], 'acme.tags-2').plugin), /--gn-plugin-acme-tags-2-/);
    // two ids can lead to one name: acme.tags-x may name --gn-plugin-acme-tags-x-y, which acme.tags has added already
    assert.throws(() => registry.register(theming([shared], 'acme.tags-x').plugin), /already added by acme\.tags/);
    const clash = theming([
      { ...TAG, name: '--gn-plugin-acme-tags-tag-y' },
      { ...TAG, name: '--gn-plugin-acme-tags-tag-y' },
    ]);
    assert.throws(() => pluginRegistry().register(clash.plugin), /already added by acme\.tags/);
    assert.deepEqual(registry.themeTokens(), [TAG, shared]);
    assert.deepEqual(registry.plugins(), ['acme.tags']);
  });

  test('the tokens are written as CSS a host applies: light by default and in a light host, dark when either asks', () => {
    const css = themeTokenCss([TAG, { ...TAG, name: '--gn-plugin-acme-tags-mark', light: '#555', dark: '#bbb' }]);
    assert.equal(
      css,
      [
        ':root,.theme-light{--gn-plugin-acme-tags-tag:#1a5fb4;--gn-plugin-acme-tags-mark:#555}',
        '@media (prefers-color-scheme: dark){:root{--gn-plugin-acme-tags-tag:#99c1f1;--gn-plugin-acme-tags-mark:#bbb}}',
        '.theme-dark{--gn-plugin-acme-tags-tag:#99c1f1;--gn-plugin-acme-tags-mark:#bbb}',
      ].join('\n'),
    );
    assert.equal(themeTokenCss([]), '', 'no tokens, no CSS');
  });

  test('the theme token contract passes a good token and fails each broken promise, saying what was wanted', () => {
    const failures = (t) =>
      themeTokenContract(t, 'acme.tags').flatMap((c) => {
        try {
          c.run();
          return [];
        } catch (err) {
          return [`${c.name}: ${err.message}`];
        }
      });
    assert.deepEqual(failures(TAG), []);
    for (const [broken, check] of [
      [{ ...TAG, name: '--gn-bg' }, 'it is named under its plug-in'],
      [{ ...TAG, light: 'red' }, 'it gives a colour'],
      [{ ...TAG, light: '#cccccc' }, 'it meets the locked contrast in the light theme'],
      [{ ...TAG, dark: '#333333' }, 'it meets the locked contrast in the dark theme'],
    ]) {
      const failed = failures(broken).filter((f) => f.startsWith(check));
      assert.equal(failed.length, 1, failures(broken).join('\n'));
      assert.match(failed[0], /wanted .+, got /);
    }
  });
});
