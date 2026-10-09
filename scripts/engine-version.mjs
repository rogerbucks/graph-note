#!/usr/bin/env node
// Watches the layout engine's version (spec §13, engine_version_watched). The exact Graphviz version is read from the
// engine itself, the WebAssembly build inside @viz-js/viz, never from a package.json. It must be the one the notices
// name, and no published advisory for Graphviz or for @viz-js/viz may affect it, or the release fails.
//
// The advisories are read from a committed cache, quality/advisories.json, so a check runs offline and never touches the
// network; only --refresh asks OSV, and NVD where OSV cannot answer for Graphviz. It runs in the release's quality job
// and in a weekly workflow that opens a pull request with the new cache. The plugin never asks anyone.
//
// Usage:
//   node scripts/engine-version.mjs                   check: the engine, the notices, the cache (offline); exit 1 on a flaw
//   node scripts/engine-version.mjs --refresh         ask OSV (NVD behind it) about this engine and rewrite the cache
//   node scripts/engine-version.mjs --notes <file>    also write the release notes' paragraph on the engine (offline)
//   --cache <file>                                    read or write this cache instead of quality/advisories.json
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
 * True when the advisory affects this version: by a range (from `introduced`, up to but not including `fixed`, or up to
 * and including `last_affected`), by a list of affected versions, or, when it gives neither, because the cache was asked
 * about exactly this version and the service named the advisory. A withdrawn advisory affects nothing.
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
  if (stale.length) return found;
  for (const a of cache.advisories ?? [])
    if (a.package in now && affects(a, now[a.package]))
      found.push(
        `${a.id} affects ${NAMES[a.package]} ${now[a.package]} (${a.source}): ${a.summary}. ` +
          'A release cannot be made until the engine is updated past it.',
      );
  return found;
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

// ── Only below this line is the network reached, and only by --refresh ──

const ABOUT =
  'What OSV (and NVD, where OSV could not answer for Graphviz) publishes against the Graphviz inside @viz-js/viz and against @viz-js/viz, for the versions in "queried". Written by node scripts/engine-version.mjs --refresh, never by hand; the weekly workflow and the release both run it. The check reads this file offline, and fails if it was made for another engine or lists a flaw that affects this one.';
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
 * Asks about this engine and gives the new cache and whether it changed. Graphviz is asked of OSV by its repository, then
 * of NVD if OSV cannot answer; the wrapper is asked of OSV as an npm package. A question no service can answer is an
 * error, never an empty answer: a release is not made on advisories nobody could read. A result no different from
 * `previous` keeps its date, so a weekly refresh finds nothing to propose.
 */
export async function refresh({ graphviz, wrapper, fetch = globalThis.fetch, today, previous }) {
  const sources = {},
    advisories = [];
  try {
    advisories.push(...(await askOsv(fetch, GRAPHVIZ_REPO, graphviz, 'GIT')));
    sources.graphviz = 'osv';
  } catch (osv) {
    try {
      advisories.push(...(await askNvd(fetch, graphviz)));
      sources.graphviz = 'nvd';
    } catch (nvd) {
      throw new Error(
        `could not read the advisories for Graphviz ${graphviz}: OSV: ${osv.message}; NVD: ${nvd.message}`,
      );
    }
  }
  try {
    advisories.push(...(await askOsv(fetch, WRAPPER, wrapper, 'npm')));
    sources[WRAPPER] = 'osv';
  } catch (osv) {
    throw new Error(`could not read the advisories for ${WRAPPER} ${wrapper}: OSV: ${osv.message}`);
  }
  const body = { queried: { graphviz, [WRAPPER]: wrapper }, sources, advisories };
  const kept = previous && { queried: previous.queried, sources: previous.sources, advisories: previous.advisories };
  if (JSON.stringify(kept) === JSON.stringify(body)) return { cache: previous, changed: false };
  return { cache: { about: ABOUT, changed: today ?? new Date().toISOString().slice(0, 10), ...body }, changed: true };
}

async function main(argv) {
  const option = (name) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : undefined);
  const cacheFile = resolve(ROOT, option('--cache') ?? CACHE);
  const engine = await engineVersion();
  if (argv.includes('--refresh')) {
    const { cache, changed } = await refresh({ ...engine, previous: readJSON(cacheFile) });
    if (changed) writeFileSync(cacheFile, `${JSON.stringify(cache, null, 2)}\n`);
    console.log(
      `Graphviz ${engine.graphviz}: ${cache.advisories.length} advisories listed (${changed ? 'the cache changed' : 'no change'})`,
    );
    return 0;
  }
  const notices = readFileSync(join(ROOT, 'THIRD_PARTY_NOTICES.md'), 'utf8');
  const problems = checkEngine({ ...engine, cache: readJSON(cacheFile), notices });
  if (problems.length) {
    console.error(problems.join('\n'));
    return 1;
  }
  if (option('--notes')) writeFileSync(resolve(option('--notes')), releaseNotes(engine));
  console.log(
    `Graphviz ${engine.graphviz} (inside ${WRAPPER} ${engine.wrapper}): named in the notices; no advisory in the cache affects it`,
  );
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) process.exitCode = await main(process.argv.slice(2));
