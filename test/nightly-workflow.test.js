// The nightly pre-release (spec §41, nightly_prerelease). Checked here:
// - What wakes the workflow.
// - It builds only when main moved, and publishes only after the full suite passes.
// - The one job that may write runs no code of the repository, only gh.
// - The version it carries.
// - The desktop app's installers, built by the Desktop app workflow at the same commit, signed only where keys are set.
// Read as text, by indentation, as policy.test.js reads the others.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { block, jobs, permissionValues, read, runCommands, stripComment, usesRefs } from './repository/repo.js';
import { NIGHTLY, nightlyVersion } from '../scripts/nightly-version.mjs';

const NIGHTLY_YML = '.github/workflows/nightly.yml';

/** Semantic versioning's order of two versions, -1, 0 or 1 (semver.org, rule 11), for the pre-releases a nightly has. */
function semverCompare(a, b) {
  const split = (v) => {
    const [core, pre] = v.split(/-(.*)/);
    return [core.split('.').map(Number), pre === undefined ? null : pre.split('.')];
  };
  const [ca, pa] = split(a);
  const [cb, pb] = split(b);
  for (let i = 0; i < 3; i++) if (ca[i] !== cb[i]) return ca[i] < cb[i] ? -1 : 1;
  if (!pa || !pb) return pa === pb ? 0 : pa ? -1 : 1;
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    if (pa[i] === undefined) return -1;
    if (pb[i] === undefined) return 1;
    if (pa[i] === pb[i]) continue;
    const na = /^\d+$/.test(pa[i]);
    const nb = /^\d+$/.test(pb[i]);
    if (na && nb) return Number(pa[i]) < Number(pb[i]) ? -1 : 1;
    if (na !== nb) return na ? -1 : 1;
    return pa[i] < pb[i] ? -1 : 1;
  }
  return 0;
}
const text = read(NIGHTLY_YML);
const lines = text.split('\n');
const given = (job) =>
  block(jobs(text)[job], 'permissions', 4)
    .slice(1)
    .map((l) => stripComment(l).trim())
    .filter(Boolean);

