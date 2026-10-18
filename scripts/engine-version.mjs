#!/usr/bin/env node
// Watches the layout engine's version (spec §13, engine_version_watched). The exact Graphviz version is read from the
// engine itself, the WebAssembly build inside @viz-js/viz, never from a package.json. It must be the one the notices
// name, and no published advisory for Graphviz or for @viz-js/viz may affect it, or the release fails.
//
// The advisories are read from a committed cache, quality/advisories.json, so a check runs offline and never touches the
// network. Only --refresh and --watch ask: OSV and NVD for Graphviz, answers merged, and OSV for the package that wraps
// it. --refresh runs in the release's quality job. --watch, read-only, runs in a workflow that is run by hand. It
// fails when the published advisories differ from the cache, so someone refreshes it in a pull request. The plugin
// never asks.
//
// Usage:
//   node scripts/engine-version.mjs                  check: the engine, the notices, the cache (offline);
//                                                    exit 1 on a flaw.
//   node scripts/engine-version.mjs --refresh        ask about this engine and rewrite the cache.
//   node scripts/engine-version.mjs --watch [--write <file>]
//                                                    ask, change nothing; exit 1 if the answer is not the cache.
//   node scripts/engine-version.mjs --notes <file>   also write the release notes' paragraph on the engine (offline).
//   --cache <file>                                   read or write this cache instead of quality/advisories.json.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const CACHE = 'quality/advisories.json';
const WRAPPER = '@viz-js/viz';
const NAMES = { graphviz: 'Graphviz', [WRAPPER]: WRAPPER };

/** The Graphviz version the bundled engine reports, and the version of the package that wraps it. */
export async function engineVersion() {
  const { instance } = await import('@viz-js/viz');
  const viz = await instance();
  const wrapper = JSON.parse(readFileSync(join(ROOT, 'node_modules', WRAPPER, 'package.json'), 'utf8')).version;
  return { graphviz: viz.graphvizVersion, wrapper };
}

const parts = (v) => v.split(/[.+-]/).map((p) => (/^\d+$/.test(p) ? Number(p) : 0));

/** Orders two versions as numbers, part by part: negative when a is before b. */
function order(a, b) {
  const [x, y] = [parts(a), parts(b)];
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) - (y[i] ?? 0);
  }
  return 0;
}

/**
 * True when the advisory affects this version, in one of three ways:
 * - by a range: from `introduced`, up to but not including `fixed`, or up to and including `last_affected`;
 * - by a list of affected versions;
 * - when it gives neither, because the cache was asked about exactly this version and the service named the advisory.
 * A withdrawn advisory affects nothing.
 */
export function affects(advisory, version) {
  if (advisory.withdrawn) return false;
  const ranges = advisory.ranges ?? [],
    versions = advisory.versions ?? [];
  if (!ranges.length && !versions.length) return true;
  const inside = (r) => {
    if (order(version, r.introduced ?? '0') < 0) return false;
    if (r.fixed) return order(version, r.fixed) < 0;
    return r.last_affected ? order(version, r.last_affected) <= 0 : true;
  };
  return versions.includes(version) || ranges.some(inside);
}

/** What is wrong, in words, with this engine, these notices and this cache: nothing when the list is empty. */
export function checkEngine({ graphviz, wrapper, cache, notices }) {
  const found = [];
  const listed = new RegExp(`^\\s*- Graphviz ${graphviz.replaceAll('.', '\\.')} — `, 'm');
  if (!listed.test(notices))
    found.push(
      `THIRD_PARTY_NOTICES.md does not name Graphviz ${graphviz}, the version inside the engine: ` +
        `re-check what ${WRAPPER} ${wrapper} compiles in, update licences/bundled.json, and run node scripts/notices.mjs`,
    );
  if (!notices.includes(`## ${WRAPPER}@${wrapper}`))
    found.push(`THIRD_PARTY_NOTICES.md does not name ${WRAPPER}@${wrapper}, the package that wraps the engine`);
  if (!cache) return [...found, `${CACHE} is missing: run node scripts/engine-version.mjs --refresh`];
  const now = { graphviz, [WRAPPER]: wrapper };
  const stale = Object.entries(now).filter(([name, v]) => cache.queried?.[name] !== v);
  for (const [name, v] of stale)
    found.push(
      `${CACHE} was made for ${NAMES[name]} ${cache.queried?.[name] ?? 'nothing'}, but the engine has ${v}: ` +
        'run node scripts/engine-version.mjs --refresh',
    );
  return stale.length ? found : [...found, ...flaws(cache, now)];
}

