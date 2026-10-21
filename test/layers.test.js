// Each layer imports only the layers below it (editor spec §43, layers_checked). The layers come from
// requirements/architecture.gql: the graph format library, the core, the display layer, then the plug-ins and the apps.
// scripts/layers.mjs reads every import of the shipped code and names each one that crosses a layer the wrong way.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { layerProblems, repoFiles } from '../scripts/layers.mjs';

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const ARCHITECTURE = read('requirements/architecture.gql');

/** The problems of a made-up repository: its files and their text. */
const problemsOf = (files) =>
  layerProblems(Object.keys(files), (f) => files[f], ARCHITECTURE).map((p) => `${p.file} → ${p.imports}`);

describe('each layer imports only the layers below it', () => {
  test('the repository as committed has no import that crosses a layer the wrong way', () => {
    assert.deepEqual(layerProblems(repoFiles(), read, ARCHITECTURE), []);
  });

  test('the core importing the display layer is reported, and the display layer importing the core is not', () => {
    const files = {
      'packages/core/src/a.ts': "import { b } from './display/b.ts';",
      'packages/core/src/display/b.ts': "import { c } from '../c.ts';",
      'packages/core/src/c.ts': 'export const c = 1;',
    };
    assert.deepEqual(problemsOf(files), ['packages/core/src/a.ts → packages/core/src/display/b.ts']);
  });

  test('the graph format library importing an app is reported, through a package name too', () => {
    const files = {
      'packages/obsidian/package.json': '{"name": "@thoughtknot/obsidian", "exports": {".": "./src/main.ts"}}',
      'packages/obsidian/src/main.ts': 'export const m = 1;',
      'packages/graph-spec/src/x.js': "const m = import('@thoughtknot/obsidian');",
    };
    assert.deepEqual(problemsOf(files), ['packages/graph-spec/src/x.js → packages/obsidian/src/main.ts']);
  });

  test('tests and their support are left out: they may reach any layer', () => {
    const files = {
      'packages/core/test/a.test.js': "import { b } from '../src/display/b.ts';",
      'packages/core/src/display/b.ts': 'export const b = 1;',
    };
    assert.deepEqual(problemsOf(files), []);
  });
});
