// The user guide in the wiki (spec §41, user_guide_wiki). It is a page in plain words for people who are not technical.
// Its pictures are taken from the current build by scripts/wiki-screens.mjs. Its list of settings is made from the
// editor's own options. Pure: no browser is started; the pictures' list and the guide are held against each other.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { OPTIONS } from '../packages/core/src/settings.ts';
import { settingsTables, shotsOf, unexplained } from '../scripts/wiki.mjs';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SHOTS, findChrome, servedFiles } from '../scripts/wiki-screens.mjs';
import { read } from './repository/repo.js';

const guide = read('wiki/How-to-use-ThoughtKnot.md');

describe('the user guide', () => {
  test('shows every picture taken, each once, and asks for none that is not taken', () => {
    assert.deepEqual(shotsOf(guide).sort(), SHOTS.map((s) => s.name).sort());
  });

  test('gives every picture words that say what it shows', () => {
    for (const s of SHOTS) assert.ok(s.alt.length > 15, s.name);
  });

  test('lists every setting of the editor, from its own list of options', () => {
    assert.match(guide, /<!-- wiki:settings -->/);
    const tables = settingsTables(OPTIONS);
    for (const o of OPTIONS) assert.ok(tables.includes(`| **${o.name}** |`), o.name);
  });

  test('keeps to plain words: no sentence over 40 words, and none of the code words a reader would not know', () => {
    const prose = guide
      .replace(/````[\s\S]*?````|```[\s\S]*?```/g, '')
      .replace(/`[^`]*`/g, 'x')
      .replace(/\(http[^)]*\)/g, '');
    for (const sentence of prose.split(/(?<=[.!?])\s+|\n(?=\s*(?:[#|-]|\d+\.|\n))/))
      assert.ok(sentence.split(/\s+/).length <= 40, sentence.slice(0, 80));
    assert.doesNotMatch(prose, /\b(API|DOM|SVG renderer|CRDT|npm|repository|workspace|regex)\b/);
  });

  test('names a new button of the card, and not the count of problems, which it explains as such', () => {
    assert.deepEqual(unexplained(['Fit', 'Rewind time', '3 problems', 'No problems'], guide), ['Rewind time']);
  });
});

describe('finding Chrome', () => {
  test('takes the one given, else the first usual name found, and says when there is none', () => {
    assert.equal(findChrome('/my/chrome'), '/my/chrome');
    assert.equal(
      findChrome(undefined, (n) => {
        if (n !== 'chromium') throw new Error('not found');
        return '/usr/bin/chromium';
      }),
      '/usr/bin/chromium',
    );
    assert.throws(
      () =>
        findChrome(undefined, () => {
          throw new Error('not found');
        }),
      /no Chrome found/,
    );
  });
});

describe('serving the harness for the screenshots', () => {
  test('serves only the built files and the icons, by name, so a path such as ../ reaches nothing else', () => {
    const dir = mkdtempSync(join(tmpdir(), 'wiki-served-'));
    writeFileSync(join(dir, 'index.html'), '');
    writeFileSync(join(dir, 'harness.js'), '');
    const files = servedFiles(dir);
    assert.equal(files.get('/'), join(dir, 'index.html'));
    assert.equal(files.get('/harness.js'), join(dir, 'harness.js'));
    assert.ok(files.get('/icons/pencil.svg').endsWith(join('icons', 'pencil.svg')));
    for (const asked of ['/../package.json', '/icons/../../../package.json', '/%2e%2e/package.json'])
      assert.equal(files.get(asked), undefined, asked);
  });
});
