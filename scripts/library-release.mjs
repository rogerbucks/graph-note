#!/usr/bin/env node
// Builds the JavaScript library as two packages for a GitHub release (spec §41, lib_github_release). Never for npm (Q-02).
//
// - thoughtknot-graph-spec-<version>.tgz: the reader, checker and layout, with their types.
// - thoughtknot-core-<version>.tgz: the core in one file, with its types. Graph-spec and the Graphviz engine are bundled
//   inside it. Its types use graph-spec's, so it names the graph-spec package from the same release.
//
// Each package is private, so npm refuses to publish it, and runs nothing when installed. A person installs one from
// the release, as `npm install <the asset's URL>`.
//
// Usage:
//   node scripts/library-release.mjs --out DIR   builds both packages into DIR, at the manifest's version.
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import esbuild from 'esbuild';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPO = 'rogerbucks/thoughtknot';
const NPM = process.platform === 'win32' ? 'npm.cmd' : 'npm';

// The two packages: their short name, their package name and the start of their asset's file name.
export const PACKAGES = [
  { short: 'graph-spec', name: '@thoughtknot/graph-spec', asset: 'thoughtknot-graph-spec-' },
  { short: 'core', name: '@thoughtknot/core', asset: 'thoughtknot-core-' },
];

export const assetName = (short, version) => `thoughtknot-${short}-${version}.tgz`;

// Where a package's asset is downloaded from, once the release is published.
export const releaseUrl = (repo, version, short) =>
  `https://github.com/${repo}/releases/download/${version}/${assetName(short, version)}`;

// The files every package carries beside its own.
function common(stage, pkg, version) {
  copyFileSync(join(ROOT, 'LICENSE'), join(stage, 'LICENSE'));
  copyFileSync(join(ROOT, 'THIRD_PARTY_NOTICES.md'), join(stage, 'THIRD_PARTY_NOTICES.md'));
  const { description } = JSON.parse(readFileSync(join(ROOT, 'packages', pkg.short, 'package.json'), 'utf8'));
  writeFileSync(
    join(stage, 'README.md'),
    [
      `# ${pkg.name} ${version}`,
      '',
      description,
      '',
      `Part of ThoughtKnot (https://github.com/${REPO}). It is released on GitHub only, never on npm.`,
      'Install it from the release: `npm install <the URL of this file on the release page>`.',
      '',
    ].join('\n'),
  );
}

const manifest = (pkg, version, fields) => ({
  name: pkg.name,
  version,
  private: true,
  description: JSON.parse(readFileSync(join(ROOT, 'packages', pkg.short, 'package.json'), 'utf8')).description,
  license: 'MPL-2.0',
  repository: { type: 'git', url: `git+https://github.com/${REPO}.git` },
  ...fields,
});

// Packs a staged folder into DIR as the package's asset, and gives back its path.
function pack(stage, out, short, version) {
  const [{ filename }] = JSON.parse(
    execFileSync(NPM, ['pack', stage, '--pack-destination', out, '--json', '--ignore-scripts'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }),
  );
  const file = join(out, assetName(short, version));
  if (resolve(out, filename) !== file) {
    copyFileSync(resolve(out, filename), file);
    rmSync(resolve(out, filename));
  }
  return file;
}

async function stageGraphSpec(stage, version) {
  const pkg = PACKAGES[0];
  const src = join(ROOT, 'packages/graph-spec/src');
  execFileSync(process.execPath, [
    join(ROOT, 'packages/graph-spec/esbuild.check.mjs'),
    join(stage, 'graph-spec-check.js'),
  ]);
  for (const file of ['graph-layout.js', 'graph-spec.d.ts', 'graph-layout-types.d.ts'])
    copyFileSync(join(src, file), join(stage, file));
  common(stage, pkg, version);
  const fields = {
    type: 'commonjs',
    main: 'graph-spec-check.js',
    types: 'graph-spec.d.ts',
    exports: {
      '.': { types: './graph-spec.d.ts', default: './graph-spec-check.js' },
      './graph-layout.js': { types: './graph-layout-types.d.ts', default: './graph-layout.js' },
      './package.json': './package.json',
    },
  };
  writeFileSync(join(stage, 'package.json'), `${JSON.stringify(manifest(pkg, version, fields), null, 2)}\n`);
}

