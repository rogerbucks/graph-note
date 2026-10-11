// The test vault: an Obsidian vault in the repository, test-vault/, where each build is tried before it is promoted.
// It holds dummy notes only, each tied to the requirements it exercises, and the two settings that make it a vault with
// the plugin on. Nothing Obsidian writes as it runs, and no plugin build, is ever committed, and every session in it
// starts and ends with the vault restored to what is committed. Spec §13, tried first in a test vault.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { auditRequirements, REQUIREMENTS } from '../scripts/check-requirements.mjs';
import { exists, read, readJSON, path, notIgnored, ROOT } from './repository/repo.js';

const VAULT = 'test-vault';
const GUIDE = `${VAULT}/GUIDE.md`;
/** The device check notes' folder (test/device-check-notes.test.js holds them to the device checklist). */
const DEVICE_CHECKS = `${VAULT}/Device checks/`;
const KEPT = [`${VAULT}/.obsidian/app.json`, `${VAULT}/.obsidian/community-plugins.json`];
const PLUGIN_FILES = ['main.js', 'manifest.json', 'styles.css'];

/** The guide's map: each note, and the requirement ids it exercises. */
const guideMap = () =>
  new Map(
    [...read(GUIDE).matchAll(/^- `([^`]+\.md)` — .*Requirements: ([\w, ]+)\.$/gm)].map((m) => [
      m[1],
      m[2].split(',').map((s) => s.trim()),
    ]),
  );
const requirementIds = () => new Set([...read(REQUIREMENTS).matchAll(/^\((\w+):Requirement \{/gm)].map((m) => m[1]));

describe('the test vault holds dummy notes, each tied to what it exercises', () => {
  test('a guide maps every note to the requirements it exercises, and every id is a requirement', () => {
    const map = guideMap();
    assert.ok(map.size >= 2, 'the guide lists the notes');
    const ids = requirementIds();
    for (const [note, reqs] of map) {
      assert.ok(exists(`${VAULT}/${note}`), `${note} is in the vault`);
      assert.ok(reqs.length, `${note} names its requirements`);
      for (const id of reqs) assert.ok(ids.has(id), `${note}: ${id} is a requirement in ${REQUIREMENTS}`);
    }
    assert.deepEqual(
      auditRequirements(read(REQUIREMENTS)).filter((p) => p.kind === 'unreadable'),
      [],
    );
  });

  test('the sample note holds the guide example: a graph in steps, a misspelt link, a query, and an empty graph', () => {
    const note = read(`${VAULT}/Sample graph note.md`);
    assert.ok((note.match(/^```gql$/gm) ?? []).length >= 4);
    assert.match(note, /\/\/ graph: \w+ · QUERY/);
    assert.match(note, /^\/\/ graph: \w+\n```/m, 'an empty graph block');
    assert.match(note, /\(small_reeder\)/, 'a link with a misspelt name');
  });

  test('every note at the vault root is in the guide, and none carries front matter', () => {
    const notes = execFileSync('git', ['ls-files', '--others', '--cached', '--exclude-standard', VAULT], {
      cwd: ROOT,
      encoding: 'utf8',
    })
      .split('\n')
      .filter((f) => f.endsWith('.md') && f !== GUIDE && !f.startsWith(DEVICE_CHECKS));
    const listed = guideMap();
    for (const f of notes) {
      assert.ok(listed.has(f.slice(VAULT.length + 1)), `${f} is in the guide`);
      assert.ok(!read(f).startsWith('---'), `${f} has no front matter`);
    }
  });
});

describe('only the notes and two settings are committed', () => {
  test('the vault turns on graph-note and no other community plugin', () => {
    assert.deepEqual(readJSON(`${VAULT}/.obsidian/community-plugins.json`), ['graph-note']);
    assert.equal(typeof readJSON(`${VAULT}/.obsidian/app.json`), 'object');
  });

  test('the notes and the two settings can be committed; what Obsidian writes, and the plugin build, cannot', () => {
    for (const f of [
      'Sample graph note.md',
      'Long note.md',
      'GUIDE.md',
      'Device checks/Device checks.md',
      'Device checks/01 Viewing/V-01 Every graph is drawn.md',
    ])
      assert.ok(notIgnored(`${VAULT}/${f}`), f);
    for (const f of KEPT) assert.ok(notIgnored(f), f);
    for (const f of [
      '.obsidian/workspace.json',
      '.obsidian/workspace-mobile.json',
      '.obsidian/core-plugins.json',
      '.obsidian/appearance.json',
      '.obsidian/hotkeys.json',
      ...PLUGIN_FILES.map((p) => `.obsidian/plugins/graph-note/${p}`),
      '.obsidian/plugins/another-plugin/main.js',
      'A folder/A note typed in a session.md',
      'pasted image.png',
      'Device checks/pasted image.png',
      'Device checks/01 Viewing/pasted image.png',
      'Device checks/01 Viewing/.obsidian/workspace.json',
    ])
      assert.ok(!notIgnored(`${VAULT}/${f}`), `${f} is ignored`);
  });

  test('nothing committed in the vault is a workspace file, a plugin build or anything but a note or the two settings', () => {
    const tracked = execFileSync('git', ['ls-files', VAULT], { cwd: ROOT, encoding: 'utf8' })
      .split('\n')
      .filter(Boolean);
    const allowed = (f) =>
      KEPT.includes(f) ||
      /^test-vault\/[^/]+\.md$/.test(f) ||
      /^test-vault\/Device checks\/([^/]+\/)?[^/]+\.md$/.test(f);
    assert.deepEqual(
      tracked.filter((f) => !allowed(f)),
      [],
    );
  });
});

describe('each session in the vault starts and ends clean', () => {
  const git = (cwd, ...args) =>
    execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.com', ...args], { cwd, encoding: 'utf8' });

  /** A throwaway repository holding a copy of the vault as committed here, and the ignore rules. */
  function scratchRepo() {
    const dir = mkdtempSync(join(tmpdir(), 'test-vault-'));
    git(dir, 'init', '-q');
    cpSync(path('.gitignore'), join(dir, '.gitignore'));
    for (const f of [...guideMap().keys(), 'GUIDE.md']) {
      mkdirSync(join(dir, VAULT), { recursive: true });
      cpSync(path(`${VAULT}/${f}`), join(dir, VAULT, f));
    }
    mkdirSync(join(dir, VAULT, '.obsidian'));
    for (const f of KEPT) cpSync(path(f), join(dir, f));
    git(dir, 'add', '-A');
    git(dir, 'commit', '-q', '-m', 'vault');
    return dir;
  }

  test('fresh restores the notes, removes what a session added, and links the plugin build into the vault', () => {
    const dir = scratchRepo();
    try {
      const note = join(dir, VAULT, 'Long note.md');
      const before = readFileSync(note, 'utf8');
      writeFileSync(note, before + '\n(typed:Thing {name: "typed in a session"})\n');
      writeFileSync(join(dir, VAULT, 'Untitled.md'), 'new');
      writeFileSync(join(dir, VAULT, '.obsidian', 'workspace.json'), '{}');
      mkdirSync(join(dir, VAULT, 'A folder'));
      writeFileSync(join(dir, VAULT, 'A folder', 'note.md'), 'x');
      git(dir, 'add', join(VAULT, 'Untitled.md'));

      const run = spawnSync(process.execPath, [path('scripts/reset-test-vault.mjs'), '--root', dir], {
        encoding: 'utf8',
      });
      assert.equal(run.status, 0, run.stdout + run.stderr);

      assert.equal(readFileSync(note, 'utf8'), before);
      for (const gone of ['Untitled.md', '.obsidian/workspace.json', 'A folder'])
        assert.ok(!existsSync(join(dir, VAULT, gone)), `${gone} is removed`);
      assert.equal(git(dir, 'status', '--porcelain'), '');
      for (const p of PLUGIN_FILES)
        assert.equal(readlinkSync(join(dir, VAULT, '.obsidian', 'plugins', 'graph-note', p)), `../../../../${p}`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('fresh touches nothing outside the vault', () => {
    const dir = scratchRepo();
    try {
      writeFileSync(join(dir, 'work in progress.txt'), 'kept');
      writeFileSync(join(dir, '.gitignore'), readFileSync(join(dir, '.gitignore'), 'utf8') + '# edited\n');
      const run = spawnSync(process.execPath, [path('scripts/reset-test-vault.mjs'), '--root', dir], {
        encoding: 'utf8',
      });
      assert.equal(run.status, 0, run.stdout + run.stderr);
      assert.ok(existsSync(join(dir, 'work in progress.txt')));
      assert.match(readFileSync(join(dir, '.gitignore'), 'utf8'), /# edited\n$/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('an unknown command says how to use it and changes nothing', () => {
    const run = spawnSync(process.execPath, [path('scripts/reset-test-vault.mjs'), 'tidy'], { encoding: 'utf8' });
    assert.equal(run.status, 2);
    assert.match(run.stderr, /reset-test-vault\.mjs \[--root DIR\]/);
  });
});
