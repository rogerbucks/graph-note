// The register of known risks (spec §50, risk_register): the release waits on it. Proved on registers made for the
// purpose: a risk left undecided, one overdue, one whose code moved, and the stamp that clears it. The committed
// register is checked too, and RISKS.md is held to what the script writes from it.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  ALERT_KEY,
  CHOICES,
  RULE_FROM,
  REGISTER,
  REPORT,
  STALE_DAYS,
  globToRegExp,
  newLine,
  readRegister,
  registerProblems,
  releaseProblems,
  report,
  rolesTouched,
  staleRisks,
  underPaths,
} from '../scripts/risk-register.mjs';
import { ROOT, read, runCommands } from './repository/repo.js';

const WAVES = {
  waves: [{ title: 'Wave 6 · Host, storage and plug-in contracts', start: '2026-11-13', end: '2026-11-26' }],
};
const risk = (over = {}) => ({
  id: 'SEC-1',
  role: 'Senior security engineer',
  area: 'security',
  title: 'The local server takes any origin',
  risk: 'A web page can call it.',
  evidence: ['packages/claude-code/server/editor-server.ts:10'],
  likelihood: 'medium',
  impact: 'high',
  decision: 'fix-now',
  fix: 'Check the Origin header.',
  check: 'A test posts with a foreign origin and expects 403.',
  paths: ['packages/claude-code/server/**'],
  effort: 'hours',
  raised: '2026-10-19',
  reviewed: { date: '2026-10-19', commit: 'abcdef1' },
  status: 'open',
  ...over,
});
const register = (...risks) => ({
  about: 'test',
  panel: { last_full: { date: '2026-10-19', commit: 'abcdef1', version: '0.7.1' } },
  risks,
});
const unchanged = () => [];
const moved = () => ['packages/claude-code/server/editor-server.ts', 'README.md'];

describe('the shape of a risk', () => {
  test('a whole risk passes, and each field it lacks is named', () => {
    assert.deepEqual(registerProblems(register(risk()), WAVES), []);
    const { fix: _f, paths: _p, ...bare } = risk();
    assert.match(registerProblems(register(bare), WAVES).join('\n'), /SEC-1: missing fix, paths/);
  });

  test('each choice field takes only its listed values', () => {
    for (const field of Object.keys(CHOICES)) {
      const found = registerProblems(register(risk({ [field]: 'maybe' })), WAVES);
      assert.match(found.join('\n'), new RegExp(`${field} must be one of`), field);
    }
  });

  test('a fix-later risk names a wave of the plan; an accepted one says who and why; a done one names its pull request', () => {
    assert.match(registerProblems(register(risk({ decision: 'fix-later' })), WAVES)[0], /names a wave/);
    assert.deepEqual(
      registerProblems(register(risk({ decision: 'fix-later', wave: WAVES.waves[0].title })), WAVES),
      [],
    );
    assert.match(registerProblems(register(risk({ decision: 'accept', status: 'accepted' })), WAVES)[0], /accepted_by/);
    assert.match(registerProblems(register(risk({ status: 'done' })), WAVES)[0], /done_in/);
    assert.match(registerProblems(register(risk({ decision: 'accept' })), WAVES).join('\n'), /closes the risk/);
  });

  test('two risks cannot share an id', () => {
    assert.match(registerProblems(register(risk(), risk()), WAVES).join('\n'), /used twice/);
  });
});

describe('what stops a release', () => {
  const options = (changed, date = '2026-10-20', version = '0.7.2') => ({ waves: WAVES, date, changed, version });
  const problems = (...a) => releaseProblems(...a).problems;
  const warnings = (...a) => releaseProblems(...a).warnings;

  test('an open fix-now risk', () => {
    assert.match(problems(register(risk()), options(unchanged))[0], /SEC-1: fix now, still open/);
  });

  test('a fix-later risk past the end of its wave, and not one before it', () => {
    const later = risk({ decision: 'fix-later', wave: WAVES.waves[0].title });
    assert.deepEqual(problems(register(later), options(unchanged, '2026-11-26')), []);
    assert.match(problems(register(later), options(unchanged, '2026-11-27'))[0], /due by 2026-11-26/);
  });

  test('a risk whose paths moved since it was reviewed warns, naming the files and the command that clears it', () => {
    const later = risk({ decision: 'fix-later', wave: WAVES.waves[0].title });
    assert.deepEqual(problems(register(later), options(moved)), []);
    const [warning] = warnings(register(later), options(moved));
    assert.match(warning, /SEC-1: stale.*editor-server\.ts/);
    assert.doesNotMatch(warning, /README/);
    assert.match(warning, /--reviewed SEC-1/);
    assert.match(warning, /stops the release from 2026-11-18/);
  });

  test(`a risk stale for more than ${STALE_DAYS} days stops the release`, () => {
    const later = risk({ decision: 'fix-later', wave: WAVES.waves[0].title });
    assert.deepEqual(problems(register(later), options(moved, '2026-11-18')), []);
    assert.match(
      problems(register(later), options(moved, '2026-11-19'))[0],
      /SEC-1: stale.*unlooked at since 2026-11-18/,
    );
  });

  test('a version that starts a new line since the full panel last looked, and not a patch', () => {
    const later = risk({ decision: 'fix-later', wave: WAVES.waves[0].title });
    assert.deepEqual(problems(register(later), options(unchanged, '2026-10-20', '0.7.9')), []);
    assert.match(
      problems(register(later), options(unchanged, '2026-10-20', '0.8.0'))[0],
      /0\.8\.0 starts a new line since 0\.7\.1.*--full-panel/,
    );
    assert.ok(newLine('1.0.0', '0.9.9') && !newLine('0.7.1', '0.7.0'));
  });

  test('a register with no record of a full panel is refused', () => {
    const { panel: _p, ...bare } = register(risk());
    assert.match(registerProblems(bare, WAVES)[0], /panel\.last_full/);
  });

  test('a reviewed commit the history does not hold', () => {
    assert.match(
      problems(
        register(risk({ decision: 'fix-later', wave: WAVES.waves[0].title })),
        options(() => null),
      )[0],
      /does not hold/,
    );
  });

  test('a done or accepted risk stops nothing, whatever moved', () => {
    const done = risk({ status: 'done', done_in: '#1' });
    const accepted = risk({
      id: 'SEC-2',
      decision: 'accept',
      status: 'accepted',
      accepted_by: 'Roger',
      accepted_reason: 'local only',
    });
    assert.deepEqual(problems(register(done, accepted), options(moved)), []);
  });
});

