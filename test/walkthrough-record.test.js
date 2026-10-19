// The accessibility walk-through is recorded for each stable release, and the release waits on it (spec §11,
// walkthrough_recorded; UX-1 of the expert panel):
// - RELEASING.md holds the 21 checks, AX-01 to AX-21, and names the three hosts.
// - test/walkthroughs/<version>.md is the record. It gives the build, the day and who walked it. Then comes each host
//   in each theme, with every check ticked, or left unticked with its reason written after it.
// - The release and its dry run run the check on the version they release, and fail without a whole record.
// - `--new` writes an empty record to fill in. Every record committed passes.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { checkRecord, checkIds, recordPath, template, HOSTS, THEMES } from '../scripts/walkthrough-record.mjs';
import { read } from './repository/repo.js';

const IDS = checkIds(read('RELEASING.md'));

/** A whole record of `version`: every check ticked in every host and theme, but those in `skip` (id: reason). */
function whole(version, skip = {}) {
  const head = `# Accessibility walk-through: ${version}\n\n- Build: ${version} (abc1234)\n- Date: 2026-10-20\n- By: Roger\n`;
  const parts = HOSTS.flatMap((host) =>
    THEMES.map(
      (theme) =>
        `\n## ${host} · ${theme}\n\n` +
        IDS.map((id) => (skip[id] ? `- [ ] ${id} — ${skip[id]}` : `- [x] ${id}`)).join('\n') +
        '\n',
    ),
  );
  return head + parts.join('');
}

describe('the checks and the hosts', () => {
  test('RELEASING.md holds the 21 checks, AX-01 to AX-21, each once', () => {
    assert.deepEqual(
      IDS,
      Array.from({ length: 21 }, (_, i) => `AX-${String(i + 1).padStart(2, '0')}`),
    );
  });

  test('RELEASING.md names every host the record walks, and says where the record goes', () => {
    const text = read('RELEASING.md');
    for (const host of HOSTS) assert.ok(text.includes(host), host);
    assert.match(text, /test\/walkthroughs\/<version>\.md/);
    assert.match(text, /node scripts\/walkthrough-record\.mjs --new/);
  });
});

describe('a record', () => {
  test('a whole record passes', () => {
    assert.deepEqual(checkRecord(whole('0.7.0'), { ids: IDS, version: '0.7.0' }), []);
  });

  test('a check left unticked passes only with its reason written after it', () => {
    const reasoned = whole('0.7.0', { 'AX-14': 'not on a desktop: AX-14 is for a phone' });
    assert.deepEqual(checkRecord(reasoned, { ids: IDS, version: '0.7.0' }), []);
    const bare = whole('0.7.0').replace('- [x] AX-05', '- [ ] AX-05');
    const problems = checkRecord(bare, { ids: IDS, version: '0.7.0' });
    assert.equal(problems.length, 1, problems.join('\n'));
    assert.match(problems[0], /Obsidian on a desktop · light: AX-05 is not ticked, and no reason is written/);
  });

  test('a host or a theme not walked, or a check left out, is named', () => {
    const noPhoneDark = whole('0.7.0').replace(/\n## Obsidian on a phone · dark\n[^#]*/, '\n');
    assert.match(checkRecord(noPhoneDark, { ids: IDS, version: '0.7.0' }).join('\n'), /Obsidian on a phone · dark/);
    const noTwelve = whole('0.7.0').replace('- [x] AX-12\n', '');
    assert.match(checkRecord(noTwelve, { ids: IDS, version: '0.7.0' }).join('\n'), /AX-12 is missing/);
  });

  test('the build, the day and who walked it are given, and the build is the version released', () => {
    const problems = (text) => checkRecord(text, { ids: IDS, version: '0.7.0' }).join('\n');
    assert.match(problems(whole('0.7.0').replace('- By: Roger\n', '')), /who walked it/);
    assert.match(problems(whole('0.7.0').replace('2026-10-20', 'yesterday')), /the day/);
    assert.match(problems(whole('0.6.9')), /0\.7\.0/);
  });

  test('a check the walk-through does not hold is refused', () => {
    const odd = whole('0.7.0').replace('- [x] AX-21\n', '- [x] AX-21\n- [x] AX-99\n');
    assert.match(checkRecord(odd, { ids: IDS, version: '0.7.0' }).join('\n'), /AX-99/);
  });

  test('--new writes a record with every check unticked, so it fails until it is walked', () => {
    const text = template('0.7.0', IDS, { commit: 'abc1234', date: '2026-10-20' });
    const problems = checkRecord(text, { ids: IDS, version: '0.7.0' });
    assert.equal(problems.length, IDS.length * HOSTS.length * THEMES.length + 1, 'every check, and who walked it');
    const done = text.replaceAll('- [ ]', '- [x]').replace('- By: ', '- By: Roger');
    assert.deepEqual(checkRecord(done, { ids: IDS, version: '0.7.0' }), []);
  });

  test('the record of a version is test/walkthroughs/<version>.md', () => {
    assert.equal(recordPath('0.7.0'), 'test/walkthroughs/0.7.0.md');
  });
});

describe('the release waits on it', () => {
  for (const workflow of ['.github/workflows/release.yml', '.github/workflows/release-check.yml'])
    test(`${workflow} checks the record before anything is built`, () => {
      const text = read(workflow);
      const check = text.indexOf('node scripts/walkthrough-record.mjs --release');
      assert.ok(check > 0, 'it checks the record');
      assert.ok(check < text.indexOf('quality-metrics.mjs'), 'before the slow work');
    });

  test('every record committed passes', () => {
    let names = [];
    try {
      names = readdirSync(new URL('./walkthroughs/', import.meta.url)).filter((n) => n.endsWith('.md'));
    } catch {
      // no record yet
    }
    for (const name of names) {
      const version = name.replace(/\.md$/, '');
      assert.deepEqual(checkRecord(read(recordPath(version)), { ids: IDS, version }), [], name);
    }
  });
});
