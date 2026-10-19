#!/usr/bin/env node
// The library's public interface, declared in one file and checked in CI (lib_public_api).
//
// The library is the reader, checker and layout (@thoughtknot/graph-spec) and the core (@thoughtknot/core).
// Its public interface is what each package's entry points export. The core's `hosts/*` paths are for hosts, not for
// library users, so they are left out. Two `display/*` paths are in: the host interface and its contract. A host
// built by someone else relies on them. So a change to `DisplayHost` needs a new major version (risk API-3).
//
// Each export is written as lines of text: one for a function or a value, one per member for a type or a class.
// A change is breaking when an export goes or one of its lines goes or changes. A new export or a new line is not.
// This errs on the safe side: widening a parameter's type still counts as breaking.
//
// A breaking change since the last release needs a new major version. The last release is the highest bare version tag
// (such as 0.7.0, never a nightly) before the commit checked out. Its own copy of the file is the interface it shipped.
//
// Usage:
//   node scripts/public-api.mjs            says whether public-api.json matches the code.
//   node scripts/public-api.mjs --update   writes public-api.json from the code.
//   node scripts/public-api.mjs --release  says whether the versions allow every break since the last release.
//
// Exits 1 when the file does not match, or a break comes without a major version.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const DECLARATION = 'public-api.json';

// Each package of the library, and the entry points that make up its public interface.
export const LIBRARY = {
  '@thoughtknot/core': {
    folder: 'packages/core',
    entries: {
      '.': 'src/index.ts',
      './display/host': 'src/display/host.ts',
      './display/host-contract': 'src/display/host-contract.ts',
    },
  },
  '@thoughtknot/graph-spec': {
    folder: 'packages/graph-spec',
    entries: { '.': 'src/graph-spec.d.ts', './src/graph-layout.js': 'src/graph-layout-types.d.ts' },
  },
};

const FLAGS =
  ts.TypeFormatFlags.NoTruncation |
  ts.TypeFormatFlags.UseSingleQuotesForStringLiteralType |
  ts.TypeFormatFlags.WriteArrayAsGenericType;

