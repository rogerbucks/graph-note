// The security alerts a release waits on (spec §50, security_release_gate and security_daily). Proved on alerts made for
// the purpose, through a fake GitHub and a fake OSV, so no test reaches the network. Each source's alert takes one shape.
// A list the token may not read is never taken as empty. Each gate lets through only what it should.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  collect,
  fromCodeScanning,
  fromDependabot,
  fromNpmAudit,
  fromSecretScanning,
  gateProblems,
  githubList,
  osvAudit,
  planPage,
  severityOf,
  unplanned,
  uvPackages,
} from '../scripts/security-alerts.mjs';

const json = (body, status = 200) => ({
  ok: status < 400,
  status,
  json: async () => body,
  text: async () => JSON.stringify(body),
});

const CODEQL = {
  number: 7,
  html_url: 'https://github.com/o/r/security/code-scanning/7',
  rule: { id: 'js/xss', description: 'Cross-site scripting', security_severity_level: 'high' },
  most_recent_instance: { location: { path: 'src/view.ts' } },
};
const QUALITY = { number: 8, rule: { id: 'js/unused-local-variable', severity: 'note', tags: ['maintainability'] } };
const DEPENDABOT = {
  number: 3,
  html_url: 'https://github.com/o/r/security/dependabot/3',
  security_advisory: { severity: 'moderate', summary: 'Prototype pollution' },
  dependency: { package: { name: 'lodash' }, manifest_path: 'package-lock.json' },
};
const SECRET = {
  number: 1,
  html_url: 'https://github.com/o/r/security/secret-scanning/1',
  secret_type_display_name: 'GitHub token',
};

/** A fake GitHub: each list path answers with its alerts, or with a status for a list the token may not read. */
const github =
  (lists) =>
  async (url, { headers } = {}) => {
    assert.match(headers.authorization, /^Bearer /);
    const path = new URL(url).pathname.split('/').slice(4, 5)[0];
    const got = lists[path];
    return typeof got === 'number' ? json({ message: 'Resource not accessible by integration' }, got) : json(got ?? []);
  };
const clean = { npm: () => ({ alerts: [] }), osv: async () => ({ alerts: [] }) };

describe('each source gives one shape of alert', () => {
  test('severities from every source fall into four words, and an unknown one counts as high', () => {
    assert.deepEqual(
      ['critical', 'HIGH', 'moderate', 'warning', 'error', 'note', 'low', undefined, 'weird'].map(severityOf),
      ['critical', 'high', 'medium', 'medium', 'high', 'low', 'low', 'high', 'high'],
    );
  });

  test('code scanning keeps security rules and leaves code quality to the ruleset', () => {
    assert.deepEqual(fromCodeScanning(CODEQL), {
      key: 'code-scanning/7',
      severity: 'high',
      title: 'Cross-site scripting',
      url: CODEQL.html_url,
      where: 'src/view.ts',
    });
    assert.equal(fromCodeScanning(QUALITY), null);
  });

  test('a Dependabot alert names its package, and a leaked secret is always critical', () => {
    assert.equal(fromDependabot(DEPENDABOT).key, 'dependabot/3');
    assert.equal(fromDependabot(DEPENDABOT).severity, 'medium');
    assert.match(fromDependabot(DEPENDABOT).title, /^lodash: Prototype pollution$/);
    assert.equal(fromSecretScanning(SECRET).severity, 'critical');
  });

  test('npm audit gives one alert per advisory, and a package that only depends on one adds none', () => {
    const report = {
      vulnerabilities: {
        lodash: { via: [{ url: 'https://github.com/advisories/GHSA-aaaa-bbbb-cccc', severity: 'high', title: 'Bad' }] },
        wrapper: { via: ['lodash'] },
      },
    };
    assert.deepEqual(
      fromNpmAudit(report).map((a) => [a.key, a.severity]),
      [['npm/GHSA-aaaa-bbbb-cccc', 'high']],
    );
  });

  test('the Python lock file gives only the packages pinned from PyPI', () => {
    const lock = [
      'version = 1',
      '[[package]]',
      'name = "lxml"',
      'version = "6.1.3"',
      'source = { registry = "https://pypi.org/simple" }',
      '[[package]]',
      'name = "graph-spec"',
      'version = "0.7.1"',
      'source = { virtual = "." }',
    ].join('\n');
    assert.deepEqual(uvPackages(lock), [{ name: 'lxml', version: '6.1.3' }]);
  });

  test('OSV is asked about each pinned package, and each advisory it knows becomes an alert', async () => {
    const lock = '[[package]]\nname = "lxml"\nversion = "6.1.3"\nsource = { registry = "https://pypi.org/simple" }\n';
    const asked = [];
    const fake = async (url, opts) => {
      asked.push(url);
      if (url.endsWith('/querybatch')) {
        assert.deepEqual(JSON.parse(opts.body).queries, [
          { package: { name: 'lxml', ecosystem: 'PyPI' }, version: '6.1.3' },
        ]);
        return json({ results: [{ vulns: [{ id: 'GHSA-xxxx-yyyy-zzzz' }] }] });
      }
      return json({ id: 'GHSA-xxxx-yyyy-zzzz', summary: 'XXE', database_specific: { severity: 'CRITICAL' } });
    };
    const { alerts } = await osvAudit({ fetch: fake, lock });
    assert.deepEqual(
      alerts.map((a) => [a.key, a.severity, a.title]),
      [['osv/GHSA-xxxx-yyyy-zzzz', 'critical', 'lxml 6.1.3: XXE']],
    );
    assert.equal(asked.length, 2);
  });
});

