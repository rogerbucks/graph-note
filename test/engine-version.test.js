// The layout engine's version, watched (spec §13, engine_version_watched). The exact Graphviz version is read from the
// engine itself. It is named in the release notes and the notices. It is checked against the published advisories for
// Graphviz and for the package that wraps it. A known flaw fails the release. The check reads a committed cache, so it
// runs offline. Only the refresh reaches the network (OSV, with NVD behind it). It runs in the release and a weekly
// workflow. Nothing here touches the network: the refresh is proved with a fetch made for the purpose.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  engineVersion,
  checkEngine,
  affects,
  refresh,
  releaseNotes,
  staleness,
  watch,
} from '../scripts/engine-version.mjs';
import { loadEngine } from '../packages/core/src/engine.ts';
import { exists, read, readJSON, ROOT, walk, block, jobs, runCommands, stripComment } from './repository/repo.js';

const GRAPHVIZ_VERSION = /^\d+\.\d+\.\d+$/;
const cache = () => readJSON('quality/advisories.json');
const notices = () => read('THIRD_PARTY_NOTICES.md');
const advisory = (extra) => ({
  id: 'CVE-2099-0001',
  package: 'graphviz',
  source: 'osv',
  summary: 'a flaw made up for this test',
  ...extra,
});
const withAdvisories = (...list) => ({ ...cache(), advisories: list });
const problems = async (c, n = notices()) => checkEngine({ ...(await engineVersion()), cache: c, notices: n });

describe('reading the version from the engine', () => {
  test('it is Graphviz’s own, read from the engine that is bundled, and the notices name it', async () => {
    const { graphviz, wrapper } = await engineVersion();
    assert.match(graphviz, GRAPHVIZ_VERSION);
    assert.equal((await loadEngine()).version, graphviz, 'the engine the plugin starts says the same');
    assert.match(notices(), new RegExp(`Graphviz ${graphviz.replaceAll('.', '\\.')} — `));
    assert.match(notices(), new RegExp(`@viz-js/viz@${wrapper.replaceAll('.', '\\.')}`));
  });

  test('the package that wraps it is named by its own version, which is not the Graphviz one', async () => {
    const { graphviz, wrapper } = await engineVersion();
    assert.equal(wrapper, readJSON('node_modules/@viz-js/viz/package.json').version);
    assert.notEqual(wrapper, graphviz);
  });

  test('no version of Graphviz is written into the script: it is read, never remembered', async () => {
    const { graphviz, wrapper } = await engineVersion();
    const script = read('scripts/engine-version.mjs');
    assert.ok(!script.includes(graphviz) && !script.includes(wrapper));
    assert.match(script, /graphvizVersion/);
  });

  test('notices that name another version than the engine’s are a problem, said plainly', async () => {
    const { graphviz } = await engineVersion();
    const stale = notices().replaceAll(`Graphviz ${graphviz} `, 'Graphviz 1.0.0 ');
    const found = await problems(cache(), stale);
    assert.equal(found.length, 1);
    assert.match(found[0], new RegExp(`THIRD_PARTY_NOTICES\\.md.*Graphviz ${graphviz.replaceAll('.', '\\.')}`));
  });

  test('the release notes name both versions, and the notices they point to', async () => {
    const { graphviz, wrapper } = await engineVersion();
    const notes = releaseNotes({ graphviz, wrapper });
    assert.match(notes, new RegExp(`Graphviz ${graphviz.replaceAll('.', '\\.')}`));
    assert.match(notes, new RegExp(`@viz-js/viz ${wrapper.replaceAll('.', '\\.')}`));
    assert.match(notes, /THIRD_PARTY_NOTICES\.md/);
    assert.match(notes, /OSV/);
  });
});

describe('the committed advisory cache', () => {
  test('it passes: it was made for this engine, and no advisory in it affects it', async () => {
    assert.deepEqual(await problems(cache()), []);
  });

  test('it says which versions it was made for, what was asked, and when it was last checked', async () => {
    const { graphviz, wrapper } = await engineVersion();
    const c = cache();
    assert.deepEqual(c.queried, { graphviz, '@viz-js/viz': wrapper });
    assert.match(c.checked, /^\d{4}-\d{2}-\d{2}$/);
    assert.deepEqual(c.sources, { graphviz: 'osv+nvd', '@viz-js/viz': 'osv' });
    assert.ok(Array.isArray(c.advisories));
  });

  test('a check older than 14 days warns, and the check itself still passes', () => {
    assert.match(
      staleness({ checked: '2026-10-01' }, '2026-10-16'),
      /15 days.*node scripts\/engine-version\.mjs --refresh/,
    );
    assert.equal(staleness({ checked: '2026-10-01' }, '2026-10-15'), null, 'exactly 14 days is not old');
    assert.equal(staleness({ checked: '2026-10-10' }, '2026-10-10'), null);
    assert.match(staleness({}, '2026-10-10'), /never/);
  });
});