describe('what the panel looks at again', () => {
  test('globs: ** crosses folders, * stays in one', () => {
    assert.ok(globToRegExp('packages/**').test('packages/core/src/zoom.ts'));
    assert.ok(globToRegExp('.github/workflows/*.yml').test('.github/workflows/release.yml'));
    assert.ok(!globToRegExp('.github/*.yml').test('.github/workflows/release.yml'));
    assert.ok(underPaths('scripts/risk-register.mjs', ['test/**', 'scripts/*.mjs']));
  });

  test('the stale risks are the open ones whose paths moved', () => {
    const done = risk({ id: 'SEC-2', status: 'done', done_in: '#1' });
    assert.deepEqual(
      staleRisks(register(risk(), done), moved).map((s) => s.risk.id),
      ['SEC-1'],
    );
    assert.deepEqual(staleRisks(register(risk()), unchanged), []);
  });

  test('the roles touched since a ref are those with a risk, open or closed, in a changed path', () => {
    const ux = risk({ id: 'UX-1', role: 'UX lead', paths: ['styles.css'], status: 'done', done_in: '#2' });
    const roles = rolesTouched(register(risk(), ux), 'tag', () => ['styles.css']);
    assert.deepEqual([...roles.keys()], ['UX lead']);
  });
});

describe('security risks: the alerts they plan, and the rule that keeps them fixed', () => {
  const none = { has: () => false };
  const all = { has: () => true };

  test('a risk may name the security alerts it plans, each by its key, and a wrong key is refused', () => {
    for (const key of [
      'code-scanning/12',
      'dependabot/3',
      'secret-scanning/1',
      'npm/GHSA-abcd-1234-wxyz',
      'osv/PYSEC-2026-1',
    ])
      assert.match(key, ALERT_KEY, key);
    assert.deepEqual(registerProblems(register(risk({ alerts: ['code-scanning/12'] })), WAVES, none), []);
    assert.match(registerProblems(register(risk({ alerts: ['codeql 12'] })), WAVES, none).join('\n'), /alerts must be/);
    assert.match(
      registerProblems(register(risk({ alerts: 'code-scanning/12' })), WAVES, none).join('\n'),
      /alerts must be/,
    );
  });

  test('a security risk fixed from the day the rule began names the rule that stops it coming back', () => {
    const fixed = (over) => risk({ status: 'done', done_in: '#700', raised: RULE_FROM, ...over });
    assert.match(
      registerProblems(register(fixed()), WAVES, all).join('\n'),
      /names the rule that stops it coming back/,
    );
    assert.deepEqual(registerProblems(register(fixed({ prevented_by: ['test/x.test.js'] })), WAVES, all), []);
    // one fixed before the rule began, or outside security, is left as it was
    assert.deepEqual(registerProblems(register(fixed({ raised: '2026-10-19' })), WAVES, all), []);
    assert.deepEqual(registerProblems(register(fixed({ area: 'ux' })), WAVES, all), []);
  });

  test('the rule a risk names must be a file in the repository, so a deleted rule stops the release', () => {
    const fixed = risk({ status: 'done', done_in: '#700', raised: RULE_FROM, prevented_by: ['test/gone.test.js'] });
    assert.match(registerProblems(register(fixed), WAVES, none).join('\n'), /prevented_by names test\/gone\.test\.js/);
  });

  test('the page names the rule beside the pull request that fixed it', () => {
    const fixed = risk({ status: 'done', done_in: '#700', raised: RULE_FROM, prevented_by: ['test/x.test.js'] });
    assert.match(report(register(fixed)), /\| #700; kept out by `test\/x\.test\.js` \|/);
  });
});

describe('the committed register', () => {
  test('is well formed', () => {
    assert.deepEqual(registerProblems(readRegister()), []);
  });

  test(`${REPORT} is what the script writes from it`, () => {
    assert.equal(read(REPORT), report(readRegister()), `run: node scripts/risk-register.mjs --write-report`);
  });

  test('every open risk names at least one path that exists, or one under a folder that does', () => {
    for (const r of readRegister().risks.filter((x) => x.status === 'open'))
      for (const p of r.paths) {
        const top = p.split('/')[0].replace(/\*.*/, '');
        assert.doesNotThrow(
          () => execFileSync('git', ['ls-files', '--error-unmatch', top], { cwd: ROOT, stdio: 'pipe' }),
          `${r.id}: ${p}`,
        );
      }
  });

  test('the release and its dry run wait on the register, step for step', () => {
    for (const file of ['release.yml', 'release-check.yml'])
      assert.ok(
        runCommands(read(`.github/workflows/${file}`)).includes('node scripts/risk-register.mjs --release'),
        file,
      );
  });

  test('the script says how it is used, in plain words, and only reads unless asked to stamp or write', () => {
    const r = execFileSync(process.execPath, ['scripts/risk-register.mjs', '--check'], { cwd: ROOT, encoding: 'utf8' });
    assert.equal(r, '');
  });
});