describe('reading the lists', () => {
  test('a list the token may not read is named as not read, never taken as empty', async () => {
    assert.deepEqual(await githubList('/repos/o/r/dependabot/alerts', ''), { unread: 'no token' });
    const got = await githubList('/repos/o/r/dependabot/alerts', 't', { fetch: github({ dependabot: 403 }) });
    assert.match(got.unread, /^403/);
  });

  test('every page of a long list is read', async () => {
    let pages = 0;
    const fake = async (url) => {
      pages++;
      const page = Number(new URL(url).searchParams.get('page'));
      return json(page === 1 ? Array.from({ length: 100 }, (_, i) => ({ number: i })) : [{ number: 100 }]);
    };
    const { alerts } = await githubList('/repos/o/r/code-scanning/alerts?state=open', 't', { fetch: fake });
    assert.equal(alerts.length, 101);
    assert.equal(pages, 2);
  });

  test('the read-only alerts token reads Dependabot and secret scanning; the workflow token reads code scanning', async () => {
    const used = {};
    const fake = async (url, { headers }) => {
      used[new URL(url).pathname.split('/')[4]] = headers.authorization;
      return json([]);
    };
    await collect({ repo: 'o/r', token: 'wf', alertsToken: 'ro', fetch: fake, ...clean });
    assert.deepEqual(used, {
      'code-scanning': 'Bearer wf',
      dependabot: 'Bearer ro',
      'secret-scanning': 'Bearer ro',
    });
  });

  test('without the alerts token, Dependabot is tried with the workflow token, and the lock files are still checked', async () => {
    const found = await collect({
      repo: 'o/r',
      token: 'wf',
      alertsToken: '',
      fetch: github({ 'code-scanning': [CODEQL, QUALITY], dependabot: 403, 'secret-scanning': 403 }),
      npm: () => ({ alerts: [{ key: 'npm/GHSA-1', severity: 'low', title: 't', url: 'u', where: '' }] }),
      osv: async () => ({ alerts: [] }),
    });
    assert.deepEqual(
      found.alerts.map((a) => a.key),
      ['code-scanning/7', 'npm/GHSA-1'],
    );
    assert.deepEqual(found.read, ['code scanning', 'npm audit', 'OSV (Python)']);
    assert.deepEqual(Object.keys(found.unread), ['dependabot', 'secret scanning']);
  });
});

