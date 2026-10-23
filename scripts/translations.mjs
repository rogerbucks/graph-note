#!/usr/bin/env node
// The translation files (editor spec §42, translations_as_files). Each is a plain JSON file for one language in
// packages/core/translations/, named by its language tag, such as fr.json or pt-BR.json. It holds the source's keys,
// each with its word in that language. The core reads them through one list, src/translation-files.ts, which this
// script writes. So a translator adds a file and runs this script, and writes no code.
//
// Usage:
//   node scripts/translations.mjs             writes the list from the files there.
//   node scripts/translations.mjs --new fr    starts fr.json with every source word, in UK English, to translate.
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const FOLDER = join(ROOT, 'packages/core/translations');
export const LIST = join(ROOT, 'packages/core/src/translation-files.ts');

/** The language tag of each translation file, sorted. */
export const translationTags = () =>
  readdirSync(FOLDER)
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.slice(0, -'.json'.length))
    .sort();

/** The list of translation files, as src/translation-files.ts holds it. */
export function listText(tags = translationTags()) {
  const name = (tag) => `t_${tag.replace(/-/g, '_')}`;
  return [
    '// The translation files of packages/core/translations/, by language tag (editor spec §42, translations_as_files).',
    '// Made by `node scripts/translations.mjs`: change the files there and run it, never this list by hand.',
    ...tags.map((t) => `import ${name(t)} from '../translations/${t}.json' with { type: 'json' };`),
    '',
    '/** Each translation file, by its language tag, as it is written: words.ts checks it against the source. */',
    `export const TRANSLATION_FILES: Record<string, unknown> = {${tags.map((t) => ` '${t}': ${name(t)}`).join(',')}${tags.length ? ' ' : ''}};`,
    '',
  ].join('\n');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const at = process.argv.indexOf('--new');
  if (at > 0) {
    const tag = Intl.getCanonicalLocales(process.argv[at + 1] ?? '')[0];
    const file = join(FOLDER, `${tag}.json`);
    if (existsSync(file)) throw new Error(`${tag}.json is there already`);
    const { SOURCE_WORDS } = await import('../packages/core/src/source-words.ts');
    writeFileSync(file, `${JSON.stringify(SOURCE_WORDS, null, 2)}\n`);
    console.log(`Started packages/core/translations/${tag}.json: translate each word, then run this script again.`);
  }
  writeFileSync(LIST, listText());
  // as Prettier writes it, so the format check passes
  execFileSync(join(ROOT, 'node_modules/.bin/prettier'), ['--write', LIST], { stdio: 'ignore' });
  console.log(`Listed ${translationTags().length} translation files in packages/core/src/translation-files.ts.`);
}
