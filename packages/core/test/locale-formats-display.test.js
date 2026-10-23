// Every list the display layer sorts for the reader uses the reader's order (editor spec §42, locale_sorting). A bare
// `.sort()` puts text in code-unit order: "Zebra" before "apple", and "ö" after every letter in German. So no file of
// the display layer may sort text that way; it sorts through sortedForReader instead. A sort with its own comparison,
// such as by a count or a position, is fine.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DISPLAY = fileURLToPath(new URL('../src/display', import.meta.url));

test('no list the display layer shows is sorted in code-unit order', () => {
  const bare = readdirSync(DISPLAY, { recursive: true })
    .filter((f) => f.endsWith('.ts'))
    .flatMap((f) =>
      readFileSync(join(DISPLAY, f), 'utf8')
        .split('\n')
        .map((line, i) => [`${f}:${i + 1}`, line])
        .filter(([, line]) => /\.sort\(\)/.test(line))
        .map(([at]) => at),
    );
  assert.deepEqual(bare, [], 'sort these through sortedForReader');
});
