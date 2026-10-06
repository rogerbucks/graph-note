// The content check: refuses, before every commit and again in CI, files that
// look confidential or personal. Spec §13: no vault content above Public, and
// confidential or personal content refused, from general patterns only.
//
// The samples below are assembled at run time from parts, so this file never
// holds a line that looks like the real thing — the check runs over this file
// too, and a sample in plain form would be refused like any other.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, chmodSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { findProblems } from '../scripts/check-classification.mjs';
import { ROOT, path } from './lib/repo.js';

// ── Samples, built from parts ──
const classified = (level) => ['---', `${'classi'}${'fication'}: ${level}`, '---', '', '# A note'].join('\n');
const uuidLine = (quote = '"') => `${'uu'}${'id'}: ${quote}${randomUUID()}${quote}`;
const homePath = (...parts) => ['', ...parts].join('/');
const email = (local, domain) => [local, domain].join('@');
const luhnComplete = (body) => {
  const digits = [...body].map(Number).reverse();
  const sum = digits.reduce((s, d, i) => s + (i % 2 === 0 ? (d * 2 > 9 ? d * 2 - 9 : d * 2) : d), 0);
  return body + ((10 - (sum % 10)) % 10);
};
const card = luhnComplete(['4111', '1111', '1111', '111'].join(''));
const groups = (s, sep) => s.match(/.{1,4}/g).join(sep);
const notLuhn = card.slice(0, -1) + ((Number(card.at(-1)) + 1) % 10);

const rules = (text) => findProblems(text).map((p) => p.rule);

describe('what the check refuses', () => {
  test('a classification other than Public', () => {
    assert.deepEqual(rules(classified('Own')), ['classification']);
    assert.deepEqual(rules(classified('Confidential')), ['classification']);
    assert.deepEqual(rules(classified('"Personal"')), ['classification']);
  });

  test('a note uuid line', () => {
    assert.deepEqual(rules(uuidLine()), ['vault-uuid']);
    assert.deepEqual(rules(uuidLine('')), ['vault-uuid']);
    assert.deepEqual(rules(`  ${uuidLine("'")}`), ['vault-uuid']);
  });

  test('an absolute home-folder path', () => {
    assert.deepEqual(rules(`see ${homePath('Users', 'alex', 'notes', 'a.md')}`), ['home-path']);
    assert.deepEqual(rules(`"${homePath('home', 'alex', 'work')}"`), ['home-path']);
    assert.deepEqual(rules(['C:', 'Users', 'alex', 'notes'].join('\\')), ['home-path']);
    assert.deepEqual(rules(`file://${homePath('Users', 'alex', 'x')}`), ['home-path']);
  });

  test('a personal email address', () => {
    assert.deepEqual(rules(`mail ${email('someone', 'gmail.com')} today`), ['email']);
    assert.deepEqual(rules(email('a.person', 'company.co.uk')), ['email']);
  });

  test('a phone number', () => {
    for (const phone of [
      ['+44', '7700', '900123'].join(' '),
      ['+1', '(555)', '123-4567'].join(' '),
      ['(555)', '123-4567'].join(' '),
      ['555', '123', '4567'].join('-'),
      ['07700', '900123'].join(' '),
    ]) assert.deepEqual(rules(`call ${phone}`), ['phone'], phone);
  });

  test('a card number', () => {
    assert.deepEqual(rules(`card ${card}`), ['card']);
    assert.deepEqual(rules(`card ${groups(card, ' ')}`), ['card']);
    assert.deepEqual(rules(`card ${groups(card, '-')}`), ['card']);
  });

  test('each problem gives its line', () => {
    const [p] = findProblems(['one', 'two', `x ${email('someone', 'gmail.com')}`].join('\n'));
    assert.equal(p.line, 3);
  });
});

describe('what the check lets through', () => {
  test('a Public classification', () => {
    assert.deepEqual(rules(classified('Public')), []);
    assert.deepEqual(rules(classified('"Public"')), []);
  });

  test('uuids that are not a note uuid line', () => {
    assert.deepEqual(rules(`const id = '${randomUUID()}';`), []);
  });

  test('paths that are not in a home folder', () => {
    assert.deepEqual(rules('/usr/local/bin/node and ~/dev/graph-note and src/Users/list.ts'), []);
  });

  test('example, no-reply and package addresses', () => {
    assert.deepEqual(rules(email('dev', 'example.com')), []);
    assert.deepEqual(rules(email('someone', 'users.noreply.github.com')), []);
    assert.deepEqual(rules(email('noreply', 'anthropic.com')), []);
    assert.deepEqual(rules(email('git', 'github.com')), []);
    assert.deepEqual(rules('npm install @viz-js/viz@3.31.0 eslint@9.39.5'), []);
  });

  test('dates, versions, times, counts and hashes', () => {
    assert.deepEqual(rules('2026-10-07 at 12:30, version 10.11.0, 1167/1167 passed, 192.168.1.1'), []);
    assert.deepEqual(rules('sha512-Kx7Q1234567890123456789/abc+def== and 3d3c42e5aac5ba805825da76410c181273ba90b1'), []);
  });

  test('a long number that fails the card checksum', () => {
    assert.deepEqual(rules(`id ${notLuhn}`), []);
  });
});

