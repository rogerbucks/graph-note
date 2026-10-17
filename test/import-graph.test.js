// Which tests reach a file (editor spec §13, affected_tests_by_imports): the repository's import graph, followed from
// each test through every module it imports, directly or through others, and the files a test names to build or load.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { importGraph, testsReaching, isTestFile } from '../scripts/import-graph.mjs';
import { testsForChanges } from '../scripts/changed-tests.mjs';

/** A path in the small repository, made at run time so this test names no real file of the repository as a path. */
const P = (rest) => ['packages', rest].join('/');

/** A small repository: each file's text. */
const FILES = {
  [P('core/package.json')]: JSON.stringify({
    name: '@graph-note/core',
    exports: { '.': './src/index.ts', './display/*': './src/display/*.ts' },
  }),
  [P('core/src/index.ts')]: "export { zoom } from './zoom.ts';\nexport * from './words.ts';\n",
  [P('core/src/zoom.ts')]: "import { limit } from './zoom-limits.ts';\nexport const zoom = limit;\n",
  [P('core/src/zoom-limits.ts')]: 'export const limit = 4;\n',
  [P('core/src/words.ts')]: 'export const hello = "hello";\n',
  [P('core/src/lonely.ts')]: 'export const nobody = 1;\n',
  [P('core/src/display/host.ts')]: "import type { Thing } from '../zoom.ts';\nexport const host = 1;\n",
  [P('core/test/zoom.test.js')]: "import { zoom } from '../src/zoom.ts';\n",
  [P('core/test/later.test.js')]: "test('x', async () => { await import('../src/words.ts'); });\n",
  [P('obsidian/src/main.ts')]:
    "import { zoom } from '@graph-note/core';\nimport { host } from '@graph-note/core/display/host';\n",
  [P('obsidian/test/main.test.js')]:
    "import {\n  start,\n} from '../src/main.ts';\nimport { helper } from './host/fake.js';\n",
  [P('obsidian/test/host/fake.js')]: 'export const helper = 1;\n',
  [P('claude-code/page/page-main.ts')]: "import { hello } from '@graph-note/core';\n",
  [P('claude-code/test/page.test.js')]: "await build({ entryPoints: ['page/page-main.ts'] });\n",
  [P('claude-code/page/keys.ts')]: 'export const keys = 1;\n',
  [P('claude-code/test/page-files.test.js')]: 'const folder = `${PACKAGE}page`;\nreaddirSync(folder);\n',
};
const files = Object.keys(FILES);
const graph = importGraph(files, (f) => FILES[f]);
const reach = (path) => testsReaching(graph, path);

describe('the tests that reach a file', () => {
  test('a module is reached by the test that imports it, and by the tests of every module that imports it', () => {
    // the page imports the core by its name, so it reaches every module the core's entry exports
    assert.deepEqual(reach(P('core/src/zoom-limits.ts')), [
      P('claude-code/test/page-files.test.js'),
      P('claude-code/test/page.test.js'),
      P('core/test/zoom.test.js'),
      P('obsidian/test/main.test.js'),
    ]);
  });

  test('a package is imported by its name, through its entry and the paths its exports map', () => {
    assert.deepEqual(reach(P('core/src/display/host.ts')), [P('obsidian/test/main.test.js')]);
    assert.ok(reach(P('core/src/words.ts')).includes(P('obsidian/test/main.test.js')), 'through index.ts');
  });

  test('an import written over several lines, a type import and a dynamic import all count', () => {
    assert.ok(reach(P('obsidian/src/main.ts')).includes(P('obsidian/test/main.test.js')));
    assert.ok(reach(P('core/src/words.ts')).includes(P('core/test/later.test.js')));
  });

  test('a file a test names to build, as an entry point, is reached with all it imports', () => {
    assert.ok(reach(P('claude-code/page/page-main.ts')).includes(P('claude-code/test/page.test.js')));
    assert.ok(reach(P('core/src/words.ts')).includes(P('claude-code/test/page.test.js')));
  });

  test('a folder a test names, to walk it, reaches every file in it', () => {
    assert.deepEqual(reach(P('claude-code/page/keys.ts')), [P('claude-code/test/page-files.test.js')]);
    assert.ok(reach(P('claude-code/page/page-main.ts')).includes(P('claude-code/test/page-files.test.js')));
  });

  test('test support is reached by the tests that import it', () => {
    assert.deepEqual(reach(P('obsidian/test/host/fake.js')), [P('obsidian/test/main.test.js')]);
  });

  test('a module nothing imports is reached by no test, and a test reaches itself', () => {
    assert.deepEqual(reach(P('core/src/lonely.ts')), []);
    assert.deepEqual(reach(P('core/test/zoom.test.js')), [P('core/test/zoom.test.js')]);
  });

  test('a test file is one named .test.js or .test.mjs, or a Python test', () => {
    assert.equal(isTestFile(P('core/test/zoom.test.js')), true);
    assert.equal(isTestFile(P('graph-spec/test/layout.test.mjs')), true);
    assert.equal(isTestFile('python/graph_spec/tests/test_graph_svg.py'), true);
    assert.equal(isTestFile(P('obsidian/test/host/fake.js')), false);
  });
});

describe('tests picked by the import graph, by npm run test:changed', () => {
  const tracked = [
    'package.json',
    'packages/core/src/index.ts',
    'packages/core/src/zoom.ts',
    'packages/core/test/pane.test.js',
    'packages/core/test/zoom.test.js',
    'packages/core/test/zoom-limits.test.js',
    'packages/obsidian/test/graph-view.test.js',
  ];
  const ZOOM = ['packages/core/test/zoom-limits.test.js', 'packages/core/test/zoom.test.js'];
  const REACH = {
    'packages/core/src/types.ts': ['packages/core/test/pane.test.js', 'packages/obsidian/test/graph-view.test.js'],
    'packages/core/src/index.ts': ['packages/obsidian/test/graph-view.test.js'],
    'packages/core/src/zoom.ts': ['packages/obsidian/test/graph-view.test.js'],
    'packages/obsidian/test/host/fake-dom.js': ['packages/obsidian/test/graph-view.test.js'],
  };
  const reached = (...changed) => testsForChanges(changed, tracked, (p) => REACH[p] ?? []);

  test('a module no test is named after runs the tests that reach it, not the whole suite', () => {
    assert.deepEqual(reached('packages/core/src/types.ts'), {
      all: false,
      files: ['packages/core/test/pane.test.js', 'packages/obsidian/test/graph-view.test.js'],
    });
  });

  test('a package’s entry and test support run the tests that reach them', () => {
    assert.deepEqual(reached('packages/core/src/index.ts').files, ['packages/obsidian/test/graph-view.test.js']);
    assert.deepEqual(reached('packages/obsidian/test/host/fake-dom.js').files, [
      'packages/obsidian/test/graph-view.test.js',
    ]);
  });

  test('a module runs the tests named after it and the tests that reach it, each once', () => {
    assert.deepEqual(reached('packages/core/src/zoom.ts').files, [
      ...ZOOM,
      'packages/obsidian/test/graph-view.test.js',
    ]);
  });

  test('a module no test reaches is shared, so the whole suite runs, and one line says why', () => {
    assert.deepEqual(reached('packages/core/src/lonely.ts'), {
      all: true,
      reason: 'packages/core/src/lonely.ts is shared: no test reaches it',
    });
  });

  test('package.json, the lock file and workflows still run the whole suite', () => {
    for (const changed of ['package.json', 'package-lock.json', '.github/workflows/ci.yml'])
      assert.equal(reached(changed).all, true, changed);
  });
});
