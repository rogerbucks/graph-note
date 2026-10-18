// Licences through the whole build chain. Spec §13, Licence: the plugin is MPL-2.0;
// every library bundled into a release, and everything compiled inside one,
// carries a licence on the allow-list; the notices name them all and ship with
// every release; build tools should be on the allow-list too, and a GPL tool is
// allowed only where it runs in CI alone and is never shipped (build_tool_licences).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { exists, read, readJSON, path, walk, jsPackages, jobs, runCommands, workflowFiles } from './repository/repo.js';
import {
  aptInstalls,
  buildTools,
  bundledPackages,
  carriesWasm,
  ciOnlyProblems,
  licenceAllowed,
  lockedNames,
} from './repository/licences.js';
import { renderNotices } from '../scripts/notices.mjs';

const record = () => readJSON('licences/bundled.json');

describe('the plugin licence', () => {
  test('the repository is under the Mozilla Public License 2.0 (Roger, 18 Oct 2026)', () => {
    const text = read('LICENSE');
    assert.match(text, /^Mozilla Public License Version 2\.0\n=+\n/);
    assert.match(text, /Exhibit A - Source Code Form License Notice/);
    assert.match(text, /Exhibit B - "Incompatible With Secondary Licenses" Notice/);
  });

  test('every package declares MPL-2.0, the Python library too', () => {
    for (const p of jsPackages()) assert.equal(readJSON(`${p}/package.json`).license, 'MPL-2.0', p);
    assert.match(read('python/graph_spec/pyproject.toml'), /^license = "MPL-2\.0"$/m);
  });
});

describe('the allow-list', () => {
  test('it reads licence expressions', () => {
    assert.ok(licenceAllowed('MIT'));
    assert.ok(licenceAllowed('(MIT OR Apache-2.0)'));
    assert.ok(licenceAllowed('MIT OR NCSA'));
    assert.ok(licenceAllowed('Apache-2.0 WITH LLVM-exception'));
    assert.ok(licenceAllowed('ISC AND BSD-3-Clause'));
    assert.equal(licenceAllowed('GPL-3.0-only'), false);
    assert.equal(licenceAllowed('MIT AND GPL-3.0-only'), false);
    assert.equal(licenceAllowed(undefined), false);
  });

  test('EPL-2.0 is allowed for Graphviz alone', () => {
    assert.ok(licenceAllowed('EPL-2.0', 'Graphviz'));
    assert.equal(licenceAllowed('EPL-2.0'), false);
    assert.equal(licenceAllowed('EPL-2.0', 'Something else'), false);
  });

  test('it finds WebAssembly, as a file or inlined', () => {
    assert.ok(carriesWasm('x.wasm', Buffer.from([0, 0x61, 0x73, 0x6d])));
    assert.ok(carriesWasm('x.js', Buffer.from('const b = "AGFzbQEAAAAB";')));
    assert.equal(carriesWasm('x.js', Buffer.from('export const a = 1;')), false);
  });
});

describe('what is bundled into a release', () => {
  test('the bundled packages are found from the lockfile', () => {
    assert.deepEqual(
      bundledPackages().map((p) => p.name),
      ['@viz-js/viz', 'marked'],
    );
  });

  test('every bundled package declares an allowed licence', () => {
    for (const p of bundledPackages()) assert.ok(licenceAllowed(p.licence), `${p.name}: ${p.licence}`);
  });

  test('every bundled package has its contents recorded for its exact version', () => {
    const { packages } = record();
    for (const p of bundledPackages()) {
      const entry = packages[`${p.name}@${p.version}`];
      assert.ok(entry, `${p.name}@${p.version} is recorded — re-check its contents when it changes`);
      assert.equal(entry.licence, p.licence, `${p.name}: the recorded licence is the declared one`);
    }
  });

  test('everything compiled inside a bundled package carries an allowed licence', () => {
    for (const [key, entry] of Object.entries(record().packages)) {
      for (const c of entry.inside) assert.ok(licenceAllowed(c.licence, c.name), `${key} → ${c.name}: ${c.licence}`);
    }
  });

  test('the record covers everything a package says it was built from', () => {
    for (const p of bundledPackages()) {
      const entry = record().packages[`${p.name}@${p.version}`];
      const recorded = new Set(entry.inside.map((c) => c.provenance));
      const provenance = walk(`node_modules/${p.name}`).filter((f) => f.endsWith('provenance.json'));
      for (const f of provenance) {
        for (const dep of readJSON(f).predicate?.buildDefinition?.resolvedDependencies ?? []) {
          assert.ok(recorded.has(dep.uri), `${p.name}: ${dep.uri} (from ${f}) is not recorded`);
        }
      }
    }
  });

  test('a package with WebAssembly inside has its contents recorded', () => {
    for (const p of bundledPackages()) {
      const wasm = walk(`node_modules/${p.name}`).some((f) => carriesWasm(f, readFileSync(path(f))));
      const entry = record().packages[`${p.name}@${p.version}`];
      if (wasm) assert.ok(entry.inside.length > 0, `${p.name} compiles code in; record what`);
    }
  });
});

