#!/usr/bin/env node
// Builds the VS Code extension as one file to install, a .vsix, for a nightly pre-release (spec §41, vscode_plugin).
//
// - thoughtknot-vscode-<version>.vsix: the built extension, its webview page, LICENSE and THIRD_PARTY_NOTICES.md.
// - A person installs it in VS Code with "Extensions: Install from VSIX...", or `code --install-extension <file>`.
// - It is never sent to the Marketplace. Its package.json names no dependencies: everything is bundled.
//
// A .vsix is a zip file, laid out as VS Code reads it: `extension.vsixmanifest`, `[Content_Types].xml`, and the
// extension's own files under `extension/`. It is written here, with Node's zlib, so no packaging tool is installed.
//
// Usage:
//   node scripts/vscode-release.mjs --version VERSION --out DIR   builds the .vsix into DIR, at VERSION.
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crc32, deflateRawSync } from 'node:zlib';
import { buildExtension } from '../packages/vscode/esbuild.config.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PACKAGE = join(ROOT, 'packages/vscode/package.json');

/** The .vsix's file name at `version`. */
export const vsixName = (version) => `thoughtknot-vscode-${version}.vsix`;

/** A version as semantic versioning writes one, a pre-release such as a nightly's included. */
const VERSION = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;

/** Text safe inside an XML attribute or element. */
const xml = (text) =>
  String(text).replace(
    /[<>&"']/g,
    (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c],
  );

/** The extension's package.json as it ships: at `version`, with nothing to install and no scripts. */
export function shippedPackage(given, version) {
  const { dependencies: _d, devDependencies: _dd, scripts: _s, private: _p, ...kept } = given;
  return { ...kept, version };
}

/** The manifest VS Code reads first: who made the extension, its version, and the VS Code it needs. */
export function vsixManifest(pkg) {
  const property = (id, value) => `      <Property Id="${id}" Value="${xml(value)}" />`;
  return `<?xml version="1.0" encoding="utf-8"?>
<PackageManifest Version="2.0.0" xmlns="http://schemas.microsoft.com/developer/vsx-schema/2011" xmlns:d="http://schemas.microsoft.com/developer/vsx-schema-design/2011">
  <Metadata>
    <Identity Language="en-US" Id="${xml(pkg.name)}" Version="${xml(pkg.version)}" Publisher="${xml(pkg.publisher)}" />
    <DisplayName>${xml(pkg.displayName)}</DisplayName>
    <Description xml:space="preserve">${xml(pkg.description)}</Description>
    <Categories>${xml((pkg.categories ?? []).join(','))}</Categories>
    <GalleryFlags>Public</GalleryFlags>
    <Properties>
${[
  property('Microsoft.VisualStudio.Code.Engine', pkg.engines.vscode),
  property('Microsoft.VisualStudio.Code.ExtensionKind', 'workspace'),
  property('Microsoft.VisualStudio.Code.PreRelease', String(pkg.version.includes('-'))),
].join('\n')}
    </Properties>
    <License>extension/LICENSE.txt</License>
  </Metadata>
  <Installation>
    <InstallationTarget Id="Microsoft.VisualStudio.Code" />
  </Installation>
  <Dependencies />
  <Assets>
    <Asset Type="Microsoft.VisualStudio.Code.Manifest" Path="extension/package.json" Addressable="true" />
    <Asset Type="Microsoft.VisualStudio.Services.Content.License" Path="extension/LICENSE.txt" Addressable="true" />
  </Assets>
</PackageManifest>
`;
}

/** Each kind of file the .vsix holds, by its ending, as VS Code's packager names them. */
const TYPES = {
  '.json': 'application/json',
  '.vsixmanifest': 'text/xml',
  '.js': 'application/javascript',
  '.cjs': 'application/javascript',
  '.css': 'text/css',
  '.html': 'text/html',
  '.md': 'text/markdown',
  '.txt': 'text/plain',
  '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.map': 'application/json',
};

/** The content types file every .vsix opens with, naming the type of each ending it holds. */
export function contentTypes(paths) {
  const endings = [...new Set(paths.map((p) => extname(p)).filter(Boolean))].sort();
  const missing = endings.filter((e) => !TYPES[e]);
  if (missing.length) throw new Error(`no content type for ${missing.join(', ')}: add it to TYPES`);
  return `<?xml version="1.0" encoding="utf-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
${endings.map((e) => `  <Default Extension="${e}" ContentType="${TYPES[e]}" />`).join('\n')}
</Types>
`;
}

/** A zip file holding `files`, each `[path, bytes]`, deflated, dated 1 January 1980 so a build is the same each time. */
export function zip(files) {
  const locals = [];
  const central = [];
  let offset = 0;
  for (const [path, bytes] of files) {
    const name = Buffer.from(path, 'utf8');
    const packed = deflateRawSync(bytes, { level: 9 });
    const crc = crc32(bytes);
    const head = Buffer.alloc(30);
    head.writeUInt32LE(0x04034b50, 0);
    head.writeUInt16LE(20, 4);
    head.writeUInt16LE(0x0800, 6); // names are UTF-8
    head.writeUInt16LE(8, 8); // deflate
    head.writeUInt16LE(0, 10);
    head.writeUInt16LE(0x21, 12); // 1980-01-01
    head.writeUInt32LE(crc, 14);
    head.writeUInt32LE(packed.length, 18);
    head.writeUInt32LE(bytes.length, 22);
    head.writeUInt16LE(name.length, 26);
    head.writeUInt16LE(0, 28);
    locals.push(head, name, packed);
    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(20, 4);
    entry.writeUInt16LE(20, 6);
    head.copy(entry, 8, 6, 28);
    entry.writeUInt16LE(name.length, 28);
    entry.writeUInt32LE(offset, 42);
    central.push(entry, name);
    offset += head.length + name.length + packed.length;
  }
  const size = central.reduce((n, b) => n + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(size, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, ...central, end]);
}

/** Every file under `dir`, by its path from `dir`, in a fixed order. */
function filesUnder(dir) {
  return readdirSync(dir, { recursive: true })
    .map(String)
    .filter((p) => statSync(join(dir, p)).isFile())
    .map((p) => p.split('\\').join('/'))
    .sort();
}

/** Builds the .vsix at `version` into `out`, and gives its path. */
export async function packVsix({ version, out }) {
  if (!VERSION.test(version)) throw new Error(`${version} is not a version such as 0.7.2 or 0.7.2-nightly.20261024`);
  const stage = mkdtempSync(join(tmpdir(), 'thoughtknot-vsix-'));
  try {
    await buildExtension(join(stage, 'dist'));
    const pkg = shippedPackage(JSON.parse(readFileSync(PACKAGE, 'utf8')), version);
    const files = [
      ['extension/package.json', Buffer.from(`${JSON.stringify(pkg, null, 2)}\n`)],
      ['extension/LICENSE.txt', readFileSync(join(ROOT, 'LICENSE'))],
      ['extension/THIRD_PARTY_NOTICES.md', readFileSync(join(ROOT, 'THIRD_PARTY_NOTICES.md'))],
      ['extension/readme.md', readFileSync(join(ROOT, 'packages/vscode/GUIDE.md'))],
      ...filesUnder(join(stage, 'dist')).map((p) => [`extension/dist/${p}`, readFileSync(join(stage, 'dist', p))]),
    ];
    const manifest = ['extension.vsixmanifest', Buffer.from(vsixManifest(pkg))];
    const types = ['[Content_Types].xml', Buffer.from(contentTypes([manifest[0], ...files.map(([p]) => p)]))];
    mkdirSync(out, { recursive: true });
    const file = join(out, vsixName(version));
    writeFileSync(file, zip([types, manifest, ...files]));
    return file;
  } finally {
    rmSync(stage, { recursive: true, force: true });
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const arg = (name) => {
    const i = process.argv.indexOf(name);
    return i > 0 ? process.argv[i + 1] : undefined;
  };
  const version = arg('--version');
  const out = arg('--out');
  if (!version || !out) {
    console.error('Usage: node scripts/vscode-release.mjs --version VERSION --out DIR');
    process.exit(2);
  }
  console.log(relative(process.cwd(), await packVsix({ version, out })));
}