// A TypeScript type written out for a JSON value, so the types need not import the JSON file itself.
const typeOfJson = (value) => {
  if (Array.isArray(value)) return `Array<${value.length ? typeOfJson(value[0]) : 'unknown'}>`;
  if (value === null) return 'null';
  if (typeof value === 'object')
    return `{ ${Object.entries(value)
      .map(([key, item]) => `${JSON.stringify(key)}: ${typeOfJson(item)};`)
      .join(' ')} }`;
  return typeof value;
};

// Every file under a folder.
const filesUnder = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? filesUnder(join(dir, entry.name)) : [join(dir, entry.name)],
  );

// The core's declarations, emitted by TypeScript and made to stand alone. Imports end in .js, as Node resolves them,
// and a JSON file from outside the core becomes its type written out.
function coreTypes(typesDir) {
  const tsc = createRequire(import.meta.url).resolve('typescript/bin/tsc');
  const core = join(ROOT, 'packages/core');
  execFileSync(process.execPath, [
    tsc,
    '-p',
    core,
    '--declaration',
    '--emitDeclarationOnly',
    '--noEmit',
    'false',
    '--rootDir',
    join(core, 'src'),
    '--outDir',
    typesDir,
  ]);
  for (const file of filesUnder(typesDir)) {
    const source = join(core, 'src', relative(typesDir, file).replace(/\.d\.ts$/, '.ts'));
    const text = readFileSync(file, 'utf8')
      .replace(/^import (\w+) from '(\.[^']*\.json)';$/gm, (_, name, path) => {
        const json = JSON.parse(readFileSync(resolve(dirname(source), path), 'utf8'));
        return `declare const ${name}: ${typeOfJson(json)};`;
      })
      .replace(/(from '\.{1,2}\/[^']*)\.ts'/g, "$1.js'");
    writeFileSync(file, text);
  }
}

async function stageCore(stage, version, graphSpec) {
  const pkg = PACKAGES[1];
  await esbuild.build({
    absWorkingDir: join(ROOT, 'packages/core'),
    entryPoints: ['src/index.ts'],
    outfile: join(stage, 'index.mjs'),
    bundle: true,
    platform: 'neutral',
    format: 'esm',
    target: 'es2022',
    mainFields: ['module', 'main'],
    legalComments: 'inline',
    logLevel: 'warning',
    banner: { js: `// ${pkg.name} ${version}, built from packages/core by scripts/library-release.mjs.` },
  });
  coreTypes(join(stage, 'types'));
  common(stage, pkg, version);
  const fields = {
    type: 'module',
    types: './types/index.d.ts',
    exports: { '.': { types: './types/index.d.ts', default: './index.mjs' }, './package.json': './package.json' },
    dependencies: { [PACKAGES[0].name]: graphSpec },
  };
  writeFileSync(join(stage, 'package.json'), `${JSON.stringify(manifest(pkg, version, fields), null, 2)}\n`);
}

// Builds both packages into `out`. The core names graph-spec at its release URL; `graphSpecSource: 'local'` names the
// file just built instead, for a test that installs both with no network. Gives back [{name, file}].
export async function buildLibrary({ out, version, repo = REPO, graphSpecSource }) {
  mkdirSync(out, { recursive: true });
  const staging = mkdtempSync(join(tmpdir(), 'library-release-'));
  try {
    const stages = Object.fromEntries(PACKAGES.map(({ short }) => [short, join(staging, short)]));
    for (const dir of Object.values(stages)) mkdirSync(dir);
    await stageGraphSpec(stages['graph-spec'], version);
    const graphSpecFile = pack(stages['graph-spec'], out, 'graph-spec', version);
    const graphSpec = graphSpecSource === 'local' ? `file:${graphSpecFile}` : releaseUrl(repo, version, 'graph-spec');
    await stageCore(stages.core, version, graphSpec);
    const coreFile = pack(stages.core, out, 'core', version);
    return [
      { name: PACKAGES[0].name, file: graphSpecFile },
      { name: PACKAGES[1].name, file: coreFile },
    ];
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const at = process.argv.indexOf('--out');
  if (at === -1 || !process.argv[at + 1]) {
    console.error('usage: node scripts/library-release.mjs --out DIR');
    process.exit(2);
  }
  const { version } = JSON.parse(readFileSync(join(ROOT, 'manifest.json'), 'utf8'));
  const repo = process.env.GITHUB_REPOSITORY || REPO;
  for (const { file } of await buildLibrary({ out: resolve(process.argv[at + 1]), version, repo }))
    console.log(`library-release: built ${relative(process.cwd(), file)}`);
}
