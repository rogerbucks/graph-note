// The mod's data folder is the user's alone (spec §26): Claude's own writes to the settings and drafts there are refused,
// so a session cannot loosen its own classification gate. File tools are judged by the target's real path; Bash by
// whether the command names the folder at all. Reads by the Read tool stay allowed.
import { afterEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readlinkSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { guardDataFolder } from '../src/data-guard.ts';

const made = [];
afterEach(() => {
  for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** A top folder holding `data` (the mod's data folder, with a settings file), `work` (the cwd) and `elsewhere`. */
function world() {
  const top = realpathSync(mkdtempSync(join(tmpdir(), 'gn-guard-')));
  made.push(top);
  const data = join(top, 'data', 'graph-note');
  const work = join(top, 'work');
  const elsewhere = join(top, 'elsewhere');
  for (const dir of [data, work, elsewhere]) mkdirSync(dir, { recursive: true });
  writeFileSync(join(data, 'settings.json'), '{}');
  const ports = {
    data,
    home: top,
    cwd: work,
    realPath: async (path) => realpathSync.native(path),
    readLink: async (path) => {
      try {
        return resolve(dirname(path), readlinkSync(path));
      } catch (err) {
        if (err.code === 'ENOENT' || err.code === 'EINVAL') return null;
        throw err;
      }
    },
  };
  return { top, data, work, elsewhere, ports };
}

const refused = (answer) => assert.equal(typeof answer, 'string', 'expected a refusal');
const allowed = (answer) => assert.equal(answer, null);

describe('file tools are judged by the target’s real path', () => {
  test('a direct path into the data folder is refused for Write, Edit and NotebookEdit', async () => {
    const w = world();
    const file = join(w.data, 'settings.json');
    refused(await guardDataFolder('Write', { file_path: file }, w.ports));
    refused(await guardDataFolder('Edit', { file_path: file }, w.ports));
    refused(await guardDataFolder('NotebookEdit', { notebook_path: file }, w.ports));
  });

  test('a relative path into the folder is resolved against the session’s folder', async () => {
    const w = world();
    refused(await guardDataFolder('Write', { file_path: '../data/graph-note/settings.json' }, w.ports));
  });

  test('a link elsewhere that points into the folder is refused', async () => {
    const w = world();
    symlinkSync(join(w.data, 'settings.json'), join(w.elsewhere, 'looks-harmless.json'));
    refused(await guardDataFolder('Write', { file_path: join(w.elsewhere, 'looks-harmless.json') }, w.ports));
  });

  test('a file under a linked parent is refused', async () => {
    const w = world();
    symlinkSync(w.data, join(w.elsewhere, 'linked-folder'));
    refused(await guardDataFolder('Edit', { file_path: join(w.elsewhere, 'linked-folder', 'settings.json') }, w.ports));
  });

  test('a file that does not exist yet inside the folder is refused by its nearest parent', async () => {
    const w = world();
    refused(await guardDataFolder('Write', { file_path: join(w.data, 'drafts', 'new', 'draft.json') }, w.ports));
  });

  test('a new file under a linked parent that does not exist yet is refused', async () => {
    const w = world();
    symlinkSync(w.data, join(w.elsewhere, 'linked-folder'));
    refused(await guardDataFolder('Write', { file_path: join(w.elsewhere, 'linked-folder', 'x', 'y.json') }, w.ports));
  });

  test('a path outside the folder is allowed, existing or not, and so is a sibling with the same prefix', async () => {
    const w = world();
    allowed(await guardDataFolder('Write', { file_path: join(w.elsewhere, 'notes.md') }, w.ports));
    allowed(await guardDataFolder('Write', { file_path: 'a-new-file.md' }, w.ports));
    allowed(await guardDataFolder('Write', { file_path: `${w.data}-other/settings.json` }, w.ports));
  });

  test('a data folder that is itself reached through a link is still found', async () => {
    const w = world();
    const alias = join(w.top, 'alias');
    symlinkSync(w.data, alias);
    const ports = { ...w.ports, data: alias };
    refused(await guardDataFolder('Write', { file_path: join(w.data, 'settings.json') }, ports));
    refused(await guardDataFolder('Write', { file_path: join(alias, 'settings.json') }, ports));
  });

  test('a missing path or an unknown tool is not judged', async () => {
    const w = world();
    allowed(await guardDataFolder('Write', {}, w.ports));
    allowed(await guardDataFolder('Read', { file_path: join(w.data, 'settings.json') }, w.ports));
    allowed(await guardDataFolder('Grep', { file_path: join(w.data, 'settings.json') }, w.ports));
  });
});

describe('Bash is refused when the command names the folder at all', () => {
  test('a redirect, tee and cp onto the settings are refused', async () => {
    const w = world();
    const file = join(w.data, 'settings.json');
    refused(await guardDataFolder('Bash', { command: `echo '{}' > ${file}` }, w.ports));
    refused(await guardDataFolder('Bash', { command: `echo '{}' >> "${file}"` }, w.ports));
    refused(await guardDataFolder('Bash', { command: `echo '{}' | tee ${file}` }, w.ports));
    refused(await guardDataFolder('Bash', { command: `cp loose.json ${file}` }, w.ports));
  });

  test('mv, rm, sed -i, ln, chmod, touch and an interpreter are refused', async () => {
    const w = world();
    const file = join(w.data, 'settings.json');
    for (const command of [
      `mv x ${file}`,
      `rm ${file}`,
      `sed -i s/a/b/ ${file}`,
      `ln -sf x ${file}`,
      `chmod 666 ${file}`,
      `touch ${file}`,
      `python3 edit.py ${file}`,
    ]) {
      refused(await guardDataFolder('Bash', { command }, w.ports));
    }
  });

  test('the folder named through the home folder, an environment variable or a relative path is refused', async () => {
    const w = world();
    refused(await guardDataFolder('Bash', { command: 'echo {} > ~/data/graph-note/settings.json' }, w.ports));
    refused(await guardDataFolder('Bash', { command: 'echo {} > $HOME/data/graph-note/settings.json' }, w.ports));
    refused(await guardDataFolder('Bash', { command: 'echo {} > "${HOME}/data/graph-note/settings.json"' }, w.ports));
    refused(await guardDataFolder('Bash', { command: 'echo {} > $CLAUDE_PLUGIN_DATA/settings.json' }, w.ports));
    refused(await guardDataFolder('Bash', { command: 'echo {} > ../data/graph-note/settings.json' }, w.ports));
  });

  test('a path that only resolves into the folder through a link is refused', async () => {
    const w = world();
    symlinkSync(w.data, join(w.elsewhere, 'linked-folder'));
    refused(
      await guardDataFolder(
        'Bash',
        { command: `echo {} > ${join(w.elsewhere, 'linked-folder')}/settings.json` },
        w.ports,
      ),
    );
  });

  test('a command that does not name the folder is allowed', async () => {
    const w = world();
    allowed(await guardDataFolder('Bash', { command: `echo hi > ${join(w.elsewhere, 'out.txt')}` }, w.ports));
    allowed(await guardDataFolder('Bash', { command: 'git status && ls -la' }, w.ports));
    allowed(await guardDataFolder('Bash', { command: `ls ${w.data}-other` }, w.ports));
  });
});

describe('the refusal', () => {
  test('says the user changes these settings, and where, and echoes nothing of the call', async () => {
    const w = world();
    const answer = await guardDataFolder(
      'Bash',
      { command: `echo SECRET-VALUE > ${join(w.data, 'settings.json')}` },
      w.ports,
    );
    refused(answer);
    assert.match(answer, /user/i);
    assert.match(answer, /settings\.json/);
    assert.match(answer, /data folder/i);
    assert.doesNotMatch(answer, /SECRET-VALUE/);
  });
});

describe('what the first review found', () => {
  test('a different case of the folder’s name is the same folder, for files and for Bash', async () => {
    const w = world();
    const shouted = join(w.top, 'data', 'GRAPH-NOTE', 'settings.json');
    refused(await guardDataFolder('Write', { file_path: shouted }, w.ports));
    refused(await guardDataFolder('Edit', { file_path: join(w.top, 'DATA', 'graph-note', 'new.json') }, w.ports));
    refused(await guardDataFolder('Bash', { command: `echo {} > ${shouted}` }, w.ports));
  });

  test('a link that leads nowhere yet, into the folder, is refused when written through', async () => {
    const w = world();
    symlinkSync(join(w.data, 'not-yet.json'), join(w.elsewhere, 'dangling'));
    refused(await guardDataFolder('Write', { file_path: join(w.elsewhere, 'dangling') }, w.ports));
    // a relative link, settled from the link’s own folder, not the session’s
    symlinkSync('../data/graph-note/not-yet.json', join(w.elsewhere, 'relative'));
    refused(await guardDataFolder('Write', { file_path: join(w.elsewhere, 'relative') }, w.ports));
    refused(await guardDataFolder('Write', { file_path: '../elsewhere/relative' }, w.ports));
  });

  test('a dangling link used as a parent is refused, and one that leads elsewhere is allowed', async () => {
    const w = world();
    symlinkSync(join(w.data, 'no-such-folder'), join(w.elsewhere, 'dangling-parent'));
    refused(await guardDataFolder('Write', { file_path: join(w.elsewhere, 'dangling-parent', 'x.json') }, w.ports));
    symlinkSync(join(w.elsewhere, 'nowhere'), join(w.elsewhere, 'harmless'));
    allowed(await guardDataFolder('Write', { file_path: join(w.elsewhere, 'harmless') }, w.ports));
  });

  test('a real-path call that cannot run refuses the call, for files and for Bash', async () => {
    const w = world();
    const broken = { ...w.ports, realPath: async () => Promise.reject(new Error('spawn node ENOENT')) };
    const answer = await guardDataFolder('Write', { file_path: join(w.elsewhere, 'a.md') }, broken);
    refused(answer);
    refused(await guardDataFolder('Bash', { command: `echo hi > ${join(w.elsewhere, 'out.txt')}` }, broken));
    // a path that is not there is an answer, not a failure
    const missing = Object.assign(new Error('no such file'), { code: 'ENOENT' });
    const absent = {
      ...w.ports,
      realPath: async (path) => (path.includes('elsewhere') ? realpathSync(path) : Promise.reject(missing)),
    };
    allowed(await guardDataFolder('Write', { file_path: join(w.elsewhere, 'new.md') }, absent));
  });

  test('a link call that cannot run refuses a file that is not there', async () => {
    const w = world();
    const broken = { ...w.ports, readLink: async () => Promise.reject(new Error('timed out')) };
    refused(await guardDataFolder('Write', { file_path: join(w.elsewhere, 'new.md') }, broken));
  });

  test('Bash naming plugins/data is refused, even where the folder was renamed', async () => {
    const w = world();
    for (const command of [
      'mv ~/.claude/plugins/data/graph-note ~/gone',
      'mv /x/.claude/PLUGINS/Data/graph-note /y',
      `mv '/x/.claude/plugins'/'data'/graph-note /y`,
      'mv /x/.claude/plug\\ins/da\\ta/graph-note /y',
      'mv "/x/.claude/plugins/data" /y',
    ]) {
      refused(await guardDataFolder('Bash', { command }, w.ports));
    }
    allowed(await guardDataFolder('Bash', { command: 'ls /x/plugins/database /x/myplugins/data' }, w.ports));
  });

  test('home forms are expanded before matching, a named user’s too', async () => {
    const w = world();
    refused(await guardDataFolder('Bash', { command: 'echo {} > "$HOME"/data/graph-note/settings.json' }, w.ports));
    refused(await guardDataFolder('Bash', { command: 'echo {} > ${HOME}/data/graph-note/settings.json' }, w.ports));
    refused(await guardDataFolder('Bash', { command: 'echo {} > ~someone/.claude/plugins/data/x' }, w.ports));
  });
});

describe('the shipped real-path process', () => {
  const script = fileURLToPath(new URL('../bin/real-path-process.ts', import.meta.url));
  const run = (...args) => spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });

  test('says a missing path with exit code 2, and anything else it cannot settle with 1', () => {
    const w = world();
    assert.equal(run('--', join(w.elsewhere, 'missing')).status, 2);
    assert.equal(run('--', join(w.data, 'settings.json')).status, 0);
    assert.equal(run('settings.json').status, 1);
  });

  test('--link says where a link leads, settled from the link’s own folder, and 3 for a path that is none', () => {
    const w = world();
    symlinkSync('../data/graph-note/not-yet.json', join(w.elsewhere, 'l'));
    const answer = run('--link', '--', join(w.elsewhere, 'l'));
    assert.equal(answer.status, 0);
    assert.equal(answer.stdout, join(w.data, 'not-yet.json'));
    assert.equal(run('--link', '--', join(w.data, 'settings.json')).status, 3);
    assert.equal(run('--link', '--', join(w.elsewhere, 'missing')).status, 3);
  });
});

describe('the data folder is wherever the mod keeps it', () => {
  test('set (as CLAUDE_PLUGIN_DATA) or defaulted under the home folder, that folder is the one guarded', async () => {
    const w = world();
    const defaulted = join(w.top, 'home');
    const fallback = join(defaulted, '.claude', 'plugins', 'data', 'graph-note');
    mkdirSync(fallback, { recursive: true });
    const ports = { ...w.ports, data: fallback, home: defaulted };
    refused(await guardDataFolder('Write', { file_path: join(fallback, 'settings.json') }, ports));
    refused(
      await guardDataFolder('Bash', { command: 'echo {} > ~/.claude/plugins/data/graph-note/settings.json' }, ports),
    );
    // the folder the other setting names is not guarded now
    allowed(await guardDataFolder('Write', { file_path: join(w.data, 'settings.json') }, ports));
  });
});