// A type on one line, without `import("./file.ts").` before its names. So it reads the same however it is laid out
// and whichever file it lives in.
const oneLine = (text) =>
  text
    .replace(/import\("[^"]*"\)\./g, '')
    .replace(/\s+/g, ' ')
    .trim();

const optional = (symbol) => (symbol.flags & ts.SymbolFlags.Optional ? '?' : '');

const isPublic = (declaration) =>
  !declaration ||
  (!(ts.getCombinedModifierFlags(declaration) & (ts.ModifierFlags.Private | ts.ModifierFlags.Protected)) &&
    !(declaration.name && ts.isPrivateIdentifier(declaration.name)));

// The members of a type or a class, one line each, in name order.
function membersOf(checker, type, where) {
  const lines = [];
  for (const signature of type.getConstructSignatures())
    lines.push(`new ${oneLine(checker.signatureToString(signature, where, FLAGS))}`);
  for (const signature of type.getCallSignatures())
    lines.push(`call ${oneLine(checker.signatureToString(signature, where, FLAGS))}`);
  for (const info of checker.getIndexInfosOfType(type))
    lines.push(
      `index [key: ${checker.typeToString(info.keyType, where, FLAGS)}]: ${oneLine(checker.typeToString(info.type, where, FLAGS))}`,
    );
  const properties = checker
    .getPropertiesOfType(type)
    .filter((property) => isPublic(property.valueDeclaration ?? property.declarations?.[0]))
    .filter((property) => !property.name.startsWith('__@'));
  for (const property of properties.sort((a, b) => a.name.localeCompare(b.name))) {
    const read = checker.getTypeOfSymbolAtLocation(property, where);
    const declaration = property.valueDeclaration ?? property.declarations?.[0];
    const readonly =
      declaration && ts.getCombinedModifierFlags(declaration) & ts.ModifierFlags.Readonly ? 'readonly ' : '';
    lines.push(
      `${readonly}${property.name}${optional(property)}: ${oneLine(checker.typeToString(read, where, FLAGS))}`,
    );
  }
  return lines;
}

// One export, as its lines of text.
function describe(checker, exported, where) {
  const symbol = exported.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(exported) : exported;
  const lines = [];
  if (symbol.flags & ts.SymbolFlags.Class) {
    lines.push('class');
    const statics = checker.getTypeOfSymbolAtLocation(symbol, where);
    for (const line of membersOf(checker, statics, where))
      if (!line.startsWith('prototype')) lines.push(`static ${line}`);
    for (const line of membersOf(checker, checker.getDeclaredTypeOfSymbol(symbol), where)) lines.push(line);
  } else if (symbol.flags & (ts.SymbolFlags.Function | ts.SymbolFlags.Variable | ts.SymbolFlags.Property)) {
    const type = checker.getTypeOfSymbolAtLocation(symbol, where);
    lines.push(`value: ${oneLine(checker.typeToString(type, where, FLAGS))}`);
  }
  if (symbol.flags & ts.SymbolFlags.Interface) {
    lines.push('interface');
    lines.push(...membersOf(checker, checker.getDeclaredTypeOfSymbol(symbol), where));
  } else if (symbol.flags & ts.SymbolFlags.TypeAlias) {
    const type = checker.getDeclaredTypeOfSymbol(symbol);
    lines.push(`type = ${oneLine(checker.typeToString(type, where, FLAGS | ts.TypeFormatFlags.InTypeAlias))}`);
  }
  if (lines.length === 0) lines.push(`kind ${symbol.flags}`);
  return lines;
}

// The public interface of the library as it is in the code: {package: {version, entries: {entry: {name: lines}}}}.
export function readInterface(root = ROOT) {
  const files = Object.values(LIBRARY).flatMap(({ folder, entries }) =>
    Object.values(entries).map((file) => join(root, folder, file)),
  );
  const program = ts.createProgram(files, {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    allowImportingTsExtensions: true,
    allowJs: true,
    strict: true,
    noEmit: true,
    skipLibCheck: true,
    resolveJsonModule: true,
    types: [],
    lib: ['lib.es2022.d.ts', 'lib.dom.d.ts'],
  });
  const checker = program.getTypeChecker();
  const surface = {};
  for (const [name, { folder, entries }] of Object.entries(LIBRARY)) {
    const { version } = JSON.parse(readFileSync(join(root, folder, 'package.json'), 'utf8'));
    const described = {};
    for (const [entry, file] of Object.entries(entries)) {
      const source = program.getSourceFile(join(root, folder, file));
      const module = checker.getSymbolAtLocation(source);
      const exports = {};
      // A module written as `export = value` exports that one value.
      const assigned = checker.resolveExternalModuleSymbol(module);
      if (assigned !== module)
        exports['export ='] = membersOf(checker, checker.getTypeOfSymbolAtLocation(assigned, source), source);
      for (const exported of checker.getExportsOfModule(module).sort((a, b) => a.name.localeCompare(b.name)))
        exports[exported.name] = describe(checker, exported, source);
      described[entry] = exports;
    }
    surface[name] = { version, entries: described };
  }
  return surface;
}

// The text of the declaration file, as --update writes it.
export const declarationText = (surface) => `${JSON.stringify(surface, null, 2)}\n`;

// What breaks between an earlier interface and a later one: [{pkg, entry, name, line}] where `line` is the line
// that went or changed, or null when the whole export or entry went.
export function breakingChanges(before, after) {
  const breaks = [];
  for (const [pkg, { entries }] of Object.entries(before)) {
    for (const [entry, exports] of Object.entries(entries)) {
      for (const [name, lines] of Object.entries(exports)) {
        const now = after[pkg]?.entries?.[entry]?.[name];
        if (!now) {
          breaks.push({ pkg, entry, name, line: null });
          continue;
        }
        for (const line of lines) if (!now.includes(line)) breaks.push({ pkg, entry, name, line });
      }
    }
  }
  return breaks;
}

// The part of a version that a breaking change must raise. Before 1.0.0 it is the leftmost part that is not 0,
// as npm's caret ranges read it: 0.7.1 to 0.8.0 is a major step, and 0.0.3 to 0.0.4 is too.
export function majorOf(version) {
  const parts = version.split(/[.+-]/).slice(0, 3).map(Number);
  const at = parts.findIndex((part) => part !== 0);
  return at === -1 ? [0, 0, 0] : parts.map((part, i) => (i <= at ? part : 0));
}

// True when version `to` raises the major part of `from`, as majorOf reads it.
export function raisesMajor(from, to) {
  const [a, b] = [majorOf(from), majorOf(to)];
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return b[i] > a[i];
  return false;
}

const RELEASE_TAG = /^(\d+)\.(\d+)\.(\d+)$/;

// The highest bare version tag before HEAD, or null when there is none. A tag on HEAD itself is the release being
// made, so it is left out.
export function lastRelease(root = ROOT) {
  const tags = execFileSync('git', ['tag', '--merged', 'HEAD', '--no-contains', 'HEAD'], {
    cwd: root,
    encoding: 'utf8',
  })
    .split('\n')
    .filter((tag) => RELEASE_TAG.test(tag))
    .map((tag) => ({ tag, parts: tag.split('.').map(Number) }))
    .sort((a, b) => a.parts[0] - b.parts[0] || a.parts[1] - b.parts[1] || a.parts[2] - b.parts[2]);
  return tags.at(-1)?.tag ?? null;
}

// The declaration a tag shipped, or null when the tag came before the declaration did.
export function declarationAt(tag, root = ROOT) {
  try {
    const text = execFileSync('git', ['show', `${tag}:${DECLARATION}`], { cwd: root, encoding: 'utf8', stdio: 'pipe' });
    return JSON.parse(text);
  } catch {
    return null;
  }
}

// The breaks from `before` to `after` that the versions do not allow. There is one entry per package that breaks
// without raising its major version. Empty when every break is allowed.
export function unallowedBreaks(before, after) {
  const problems = [];
  const breaks = breakingChanges(before, after);
  for (const pkg of new Set(breaks.map((change) => change.pkg))) {
    const from = before[pkg].version;
    const to = after[pkg]?.version ?? from;
    if (!raisesMajor(from, to)) problems.push({ pkg, from, to, breaks: breaks.filter((change) => change.pkg === pkg) });
  }
  return problems;
}

// What --release reports: the release compared with, and the breaks it does not allow.
export function releaseCheck(root = ROOT) {
  const tag = lastRelease(root);
  if (!tag) return { tag: null, before: null, problems: [] };
  const before = declarationAt(tag, root);
  if (!before) return { tag, before: null, problems: [] };
  return { tag, before, problems: unallowedBreaks(before, readInterface(root)) };
}

const breakText = ({ entry, name, line }) =>
  line === null ? `${entry} ${name}: removed` : `${entry} ${name}: "${line}" removed or changed`;

if (process.argv[1] === fileURLToPath(import.meta.url) && process.argv.includes('--release')) {
  const { tag, before, problems } = releaseCheck();
  if (!tag) console.log('public-api: no release tag in this checkout, so nothing to compare with');
  else if (!before) console.log(`public-api: release ${tag} came before ${DECLARATION}, so nothing to compare with`);
  else if (problems.length === 0) console.log(`public-api: every change since ${tag} is allowed by the versions`);
  for (const { pkg, from, to, breaks } of problems) {
    console.log(
      `public-api: ${pkg} breaks its interface since ${tag} but goes from ${from} to ${to}, not a new major.`,
    );
    for (const change of breaks.slice(0, 20)) console.log(`  ${breakText(change)}`);
    if (breaks.length > 20) console.log(`  and ${breaks.length - 20} more`);
    process.exitCode = 1;
  }
} else if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const text = declarationText(readInterface());
  const path = join(ROOT, DECLARATION);
  if (process.argv.includes('--update')) {
    writeFileSync(path, text);
    console.log(`public-api: wrote ${DECLARATION}`);
  } else {
    let committed = '';
    try {
      committed = readFileSync(path, 'utf8');
    } catch {}
    if (committed === text) console.log(`public-api: ${DECLARATION} matches the code`);
    else {
      console.log(`public-api: ${DECLARATION} differs from the code. Run node scripts/public-api.mjs --update`);
      process.exitCode = 1;
    }
  }
}
