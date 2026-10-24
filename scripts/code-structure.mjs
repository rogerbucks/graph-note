// How the code is structured, from requirements/architecture.gql (editor spec §43, structure_checked). A part of the
// architecture may be cut into areas. Each area names its files, what it does and the spec section it serves. Every
// shipped file of such a part must sit in exactly one area, and an area holds no more files than its ceiling. So a new
// file has to be placed, and a crowded area has to be split or its ceiling raised on purpose. The areas and the imports
// between them are drawn on the wiki's Architecture page by scripts/wiki-developers.mjs.
//
//   node scripts/code-structure.mjs   lists each fault, and fails when there is one
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { importGraph } from './import-graph.mjs';

const require = createRequire(import.meta.url);
const gs = require('../packages/graph-spec/src/graph-spec-check.js');
const ROOT = fileURLToPath(new URL('..', import.meta.url));

/** An area with no `most` of its own holds this many files at most. */
export const MOST_FILES = 40;

// the shipped code: not a test, its support, a type declaration or what a build writes
const CODE = /\.(ts|js|mjs|cjs)$/;
const LEFT_OUT =
  /(^|\/)tests?\/|(^|\/)dist\/|\.d\.ts$|^main\.js$|^packages\/claude-code\/mod\/(hooks\/graph\.js|bin\/)/;

/** A glob as a regular expression: `*` is any run inside one folder, `**` any run of folders. */
export function globToRegExp(glob) {
  const source = glob
    .split(/(\*\*\/?|\*)/)
    .map((piece) => {
      if (piece === '**/') return '(?:.*/)?';
      if (piece === '**') return '.*';
      if (piece === '*') return '[^/]*';
      return piece.replace(/[.+^${}()|[\]\\?]/g, '\\$&');
    })
    .join('');
  return new RegExp(`^${source}$`);
}

/**
 * The structure in `architecture` (the text of architecture.gql): the parts with a path, and the areas of each. An area
 * is {id, name, does, section, part, globs, most}. Parts are sorted so the one with the longest path, the closest
 * folder, comes first.
 */
export function readStructure(architecture) {
  const g = gs.worldFromStore(gs.read([architecture])).project_architecture;
  const text = (id, key) => (g.p(id)[key] === undefined ? undefined : String(g.p(id)[key]));
  const parts = g
    .labelled('Part')
    .filter((p) => g.p(p).path)
    .map((p) => ({ id: p, name: text(p, 'name'), path: text(p, 'path'), areas: [] }))
    .sort((a, b) => b.path.length - a.path.length);
  const byId = new Map(parts.map((p) => [p.id, p]));
  const areas = g.labelled('Area').map((a) => ({
    id: a,
    name: text(a, 'name') ?? a,
    does: text(a, 'does'),
    section: text(a, 'section'),
    part: g.out(a, 'PART_OF')[0]?.[2],
    globs: (text(a, 'files') ?? '').split(/\s+/).filter(Boolean),
    most: g.p(a).most === undefined ? MOST_FILES : Number(g.p(a).most),
  }));
  for (const a of areas) if (byId.has(a.part)) byId.get(a.part).areas.push(a);
  return { parts, areas };
}

/** The part a file belongs to: the one whose folder holds it most closely; undefined for none. */
const partOf = (parts, file) => parts.find((p) => file === p.path || file.startsWith(`${p.path}/`));

/** The areas of `part` that match `file`. */
const areasOf = (part, file) => part.areas.filter((a) => a.globs.some((glob) => globToRegExp(glob).test(file)));

/** The shipped code among `files`. */
export const shippedCode = (files) => files.filter((f) => CODE.test(f) && !LEFT_OUT.test(f));

/**
 * Each fault of the structure, as a line naming the thing. A fault is one of these:
 * - an area in no part with a path, or with no files, no words for what it does or no section;
 * - a shipped file of a part that has areas, but in none of them, or in more than one;
 * - an area matching no file, or more files than its ceiling.
 */
export function structureProblems(structure, files) {
  const { parts, areas } = structure;
  const problems = [];
  const counts = new Map(areas.map((a) => [a.id, 0]));
  for (const a of areas) {
    if (!parts.some((p) => p.id === a.part))
      problems.push(`${a.id}: the area is in no built part: link it with PART_OF`);
    if (!a.globs.length) problems.push(`${a.id}: name the area's files`);
    if (!a.does) problems.push(`${a.id}: say what the area does`);
    if (!a.section) problems.push(`${a.id}: name the spec section the area serves`);
  }
  for (const file of shippedCode(files)) {
    const part = partOf(parts, file);
    if (!part || !part.areas.length) continue;
    const found = areasOf(part, file);
    if (found.length === 0)
      problems.push(`${file}: in no area of ${part.id}: add it to one in requirements/architecture.gql`);
    if (found.length > 1) problems.push(`${file}: in more than one area: ${found.map((a) => a.id).join(', ')}`);
    for (const a of found) counts.set(a.id, counts.get(a.id) + 1);
  }
  for (const a of areas) {
    const n = counts.get(a.id);
    if (a.globs.length && parts.some((p) => p.id === a.part) && n === 0)
      problems.push(`${a.id}: the area matches no file`);
    if (n > a.most)
      problems.push(
        `${a.id}: ${n} files, over its ceiling of ${a.most}: split the area, or raise its most with a reason`,
      );
  }
  return problems;
}

