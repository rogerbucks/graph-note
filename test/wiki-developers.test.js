// The wiki's pages for developers (spec §41, developer_wiki): the architecture, writing a plug-in, adding a host and the
// reference. Each list is made from the code and requirements/architecture.gql. Each requirement is marked against the
// latest release. The plug-in example installs. Pure: the real files are read, nothing is fetched.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { pluginRegistry, PLUGIN_API, exporterContract } from '../packages/core/src/index.ts';
import { readBoard } from '../scripts/slice-board.mjs';
import { renderWiki } from '../scripts/wiki.mjs';
import { architectureChart, architectureProblems, readArchitecture } from '../scripts/wiki-architecture.mjs';
import {
  developerFacts,
  editionNote,
  hostMembers,
  pointsTable,
  requirementStates,
} from '../scripts/wiki-developers.mjs';
import { checkPage } from '../scripts/wiki-review.mjs';
import { exists, read, readJSON } from './repository/repo.js';

const requirementsText = read('requirements/editor-requirements.md');
const { requirements } = readBoard(requirementsText);
const architectureText = read('requirements/architecture.gql');
const DEVELOPER_PAGES = ['For-developers.md', 'Architecture.md', 'Writing-a-plug-in.md', 'Adding-a-host.md'];
const handPages = Object.fromEntries(
  readdirSync('wiki')
    .filter((f) => f.endsWith('.md'))
    .map((f) => [f, read(`wiki/${f}`)]),
);
const facts = await developerFacts();
const made = (over = {}) =>
  renderWiki({
    requirementsText,
    developer: facts,
    waves: readJSON('requirements/waves.json').waves,
    workstreams: readJSON('requirements/workstreams.json'),
    baseline: readJSON('quality/baseline.json'),
    versions: readJSON('versions.json'),
    releases: [],
    options: [],
    pages: handPages,
    sha: '0123456789abcdef',
    today: '2026-10-18',
    ...over,
  });

describe('the architecture graph', () => {
  const arch = readArchitecture(architectureText);

  test('names only paths that are there and requirements that exist, and each layer uses only those below it', () => {
    assert.deepEqual(architectureProblems(arch, requirements, exists), []);
  });

  test('has every package of the repository as a part, so a new one cannot be left off the drawing', () => {
    const paths = new Set(arch.parts.map((p) => p.path));
    for (const dir of readdirSync('packages').filter((p) => !p.startsWith('.')))
      assert.ok(paths.has(`packages/${dir}`), `packages/${dir}`);
    assert.ok(paths.has('python/graph_spec'));
  });

  test('finds a missing path, an unknown requirement, a part in no layer and a layer using one above it', () => {
    const bad = {
      layers: [
        { id: 'top', order: 1, uses: ['low'] },
        { id: 'low', order: 2, uses: ['top'] },
      ],
      parts: [
        { id: 'gone', path: 'packages/nowhere', layer: 'top', offers: [], implements: [] },
        { id: 'loose', requirement: 'no_such_thing', offers: [], implements: [] },
      ],
      interfaces: [{ id: 'iface', file: 'nowhere.ts', requirements: ['also_missing'] }],
    };
    const problems = architectureProblems(bad, requirements, exists).join('\n');
    assert.match(problems, /low: a layer uses only layers below it, not top/);
    assert.match(problems, /gone: no packages\/nowhere/);
    assert.match(problems, /loose: the part is in no layer/);
    assert.match(problems, /loose: no requirement no_such_thing/);
    assert.match(problems, /iface: no nowhere\.ts/);
    assert.match(problems, /iface: no requirement also_missing/);
  });

  test('is drawn as ThoughtKnot draws a graph: each thing with its kind, and a part not built yet dashed', () => {
    const chart = architectureChart(arch);
    for (const p of arch.parts) assert.match(chart, new RegExp(`${p.id}\\[".*<i>:Part</i>"\\]`));
    for (const i of arch.interfaces) assert.match(chart, new RegExp(`${i.id}\\{\\{".*<i>:Interface</i>"\\}\\}`));
    assert.match(chart, /class vscode planned/);
  });
});

