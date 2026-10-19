// The library's public interface is declared and checked, so a break cannot ship without a new major version
// (spec §41, lib_public_api):
// - public-api.json matches what the library's entry points export.
// - Taking away an export, or changing one of its lines, is a break. Adding one is not.
// - A break since the last release fails unless the package raises its major version. Before 1.0.0 that is the
//   leftmost part that is not 0, so 0.7.1 to 0.8.0 is a major step.
// - The release workflow runs the same check before it builds anything.
// Proved on the real repository, on small libraries written for the purpose and on small repositories with tags.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import {
  DECLARATION,
  breakingChanges,
  declarationAt,
  declarationText,
  lastRelease,
  raisesMajor,
  readInterface,
  releaseCheck,
  unallowedBreaks,
} from '../scripts/public-api.mjs';
import { read, readJSON } from './repository/repo.js';
import { repository } from './repository/scratch-repository.js';

const CORE = '@thoughtknot/core';

// A library folder with the core and graph-spec entry points, holding the given text.
function library({ core, spec = 'export declare function check(text: string): string[];\n', version = '0.7.1' }) {
  const dir = mkdtempSync(join(tmpdir(), 'public-api-'));
  const files = {
    'packages/core/package.json': JSON.stringify({ version }),
    'packages/core/src/index.ts': core,
    'packages/core/src/display/host.ts': 'export interface DisplayHost { notice(message: string): void }\n',
    'packages/core/src/display/host-contract.ts': 'export const HOST_CONTRACT_VERSION = 1;\n',
    'packages/graph-spec/package.json': JSON.stringify({ version }),
    'packages/graph-spec/src/graph-spec.d.ts': spec,
    'packages/graph-spec/src/graph-layout-types.d.ts':
      'declare const GraphLayout: { wrap(text: string, width: number): string[] };\nexport = GraphLayout;\n',
  };
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, file)), { recursive: true });
    writeFileSync(join(dir, file), text);
  }
  return { dir, done: () => rmSync(dir, { recursive: true, force: true }) };
}

const surfaceOf = (core) => {
  const made = library({ core });
  try {
    return readInterface(made.dir);
  } finally {
    made.done();
  }
};

describe('the declared interface', () => {
  test('public-api.json matches what the entry points export', () => {
    assert.equal(
      read(DECLARATION),
      declarationText(readInterface()),
      'run node scripts/public-api.mjs --update and commit the file',
    );
  });

  test('it names every package of the library at its own version', () => {
    const declared = readJSON(DECLARATION);
    assert.deepEqual(Object.keys(declared).sort(), [CORE, '@thoughtknot/graph-spec']);
    assert.equal(declared[CORE].version, readJSON('packages/core/package.json').version);
    assert.ok(Object.keys(declared[CORE].entries['.']).includes('readNote'), 'the core reads a note');
    assert.ok(declared['@thoughtknot/graph-spec'].entries['./src/graph-layout.js']['export ='].length > 0);
  });

  // Risk API-3: a host built for one version of DisplayHost must not break silently when it changes.
  test('the host interface is declared, and its version moves with it', async () => {
    const { HOST_CONTRACT_VERSION, HOST_CONTRACT_VERSIONS } =
      await import('../packages/core/src/display/host-contract.ts');
    const entries = readJSON(DECLARATION)[CORE].entries;
    assert.ok(entries['./display/host']?.DisplayHost?.length, 'DisplayHost is declared, member by member');
    assert.ok(entries['./display/host-contract']?.HOST_CONTRACT_VERSION, 'and the contract with its version');
    const digest = createHash('sha256').update(JSON.stringify(entries['./display/host'])).digest('hex').slice(0, 16);
    const [version, recorded] = HOST_CONTRACT_VERSIONS.at(-1);
    assert.equal(
      digest,
      recorded,
      `the host interface changed: add [${version + 1}, '${digest}'] to HOST_CONTRACT_VERSIONS in host-contract.ts`,
    );
    assert.equal(HOST_CONTRACT_VERSION, version, 'the version is the last one recorded');
    HOST_CONTRACT_VERSIONS.forEach(([v], i) => i && assert.equal(v, HOST_CONTRACT_VERSIONS[i - 1][0] + 1, 'by one'));
    assert.equal(new Set(HOST_CONTRACT_VERSIONS.map(([, d]) => d)).size, HOST_CONTRACT_VERSIONS.length);
  });

  test('a function, a type and a class are each written out, wherever they live', () => {
    const surface = surfaceOf(
      [
        'export function draw(text: string, width?: number): string { return text; }',
        'export interface Box { name: string; size?: number }',
        'export class Store { #secret = 1; private hidden = 2; read(): string { return ""; } }',
      ].join('\n'),
    );
    const core = surface[CORE].entries['.'];
    assert.deepEqual(core.draw, ['value: (text: string, width?: number) => string']);
    assert.deepEqual(core.Box, ['interface', 'name: string', 'size?: number | undefined']);
    assert.deepEqual(core.Store, ['class', 'static new (): Store', 'read: () => string']);
    assert.deepEqual(surface['@thoughtknot/graph-spec'].entries['./src/graph-layout.js'], {
      'export =': ['wrap: (text: string, width: number) => string[]'],
    });
  });
});