/** The advisories in a cache that affect these versions (by package name), each said in words. */
function flaws(cache, now) {
  return (cache.advisories ?? [])
    .filter((a) => a.package in now && affects(a, now[a.package]))
    .map(
      (a) =>
        `${a.id} affects ${NAMES[a.package]} ${now[a.package]} (${a.source}): ${a.summary}. ` +
        'A release cannot be made until the engine is updated past it.',
    );
}

const STALE_DAYS = 14;

/** A warning when the cache was last checked more than 14 days before `today` (YYYY-MM-DD), or never; else null. */
export function staleness(cache, today = new Date().toISOString().slice(0, 10)) {
  if (!cache?.checked)
    return `${CACHE} says nothing of when it was checked: it was never checked, so run node scripts/engine-version.mjs --refresh`;
  const days = Math.floor((Date.parse(today) - Date.parse(cache.checked)) / 864e5);
  return days > STALE_DAYS
    ? `${CACHE} was last checked ${days} days ago (${cache.checked}): run node scripts/engine-version.mjs --refresh`
    : null;
}

/** The release notes' paragraph on the engine: what it is, and that the advisories for it were checked. */
export function releaseNotes({ graphviz, wrapper }) {
  return [
    '## Layout engine',
    '',
    `- Graphviz ${graphviz}, read from the engine itself (inside ${WRAPPER} ${wrapper}) when this release was built.`,
    `- Checked against the published advisories for Graphviz and for ${WRAPPER} (OSV, with NVD behind it) by this release’s quality job: none is known to affect either.`,
    '- Its licence, and where its source is, are in THIRD_PARTY_NOTICES.md.',
    '',
  ].join('\n');
}

const readJSON = (file) => {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return undefined;
  }
};

// ── Only below this line is the network reached, and only by --refresh and --watch ──

const ABOUT =
  'What OSV and NVD publish against the Graphviz inside @viz-js/viz (both are asked, and their answers merged), and what OSV publishes against @viz-js/viz, for the versions in "queried", as of "checked". Written by node scripts/engine-version.mjs --refresh, never by hand; the release runs it, and the Engine advisories workflow watches for a change. The check reads this file offline, and fails if it was made for another engine or lists a flaw that affects this one.';
const GRAPHVIZ_REPO = 'https://gitlab.com/graphviz/graphviz.git';

const flat = (text) =>
  String(text ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 240);

/** The ranges an OSV record gives in versions (semantic or ecosystem), as { introduced, fixed | last_affected }. */
function osvRanges(vuln) {
  const out = [];
  for (const a of vuln.affected ?? []) {
    for (const r of a.ranges ?? []) {
      if (r.type === 'GIT') continue; // commits, which a version cannot be read against
      let open;
      for (const e of r.events ?? []) {
        if ('introduced' in e) {
          if (open) out.push(open);
          open = { introduced: e.introduced };
        } else if (open && ('fixed' in e || 'last_affected' in e)) {
          out.push({ ...open, ...('fixed' in e ? { fixed: e.fixed } : { last_affected: e.last_affected }) });
          open = undefined;
        }
      }
      if (open) out.push(open);
    }
  }
  return out;
}

function fromOsv(vuln, name, version) {
  const ranges = osvRanges(vuln);
  // a list of tags can run to hundreds; only the one asked about says anything here
  const versions = (vuln.affected ?? []).flatMap((a) => a.versions ?? []).filter((v) => v === version);
  return {
    id: vuln.id,
    package: name,
    source: 'osv',
    summary: flat(vuln.summary ?? vuln.details),
    ...(vuln.aliases?.length && { aliases: vuln.aliases }),
    ...(versions.length && { versions: [...new Set(versions)] }),
    ...(ranges.length && { ranges }),
    ...(vuln.withdrawn && { withdrawn: vuln.withdrawn }),
  };
}

