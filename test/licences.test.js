// Licences through the whole build chain. Spec §13, Licence: the plugin is MIT;
// every library bundled into a release, and everything compiled inside one,
// carries a licence on the allow-list; the notices name them all and ship with
// every release; build tools should be on the allow-list too.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { exists, read, readJSON, path, walk, jsPackages } from './lib/repo.js';
import { licenceAllowed, bundledPackages, buildTools, carriesWasm } from './lib/licences.js';
import { renderNotices } from '../scripts/notices.mjs';

const record = () => readJSON('licences/bundled.json');

describe('the plugin licence', () => {
  test('the repository is MIT-licensed', () => {
    const text = read('LICENSE');
    assert.match(text, /^MIT License\n/);
    assert.match(text, /Permission is hereby granted, free of charge/);
  });

  test('every package declares MIT', () => {
    for (const p of jsPackages()) assert.equal(readJSON(`${p}/package.json`).license, 'MIT', p);
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
      ['@viz-js/viz'],
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