describe('what the check reports', () => {
  test('it names the rule and line but never echoes the value', () => {
    const value = email('someone', 'gmail.com');
    const r = spawnSync(process.execPath, [path('scripts/check-classification.mjs'), '--stdin', 'notes.md'], {
      input: `x\n${value}\n`, encoding: 'utf8',
    });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /notes\.md:2/);
    assert.match(r.stderr, /email/);
    assert.doesNotMatch(r.stderr + r.stdout, new RegExp(value.replace('.', '\\.')));
  });
});

describe('the hook and the whole-repository check', () => {
  const git = (cwd, ...args) => spawnSync('git', ['-c', 'user.name=Test', '-c', `user.email=${email('test', 'example.com')}`, ...args], { cwd, encoding: 'utf8' });

  function scratchRepo() {
    const dir = mkdtempSync(join(tmpdir(), 'graph-note-hook-'));
    git(dir, 'init', '-q');
    mkdirSync(join(dir, 'scripts'));
    mkdirSync(join(dir, '.githooks'));
    copyFileSync(path('scripts/check-classification.mjs'), join(dir, 'scripts/check-classification.mjs'));
    copyFileSync(path('.githooks/pre-commit'), join(dir, '.githooks/pre-commit'));
    chmodSync(join(dir, '.githooks/pre-commit'), 0o755);
    git(dir, 'config', 'core.hooksPath', '.githooks');
    return dir;
  }

  test('the pre-commit hook refuses a staged file classified above Public', (t) => {
    const dir = scratchRepo();
    t.after(() => rmSync(dir, { recursive: true, force: true }));
    writeFileSync(join(dir, 'note.md'), classified('Own'));
    git(dir, 'add', 'note.md');
    const r = git(dir, 'commit', '-q', '-m', 'add a note');
    assert.notEqual(r.status, 0, 'the commit is refused');
    assert.match(r.stderr, /note\.md:2/);
    assert.equal(git(dir, 'rev-parse', '--verify', '-q', 'HEAD').status, 1, 'nothing was committed');
  });

  test('the pre-commit hook lets a Public file through', (t) => {
    const dir = scratchRepo();
    t.after(() => rmSync(dir, { recursive: true, force: true }));
    writeFileSync(join(dir, 'note.md'), classified('Public'));
    git(dir, 'add', '.');
    const r = git(dir, 'commit', '-q', '-m', 'add a note');
    assert.equal(r.status, 0, r.stderr);
  });

  test('the hook checks what is staged, not the working copy', (t) => {
    const dir = scratchRepo();
    t.after(() => rmSync(dir, { recursive: true, force: true }));
    writeFileSync(join(dir, 'note.md'), classified('Own'));
    git(dir, 'add', 'note.md');
    writeFileSync(join(dir, 'note.md'), classified('Public'));
    assert.notEqual(git(dir, 'commit', '-q', '-m', 'add a note').status, 0);
  });

  test('--all refuses a committed file, as CI runs it', (t) => {
    const dir = scratchRepo();
    t.after(() => rmSync(dir, { recursive: true, force: true }));
    writeFileSync(join(dir, 'note.md'), `call ${['+44', '7700', '900123'].join(' ')}\n`);
    git(dir, 'add', '.');
    git(dir, 'commit', '-q', '--no-verify', '-m', 'skipped the hook');
    const r = spawnSync(process.execPath, ['scripts/check-classification.mjs', '--all'], { cwd: dir, encoding: 'utf8' });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /note\.md:1.*phone/);
  });

  test('this repository passes its own check', () => {
    const r = spawnSync(process.execPath, ['scripts/check-classification.mjs', '--all'], { cwd: ROOT, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
  });

  test('binary files are skipped', (t) => {
    const dir = scratchRepo();
    t.after(() => rmSync(dir, { recursive: true, force: true }));
    writeFileSync(join(dir, 'image.bin'), Buffer.concat([Buffer.from([0, 1, 2]), Buffer.from(classified('Own'))]));
    git(dir, 'add', '.');
    assert.equal(git(dir, 'commit', '-q', '-m', 'binary').status, 0);
  });
});