describe('an advisory that affects the engine fails the check', () => {
  test('one for Graphviz, with no range given, is taken to affect the version it was asked about', async () => {
    const found = await problems(withAdvisories(advisory()));
    assert.equal(found.length, 1);
    assert.match(found[0], /CVE-2099-0001/);
    assert.match(found[0], /Graphviz/);
    assert.match(found[0], /a flaw made up for this test/);
  });

  test('one for the package that wraps it fails too, and names the package', async () => {
    const found = await problems(withAdvisories(advisory({ id: 'GHSA-xxxx', package: '@viz-js/viz', source: 'osv' })));
    assert.equal(found.length, 1);
    assert.match(found[0], /GHSA-xxxx/);
    assert.match(found[0], /@viz-js\/viz/);
  });

  test('a range that includes the version fails; one that ended before it, or begins after it, does not', async () => {
    const { graphviz } = await engineVersion();
    const [major] = graphviz.split('.').map(Number);
    const covers = advisory({ ranges: [{ introduced: '0', fixed: `${major + 1}.0.0` }] });
    const ended = advisory({ id: 'CVE-2099-0002', ranges: [{ introduced: '0', fixed: graphviz }] });
    const later = advisory({ id: 'CVE-2099-0003', ranges: [{ introduced: `${major + 1}.0.0` }] });
    assert.equal((await problems(withAdvisories(covers))).length, 1);
    assert.deepEqual(await problems(withAdvisories(ended, later)), []);
  });

  test('a list of affected versions that holds the engine’s fails; one that does not, does not', async () => {
    const { graphviz } = await engineVersion();
    assert.equal((await problems(withAdvisories(advisory({ versions: ['1.0.0', graphviz] })))).length, 1);
    assert.deepEqual(await problems(withAdvisories(advisory({ versions: ['1.0.0', '2.0.0'] }))), []);
  });

  test('a withdrawn advisory is not a flaw', async () => {
    assert.deepEqual(await problems(withAdvisories(advisory({ withdrawn: '2026-01-01T00:00:00Z' }))), []);
  });

  test('a range reads the way semantic versions are ordered, not as text', () => {
    const a = advisory({ ranges: [{ introduced: '2.9.0', last_affected: '16.2.0' }] });
    assert.ok(affects(a, '16.1.0'), '16.1.0 is after 2.9.0 as a number, not as text');
    assert.ok(affects(a, '16.2.0'), 'last_affected includes its own version');
    assert.ok(!affects(a, '16.10.0'));
    assert.ok(!affects(a, '2.8.9'));
  });

  test('every advisory is named, not only the first', async () => {
    const found = await problems(withAdvisories(advisory(), advisory({ id: 'CVE-2099-0009' })));
    assert.equal(found.length, 2);
  });
});

describe('a cache made for another engine is not trusted', () => {
  test('after Graphviz is updated, the check says the cache is stale and how to refresh it', async () => {
    const { graphviz } = await engineVersion();
    const stale = { ...cache(), queried: { ...cache().queried, graphviz: '1.0.0' } };
    const found = await problems(stale);
    assert.equal(found.length, 1);
    assert.match(found[0], /1\.0\.0/);
    assert.match(found[0], new RegExp(graphviz.replaceAll('.', '\\.')));
    assert.match(found[0], /node scripts\/engine-version\.mjs --refresh/);
  });

  test('so is the wrapper’s, and a missing cache', async () => {
    const stale = { ...cache(), queried: { ...cache().queried, '@viz-js/viz': '0.0.1' } };
    assert.equal((await problems(stale)).length, 1);
    assert.equal((await problems(undefined)).length, 1);
  });
});

