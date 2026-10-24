// The VS Code extension as one file to install, a .vsix, on every nightly pre-release (spec §41, nightly_prerelease,
// vscode_plugin). A person downloads it and runs "Extensions: Install from VSIX..." in VS Code.
// - The nightly builds it at the nightly version, checksums it and attaches it, saying how to install it.
// - It is a zip file laid out as VS Code reads one: its manifest, its content types, and the extension under extension/.
// - Its manifest names the extension, its version, its publisher and the VS Code it needs, as its package.json does.
// - Its package.json names nothing to install: the extension and its webview page are built into it.
// Proved on a .vsix built for the test, read back with a zip reader written here.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { crc32, inflateRawSync } from 'node:zlib';
import { contentTypes, packVsix, shippedPackage, vsixManifest, vsixName, zip } from '../scripts/vscode-release.mjs';
import { read, readJSON } from './repository/repo.js';

/** The files of a zip, by name, each checked against the checksum the zip gives it. */
function unzip(bytes) {
  const end = bytes.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const count = bytes.readUInt16LE(end + 10);
  let at = bytes.readUInt32LE(end + 16);
  const files = new Map();
  for (let i = 0; i < count; i++) {
    assert.equal(bytes.readUInt32LE(at), 0x02014b50, 'a central directory entry');
    const method = bytes.readUInt16LE(at + 10);
    const crc = bytes.readUInt32LE(at + 16);
    const packed = bytes.readUInt32LE(at + 20);
    const nameLength = bytes.readUInt16LE(at + 28);
    const extra = bytes.readUInt16LE(at + 30) + bytes.readUInt16LE(at + 32);
    const local = bytes.readUInt32LE(at + 42);
    const name = bytes.toString('utf8', at + 46, at + 46 + nameLength);
    const start = local + 30 + bytes.readUInt16LE(local + 26) + bytes.readUInt16LE(local + 28);
    const data = bytes.subarray(start, start + packed);
    const content = method === 8 ? inflateRawSync(data) : data;
    assert.equal(crc32(content), crc, `${name}'s checksum`);
    files.set(name, content);
    at += 46 + nameLength + extra;
  }
  return files;
}

const VERSION = '0.7.2-nightly.20261024';

describe('the nightly attaches the VS Code extension', () => {
  const text = read('.github/workflows/nightly.yml');
  const line = (word) => text.split('\n').find((l) => l.includes(word)) ?? '';

  test('builds the .vsix at the nightly version, before the release is made', () => {
    const build = text.indexOf('node scripts/vscode-release.mjs --version "$VERSION" --out .');
    assert.ok(build > 0, 'it builds the .vsix');
    assert.ok(build < text.indexOf('gh release create'), 'built before the release is made');
  });

  test('checksums it, hands it to the publish job and attaches it, saying how to install it', () => {
    assert.ok(line('sha256sum main.js').includes('"thoughtknot-vscode-$VERSION.vsix"'), 'in SHA256SUMS');
    assert.match(text, /\n {12}thoughtknot-vscode-\*\.vsix\n/, 'in the artifact the publish job downloads');
    const create = line('gh release create');
    assert.ok(create.includes('"thoughtknot-vscode-$VERSION.vsix"'), 'attached to the release');
    assert.match(create, /Install from VSIX/);
  });

  test('is named for its version', () => {
    assert.equal(vsixName(VERSION), `thoughtknot-vscode-${VERSION}.vsix`);
  });
});