describe('the notices', () => {
  test('every licence text the record names is present', () => {
    for (const [key, entry] of Object.entries(record().packages)) {
      for (const item of [entry, ...entry.inside]) {
        assert.ok(item.licenceText && exists(`licences/${item.licenceText}`), `${key}: ${item.name ?? key} text`);
        assert.ok(read(`licences/${item.licenceText}`).trim(), `${item.licenceText} is not empty`);
      }
    }
  });

  test('THIRD_PARTY_NOTICES.md is generated from the record and is up to date', () => {
    const expected = renderNotices(record(), (f) => read(`licences/${f}`));
    assert.equal(read('THIRD_PARTY_NOTICES.md'), expected, 'run: node scripts/notices.mjs');
  });

  test('the notices name every bundled library and what is inside it', () => {
    const notices = read('THIRD_PARTY_NOTICES.md');
    for (const [key, entry] of Object.entries(record().packages)) {
      assert.ok(notices.includes(key), key);
      for (const c of entry.inside) assert.ok(notices.includes(`${c.name} ${c.version}`), `${c.name} ${c.version}`);
    }
  });

  test('where a licence asks for it, the notices say where the source is', () => {
    const notices = read('THIRD_PARTY_NOTICES.md');
    for (const entry of Object.values(record().packages)) {
      for (const c of entry.inside.filter((c) => /EPL/.test(c.licence))) {
        assert.match(c.source ?? '', /^https:\/\//, `${c.name} names its source`);
        assert.ok(notices.includes(c.source), `${c.name}: the source link is in the notices`);
      }
    }
  });
});

describe('build tools, which are not shipped', () => {
  test('each carries an allowed licence, or a reviewed exception', () => {
    const exceptions = record().buildToolExceptions;
    const problems = buildTools()
      .filter((t) => !licenceAllowed(t.licence))
      .filter((t) => exceptions[t.name]?.licence !== t.licence || !exceptions[t.name]?.reason)
      .map((t) => `${t.name}@${t.version}: ${t.licence}`);
    assert.deepEqual(problems, []);
  });

  test('no exception is left over once its tool is gone', () => {
    const names = new Set(buildTools().map((t) => t.name));
    for (const name of Object.keys(record().buildToolExceptions)) assert.ok(names.has(name), name);
  });
});

describe('a GPL tool, allowed only where it runs in CI alone and is never shipped (build_tool_licences)', () => {
  const tools = () => record().ciOnlyTools.tools;
  const installs = () =>
    workflowFiles().flatMap((f) => aptInstalls(f.replace('.github/workflows/', ''), jobs(read(f))));

  test('the allowance is named and documented, and Valgrind, GPL-3.0 by its manual, is its one entry', () => {
    assert.match(record().ciOnlyTools.about, /GPL tool is allowed only where it runs in CI alone and is never shipped/);
    assert.deepEqual(Object.keys(tools()), ['valgrind']);
    assert.equal(tools().valgrind.licence, 'GPL-3.0');
    assert.equal(tools().valgrind.licenceSource, 'https://valgrind.org/docs/manual/manual-intro.html');
    assert.deepEqual(ciOnlyProblems(record(), lockedNames()), []);
    assert.equal(licenceAllowed('GPL-3.0'), false, 'the allow-list itself is unchanged: GPL is not on it');
  });

  test('cannot cover anything bundled, inside what is bundled, or in node_modules, dev or not', () => {
    const planted = structuredClone(record());
    const entry = { ...tools().valgrind };
    for (const name of ['@viz-js/viz', 'Graphviz', 'esbuild', 'ESLint', 'valgrind'])
      planted.ciOnlyTools.tools[name] = entry;
    const said = ciOnlyProblems(planted, lockedNames()).join('\n');
    assert.match(said, /^@viz-js\/viz: bundled/m, 'the bundled engine');
    assert.match(said, /^Graphviz: bundled/m, 'what the engine carries inside');
    assert.match(said, /^esbuild: in the lockfile/m, 'a dev package in node_modules');
    assert.match(said, /^ESLint: in the lockfile/m, 'in any case');
    assert.doesNotMatch(said, /^valgrind/m, 'the real entry stays allowed');
    planted.ciOnlyTools.tools.valgrind = { ...entry, licence: 'MIT', jobs: [] };
    assert.equal(ciOnlyProblems(planted, lockedNames()).filter((p) => p.startsWith('valgrind')).length, 2);
  });

  test('every package a workflow installs with apt-get is on the allowance, in exactly the jobs it names', () => {
    const found = installs();
    for (const { job, name } of found) assert.ok(tools()[name], `${job} installs ${name}, not on the allowance`);
    for (const [name, t] of Object.entries(tools())) {
      const where = found.filter((i) => i.name === name).map((i) => i.job);
      assert.deepEqual(where.sort(), [...t.jobs].sort(), name);
    }
  });

  test('an install is found in every form apt takes, every package on its line, flags anywhere among them', () => {
    const planted = {
      a: ['      - run: sudo apt install valgrind'],
      b: ['      - run: sudo apt-get -y install valgrind gdb && echo done'],
      c: ['      - run: apt-get install --no-install-recommends -y valgrind'],
    };
    assert.deepEqual(
      aptInstalls('x.yml', planted).map((i) => `${i.job} ${i.name} ${i.bare}`),
      ['x.yml a valgrind false', 'x.yml b valgrind false', 'x.yml b gdb false', 'x.yml c valgrind true'],
    );
  });

  test('the developer-only image installs only what the allowance names for it, and asks for no recommended packages', () => {
    const images = walk('docker').filter((f) => f.endsWith('.Dockerfile'));
    assert.deepEqual(images, ['docker/benchmarks.Dockerfile']);
    for (const image of images) {
      const found = aptInstalls(image, { image: read(image).split('\n') });
      assert.ok(found.length > 0, `the control: ${image}'s installs are found`);
      for (const { name, bare } of found) {
        assert.ok(tools()[name]?.images?.includes(image), `${image} installs ${name}, not on the allowance for it`);
        assert.ok(bare, `${image} installs ${name} with --no-install-recommends`);
      }
    }
  });

  test('every install asks for no recommended packages, so nothing else GPL comes in unlisted', () => {
    const found = installs();
    assert.ok(found.length > 0, 'the control: the installs are found');
    for (const i of found) assert.ok(i.bare, `${i.job} installs ${i.name} with --no-install-recommends`);
  });

  test('never in a job that builds, tests or releases what ships, nor in ordinary CI', () => {
    const installing = new Set(installs().map((i) => i.job));
    assert.ok(installing.size > 0, 'the control: the installs are found');
    for (const f of workflowFiles()) {
      const file = f.replace('.github/workflows/', '');
      for (const [job, lines] of Object.entries(jobs(read(f)))) {
        const SHIPS = /npm run build|npm test|gh release|git archive/;
        const builds = runCommands(lines.join('\n')).some((r) => SHIPS.test(r));
        if (builds || file === 'ci.yml') assert.ok(!installing.has(`${file} ${job}`), `${file} ${job}`);
      }
    }
  });
});