describe('where a requirement stands', () => {
  const r = (id, status) => ({ id, status });

  test('is released when proved at the latest release, nightly only when proved on main alone, else being built or planned', () => {
    const states = requirementStates(
      [r('a', 'proved'), r('b', 'proved'), r('c', 'part'), r('d', 'open')],
      [r('a', 'proved'), r('b', 'part')],
    );
    assert.deepEqual(Object.fromEntries(states), { a: 'released', b: 'nightly', c: 'part', d: 'open' });
  });

  test('counts every proved requirement as released when there is no release to compare with', () => {
    assert.equal(requirementStates([r('a', 'proved')], null).get('a'), 'released');
  });

  test('is marked nightly only on the pages when the release did not prove it', () => {
    const released = requirementsText.replace(/(\(test_help_shapes:Test \{[^}]*status: )'written'/, "$1'planned'");
    const pages = made({
      releasedText: released,
      releases: [
        { tagName: '0.7.1-nightly.20261019', name: 'nightly', publishedAt: '2026-10-19T00:00:00Z' },
        { tagName: '0.7.0', name: '0.7.0', publishedAt: '2026-10-18T00:00:00Z' },
      ],
    });
    assert.match(pages['For-developers.md'], /The latest release is \*\*\[0\.7\.0\]/);
    assert.match(pages['Architecture.md'], /🌙 `lsp_shapes`/);
    assert.match(made()['Architecture.md'], /✅ `lsp_shapes`/);
    assert.equal(editionNote(undefined).includes('latest release'), false);
  });
});

describe('the developer pages', () => {
  const pages = made();

  test('fill every marker, and keep to the checks a page people write is held to', () => {
    const names = new Set(Object.keys(pages).map((f) => f.slice(0, -3)));
    for (const f of [...DEVELOPER_PAGES, 'Developer-reference.md']) {
      assert.ok(pages[f], f);
      assert.doesNotMatch(pages[f], /<!-- wiki:/, f);
      assert.deepEqual(checkPage(pages[f], { pages: names, files: new Set(), exists, version: '0.0.0' }), [], f);
    }
  });

  test('list every extension point, every contract check and every design token from the code', () => {
    const plugin = pages['Writing-a-plug-in.md'];
    for (const p of facts.points) assert.match(plugin, new RegExp(`\\| \`${p}\` \\|`));
    for (const c of [...facts.exporterChecks, ...facts.tokenChecks]) assert.ok(plugin.includes(`- ☑ ${c}`), c);
    for (const t of Object.keys(facts.tokens)) assert.ok(plugin.includes(`| \`${t}\` |`), t);
    assert.ok(plugin.includes(`version \`${PLUGIN_API}\``));
  });

  test('refuse an extension point the page has no words for', () => {
    assert.throws(() => pointsTable(['exports', 'diagram-types']), /"diagram-types" has no words/);
  });

  test('list every member of the host interface and every check of the host contract', () => {
    const host = pages['Adding-a-host.md'];
    const members = hostMembers(facts.hostSource);
    const declared = /export interface DisplayHost \{([\s\S]*?)\n\}/.exec(facts.hostSource)[1].match(/^ {2}\w+\??:/gm);
    assert.equal(members.length, declared.length);
    for (const m of members)
      assert.ok(host.includes(`| \`${m.name}\` | ${m.optional ? 'Optional' : 'Required'} |`), m.name);
    for (const c of facts.hostChecks) assert.ok(host.includes(`- ☑ ${c}`), c);
  });

  test('list every problem code and standard schema in the reference', () => {
    const ref = pages['Developer-reference.md'];
    for (const c of facts.problemCodes) assert.ok(ref.includes(`| \`${c.code}\` |`), c.code);
    assert.match(ref, /\| `decision@1` \|/);
  });

  test('are in the sidebar, with the design pages', () => {
    for (const f of [...DEVELOPER_PAGES, 'Developer-reference.md', 'Design-review.md', 'Whiteboard-design.md'])
      assert.ok(pages['_Sidebar.md'].includes(`](${f.slice(0, -3)})`), f);
  });

  test('give a plug-in example that installs and passes its contract', () => {
    const code = /## A first plug-in[\s\S]*?```js\n([\s\S]*?)```/.exec(read('wiki/Writing-a-plug-in.md'))[1];
    const body = code.replace(/^import .*\n/m, '') + '\nreturn registry;';
    const registry = new Function('PLUGIN_API', 'pluginRegistry', body)(PLUGIN_API, pluginRegistry);
    const exporter = registry.exporters()[0];
    assert.equal(exporter.format, 'text-list');
    for (const check of exporterContract(exporter)) check.run();
  });
});
