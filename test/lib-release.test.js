// Each release publishes the JavaScript library as a GitHub release, with a changelog, and never to npm
// (spec §41, lib_github_release; Q-02):
// - The release and the nightly build two packages, the reader, checker and layout (graph-spec) and the core, and
//   attach them with their checksums.
// - The two install from their files alone, with no registry. A program then reads a note with the core, its types
//   check, and the checker answers.
// - The release notes carry a changelog: the pull requests merged since the last release, and what changed in the
//   library's interface.
// - No workflow publishes to npm, and every package stays private.
// Proved on the workflows, on packages built for the test and on small repositories with tags.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { buildLibrary, PACKAGES, assetName, releaseUrl } from '../scripts/library-release.mjs';
import { changelogText, pullRequests } from '../scripts/changelog.mjs';
import { read, readJSON, jsPackages, workflowFiles } from './repository/repo.js';
import { repository } from './repository/scratch-repository.js';

const NPM = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const NOTE = "// graph: g\n(tea:Drink {name: 'Tea'}),\n(me:Person {name: 'Me'}),\n(tea)-[:WARMS]->(me)";

describe('the release and the nightly attach the library', () => {
  for (const workflow of ['.github/workflows/release.yml', '.github/workflows/nightly.yml']) {
    test(`${workflow} builds both packages, checksums them and attaches them`, () => {
      const text = read(workflow);
      const build = text.indexOf('node scripts/library-release.mjs');
      assert.ok(build > 0, 'it builds the library packages');
      const sums = text.split('\n').find((line) => line.includes('sha256sum'));
      const create = text.split('\n').find((line) => line.includes('gh release create'));
      for (const name of PACKAGES.map((pkg) => pkg.asset)) {
        assert.ok(sums.includes(name), `${name} is in SHA256SUMS`);
        assert.ok(create.includes(name), `${name} is attached to the release`);
      }
      assert.ok(build < text.indexOf('gh release create'), 'built before the release is made');
    });
  }

  test('the stable release carries the changelog in its notes', () => {
    const text = read('.github/workflows/release.yml');
    assert.match(text, /node scripts\/changelog\.mjs[^\n]*--out release-notes\.md/);
    const create = text.split('\n').find((line) => line.includes('gh release create'));
    assert.ok(create.includes('--notes-file release-notes.md'), 'the notes are the changelog');
  });

  test('a package asset is named for its version, and the core finds graph-spec in the same release', () => {
    assert.equal(assetName('core', '0.8.0'), 'thoughtknot-core-0.8.0.tgz');
    assert.equal(
      releaseUrl('rogerbucks/thoughtknot', '0.8.0', 'graph-spec'),
      'https://github.com/rogerbucks/thoughtknot/releases/download/0.8.0/thoughtknot-graph-spec-0.8.0.tgz',
    );
  });
});

describe('never to npm', () => {
  test('no workflow publishes a package or names a registry', () => {
    for (const file of workflowFiles()) {
      const text = read(file);
      assert.doesNotMatch(text, /npm publish|yarn publish|pnpm publish/, `${file} publishes to a registry`);
      assert.doesNotMatch(text, /registry-url|NPM_TOKEN|NODE_AUTH_TOKEN/, `${file} names a registry`);
    }
  });

  test('every package of the repository is private, so npm refuses to publish it', () => {
    assert.equal(readJSON('package.json').private, true);
    for (const pkg of jsPackages()) assert.equal(readJSON(`${pkg}/package.json`).private, true, pkg);
  });
});

describe('the two packages, built and installed from their files', () => {
  let dir;
  let built;
  before(async () => {
    dir = mkdtempSync(join(tmpdir(), 'lib-release-'));
    built = await buildLibrary({ out: join(dir, 'assets'), version: '0.9.0', graphSpecSource: 'local' });
  });
  after(() => rmSync(dir, { recursive: true, force: true }));

  test('each package is private, at the version given, and carries the licence and notices', () => {
    for (const { name, file } of built) {
      const listed = execFileSync('tar', ['-tzf', file], { encoding: 'utf8' });
      for (const want of ['package/package.json', 'package/LICENSE', 'package/THIRD_PARTY_NOTICES.md'])
        assert.ok(listed.includes(want), `${name} has ${want}`);
      const manifest = JSON.parse(execFileSync('tar', ['-xOzf', file, 'package/package.json'], { encoding: 'utf8' }));
      assert.equal(manifest.version, '0.9.0');
      assert.equal(manifest.private, true, `${name} can never be published`);
      assert.equal(manifest.scripts, undefined, `${name} runs nothing when installed`);
    }
  });

  test('they install with no registry, and a program reads a note with the core and checks it with graph-spec', () => {
    const app = join(dir, 'app');
    mkdirSync(app);
    writeFileSync(join(app, 'package.json'), JSON.stringify({ name: 'app', private: true, type: 'module' }));
    execFileSync(
      NPM,
      ['install', '--offline', '--no-audit', '--no-fund', '--ignore-scripts', ...built.map(({ file }) => file)],
      { cwd: app, stdio: 'pipe' },
    );
    const program = (typed) =>
      [
        "import { readNote, History, layoutSource } from '@thoughtknot/core';",
        "import spec from '@thoughtknot/graph-spec';",
        `const reading = readNote([${JSON.stringify(NOTE)}]);`,
        `const history${typed ? ': History' : ''} = new History();`,
        "history.record('a', 'b');",
        "const drawing = reading.graphs.get('g');",
        "if (!drawing) throw new Error('no drawing');",
        "const checks = spec.check(reading.world, 'g');",
        'console.log(JSON.stringify({',
        '  graphs: reading.graphs.size,',
        '  undo: history.canUndo(),',
        '  checked: checks.length > 0,',
        "  layout: layoutSource(drawing, 'LR').source.startsWith('digraph'),",
        '}));',
      ].join('\n');
    writeFileSync(join(app, 'use.ts'), program(true));
    const tsc = createRequire(import.meta.url).resolve('typescript/bin/tsc');
    execFileSync(
      process.execPath,
      [tsc, '--noEmit', '--strict', '--module', 'nodenext', '--target', 'es2022', 'use.ts'],
      {
        cwd: app,
        stdio: 'pipe',
      },
    );
    writeFileSync(join(app, 'use.mjs'), program(false));
    const said = JSON.parse(execFileSync(process.execPath, ['use.mjs'], { cwd: app, encoding: 'utf8' }));
    assert.deepEqual(said, { graphs: 1, undo: true, checked: true, layout: true });
  });
});