describe('refreshing from the published advisories (with a fetch made for the purpose)', () => {
  const OSV = 'https://api.osv.dev/v1/query';
  const NVD = 'https://services.nvd.nist.gov/rest/json/cves/2.0';
  const reply = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });
  /** A fetch that answers by address, and keeps what it was asked. */
  const fetching = (answers) => {
    const asked = [];
    const fetch = async (url, init = {}) => {
      asked.push({ url: String(url), body: init.body ? JSON.parse(init.body) : null, method: init.method ?? 'GET' });
      const answer = answers.find((a) => String(url).startsWith(a.at) && (!a.when || a.when(asked.at(-1))));
      if (!answer) throw new Error(`unexpected request to ${url}`);
      return typeof answer.reply === 'function' ? answer.reply(asked.at(-1)) : answer.reply;
    };
    return { fetch, asked };
  };
  const noCves = { at: NVD, reply: reply({ vulnerabilities: [] }) };
  const clean = [{ at: OSV, reply: reply({}) }, noCves];
  /** What NVD answers for one flaw in Graphviz before 17.0.0. */
  const nvdFlaw = (id = 'CVE-2099-7') => ({
    cve: {
      id,
      descriptions: [{ lang: 'en', value: 'a flaw NVD knows' }],
      configurations: [
        {
          nodes: [
            {
              cpeMatch: [
                {
                  vulnerable: true,
                  criteria: 'cpe:2.3:a:graphviz:graphviz:*:*:*:*:*:*:*:*',
                  versionEndExcluding: '17.0.0',
                },
              ],
            },
          ],
        },
      ],
    },
  });
  const ENGINE = { graphviz: '16.1.0', wrapper: '3.31.0' };
  const run = (answers, extra = {}) =>
    refresh({ ...ENGINE, fetch: answers.fetch, today: '2026-10-10', previous: undefined, ...extra });

  test('Graphviz is asked of OSV by its repository and of NVD, and the wrapper of OSV as an npm package', async () => {
    const f = fetching(clean);
    const { cache: made } = await run(f);
    assert.deepEqual(
      f.asked.map((a) => [a.method, a.url.split('?')[0], a.body]),
      [
        [
          'POST',
          OSV,
          { version: '16.1.0', package: { name: 'https://gitlab.com/graphviz/graphviz.git', ecosystem: 'GIT' } },
        ],
        ['GET', NVD, null],
        ['POST', OSV, { version: '3.31.0', package: { name: '@viz-js/viz', ecosystem: 'npm' } }],
      ],
    );
    assert.match(f.asked[1].url, /cpeName=cpe:2\.3:a:graphviz:graphviz:16\.1\.0:/);
    assert.deepEqual(made.queried, { graphviz: '16.1.0', '@viz-js/viz': '3.31.0' });
    assert.deepEqual(made.sources, { graphviz: 'osv+nvd', '@viz-js/viz': 'osv' });
    assert.deepEqual(made.advisories, []);
    assert.equal(made.checked, '2026-10-10');
  });

  test('what OSV lists is kept: its id, aliases, summary, and the versions and ranges it gives', async () => {
    const f = fetching([
      {
        at: OSV,
        when: (a) => a.body.package.ecosystem === 'GIT',
        reply: reply({
          vulns: [
            {
              id: 'CVE-2099-1',
              summary: 'overflow in a parser',
              aliases: ['GHSA-aaaa'],
              affected: [
                { ranges: [{ type: 'GIT', events: [{ introduced: '0' }, { fixed: 'abc123' }] }], versions: ['16.1.0'] },
              ],
            },
          ],
        }),
      },
      {
        at: OSV,
        when: (a) => a.body.package.ecosystem === 'npm',
        reply: reply({
          vulns: [
            {
              id: 'GHSA-bbbb',
              details: 'a longer text\nwith lines',
              affected: [{ ranges: [{ type: 'SEMVER', events: [{ introduced: '3.0.0' }, { fixed: '3.40.0' }] }] }],
            },
          ],
        }),
      },
      noCves,
    ]);
    const { cache: made } = await run(f);
    assert.deepEqual(made.advisories, [
      {
        id: 'CVE-2099-1',
        package: 'graphviz',
        source: 'osv',
        summary: 'overflow in a parser',
        aliases: ['GHSA-aaaa'],
        versions: ['16.1.0'],
      },
      {
        id: 'GHSA-bbbb',
        package: '@viz-js/viz',
        source: 'osv',
        summary: 'a longer text with lines',
        ranges: [{ introduced: '3.0.0', fixed: '3.40.0' }],
      },
    ]);
  });

  test('a long answer is read to its last page', async () => {
    let page = 0;
    const f = fetching([
      {
        at: OSV,
        when: (a) => a.body.package.ecosystem === 'GIT',
        reply: (a) =>
          reply(
            a.body.page_token
              ? { vulns: [{ id: 'CVE-2099-3', summary: 's' }] }
              : { vulns: [{ id: 'CVE-2099-2', summary: 's' }], next_page_token: 'more' },
          ),
      },
      { at: OSV, reply: () => reply({ vulns: [{ id: `GHSA-${++page}`, summary: 's' }] }) },
      noCves,
    ]);
    const { cache: made } = await run(f);
    assert.deepEqual(made.advisories.map((a) => a.id).sort(), ['CVE-2099-2', 'CVE-2099-3', 'GHSA-1']);
  });

  test('a flaw only NVD lists is kept, and fails the check of the engine', async () => {
    const engine = await engineVersion();
    const f = fetching([
      { at: OSV, reply: reply({}) },
      { at: NVD, reply: reply({ vulnerabilities: [nvdFlaw()] }) },
    ]);
    const { cache: made } = await refresh({ ...engine, fetch: f.fetch, today: '2026-10-10' });
    assert.deepEqual(made.sources, { graphviz: 'osv+nvd', '@viz-js/viz': 'osv' });
    assert.deepEqual(made.advisories, [
      {
        id: 'CVE-2099-7',
        package: 'graphviz',
        source: 'nvd',
        summary: 'a flaw NVD knows',
        ranges: [{ introduced: '0', fixed: '17.0.0' }],
      },
    ]);
    const found = await problems(made);
    assert.equal(found.length, 1);
    assert.match(found[0], /CVE-2099-7 affects Graphviz/);
  });

  test('a flaw both list is one advisory, from both, not two', async () => {
    const both = fetching([
      {
        at: OSV,
        when: (a) => a.body.package.ecosystem === 'GIT',
        reply: reply({ vulns: [{ id: 'CVE-2099-7', summary: 'the same flaw', versions: [] }] }),
      },
      { at: OSV, reply: reply({}) },
      { at: NVD, reply: reply({ vulnerabilities: [nvdFlaw()] }) },
    ]);
    const { cache: made } = await run(both);
    assert.equal(made.advisories.length, 1);
    assert.equal(made.advisories[0].source, 'osv+nvd');
    assert.equal(made.advisories[0].id, 'CVE-2099-7');
    assert.equal(
      made.advisories[0].ranges,
      undefined,
      'OSV named it with no range, so it affects the version asked about',
    );
  });

  test('the refresh fails closed: if OSV or NVD cannot answer for Graphviz, or OSV for the wrapper, it says which', async () => {
    const osvDown = fetching([{ at: OSV, reply: reply({}, 503) }, noCves]);
    await assert.rejects(run(osvDown), /Graphviz 16\.1\.0.*OSV answered 503/s);
    const nvdDown = fetching([
      { at: OSV, reply: reply({}) },
      { at: NVD, reply: reply({}, 503) },
    ]);
    await assert.rejects(run(nvdDown), /Graphviz 16\.1\.0.*NVD answered 503/s);
    const both = fetching([
      { at: OSV, reply: reply({}, 500) },
      { at: NVD, reply: reply({}, 503) },
    ]);
    await assert.rejects(run(both), /OSV answered 500.*NVD answered 503/s);
    const half = fetching([
      { at: OSV, when: (a) => a.body.package.ecosystem === 'GIT', reply: reply({}) },
      noCves,
      { at: OSV, reply: reply({}, 500) },
    ]);
    await assert.rejects(run(half), /@viz-js\/viz 3\.31\.0.*OSV/s);
  });

  test('a request that throws is a failure, not an empty answer', async () => {
    const fetch = async () => {
      throw new Error('offline');
    };
    await assert.rejects(refresh({ ...ENGINE, fetch, today: '2026-10-10' }), /offline|OSV/);
  });

  test('the day of the check is always the day of the refresh; whether the answer changed is said apart from it', async () => {
    const first = (await run(fetching(clean))).cache;
    const again = await refresh({ ...ENGINE, fetch: fetching(clean).fetch, today: '2026-11-01', previous: first });
    assert.equal(again.changed, false);
    assert.deepEqual(again.cache, { ...first, checked: '2026-11-01' });
    const news = fetching([{ at: OSV, reply: reply({ vulns: [{ id: 'CVE-2099-5', summary: 's' }] }) }, noCves]);
    const differ = await refresh({ ...ENGINE, fetch: news.fetch, today: '2026-11-01', previous: first });
    assert.equal(differ.changed, true);
    assert.equal(differ.cache.checked, '2026-11-01');
  });
});