describe('what counts as a break', () => {
  const before = surfaceOf('export function draw(text: string): string { return text; }\nexport const SIZE = 3;');

  test('taking away an export breaks', () => {
    const after = surfaceOf('export const SIZE = 3;');
    assert.deepEqual(breakingChanges(before, after), [{ pkg: CORE, entry: '.', name: 'draw', line: null }]);
  });

  test('changing a signature breaks', () => {
    const after = surfaceOf('export function draw(text: number): string { return ""; }\nexport const SIZE = 3;');
    assert.deepEqual(breakingChanges(before, after), [
      { pkg: CORE, entry: '.', name: 'draw', line: 'value: (text: string) => string' },
    ]);
  });

  test('adding an export does not break', () => {
    const after = surfaceOf(
      'export function draw(text: string): string { return text; }\nexport const SIZE = 3;\nexport const MORE = 1;',
    );
    assert.deepEqual(breakingChanges(before, after), []);
  });
});

describe('a break needs a new major version', () => {
  test('before 1.0.0 the major part is the leftmost part that is not 0', () => {
    assert.equal(raisesMajor('0.7.1', '0.8.0'), true);
    assert.equal(raisesMajor('0.7.1', '0.7.2'), false);
    assert.equal(raisesMajor('0.7.0', '1.0.0'), true);
    assert.equal(raisesMajor('0.0.3', '0.0.4'), true);
    assert.equal(raisesMajor('1.4.2', '1.9.0'), false);
    assert.equal(raisesMajor('1.4.2', '2.0.0'), true);
  });

  test('a break fails without a major step, and passes with one', () => {
    const before = surfaceOf('export function draw(text: string): string { return text; }');
    const after = surfaceOf('export const SIZE = 3;');
    const at = (surface, version) => ({ ...surface, [CORE]: { ...surface[CORE], version } });
    const problems = unallowedBreaks(at(before, '0.7.0'), at(after, '0.7.1'));
    assert.deepEqual(
      problems.map(({ pkg, from, to }) => ({ pkg, from, to })),
      [{ pkg: CORE, from: '0.7.0', to: '0.7.1' }],
    );
    assert.deepEqual(unallowedBreaks(at(before, '0.7.0'), at(after, '0.8.0')), []);
  });

  test('the last release is the highest bare version tag before HEAD, never a nightly, and its file is what it shipped', () => {
    const repo = repository([{ [DECLARATION]: '{"a":1}\n' }, { [DECLARATION]: '{"a":2}\n' }, { other: 'x' }]);
    try {
      assert.equal(lastRelease(repo.dir), null);
      repo.git('tag', '0.9.0', repo.ids[0]);
      repo.git('tag', '0.10.0', repo.ids[1]);
      repo.git('tag', '0.11.1-nightly.20261018', repo.ids[1]);
      assert.equal(lastRelease(repo.dir), '0.10.0', 'by version, not by text');
      repo.git('tag', '0.11.0');
      assert.equal(lastRelease(repo.dir), '0.10.0', 'the tag being released is not the last release');
      assert.deepEqual(declarationAt('0.9.0', repo.dir), { a: 1 });
      assert.deepEqual(declarationAt('0.10.0', repo.dir), { a: 2 });
    } finally {
      repo.done();
    }
  });

  test('a release from before the file existed has nothing to compare with', () => {
    const repo = repository([{ other: 'x' }]);
    try {
      repo.git('tag', '0.7.0');
      assert.equal(declarationAt('0.7.0', repo.dir), null);
    } finally {
      repo.done();
    }
  });

  test('every change since the last release in this repository is allowed by its versions', () => {
    assert.deepEqual(releaseCheck().problems, []);
  });

  test('the release workflow runs the check before it builds', () => {
    const workflow = read('.github/workflows/release.yml');
    const check = workflow.indexOf('node scripts/public-api.mjs --release');
    assert.ok(check > 0, 'release.yml runs node scripts/public-api.mjs --release');
    assert.ok(check < workflow.indexOf('gh release create'), 'before the release is made');
  });
});