describe('the parts of a .vsix', () => {
  const given = readJSON('packages/vscode/package.json');

  test('its package.json is the extension’s at the version given, with nothing to install and no scripts', () => {
    const pkg = shippedPackage(given, VERSION);
    assert.equal(pkg.version, VERSION);
    for (const field of ['dependencies', 'devDependencies', 'scripts', 'private']) assert.ok(!(field in pkg), field);
    for (const field of ['name', 'publisher', 'engines', 'main', 'contributes', 'activationEvents'])
      assert.deepEqual(pkg[field], given[field], field);
  });

  test('its manifest names the extension, its version, its publisher and the VS Code it needs', () => {
    const manifest = vsixManifest(shippedPackage(given, VERSION));
    assert.match(
      manifest,
      new RegExp(`<Identity [^>]*Id="${given.name}" Version="${VERSION}" Publisher="${given.publisher}"`),
    );
    assert.ok(manifest.includes(`Id="Microsoft.VisualStudio.Code.Engine" Value="${given.engines.vscode}"`));
    assert.ok(
      manifest.includes('Id="Microsoft.VisualStudio.Code.PreRelease" Value="true"'),
      'a nightly is a pre-release',
    );
    assert.ok(manifest.includes('<InstallationTarget Id="Microsoft.VisualStudio.Code" />'));
    assert.ok(manifest.includes('Type="Microsoft.VisualStudio.Code.Manifest" Path="extension/package.json"'));
  });

  test('its manifest writes a name with a mark XML gives a meaning as plain text', () => {
    const manifest = vsixManifest({ ...shippedPackage(given, '1.0.0'), displayName: 'Tea & <Cake>' });
    assert.ok(manifest.includes('<DisplayName>Tea &amp; &lt;Cake&gt;</DisplayName>'));
    assert.ok(manifest.includes('Id="Microsoft.VisualStudio.Code.PreRelease" Value="false"'), 'a release is not');
  });

  test('its content types name each kind of file it holds, and refuse one with no type', () => {
    const types = contentTypes(['extension.vsixmanifest', 'extension/package.json', 'extension/dist/a.cjs']);
    for (const ending of ['.vsixmanifest', '.json', '.cjs']) assert.ok(types.includes(`Extension="${ending}"`), ending);
    assert.throws(() => contentTypes(['extension/a.exe']), /no content type for \.exe/);
  });

  test('its zip reads back as written, and is the same each time it is made', () => {
    const files = [
      ['a.txt', Buffer.from('tea')],
      ['dir/ü.json', Buffer.from('{"cake": true}'.repeat(50))],
    ];
    const bytes = zip(files);
    assert.deepEqual([...unzip(bytes)], files);
    assert.ok(bytes.equals(zip(files)), 'no date or order changes it');
  });
});

describe('a .vsix built as the nightly builds it', () => {
  let dir;
  let file;
  let files;
  before(async () => {
    dir = mkdtempSync(join(tmpdir(), 'vsix-'));
    file = await packVsix({ version: VERSION, out: dir });
    files = unzip(readFileSync(file));
  });
  after(() => rmSync(dir, { recursive: true, force: true }));

  test('is written under its name, opening with its content types and its manifest', () => {
    assert.equal(file, join(dir, vsixName(VERSION)));
    assert.deepEqual([...files.keys()].slice(0, 2), ['[Content_Types].xml', 'extension.vsixmanifest']);
  });

  test('holds the extension’s entry point, its webview page and its licences', () => {
    const pkg = JSON.parse(files.get('extension/package.json'));
    assert.equal(pkg.version, VERSION);
    assert.ok(!pkg.dependencies, 'nothing to install');
    const main = `extension/${pkg.main.replace(/^\.\//, '')}`;
    assert.ok(files.has(main), main);
    for (const name of ['index.html', 'page.js', 'vscode-editor.js', 'layout-worker.js'])
      assert.ok(files.has(`extension/dist/webview/${name}`), name);
    for (const name of ['LICENSE.txt', 'THIRD_PARTY_NOTICES.md', 'readme.md'])
      assert.ok(files.has(`extension/${name}`), name);
  });

  test('names a content type for every file it holds', () => {
    const types = files.get('[Content_Types].xml').toString();
    for (const name of [...files.keys()].slice(1)) {
      const ending = name.slice(name.lastIndexOf('.'));
      assert.ok(types.includes(`Extension="${ending}"`), name);
    }
  });
});