describe('watching the published advisories without changing anything', () => {
  const reply = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });
  /** OSV answers `osv` about Graphviz and nothing about the wrapper; NVD answers `nvd`. */
  const answering = (osv, nvd = { vulnerabilities: [] }) => ({
    fetch: async (url, init) => {
      if (String(url).includes('nvd.nist.gov')) return reply(nvd);
      return reply(String(init?.body).includes('"GIT"') ? osv : {});
    },
  });
  const ENGINE = { graphviz: '16.1.0', wrapper: '3.31.0' };
  const committed = () => ({
    queried: { graphviz: '16.1.0', '@viz-js/viz': '3.31.0' },
    sources: { graphviz: 'osv+nvd', '@viz-js/viz': 'osv' },
    checked: '2026-10-01',
    advisories: [],
  });
  const watched = (osv, previous = committed()) =>
    watch({ ...ENGINE, previous, today: '2026-10-10', ...answering(osv) });

  test('an answer that is the same as the committed one is fine, whatever day it is', async () => {
    const r = await watched({});
    assert.deepEqual(r.problems, []);
    assert.equal(r.fresh.checked, '2026-10-10');
  });

  test('an advisory that is new fails, saying what changed and what to do about it', async () => {
    const r = await watched({ vulns: [{ id: 'CVE-2099-5', summary: 'a new flaw' }] });
    assert.equal(r.problems.length, 2);
    const text = r.problems.join('\n');
    assert.match(text, /CVE-2099-5 affects Graphviz 16\.1\.0.*a new flaw/);
    assert.match(text, /have changed since quality\/advisories\.json was committed/);
    assert.match(text, /added: CVE-2099-5/);
    assert.match(
      text,
      /Run node scripts\/engine-version\.mjs --refresh and open a pull request with quality\/advisories\.json/,
    );
  });

  test('an advisory that was withdrawn, so it is gone from the answer, is a change to commit too', async () => {
    const old = {
      ...committed(),
      advisories: [{ id: 'CVE-2099-6', package: 'graphviz', source: 'osv', summary: 's' }],
    };
    const r = await watched({}, old);
    assert.equal(r.problems.length, 1);
    assert.match(r.problems[0], /removed: CVE-2099-6/);
    assert.match(r.problems[0], /--refresh and open a pull request/);
  });

  test('a cache made for another engine is a change too, and the command is the same', async () => {
    const old = { ...committed(), queried: { graphviz: '1.0.0', '@viz-js/viz': '3.31.0' } };
    const r = await watched({}, old);
    assert.equal(r.problems.length, 1);
    assert.match(r.problems[0], /--refresh and open a pull request/);
  });

  test('a service that cannot answer fails the watch, rather than passing it', async () => {
    await assert.rejects(
      watch({ ...ENGINE, previous: committed(), fetch: async () => reply({}, 503) }),
      /OSV answered 503/,
    );
  });
});