/** Every vulnerability OSV lists for one package at one version, across its pages. */
async function askOsv(fetch, name, version, ecosystem) {
  const found = [];
  let token;
  do {
    const res = await fetch('https://api.osv.dev/v1/query', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ version, package: { name, ecosystem }, ...(token && { page_token: token }) }),
    });
    if (!res.ok) throw new Error(`OSV answered ${res.status}`);
    const page = await res.json();
    found.push(...(page.vulns ?? []));
    token = page.next_page_token;
  } while (token);
  return found.map((v) => fromOsv(v, name === GRAPHVIZ_REPO ? 'graphviz' : name, version));
}

/** Every CVE NVD lists against Graphviz at this version (NVD reads the version in the CPE name itself). */
async function askNvd(fetch, version) {
  const cpe = `cpe:2.3:a:graphviz:graphviz:${version}:*:*:*:*:*:*:*`;
  const res = await fetch(`https://services.nvd.nist.gov/rest/json/cves/2.0?cpeName=${cpe}`);
  if (!res.ok) throw new Error(`NVD answered ${res.status}`);
  return ((await res.json()).vulnerabilities ?? []).map(({ cve }) => {
    const ranges = (cve.configurations ?? [])
      .flatMap((c) => c.nodes ?? [])
      .flatMap((n) => n.cpeMatch ?? [])
      .filter((m) => m.vulnerable && /:graphviz:graphviz:/.test(m.criteria))
      .map((m) => ({
        introduced: m.versionStartIncluding ?? '0',
        ...(m.versionEndExcluding && { fixed: m.versionEndExcluding }),
        ...(m.versionEndIncluding && { last_affected: m.versionEndIncluding }),
      }))
      .filter((r) => r.fixed || r.last_affected);
    return {
      id: cve.id,
      package: 'graphviz',
      source: 'nvd',
      summary: flat(cve.descriptions?.find((d) => d.lang === 'en')?.value),
      ...(ranges.length && { ranges }),
    };
  });
}

/**
 * Two entries for one flaw (the same id, or one the other names as an alias, for the same package) are one, from both
 * services. If either named it with no version or range, the merged one has none, so it affects the version asked about.
 */
function merge(list) {
  const out = [];
  const open = (x) => !x.ranges?.length && !x.versions?.length;
  const same = (x, y) =>
    x.package === y.package && (x.id === y.id || x.aliases?.includes(y.id) || y.aliases?.includes(x.id));
  for (const a of list) {
    const at = out.findIndex((x) => same(x, a));
    if (at < 0) {
      out.push(a);
      continue;
    }
    const had = out[at];
    const { ranges: _r, versions: _v, ...rest } = had;
    const joined = { ...rest, source: [...new Set([...had.source.split('+'), ...a.source.split('+')])].join('+') };
    if (!open(had) && !open(a)) {
      const union = (key) => [
        ...new Map([...(had[key] ?? []), ...(a[key] ?? [])].map((v) => [JSON.stringify(v), v])).values(),
      ];
      if (union('ranges').length) joined.ranges = union('ranges');
      if (union('versions').length) joined.versions = union('versions');
    }
    out[at] = joined;
  }
  return out;
}

/** What a service said when it could not answer, or null when it answered. */
const failure = async (name, ask) => {
  try {
    return { found: await ask() };
  } catch (e) {
    return { error: `${name}: ${e.message}` };
  }
};

/**
 * Asks about this engine and gives the new cache and whether the answer changed from `previous` (its date apart).
 * Graphviz is asked of OSV by its repository and of NVD, and the two answers merged. The wrapper is asked of OSV as an
 * npm package. A question any service cannot answer is an error, never an empty answer. A release is not made on
 * advisories nobody could read.
 */
