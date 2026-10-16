// The repository policy: plugin-store files, supply-chain pins, least-privilege
// CI, and what the shipped source may and may not do. Spec §13, Delivery.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { statSync } from 'node:fs';
import {
  exists,
  read,
  readJSON,
  path,
  notIgnored,
  jsPackages,
  sourceFiles,
  workflowFiles,
  block,
  permissionValues,
  jobs,
  usesRefs,
  runCommands,
  stripComment,
  findsNetwork,
  findsHotkeys,
  forbiddenImports,
  reachesSendModule,
  findsBackground,
} from './repository/repo.js';

const SEMVER = /^\d+\.\d+\.\d+$/;
const EXACT = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;
const RUNTIME_ALLOWED = new Set(['@viz-js/viz']);
// The one addition spec §13 allows, for the browser host alone (§26, cc_one_renderer): a Markdown renderer.
const MARKDOWN_RENDERER = 'marked';
// The one place that may reach the network: sending to an AI the user has set
// up, only when the user sends (spec §13 and §19). Only the send dialog reaches it.
const AI_SEND_MODULE = 'packages/obsidian/src/ai/send.ts';
const AI_SEND_DIALOG = 'packages/obsidian/src/ai/send-dialog.ts';
const TEST_FRAMEWORKS = ['jest', 'mocha', 'vitest', 'ava', 'tap', 'jasmine', 'uvu', 'chai'];

const allDeps = (pkg) => ({
  ...pkg.dependencies,
  ...pkg.devDependencies,
  ...pkg.optionalDependencies,
  ...pkg.peerDependencies,
});