describe('no network in the checks', () => {
  /** Runs the script with fetch made to fail, so any request it made would show. */
  const offline = (...args) =>
    spawnSync(
      process.execPath,
      [
        '--import',
        'data:text/javascript,globalThis.fetch=()=>{throw new Error("network used")}',
        'scripts/engine-version.mjs',
        ...args,
      ],
      { cwd: ROOT, encoding: 'utf8' },
    );

  test('the check reads the engine and the cache, exits 0, and says the version', async () => {
    const r = offline();
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /Graphviz \d+\.\d+\.\d+/);
    assert.doesNotMatch(r.stdout + r.stderr, /network used/);
  });

  test('the release notes are written without it too', async () => {
    const file = join(mkdtempSync(join(tmpdir(), 'engine-')), 'notes.md');
    const r = offline('--notes', file);
    assert.equal(r.status, 0, r.stderr);
    assert.match(readFileSync(file, 'utf8'), /Graphviz \d+\.\d+\.\d+/);
  });

  test('a tampered cache fails the command, and names the advisory', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'engine-'));
    const file = join(dir, 'advisories.json');
    writeFileSync(file, JSON.stringify(withAdvisories(advisory())));
    const r = offline('--cache', file);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /CVE-2099-0001/);
  });

  test('only the refresh may reach out: the script’s code above its marked network section has no request in it', () => {
    const script = read('scripts/engine-version.mjs');
    const marker = script.indexOf('// ── Only below this line is the network reached');
    assert.ok(marker > 0, 'the network section is marked');
    const outside = script
      .slice(0, marker)
      .split('\n')
      .filter((l) => !l.trim().startsWith('//'))
      .join('\n');
    assert.doesNotMatch(outside, /\bfetch\b|osv\.dev|nvd\.nist\.gov|https?:\/\//);
    assert.match(script.slice(marker), /osv\.dev/);
  });

  test('the plugin never asks: no shipped source names an advisory service', () => {
    const shipped = ['core', 'graph-spec', 'obsidian'].flatMap((p) => walk(`packages/${p}/src`));
    for (const f of shipped) assert.doesNotMatch(read(f), /osv\.dev|nvd\.nist\.gov/, f);
  });

  test('ordinary CI does not refresh', () => {
    const ci = runCommands(read('.github/workflows/ci.yml'));
    assert.equal(
      ci.some((r) => /engine-version/.test(r) && /--refresh/.test(r)),
      false,
    );
  });
});