describe('the changelog', () => {
  test('lists the pull requests merged since the last release, by number and title', () => {
    const repo = repository([{ a: '1' }]);
    try {
      repo.git('tag', '0.7.0');
      const merge = (branch, file, title, number) => {
        repo.git('checkout', '-q', '-b', branch);
        repo.commit({ [file]: branch }, `work on ${branch}`);
        repo.git('checkout', '-q', 'main');
        repo.git(
          'merge',
          '-q',
          '--no-ff',
          branch,
          '-m',
          `Merge pull request #${number} from someone/${branch}`,
          '-m',
          title,
        );
      };
      merge('one', 'b', 'Draw the graph faster', 12);
      merge('two', 'c', 'Fix the export of an empty note', 13);
      assert.deepEqual(pullRequests(repo.dir, '0.7.0'), [
        { number: 12, title: 'Draw the graph faster' },
        { number: 13, title: 'Fix the export of an empty note' },
      ]);
    } finally {
      repo.done();
    }
  });

  test('says what the library added and broke, and when there is nothing to compare with', () => {
    const at = (lines) => ({ '@thoughtknot/core': { version: '0.7.0', entries: { '.': lines } } });
    const text = changelogText({
      version: '0.8.0',
      from: '0.7.0',
      pulls: [{ number: 12, title: 'Draw the graph faster' }],
      repo: 'rogerbucks/thoughtknot',
      before: at({ draw: ['value: () => void'], old: ['value: () => void'] }),
      after: at({ draw: ['value: (x: number) => void'], fresh: ['value: () => void'] }),
    });
    assert.match(text, /^## 0\.8\.0/m);
    assert.match(text, /\[#12\]\(https:\/\/github\.com\/rogerbucks\/thoughtknot\/pull\/12\) Draw the graph faster/);
    assert.match(text, /Added.*`fresh`/s);
    assert.match(text, /Changed or removed.*`draw`.*`old`/s);
    const first = changelogText({
      version: '0.8.0',
      from: '0.7.0',
      pulls: [],
      repo: 'r/r',
      before: null,
      after: at({}),
    });
    assert.match(first, /first release with a declared interface/i);
    assert.match(first, /No pull requests/);
  });

  test('the real repository gives a changelog since its last release', () => {
    const out = join(mkdtempSync(join(tmpdir(), 'changelog-')), 'notes.md');
    execFileSync(process.execPath, ['scripts/changelog.mjs', '--out', out], { stdio: 'pipe' });
    assert.match(readFileSync(out, 'utf8'), /^## /m);
  });
});

// The version promise, told to users (spec §41, version_promise_told). Before 1.0.0, 0.7 to 0.8 may break the
// interface. So every release's notes say what changed, and the README and the wiki say the rule.
describe('the version rule is told to the people who use the library', () => {
  const RULE = /before 1\.0\.0/i;
  test('the changelog has a Library changes section that states the rule', () => {
    const text = changelogText({ version: '0.8.0', from: '0.7.0', pulls: [], repo: 'o/r', before: null, after: {} });
    assert.match(text, /^### Library changes$/m);
    assert.match(text.slice(text.indexOf('### Library changes')), RULE);
  });
  test('--check refuses release notes without the section, and passes notes with it', () => {
    const dir = mkdtempSync(join(tmpdir(), 'notes-'));
    try {
      const run = (body) => {
        writeFileSync(join(dir, 'notes.md'), body);
        try {
          execFileSync(process.execPath, ['scripts/changelog.mjs', '--check', join(dir, 'notes.md')], {
            stdio: 'pipe',
          });
          return 0;
        } catch (error) {
          return error.status;
        }
      };
      assert.equal(run('## 0.8.0\n\n### Pull requests\n'), 1);
      assert.equal(run('## 0.8.0\n\n### Library changes\n\nNothing.\n'), 0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
  test('the release checks its notes before it drafts, and the release check tries it first', () => {
    const release = read('.github/workflows/release.yml');
    const check = release.indexOf('node scripts/changelog.mjs --check release-notes.md');
    assert.ok(check !== -1, 'release.yml checks its notes');
    assert.ok(check < release.indexOf('gh release create'), 'before it drafts the release');
    assert.match(read('.github/workflows/release-check.yml'), /node scripts\/changelog\.mjs --check release-notes\.md/);
  });
  test('the README and the For developers page state the rule', () => {
    for (const file of ['README.md', 'wiki/For-developers.md']) {
      assert.match(read(file), /^## Versions$/m, file);
      assert.match(read(file), RULE, file);
    }
  });
});