export async function refresh({ graphviz, wrapper, fetch = globalThis.fetch, today, previous }) {
  const osv = await failure('OSV', () => askOsv(fetch, GRAPHVIZ_REPO, graphviz, 'GIT'));
  const nvd = await failure('NVD', () => askNvd(fetch, graphviz));
  const errors = [osv.error, nvd.error].filter(Boolean);
  if (errors.length) throw new Error(`could not read the advisories for Graphviz ${graphviz}: ${errors.join('; ')}`);
  const npm = await failure('OSV', () => askOsv(fetch, WRAPPER, wrapper, 'npm'));
  if (npm.error) throw new Error(`could not read the advisories for ${WRAPPER} ${wrapper}: ${npm.error}`);
  const body = {
    queried: { graphviz, [WRAPPER]: wrapper },
    sources: { graphviz: 'osv+nvd', [WRAPPER]: 'osv' },
    advisories: [...merge([...osv.found, ...nvd.found]), ...npm.found],
  };
  const kept = previous && { queried: previous.queried, sources: previous.sources, advisories: previous.advisories };
  const checked = today ?? new Date().toISOString().slice(0, 10);
  return { cache: { about: ABOUT, checked, ...body }, changed: JSON.stringify(kept) !== JSON.stringify(body) };
}

const ids = (cache) => new Set((cache?.advisories ?? []).map((a) => a.id));

/**
 * Asks the services as `refresh` does, and holds the answer against the committed cache, changing nothing. Gives the
 * problems, in words (empty when the answer is the committed one and no advisory affects the engine), and the fresh cache.
 */
export async function watch({ graphviz, wrapper, fetch, previous, today }) {
  const { cache: fresh, changed } = await refresh({ graphviz, wrapper, fetch, today, previous });
  const problems = flaws(fresh, { graphviz, [WRAPPER]: wrapper });
  if (changed) {
    const [before, now] = [ids(previous), ids(fresh)];
    const said = [
      `added: ${[...now].filter((i) => !before.has(i)).join(', ') || 'none'}`,
      `removed: ${[...before].filter((i) => !now.has(i)).join(', ') || 'none'}`,
    ];
    if (!previous || previous.queried?.graphviz !== graphviz || previous.queried?.[WRAPPER] !== wrapper)
      said.push(`${CACHE} was made for another engine than this one`);
    problems.push(
      `The published advisories for the layout engine have changed since ${CACHE} was committed (${said.join('; ')}). ` +
        `Run node scripts/engine-version.mjs --refresh and open a pull request with ${CACHE}.`,
    );
  }
  return { problems, fresh };
}

async function main(argv) {
  const option = (name) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : undefined);
  const cacheFile = resolve(ROOT, option('--cache') ?? CACHE);
  const engine = await engineVersion();
  if (argv.includes('--refresh')) {
    const { cache, changed } = await refresh({ ...engine, previous: readJSON(cacheFile) });
    writeFileSync(cacheFile, `${JSON.stringify(cache, null, 2)}\n`);
    console.log(
      `Graphviz ${engine.graphviz}: ${cache.advisories.length} advisories listed (${changed ? 'the answer changed' : 'no change'})`,
    );
    return 0;
  }
  if (argv.includes('--watch')) {
    // read-only: the committed cache is never written; --write puts the fresh one elsewhere, to be uploaded
    const { problems, fresh } = await watch({ ...engine, previous: readJSON(cacheFile) });
    if (option('--write')) writeFileSync(resolve(option('--write')), `${JSON.stringify(fresh, null, 2)}\n`);
    if (problems.length) {
      console.error(problems.join('\n'));
      return 1;
    }
    console.log(`Graphviz ${engine.graphviz}: the published advisories are the committed ones, and none affects it`);
    return 0;
  }
  const notices = readFileSync(join(ROOT, 'THIRD_PARTY_NOTICES.md'), 'utf8');
  const cache = readJSON(cacheFile);
  const problems = checkEngine({ ...engine, cache, notices });
  if (problems.length) {
    console.error(problems.join('\n'));
    return 1;
  }
  const old = staleness(cache);
  if (old) console.error(`warning: ${old}`);
  if (option('--notes')) writeFileSync(resolve(option('--notes')), releaseNotes(engine));
  console.log(
    `Graphviz ${engine.graphviz} (inside ${WRAPPER} ${engine.wrapper}): named in the notices; no advisory in the cache affects it`,
  );
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) process.exitCode = await main(process.argv.slice(2));