describe('the workflows', () => {
  const release = () => read('.github/workflows/release.yml');

  test('the release’s quality job refreshes the advisories, then checks the engine, before the release is made', () => {
    const quality = runCommands(jobs(release()).quality.join('\n'));
    const at = (re) => quality.findIndex((r) => re.test(r));
    const refreshed = at(/^node scripts\/engine-version\.mjs --refresh$/);
    const checked = at(/^node scripts\/engine-version\.mjs$/);
    assert.ok(refreshed >= 0, 'it refreshes');
    assert.ok(checked > refreshed, 'and only then checks, so a known flaw fails the job');
    assert.match(block(jobs(release()).release, 'needs', 4).join('\n'), /\bquality\b/);
  });

  test('the release names the engine in its notes, and the notes are attached', () => {
    const rel = runCommands(jobs(release()).release.join('\n'));
    const notes = rel.findIndex((r) => /^node scripts\/engine-version\.mjs --notes [\w./-]+$/.test(r));
    const create = rel.findIndex((r) => /gh release create/.test(r));
    assert.ok(notes >= 0 && notes < create, 'the notes are written before the release is made');
    const file = /--notes ([\w./-]+)$/.exec(rel[notes])[1];
    assert.match(rel[create], new RegExp(`--notes-file ${file.replace('.', '\\.')}`));
    assert.match(rel[create], /--generate-notes/, 'the generated notes stay');
  });

  test('a read-only workflow, run by hand, watches the advisories live and fails on a change, uploading the new cache', () => {
    const f = '.github/workflows/engine-advisories.yml';
    assert.ok(exists(f));
    const text = read(f);
    const on = block(text.split('\n'), 'on', 0).map(stripComment).join('\n');
    assert.match(on, /workflow_dispatch:/, 'it is run by hand');
    assert.match(on, /schedule:\n\s+- cron: '\d+ \d+ \* \* [0-6]'/, 'it runs weekly, on a set morning');
    assert.doesNotMatch(on, /pull_request|push:/, 'never on a change: the release does its own live check');
    const job = jobs(text);
    assert.deepEqual(Object.keys(job), ['watch']);
    assert.equal(block(job.watch, 'permissions', 4), null, 'the job keeps the read-only default');
    assert.doesNotMatch(text, /:\s*write\b|gh pr create|git push/, 'it opens no pull request and pushes nothing');
    const runs = runCommands(text);
    assert.ok(runs.includes('node scripts/engine-version.mjs --watch --write advisories-fresh.json'));
    assert.ok(runs.includes('npm ci') && runs.includes('npm audit signatures'));
    assert.match(text, /if: always\(\)/, 'the new cache is uploaded even when the watch fails');
    assert.match(text, /actions\/upload-artifact@[0-9a-f]{40} # v\d+\.\d+\.\d+/);
    assert.match(text, /path: advisories-fresh\.json/);
    assert.match(read('.github/dependabot.yml'), /github-actions/, 'its actions are kept up to date like the others');
  });
});
