// The text pane and the drawn code blocks colour GQL with the same tokenizer as the gql-highlight plugin (spec §4,
// "colour"). The answers in tokens.expected.json were recorded from gql-highlight's own tokenize. So the core's must
// give the same token classes over the same text. As gql-highlight's do, they must join back into the text exactly.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { tokenize, TOKEN_CLASSES } from '../src/tokens.ts';

const styles = readFileSync(new URL('../../../styles.css', import.meta.url), 'utf8');

const expected = JSON.parse(readFileSync(new URL('./tokens.expected.json', import.meta.url), 'utf8'));

for (const [name, { source, tokens }] of Object.entries(expected)) {
  test(`the same tokens as gql-highlight: ${name}`, () => {
    assert.deepEqual(
      tokenize(source).map((t) => [t.c, t.s]),
      tokens,
    );
  });
}

test('tokens join back into the text exactly, whatever the text', () => {
  const parts = [
    "'",
    '"',
    '`',
    '//',
    '/*',
    '*/',
    '(',
    ')',
    '[',
    ']',
    '{',
    '}',
    ':',
    '|',
    '-[',
    ']->',
    'MATCH',
    'x',
    '\n',
    ' ',
    '$',
    '1.5',
    'é',
    '→',
    '\\',
  ];
  let s = 7;
  for (let i = 0; i < 2000; i++) {
    let text = '';
    for (let k = 0; k < 30; k++) {
      s = (s * 1103515245 + 12345) >>> 0;
      text += parts[s % parts.length];
    }
    assert.equal(
      tokenize(text)
        .map((t) => t.s)
        .join(''),
      text,
    );
  }
});

// whitespace as GQL names it (graph spec §3), as the reader reads it: U+180E is whitespace, U+FEFF is not
test('a kind after U+180E is coloured as a kind, and one after U+FEFF is not', () => {
  const kind = (text) => tokenize(text).find((t) => t.s === 'Person')?.c;
  assert.equal(kind('(a:\u{180e}Person)'), 'label');
  assert.equal(kind('(a:\u{feff}Person)'), 'var');
});

test('every class has a colour rule in styles.css, named as gql-highlight names it', () => {
  const classes = new Set(
    Object.values(expected)
      .flatMap((c) => c.tokens.map(([k]) => k))
      .filter((k) => k),
  );
  for (const c of classes) assert.ok(TOKEN_CLASSES.includes(c), c);
  for (const c of TOKEN_CLASSES) assert.match(styles, new RegExp(`\\.gql-${c}\\s*\\{[^}]*color:`), c);
});