describe('the gates', () => {
  const a = (key, severity) => ({ key, severity, title: key, url: `https://x/${key}`, where: '' });
  const found = (alerts, unread = {}) => ({ alerts, read: ['code scanning'], unread });

  test('a stable release stops on an open alert of any severity, naming it and whether it is planned', () => {
    const register = { risks: [{ id: 'SEC-30', alerts: ['dependabot/2'], decision: 'fix-now', status: 'open' }] };
    const { problems } = gateProblems(
      found([a('code-scanning/1', 'low'), a('dependabot/2', 'high')]),
      'release',
      register,
    );
    assert.equal(problems.length, 2);
    assert.match(problems[0], /code-scanning\/1 \(low\).*not yet in the risk register/);
    assert.match(problems[1], /dependabot\/2 \(high\).*planned in SEC-30/);
  });

  test('a nightly stops only on high and critical alerts, and warns of the rest', () => {
    const got = gateProblems(
      found([a('npm/A', 'critical'), a('npm/B', 'high'), a('npm/C', 'medium'), a('npm/D', 'low')]),
      'nightly',
    );
    assert.deepEqual(
      got.problems.map((p) => p.split(' ')[0]),
      ['npm/A', 'npm/B'],
    );
    assert.equal(got.warnings.length, 2);
  });

  test('an alert the owner accepted in the register is let through, with the risk named', () => {
    const register = {
      risks: [{ id: 'SEC-31', alerts: ['npm/A'], decision: 'accept', status: 'accepted', accepted_by: 'Roger' }],
    };
    const got = gateProblems(found([a('npm/A', 'high')]), 'release', register);
    assert.deepEqual(got.problems, []);
    assert.match(got.warnings[0], /accepted in SEC-31/);
  });

  test('code scanning not read stops a stable release; any other list not read is a warning', () => {
    const unread = { 'code scanning': '403', dependabot: '403' };
    const release = gateProblems(found([], unread), 'release');
    assert.equal(release.problems.length, 1);
    assert.match(release.problems[0], /code scanning was not read.*security-events: read/);
    assert.match(release.warnings[0], /dependabot was not read/);
    assert.deepEqual(gateProblems(found([], unread), 'nightly').problems, []);
  });

  test('nothing open and every list read lets both gates go', () => {
    assert.deepEqual(gateProblems(found([]), 'release'), { problems: [], warnings: [] });
    assert.deepEqual(gateProblems(found([]), 'nightly'), { problems: [], warnings: [] });
  });
});

describe('the page for the daily issue', () => {
  const a = (key, severity) => ({ key, severity, title: `t ${key}`, url: `https://x/${key}`, where: 'f.js' });

  test('lists the open alerts worst first, each planned or not, and what was not read', () => {
    const register = { risks: [{ id: 'SEC-40', alerts: ['npm/B'] }] };
    const page = planPage(
      { alerts: [a('npm/A', 'low'), a('npm/B', 'critical')], read: ['npm audit'], unread: { dependabot: '403' } },
      register,
    );
    const rows = page.split('\n').filter((l) => l.startsWith('| ['));
    assert.match(rows[0], /npm\/B.*critical.*SEC-40/);
    assert.match(rows[1], /npm\/A.*low.*\*\*not yet\*\*/);
    assert.match(page, /## Not read\n\n- dependabot: 403/);
    assert.match(page, /SECURITY_ALERTS_TOKEN/);
    assert.match(page, /prevented_by/);
  });

  test('names each alert by key, severity and link alone, as the issue and the logs are public', () => {
    const page = planPage({
      alerts: [{ ...a('code-scanning/9', 'high'), title: 'SQL injection', where: 'src/db.ts' }],
      read: [],
      unread: {},
    });
    assert.doesNotMatch(page, /SQL injection|src\/db\.ts/);
    const { problems } = gateProblems(
      { alerts: [{ ...a('code-scanning/9', 'high'), title: 'SQL injection', where: 'src/db.ts' }], unread: {} },
      'release',
    );
    assert.doesNotMatch(problems.join('\n'), /SQL injection|src\/db\.ts/);
    assert.match(problems[0], /^code-scanning\/9 \(high\) https:\/\/x\/code-scanning\/9/);
  });

  test('the alerts not yet planned are those no register risk names', () => {
    const register = { risks: [{ id: 'SEC-40', alerts: ['npm/B'] }] };
    assert.deepEqual(
      unplanned({ alerts: [a('npm/A', 'low'), a('npm/B', 'high')] }, register).map((x) => x.key),
      ['npm/A'],
    );
  });

  test('is empty when nothing is open and every list was read, so the issue closes', () => {
    assert.equal(planPage({ alerts: [], read: ['code scanning'], unread: {} }), '');
  });
});
