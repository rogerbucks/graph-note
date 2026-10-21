// The desktop app is shut by default (spec §41, standalone_app; offline). Its window may load only its own pages,
// reach no other origin and call only the app's seven folder commands. The Rust, the build script and the window's
// capability must name the same seven commands. So a new command is never let through unseen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const config = JSON.parse(read('src-tauri/tauri.conf.json'));
const COMMANDS = ['pick_folder', 'read_dir', 'read_text', 'write_text', 'remove_file', 'make_dir', 'write_new'];

test("the window's policy allows its own pages and Tauri's calls, and no other origin", () => {
  const policy = Object.fromEntries(
    config.app.security.csp
      .split(';')
      .map((d) => d.trim().split(/\s+/))
      .map(([k, ...v]) => [k, v]),
  );
  assert.deepEqual(policy['default-src'], ["'self'"]);
  assert.deepEqual(policy['script-src'], ["'self'"]);
  assert.deepEqual(policy['connect-src'], ["'self'", 'ipc:', 'http://ipc.localhost']);
  assert.deepEqual(policy['object-src'], ["'none'"]);
  assert.ok(!/https?:\/\/(?!ipc\.localhost)/.test(config.app.security.csp), "no web address but Tauri's own");
  assert.equal(config.build.devUrl, undefined, 'the window never loads a page from a server');
  assert.equal(config.app.security.freezePrototype, true);
});

test('the commands in the Rust, the build script and the capability are the same seven', () => {
  const handled = /generate_handler!\[([^\]]*)\]/
    .exec(read('src-tauri/src/lib.rs'))[1]
    .split(',')
    .map((s) => s.trim());
  const built = /let commands = &\[([^\]]*)\]/
    .exec(read('src-tauri/build.rs'))[1]
    .match(/"([a-z_]+)"/g)
    .map((s) => s.slice(1, -1));
  const capability = JSON.parse(read('src-tauri/capabilities/default.json'));
  const allowed = capability.permissions
    .filter((p) => p.startsWith('allow-'))
    .map((p) => p.slice(6).replace(/-/g, '_'));
  assert.deepEqual(
    [handled, built, allowed].map((l) => [...l].sort()),
    Array(3).fill([...COMMANDS].sort()),
  );
  assert.deepEqual(
    capability.permissions.filter((p) => !p.startsWith('allow-')),
    ['core:default'],
  );
});

test('the app takes no plug-in that reaches the disk, the network or a shell on its own, and pins each crate', () => {
  const cargo = read('src-tauri/Cargo.toml');
  const crates = [...cargo.matchAll(/^([a-z][\w-]*)\s*=\s*(?:"([^"]*)"|\{\s*version\s*=\s*"([^"]*)")/gm)].map(
    ([, name, a, b]) => [name, a ?? b],
  );
  const plugins = crates.map(([n]) => n).filter((n) => n.startsWith('tauri-plugin-'));
  assert.deepEqual(plugins, ['tauri-plugin-dialog']);
  for (const [name, version] of crates.filter(([n]) => n.startsWith('tauri')))
    assert.match(version, /^=\d+\.\d+\.\d+$/, `${name} is pinned to one version`);
});