describe('the plugin-store files', () => {
  test('manifest.json carries every field the store requires', () => {
    const m = readJSON('manifest.json');
    assert.equal(m.id, 'graph-note');
    assert.match(m.version, SEMVER);
    assert.match(m.minAppVersion, SEMVER);
    for (const key of ['name', 'description', 'author']) {
      assert.equal(typeof m[key], 'string', `${key} is a string`);
      assert.ok(m[key].trim(), `${key} is not empty`);
    }
    assert.equal(m.isDesktopOnly, false, 'the plugin runs on mobile');
  });

  test('the manifest id and name follow the store rules', () => {
    const { id, name } = readJSON('manifest.json');
    assert.match(id, /^[a-z]+(-[a-z]+)*$/, 'id is lowercase letters and hyphens');
    assert.doesNotMatch(id, /obsidian|plugin$/i);
    assert.doesNotMatch(name, /obsidian|plugin|theme/i, 'name avoids Obsidian, Plugin and Theme');
    assert.match(name, /^[A-Za-z0-9 ()+-]+$/, 'name is Basic Latin with no other punctuation');
  });

  test('the manifest description follows the store rules', () => {
    const { description } = readJSON('manifest.json');
    assert.ok(description.length <= 250, 'at most 250 characters');
    assert.match(description, /\.$/, 'ends with a full stop');
    assert.doesNotMatch(description, /^this is a plugin/i);
    assert.doesNotMatch(description, /\p{Extended_Pictographic}/u, 'no emoji');
  });

  test('versions.json maps the current version to its minimum app version', () => {
    const { version, minAppVersion } = readJSON('manifest.json');
    assert.equal(readJSON('versions.json')[version], minAppVersion);
  });

  test('every package carries the manifest version', () => {
    const { version } = readJSON('manifest.json');
    for (const p of jsPackages()) assert.equal(readJSON(`${p}/package.json`).version, version, p);
  });

  // found on the 0.2.0 bump: a sibling asked for at the old version is looked for on the npm registry, and npm ci fails
  test('each package asks for its siblings at their own version, in the package and in the lockfile', () => {
    const own = new Map(jsPackages().map((p) => [readJSON(`${p}/package.json`).name, readJSON(`${p}/package.json`)]));
    const lock = readJSON('package-lock.json').packages;
    for (const p of jsPackages()) {
      const { name } = readJSON(`${p}/package.json`);
      for (const deps of [readJSON(`${p}/package.json`), lock[p]])
        for (const [dep, wanted] of Object.entries({ ...deps?.dependencies, ...deps?.devDependencies }))
          if (own.has(dep)) assert.equal(wanted, own.get(dep).version, `${name} asks for ${dep}`);
    }
  });

  test('README.md, LICENSE and styles.css are present', () => {
    for (const f of ['README.md', 'LICENSE', 'styles.css']) {
      assert.ok(exists(f), `${f} exists`);
      assert.ok(read(f).trim(), `${f} is not empty`);
    }
  });

  test('main.js is never committed, as only CI builds it', () => {
    assert.equal(notIgnored('main.js'), false);
  });

  test('the build bundles the plugin with obsidian left external', () => {
    const cfg = read('packages/obsidian/esbuild.config.mjs');
    assert.match(cfg, /entryPoints:\s*\[[^\]]*src\/main\.ts/);
    assert.match(cfg, /external:\s*\[[^\]]*['"]obsidian['"]/);
    assert.ok(exists('packages/obsidian/src/main.ts'));
  });
});

describe('the supply chain', () => {
  test('every dependency of every package is pinned to an exact version', () => {
    for (const p of jsPackages()) {
      const pkg = readJSON(`${p}/package.json`);
      for (const [name, spec] of Object.entries(allDeps(pkg))) {
        assert.match(spec, EXACT, `${p}: ${name}@${spec} is not exact`);
      }
    }
  });

  test('every override is pinned to an exact version or to a direct dependency', () => {
    const walk = (o, at) =>
      Object.entries(o ?? {}).flatMap(([k, v]) =>
        typeof v === 'object' ? walk(v, `${at}${k} > `) : [[`${at}${k}`, v]],
      );
    for (const [name, spec] of walk(readJSON('package.json').overrides, '')) {
      assert.match(spec, /^(\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?|\$[\w@/.-]+)$/, `override ${name}@${spec} is not exact`);
    }
  });

  test('a security fix the pins hold back is forced, so no known advisory stays in the tree', () => {
    const lock = readJSON('package-lock.json').packages;
    const moments = Object.entries(lock)
      .filter(([k]) => k.endsWith('node_modules/moment'))
      .map(([, v]) => v.version);
    assert.ok(moments.length, 'moment is in the tree, through the obsidian types');
    for (const v of moments)
      assert.ok(
        v.localeCompare('2.31.0', undefined, { numeric: true }) >= 0,
        `moment ${v} carries GHSA-4p3w-j4w9-5jqw`,
      );
  });

  test('the only runtime dependencies are the Graphviz WebAssembly engine and, for the browser host alone, one Markdown renderer', () => {
    const workspaceNames = new Set(jsPackages().map((p) => readJSON(`${p}/package.json`).name));
    for (const p of jsPackages()) {
      const deps = Object.keys(readJSON(`${p}/package.json`).dependencies ?? {});
      const other = deps.filter((d) => !RUNTIME_ALLOWED.has(d) && !workspaceNames.has(d));
      assert.deepEqual(
        other,
        p === 'packages/claude-code' ? [MARKDOWN_RENDERER] : [],
        `${p} has runtime dependencies beyond the allowed`,
      );
    }
  });

  test('the lockfile is committed and records every dependency', () => {
    assert.ok(exists('package-lock.json'));
    assert.ok(notIgnored('package-lock.json'), 'package-lock.json is not git-ignored');
    const lock = readJSON('package-lock.json');
    assert.ok(lock.lockfileVersion >= 3);
    for (const p of jsPackages()) {
      const recorded = lock.packages[p === '.' ? '' : p];
      assert.ok(recorded, `${p} is in the lockfile`);
      assert.deepEqual(recorded.dependencies ?? {}, readJSON(`${p}/package.json`).dependencies ?? {}, p);
      assert.deepEqual(recorded.devDependencies ?? {}, readJSON(`${p}/package.json`).devDependencies ?? {}, p);
    }
  });

  test('.npmrc stops install scripts and saves exact versions', () => {
    const settings = Object.fromEntries(
      read('.npmrc')
        .split('\n')
        .filter((l) => l.includes('='))
        .map((l) => l.split('=').map((s) => s.trim())),
    );
    assert.equal(settings['ignore-scripts'], 'true');
    assert.equal(settings['save-exact'], 'true');
  });

  test('tests run on the runner built into Node, with no test framework', () => {
    for (const p of jsPackages()) {
      const names = Object.keys(allDeps(readJSON(`${p}/package.json`)));
      assert.deepEqual(
        names.filter((n) => TEST_FRAMEWORKS.includes(n)),
        [],
        p,
      );
    }
    assert.match(readJSON('package.json').scripts.test, /(^| )node --test\b/);
  });

  test('a Python package is pinned by a hashed lockfile', () => {
    const pyprojects = ['python/graph_spec/pyproject.toml', 'pyproject.toml'].filter(exists);
    for (const p of pyprojects) {
      const dir = p.replace(/\/?pyproject\.toml$/, '') || '.';
      const lock = `${dir === '.' ? '' : `${dir}/`}uv.lock`;
      assert.ok(exists(lock), `${lock} exists`);
      assert.ok(notIgnored(lock), `${lock} is committed`);
      const packages = read(lock).split('[[package]]').slice(1);
      for (const entry of packages) {
        if (/source = \{ (editable|virtual) =/.test(entry)) continue;
        assert.match(entry, /hash = "sha256:[0-9a-f]{64}"/, `every locked package has a hash:\n${entry.slice(0, 120)}`);
      }
    }
  });
});

describe('GitHub Actions', () => {
  test('there is a CI workflow and a release workflow', () => {
    assert.ok(exists('.github/workflows/ci.yml'));
    assert.ok(exists('.github/workflows/release.yml'));
  });

  test('every action is pinned to a full commit hash, its version in a comment', () => {
    for (const f of workflowFiles()) {
      const text = read(f);
      for (const ref of usesRefs(text)) {
        if (ref.startsWith('./')) continue;
        assert.match(ref, /^[\w.-]+\/[\w./-]+@[0-9a-f]{40}$/, `${f}: ${ref}`);
        const line = text.split('\n').find((l) => l.includes(ref));
        assert.match(line, /#\s*v\d+(\.\d+){0,2}\s*$/, `${f}: ${ref} names its version`);
      }
    }
  });

  test('every workflow defaults to read-only permissions', () => {
    for (const f of workflowFiles()) {
      const perms = block(read(f).split('\n'), 'permissions', 0);
      assert.ok(perms, `${f} sets top-level permissions`);
      const values = permissionValues(perms);
      assert.ok(values.length, `${f} names its permissions`);
      for (const v of values) assert.ok(['read', 'none', '{}'].includes(v), `${f}: top-level ${v}`);
    }
  });

  test('only four jobs may write: the release, the lock, the build status comment and the mirror’s issues', () => {
    for (const f of workflowFiles()) {
      for (const [name, lines] of Object.entries(jobs(read(f)))) {
        const perms = block(lines, 'permissions', 4);
        if (!perms) continue;
        const writes = permissionValues(perms).some((v) => /write/.test(v));
        if (!writes) continue;
        // the three other writers may touch nothing else: one locks pull request conversations, one leaves the build
        // status comment on a pull request, with read access to what it reads (test/build-status-workflow.test.js)
        const given = perms
          .slice(1)
          .map((l) => stripComment(l).trim())
          .filter(Boolean);
        const release = f.endsWith('release.yml') && name === 'release';
        const lock = f.endsWith('lock-conversations.yml') && name === 'lock' && given.join() === 'pull-requests: write';
        const comment =
          f.endsWith('/build-status.yml') &&
          name === 'update' &&
          given.filter((l) => /write/.test(l)).join() === 'pull-requests: write';
        // and one mirrors the requirements into their issues on a push to main (test/github-project-workflow.test.js)
        const mirror =
          f.endsWith('/project-mirror.yml') &&
          name === 'mirror' &&
          [...given].sort().join() === 'contents: read,issues: write';
        assert.ok(release || lock || comment || mirror, `${f}: job ${name} writes`);
      }
      assert.doesNotMatch(read(f), /write-all/, f);
    }
  });

  test('no workflow runs on pull_request_target', () => {
    for (const f of workflowFiles()) assert.doesNotMatch(read(f), /pull_request_target/, f);
  });

  test('checkouts never keep the token', () => {
    for (const f of workflowFiles()) {
      const text = read(f);
      const checkouts = text.split('\n').filter((l) => /uses:\s*actions\/checkout@/.test(l)).length;
      const kept = (text.match(/persist-credentials:\s*false/g) ?? []).length;
      assert.equal(kept, checkouts, `${f}: every checkout sets persist-credentials: false`);
    }
  });

  for (const f of ['.github/workflows/ci.yml', '.github/workflows/release.yml']) {
    test(`${f} installs with npm ci and verifies signatures before it builds`, () => {
      const runs = runCommands(read(f));
      const at = (re) => runs.findIndex((r) => re.test(r));
      const ci = at(/^npm ci\b/),
        sig = at(/^npm audit signatures\b/),
        build = at(/^npm run build\b/);
      assert.ok(ci >= 0, 'npm ci');
      assert.ok(sig > ci, 'npm audit signatures after npm ci');
      assert.ok(build > sig, 'build after the signatures are verified');
      assert.equal(
        runs.some((r) => /\bnpm (install|i)\b/.test(r)),
        false,
        'never npm install',
      );
    });

    test(`${f} runs the content check over every file`, () => {
      assert.ok(runCommands(read(f)).some((r) => /node scripts\/check-classification\.mjs --all/.test(r)));
    });
  }

  test('CI runs on every pull request, so security fixes run the full suite', () => {
    const ci = read('.github/workflows/ci.yml');
    assert.match(block(ci.split('\n'), 'on', 0).join('\n'), /pull_request:/);
    const runs = runCommands(ci);
    for (const re of [/^npm test\b/, /^npm run typecheck\b/, /^npm run build\b/]) {
      assert.ok(
        runs.some((r) => re.test(r)),
        String(re),
      );
    }
  });

  test('CI runs the Python library tests from its locked environment', () => {
    if (!exists('python/graph_spec/pyproject.toml')) return;
    const ci = read('.github/workflows/ci.yml');
    assert.ok('python' in jobs(ci), 'ci.yml has a python job');
    const runs = jobs(ci).python.join('\n');
    assert.match(runs, /uv sync --locked/, 'installs exactly what the lockfile pins');
    assert.match(runs, /uv run --locked python -m unittest discover -s tests/, 'runs the tests');
    assert.match(runs, /working-directory: python\/graph_spec/);
  });

  test('CI lints with the Obsidian review rules', () => {
    const ci = read('.github/workflows/ci.yml');
    assert.ok('lint' in jobs(ci), 'ci.yml has a lint job');
    assert.ok(jobs(ci).lint.some((l) => /run:\s*npm run lint/.test(l)));
    assert.match(readJSON('package.json').scripts.lint, /^eslint\b/);
    assert.match(read('eslint.config.mjs'), /from ['"]eslint-plugin-obsidianmd['"]/);
    assert.match(read('eslint.config.mjs'), /obsidianmd\.configs\.recommended/);
  });

  test('releases carry the graph-spec libraries as one attested archive, for the vault to vendor', () => {
    const rel = read('.github/workflows/release.yml');
    const runs = runCommands(rel).join('\n');
    const archive = /git archive [^\n]*-o "?(graph-spec-libraries-\$GITHUB_REF_NAME\.tar\.gz)"?[^\n]*/.exec(runs);
    assert.ok(archive, 'the archive is made by git archive, from the tagged commit');
    for (const part of [
      'LICENSE',
      'packages/graph-spec/src',
      'packages/graph-spec/bin',
      'python/graph_spec/src',
      'python/graph_spec/pyproject.toml',
      'python/graph_spec/uv.lock',
    ]) {
      assert.ok(archive[0].includes(part), `the archive holds ${part}`);
    }
    // the core's layout source, bundled into one file, for the vault's layout parity check (spec §12)
    assert.match(
      archive[0],
      /--prefix=packages\/core\/dist\/ --add-file=packages\/core\/dist\/layout-source-node\.cjs --prefix= /,
      'the archive holds the bundled layout source',
    );
    const built = runCommands(rel).findIndex((r) => /npm run build:layout/.test(r));
    assert.ok(
      built >= 0 && built < runCommands(rel).findIndex((r) => /git archive/.test(r)),
      'the layout source is bundled before the archive is made',
    );
    const attest = rel.slice(rel.indexOf('actions/attest-build-provenance'));
    assert.match(attest, /graph-spec-libraries-\*\.tar\.gz/, 'the archive has a provenance attestation');
    assert.match(
      runCommands(rel).find((r) => /gh release create/.test(r)),
      /graph-spec-libraries-\$GITHUB_REF_NAME\.tar\.gz/,
      'the archive is attached to the release',
    );
  });

  test('provenance is attested once the repository is public; until then every asset carries a SHA-256', () => {
    // GitHub refuses attestations for private repositories owned by a person (found on the first tag, 0.1.0).
    const rel = read('.github/workflows/release.yml');
    const attest = rel.split('\n').findIndex((l) => /uses:\s*actions\/attest-build-provenance@/.test(l));
    assert.match(
      rel.split('\n')[attest + 1] ?? '',
      /^\s*if:\s*\$\{\{\s*!github\.event\.repository\.private\s*\}\}\s*$/,
      'the attestation runs when the repository is public',
    );
    const sums = runCommands(rel).find((r) => /sha256sum/.test(r));
    assert.ok(sums, 'a checksum step');
    for (const asset of [
      'main.js',
      'manifest.json',
      'styles.css',
      'THIRD_PARTY_NOTICES.md',
      'graph-spec-libraries-$GITHUB_REF_NAME.tar.gz',
    ]) {
      assert.ok(sums.includes(asset), `the checksums cover ${asset}`);
    }
    assert.match(sums, /> SHA256SUMS\b/);
    assert.match(
      runCommands(rel).find((r) => /gh release create/.test(r)),
      /\bSHA256SUMS\b/,
      'the checksums are attached to the release',
    );
  });

  test('every library the plugin bundles is linted with the Obsidian review rules', () => {
    const deps = (name) =>
      Object.keys(readJSON(`packages/${name.split('/')[1]}/package.json`).dependencies ?? {}).filter((d) =>
        d.startsWith('@graph-note/'),
      );
    const bundled = new Set();
    for (const todo = deps('@graph-note/obsidian'); todo.length;) {
      const name = todo.pop();
      if (!bundled.has(name)) {
        bundled.add(name);
        todo.push(...deps(name));
      }
    }
    const ignores = /ignores:\s*\[([^\]]*)\]/.exec(read('eslint.config.mjs'))[1];
    for (const name of bundled) {
      const dir = `packages/${name.split('/')[1]}/src`;
      assert.doesNotMatch(
        ignores,
        new RegExp(`['"]${dir}/?['"]`),
        `${dir} is bundled into the plugin, so it must be linted`,
      );
    }
  });

  test('releases are built by CI from a bare version tag, with provenance and the store assets', () => {
    const rel = read('.github/workflows/release.yml');
    const on = block(rel.split('\n'), 'on', 0).join('\n');
    assert.match(on, /tags:/);
    assert.doesNotMatch(on, /['"]v/, 'tags carry no v prefix');
    assert.ok('release' in jobs(rel));
    assert.ok(usesRefs(rel).some((r) => r.startsWith('actions/attest-build-provenance@')));
    const runs = runCommands(rel).join('\n');
    assert.match(runs, /manifest\.json/, 'the tag is checked against the manifest');
    const create = runCommands(rel).find((r) => /gh release create/.test(r));
    assert.ok(create, 'gh release create');
    for (const asset of ['main.js', 'manifest.json', 'styles.css', 'THIRD_PARTY_NOTICES.md']) {
      assert.match(create, new RegExp(`\\b${asset.replace('.', '\\.')}\\b`), asset);
    }
  });
});

describe('Dependabot', () => {
  const updates = () =>
    read('.github/dependabot.yml')
      .split(/^\s*- package-ecosystem:/m)
      .slice(1)
      .map((chunk) => ({ ecosystem: chunk.split('\n')[0].trim().replace(/['"]/g, ''), chunk }));

  test('it watches npm and GitHub Actions', () => {
    const names = updates().map((u) => u.ecosystem);
    for (const e of ['npm', 'github-actions']) assert.ok(names.includes(e), e);
  });

  test('major versions the Obsidian linter cannot take are held back, each with its reason', () => {
    const npm = updates().find((u) => u.ecosystem === 'npm').chunk;
    // Pinned exactly by the Obsidian linter, so every version is held, not only majors.
    assert.match(
      npm,
      /dependency-name: '@eslint\/json'[^\n]*\n(?!\s*update-types)/,
      '@eslint/json is held at every version',
    );
    for (const name of ['eslint', '@eslint/js', 'typescript']) {
      // A name starting with @ must be quoted in YAML.
      const entry = new RegExp(
        `dependency-name: ['"]?${name.replace('/', '\\/')}['"]?\\n\\s*update-types: \\['version-update:semver-major'\\]`,
      );
      assert.match(npm, entry, `${name} is held back at major versions only`);
    }
    assert.match(npm, /# Held back:/, 'the reason is written down');
  });

  test('a Python package is watched too', () => {
    if (!exists('python/graph_spec/pyproject.toml')) return;
    assert.ok(updates().some((u) => u.ecosystem === 'uv'));
  });

  test('version updates come weekly, grouped, after a cooldown of at least seven days', () => {
    for (const { ecosystem, chunk } of updates()) {
      assert.match(chunk, /interval:\s*['"]?weekly/, `${ecosystem} weekly`);
      const days = /default-days:\s*(\d+)/.exec(chunk);
      assert.ok(days && Number(days[1]) >= 7, `${ecosystem} cooldown of 7 days or more`);
      assert.match(chunk, /groups:/, `${ecosystem} grouped`);
      assert.match(chunk, /applies-to:\s*version-updates/, `${ecosystem}: only version updates are grouped`);
    }
  });
});

describe('the shipped source', () => {
  test('the scanners find what they look for', () => {
    assert.ok(findsNetwork('await fetch(url)'));
    assert.ok(findsNetwork('new XMLHttpRequest()'));
    assert.ok(findsNetwork('new WebSocket(u)'));
    assert.ok(findsNetwork('await requestUrl({ url })'));
    assert.equal(findsNetwork('const prefetch = 1; refetchAll'), false);
    assert.ok(findsHotkeys("this.addCommand({ id: 'x', hotkeys: [{ modifiers: ['Mod'], key: 'g' }] })"));
    assert.deepEqual(forbiddenImports("import { readFileSync } from 'fs'"), ['fs']);
    assert.deepEqual(forbiddenImports("import * as p from 'node:path'"), ['node:path']);
    assert.deepEqual(forbiddenImports("const cp = require('child_process')"), ['child_process']);
    assert.deepEqual(forbiddenImports("import { shell } from 'electron'"), ['electron']);
    assert.deepEqual(forbiddenImports("import { Plugin } from 'obsidian'"), []);
  });

  test('there is source to scan', () => {
    assert.ok(sourceFiles().length > 0);
  });

  test('no source makes a network request, except the AI send module', () => {
    const offenders = sourceFiles().filter((f) => f !== AI_SEND_MODULE && findsNetwork(read(f)));
    assert.deepEqual(offenders, []);
  });

  // never_in_background (spec §19): the send module is reached from the send dialog alone, whose Send button is the
  // user saying yes; nothing in the AI's folder runs on a timer or on an event, so nothing is ever sent unasked (the
  // scans themselves are tested in test/repository-scans.test.js)
  test('the AI send module is there, and only the send dialog reaches it', () => {
    assert.ok(exists(AI_SEND_MODULE), AI_SEND_MODULE);
    assert.deepEqual(
      sourceFiles().filter((f) => f !== AI_SEND_MODULE && reachesSendModule(read(f))),
      [AI_SEND_DIALOG],
    );
  });

  test('nothing sends to an AI in the background: no timer and no event in the AI’s folder', () => {
    const folder = sourceFiles().filter((f) => f.startsWith('packages/obsidian/src/ai/'));
    assert.ok(folder.length > 1);
    assert.deepEqual(
      folder.filter((f) => findsBackground(read(f))),
      [],
    );
  });

  test('no command sets a default hotkey', () => {
    assert.deepEqual(
      sourceFiles().filter((f) => findsHotkeys(read(f))),
      [],
    );
  });

  test('no source imports Node or Electron built-ins', () => {
    const offenders = sourceFiles().flatMap((f) => forbiddenImports(read(f)).map((m) => `${f}: ${m}`));
    assert.deepEqual(offenders, []);
  });

  // iOS before 16.4 stops the whole plugin loading on a regular expression with a lookbehind. The store's linter finds
  // only a literal one, so what is built from a string, as `new RegExp(…)` does, is found here, by the text itself.
  test('no source holds a lookbehind, in a regular expression or in a string one is built from', () => {
    const lookbehind = /\(\?<[=!]/;
    assert.ok(lookbehind.test('/(?<=a)b/') && lookbehind.test('/(?<!a)b/'), 'a literal one is found');
    assert.ok(
      lookbehind.test("new RegExp('(?<![\\\\w])x')") && lookbehind.test('`(?<=${a})b`'),
      'a built one is found',
    );
    assert.equal(lookbehind.test('/(?<name>a)(?:b)(?=c)(?!d)/'), false, 'a named group and a lookahead are not');
    assert.deepEqual(
      sourceFiles().filter((f) => lookbehind.test(read(f))),
      [],
    );
  });
});

describe('the content check is installed', () => {
  test('the pre-commit hook runs the content check', () => {
    const hook = '.githooks/pre-commit';
    assert.ok(exists(hook));
    assert.ok(statSync(path(hook)).mode & 0o111, 'the hook is executable');
    assert.match(read(hook), /node scripts\/check-classification\.mjs/);
  });

  test('the README gives the one-line install', () => {
    assert.match(read('README.md'), /git config core\.hooksPath \.githooks/);
  });
});

describe('its own repository', () => {
  // own_repo (spec §13): the source lives in its own Git repository outside the vault, with GitHub as its remote
  test('the source is a Git repository whose remote is on GitHub', async () => {
    const { execFileSync } = await import('node:child_process');
    assert.ok(exists('.git'));
    const url = execFileSync('git', ['remote', 'get-url', 'origin'], { cwd: path('.'), encoding: 'utf8' }).trim();
    assert.match(url, /github\.com[:/][^/]+\/graph-note(\.git)?$/);
  });

  test('it sits inside no Obsidian vault: no folder above it holds one', async () => {
    const { existsSync } = await import('node:fs');
    const { dirname, join } = await import('node:path');
    for (let d = dirname(path('.')); d !== dirname(d); d = dirname(d)) assert.ok(!existsSync(join(d, '.obsidian')), d);
  });
});