describe('the nightly workflow', () => {
  test('runs each night on a schedule and by hand, never on a pull request or a push', () => {
    const on = block(lines, 'on', 0).join('\n');
    assert.match(on, /schedule:\s*\n\s*- cron: '0 16 \* \* \*'/);
    assert.match(on, /workflow_dispatch:/);
    // wave-nightly.yml calls it when a wave ends (test/wave-nightly-workflow.test.js)
    assert.match(on, /workflow_call:/);
    assert.doesNotMatch(on, /pull_request|push:|workflow_run/);
  });

  test('reads only, but for the publish job and the draft check, which may write contents alone', () => {
    assert.deepEqual(permissionValues(block(lines, 'permissions', 0)), ['read']);
    assert.deepEqual(Object.keys(jobs(text)), ['check', 'security', 'build', 'desktop', 'publish', 'drafts']);
    assert.equal(block(jobs(text).check, 'permissions', 4), null);
    assert.equal(block(jobs(text).build, 'permissions', 4), null);
    assert.deepEqual(given('publish'), ['contents: write']);
  });

  test('builds only after no high or critical security alert is open, read by a job that installs nothing', () => {
    const security = jobs(text).security.join('\n');
    assert.deepEqual(given('security'), ['contents: read', 'security-events: read']);
    assert.deepEqual(runCommands(security), ['node scripts/security-alerts.mjs --nightly']);
    assert.match(jobs(text).build.join('\n'), /needs: \[check, security\]/);
  });

  test('builds only when main has moved since the last nightly, unless run by hand', () => {
    const check = jobs(text).check.join('\n');
    assert.match(check, /gh api "repos\/\$GITHUB_REPOSITORY\/commits\/main"/);
    assert.match(check, /isPrerelease and \(\.tagName \| test\("-nightly\\\\\."\)\)/);
    assert.match(check, /"\$GITHUB_EVENT_NAME" = "schedule"/);
    assert.match(jobs(text).build.join('\n'), /if: needs\.check\.outputs\.moved == 'true'/);
  });

  test('builds main, and publishes only after the full suite and the content check pass', () => {
    const build = jobs(text).build.join('\n');
    assert.match(build, /ref: main\s*\n\s*persist-credentials: false/);
    const runs = runCommands(build);
    const at = (re) => runs.findIndex((r) => re.test(r));
    assert.ok(at(/^npm ci$/) >= 0, 'npm ci');
    assert.ok(at(/^npm audit signatures$/) > at(/^npm ci$/), 'signatures after the install');
    assert.ok(at(/check-classification\.mjs --all/) > at(/^npm audit signatures$/), 'the content check');
    assert.ok(at(/^npm test$/) > at(/^npm audit signatures$/), 'the full suite');
    assert.ok(at(/^npm run build$/) > at(/^npm test$/), 'built after the suite passes');
    assert.equal(
      runs.some((r) => /\bnpm (install|i)\b/.test(r)),
      false,
      'never npm install',
    );
    // after the build, and only when it passed, whatever became of the installers
    assert.match(
      jobs(text).publish.join('\n'),
      /needs: \[build, desktop\]\n\s*if: \$\{\{ !cancelled\(\) && needs\.build\.result == 'success' \}\}\n/,
    );
  });

  // The whole suite at once, browser drawing included, peaked over the default 4 GB ceiling (22 Oct 2026). CI's shards
  // and fresh clone got 6 GB; the nightly and the release run the same suite, so they get the same.
  test('runs the full suite under the memory ceiling CI gives it, as the stable release does', () => {
    const ceiling = (job) => job.join('\n').match(/THOUGHTKNOT_TEST_MEMORY_MB: (\d+)/)?.[1];
    const ci = read('.github/workflows/ci.yml').match(/THOUGHTKNOT_TEST_MEMORY_MB: (\d+)/)[1];
    assert.equal(ceiling(jobs(text).build), ci, 'the nightly build');
    assert.equal(ceiling(jobs(read('.github/workflows/release.yml')).release), ci, 'the stable release');
  });

  test('carries the assets a release carries, with the nightly version in the manifest', () => {
    const build = runCommands(jobs(text).build.join('\n')).join('\n');
    assert.match(build, /node scripts\/nightly-version\.mjs --date "\$\(date -u \+%Y%m%d\)" --taken "\$taken" --write/);
    assert.match(build, /npm run build:layout/);
    assert.match(build, /git archive --format=tar\.gz -o "graph-spec-libraries-\$VERSION\.tar\.gz"/);
    const create = runCommands(jobs(text).publish.join('\n')).find((r) => /gh release create/.test(r));
    assert.ok(create, 'gh release create');
    for (const asset of ['main.js', 'manifest.json', 'styles.css', 'THIRD_PARTY_NOTICES.md', 'SHA256SUMS']) {
      assert.match(create, new RegExp(`\\b${asset.replace('.', '\\.')}\\b`), asset);
    }
    assert.match(create, /graph-spec-libraries-\$VERSION\.tar\.gz/);
  });

  test('publishes a pre-release on the built commit, and keeps the last seven nightlies', () => {
    const publish = jobs(text).publish.join('\n');
    const create = runCommands(publish).find((r) => /gh release create/.test(r));
    assert.match(create, /--prerelease/);
    assert.match(create, /--target "\$SHA"/);
    assert.doesNotMatch(create, /--draft|--latest\b/);
    assert.match(publish, /\.\[7:\]/);
    assert.match(publish, /gh release delete "\$old" .*--cleanup-tag --yes/);
  });

  test('checks the version and the commit it is handed before it uses them', () => {
    const publish = jobs(text).publish.join('\n');
    assert.match(
      publish,
      /\[\[ "\$VERSION" =~ \^\[0-9\]\+\\\.\[0-9\]\+\\\.\[0-9\]\+-nightly\\\.\[0-9\]\{8\}\(\\\.\[b-z\]\)\?\$ \]\]/,
    );
    assert.match(publish, /\[\[ "\$SHA" =~ \^\[0-9a-f\]\{40\}\$ \]\]/);
    assert.doesNotMatch(runCommands(publish).join('\n'), /\$\{\{/, 'no expression inside a command');
  });

  // Roger, 22 Oct 2026. A second run on the same day used to delete the first's release and make it again. Its name
  // stayed the same, so BRAT never saw an update. Now the build is handed every nightly tag, and takes a new name.
  test('gives a second build the same day a name of its own, and never replaces a nightly already published', () => {
    const build = runCommands(jobs(text).build.join('\n')).join('\n');
    assert.match(build, /taken=\$\(gh release list --repo "\$GITHUB_REPOSITORY" .*-nightly/);
    const publish = runCommands(jobs(text).publish.join('\n')).join('\n');
    assert.doesNotMatch(publish, /gh release delete "\$VERSION"/);
  });

  test('runs no code of the repository in the job that writes: no checkout, no install, no Node', () => {
    const publish = jobs(text).publish.join('\n');
    assert.deepEqual([...new Set(usesRefs(publish).map((r) => r.split('@')[0]))], ['actions/download-artifact']);
    const runs = jobs(text).publish.map(stripComment).join('\n');
    assert.doesNotMatch(runs, /\b(node|npm|npx)\b|scripts\/|actions\/checkout|\.\/\S+\.sh/);
  });

  // Roger, 23 Oct 2026: releases stay private for now, as nightlies, unsigned where there is no signature.
  test('builds the app’s installers by the Desktop app workflow, at the built commit, reading only', () => {
    const desktop = jobs(text).desktop.join('\n');
    assert.match(desktop, /^ {4}needs: build$/m);
    assert.match(desktop, /^ {4}uses: \.\/\.github\/workflows\/desktop-app\.yml$/m);
    assert.match(desktop, /^ {6}ref: \$\{\{ needs\.build\.outputs\.sha \}\}$/m);
    assert.deepEqual(given('desktop'), ['contents: read']);
    const called = read('.github/workflows/desktop-app.yml');
    assert.match(block(called.split('\n'), 'on', 0).join('\n'), /workflow_call:\s*\n\s*inputs:\s*\n\s*ref:/);
    assert.match(jobs(called).build.join('\n'), /ref: \$\{\{ inputs\.ref \}\}/);
  });

  test('hands the app build only its signing keys, each under its own name, never all of them', () => {
    const desktop = jobs(text).desktop.join('\n');
    assert.doesNotMatch(desktop, /secrets: inherit/);
    const named = [...desktop.matchAll(/^ {6}([A-Z_]+): \$\{\{ secrets\.([A-Z_]+) \}\}$/gm)];
    for (const [, a, b] of named) assert.equal(a, b, 'each key under its own name');
    const declared = block(read('.github/workflows/desktop-app.yml').split('\n'), 'on', 0)
      .join('\n')
      .split(/\n {4}secrets:\n/)[1]
      .match(/^ {6}([A-Z_]+):$/gm)
      .map((l) => l.trim().slice(0, -1));
    assert.deepEqual(named.map(([, a]) => a).sort(), declared.sort());
    assert.ok(named.length >= 8, `${named.length} keys`);
  });

  test('carries the installers, named by the nightly, in its checksums; a night they fail still publishes the plugin', () => {
    const publish = jobs(text).publish.join('\n');
    assert.match(publish, /^ {4}needs: \[build, desktop\]$/m);
    assert.match(publish, /^ {4}if: \$\{\{ !cancelled\(\) && needs\.build\.result == 'success' \}\}$/m);
    assert.match(publish, /pattern: thoughtknot-app-\*/);
    const runs = runCommands(publish).join('\n');
    assert.match(runs, /mv "\$f" "nightly\/thoughtknot-app-\$VERSION-\$rest"/);
    // an artifact may keep its bundle folder, so each file is found at any depth, never a folder by a glob
    assert.match(runs, /find app -type f -print0/);
    assert.doesNotMatch(runs, /for f in app\//);
    assert.match(runs, /sha256sum thoughtknot-app-\* >> SHA256SUMS/);
    const create = runCommands(publish).find((r) => /gh release create/.test(r));
    assert.match(create, /"\$\{installers\[@\]\}" SHA256SUMS/);
    // the notes speak of installers only on a night that carries them
    assert.match(
      runs,
      /if \(\( \$\{#installers\[@\]\} \)\); then app=" The desktop app's installers .*signed only where signing keys are set/,
    );
    assert.match(create, /latest stable release\.\$app"/);
  });

  // Risk OPS-3: a draft release tells no one it waits. GitHub lists drafts only to a token that may write contents.
  test('fails, so its owner hears, while a stable release has waited as a draft for more than a day', () => {
    const drafts = jobs(text).drafts;
    assert.deepEqual(given('drafts'), ['contents: write']);
    assert.equal(block(drafts, 'needs', 4), null, 'it runs every night, whether or not main moved');
    assert.deepEqual(usesRefs(drafts.join('\n')), [], 'no action, no checkout');
    const runs = runCommands(drafts.join('\n')).join('\n');
    assert.doesNotMatch(runs, /\b(node|npm|npx)\b|scripts\//, 'no code of the repository');
    assert.match(runs, /gh release list --repo "\$GITHUB_REPOSITORY" .*isDraft.*createdAt/);
    assert.match(runs, /select\(\.isDraft and \(\.createdAt \| fromdateiso8601\) < now - 86400\)/);
    assert.match(runs, /::error::.*exit 1/s);
  });

  test('never matches the bare version tag the stable release is made from', () => {
    const rel = block(read('.github/workflows/release.yml').split('\n'), 'on', 0).join('\n');
    assert.match(rel, /- '\[0-9\]\+\.\[0-9\]\+\.\[0-9\]\+'/);
    const bare = /^[0-9]+\.[0-9]+\.[0-9]+$/;
    assert.equal(bare.test(nightlyVersion('0.6.0', '20261018')), false);
  });
});

describe('the nightly version', () => {
  test('is the next patch after the release, with the nightly suffix and the day', () => {
    assert.equal(nightlyVersion('0.6.0', '20261018'), '0.6.1-nightly.20261018');
    assert.equal(nightlyVersion('1.9.9', '20270101'), '1.9.10-nightly.20270101');
    assert.match(nightlyVersion('0.6.0', '20261018'), NIGHTLY);
  });

  test('takes the next letter, .b to .z, when the day already has a nightly, and is refused past .z', () => {
    const plain = '0.7.2-nightly.20261022';
    assert.equal(nightlyVersion('0.7.1', '20261022', ['0.7.2-nightly.20261021']), plain);
    assert.equal(nightlyVersion('0.7.1', '20261022', [plain]), `${plain}.b`);
    assert.equal(nightlyVersion('0.7.1', '20261022', [plain, `${plain}.b`]), `${plain}.c`);
    assert.match(`${plain}.b`, NIGHTLY);
    assert.doesNotMatch(`${plain}.a`, NIGHTLY);
    assert.doesNotMatch(`${plain}b`, NIGHTLY);
    const all = [plain, ...[...'bcdefghijklmnopqrstuvwxyz'].map((l) => `${plain}.${l}`)];
    assert.throws(() => nightlyVersion('0.7.1', '20261022', all), /every nightly of 20261022 is taken/);
  });

  // BRAT orders versions by semantic versioning (semver's compare). A letter joined to the day, as 20261022b, is a word
  // and so goes after every number, the next day's 20261023 included. As its own part, it sorts in time.
  test('sorts each lettered build after the one before it and before the next day, as BRAT and semver order them', () => {
    const order = [
      '0.7.2-nightly.20261022',
      '0.7.2-nightly.20261022.b',
      '0.7.2-nightly.20261022.c',
      '0.7.2-nightly.20261022.z',
      '0.7.2-nightly.20261023',
      '0.7.2',
    ];
    for (let i = 1; i < order.length; i++) assert.equal(semverCompare(order[i - 1], order[i]), -1, order[i]);
    assert.equal(semverCompare('0.7.2-nightly.20261022b', '0.7.2-nightly.20261023'), 1, 'the joined letter goes last');
  });

  test('is refused for a version that is not a release, or a day not written YYYYMMDD', () => {
    assert.throws(() => nightlyVersion('0.6.1-nightly.20261018', '20261019'), /not a release version/);
    assert.throws(() => nightlyVersion('v0.6.0', '20261018'), /not a release version/);
    assert.throws(() => nightlyVersion('0.6.0', '2026-10-18'), /YYYYMMDD/);
    assert.throws(() => nightlyVersion('0.6.0', undefined), /YYYYMMDD/);
  });
});