/**
 * The facts of the structure, for the wiki. Each part with areas gives its areas with their file and line counts, the
 * imports between its areas, and the pairs that import each other. Files are read through `read(path)`.
 */
export function structureFacts(structure, files, read) {
  const shipped = shippedCode(files);
  const graph = importGraph(shipped, read);
  const areaOf = new Map();
  for (const file of shipped) {
    const part = partOf(structure.parts, file);
    if (part?.areas.length) areaOf.set(file, areasOf(part, file)[0]);
  }
  return structure.parts
    .filter((p) => p.areas.length)
    .map((part) => {
      const areas = part.areas.map((a) => ({ ...a, files: 0, lines: 0 }));
      const by = new Map(areas.map((a) => [a.id, a]));
      const edges = new Map();
      for (const [file, area] of areaOf) {
        if (!by.has(area?.id)) continue;
        const own = by.get(area.id);
        own.files += 1;
        own.lines += read(file).split('\n').length;
        for (const to of graph.get(file) ?? []) {
          const other = areaOf.get(to);
          if (!other || other.id === area.id || !by.has(other.id)) continue;
          const key = `${area.id} ${other.id}`;
          edges.set(key, (edges.get(key) ?? 0) + 1);
        }
      }
      const list = [...edges].map(([key, count]) => {
        const [from, to] = key.split(' ');
        return { from, to, count };
      });
      const cycles = list.filter((e) => e.from < e.to && edges.has(`${e.to} ${e.from}`)).map((e) => [e.from, e.to]);
      return { part: part.id, name: part.name, path: part.path, areas, edges: list, cycles };
    });
}

/** A label as Mermaid reads it inside quotes: no quote, and no bracket it could take for syntax. */
const label = (text) => String(text).replace(/"/g, "'").replace(/[<>]/g, '');

/**
 * One part's areas drawn as ThoughtKnot draws a graph. Each area is a box with its kind and file count under its name.
 * An arrow goes each way one area imports another, marked with how many files do. Mermaid draws the layout.
 */
export function structureChart(fact) {
  const lines = ['```mermaid', 'flowchart TB'];
  for (const a of fact.areas) lines.push(`  ${a.id}["${label(a.name)}<br/><i>:Area</i> · ${a.files} files"]`);
  for (const e of fact.edges) lines.push(`  ${e.from} -->|${e.count}| ${e.to}`);
  lines.push('```');
  return lines.join('\n');
}

/** One part's areas as a table, then its cycles: the pairs of areas that import each other. */
export function structureTable(fact) {
  const rows = [...fact.areas].sort((a, b) => b.files - a.files);
  const lines = [
    '| Area | What it does | Spec | Files | Lines | Ceiling |',
    '| --- | --- | --- | ---: | ---: | ---: |',
    ...rows.map((a) => `| ${a.name} | ${a.does} | §${a.section} | ${a.files} | ${a.lines} | ${a.most} |`),
  ];
  if (fact.cycles.length) {
    const name = (id) => fact.areas.find((a) => a.id === id).name;
    lines.push('', `Areas that import each other, which a split would have to untangle:`, '');
    for (const [a, b] of fact.cycles) lines.push(`- ${name(a)} ↔ ${name(b)}`);
  }
  return lines.join('\n');
}

/** The Architecture page's structure section: each part with areas, its chart and its table. */
export function structureSection(facts) {
  return facts
    .map((f) => [`### ${f.name} (\`${f.path}\`)`, '', structureChart(f), '', structureTable(f)].join('\n'))
    .join('\n\n');
}

/** The repository's own files, as git lists them. */
export const repoFiles = () =>
  execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean);

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
  const problems = structureProblems(readStructure(read('requirements/architecture.gql')), repoFiles());
  for (const p of problems) console.log(p);
  console.log(
    problems.length
      ? `structure: ${problems.length} faults`
      : 'structure: every file is in one area, and no area is over its ceiling',
  );
  process.exitCode = problems.length ? 1 : 0;
}
