// The wiki's pages for developers (spec §41, developer_wiki): the architecture, writing a plug-in, adding a host and the
// reference. Each list is made from the file that defines it, so the pages change when the code does.
//
// The architecture is a graph note of its own, requirements/architecture.gql. It is drawn as ThoughtKnot draws a graph.
// There is a box for each thing, its kind under its name, and a dashed box for one not built yet. Each requirement is
// shown with where it stands: in the latest release, on main only (the nightly build), being built, or planned.
// scripts/wiki.mjs fills the pages' markers from here.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readBoard } from './slice-board.mjs';
import { architectureChart, architectureProblems, label, readArchitecture } from './wiki-architecture.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPO = 'https://github.com/rogerbucks/thoughtknot';
const cell = (text) => String(text).replace(/[\\|]/g, '\\$&').replace(/</g, '&lt;');
const fileLink = (path) => `[\`${path}\`](${REPO}/blob/main/${path})`;

/** What each extension point of the plug-in interface lets a plug-in add; a point missing here fails the wiki's make. */
export const POINT_ABOUT = {
  exports: 'A data export: a format offered in Export, with its title, file extension, media type and writer.',
  theme: 'Colours of its own, named under its id, in light and dark, each meeting the locked contrast.',
  storage: 'A place notes are kept, such as a server or a cloud drive, that passes the note storage contract.',
  commands: 'A command a person runs from the host’s command list, named under its id.',
  panels: 'A panel shown beside a graph, drawn right to left in a right-to-left host, with logical sides only.',
  sources:
    'A place graphs are read from, such as a database. Its graph is held as a joined graph: untrusted, and strictest when unlabelled.',
  steps:
    'A step that makes a graph from others, named under its id. Its graph keeps the lowest trust and strictest class it was given.',
};

/** Where a requirement stands, as a mark and words: in the latest release, on main only, being built, or planned. */
export const STATES = {
  released: '✅ Released',
  nightly: '🌙 Nightly only',
  part: '🟡 Being built',
  open: '⏳ Planned',
};

/**
 * Each requirement's state, by id. `requirements` are as readBoard gives them, today on main. `released` is the same
 * for the latest stable release. It is null when there is none to compare with, and then every proved requirement
 * counts as released.
 */
export function requirementStates(requirements, released) {
  const then = released ? new Map(released.map((r) => [r.id, r.status])) : null;
  return new Map(
    requirements.map((r) => {
      if (r.status !== 'proved') return [r.id, r.status === 'part' ? 'part' : 'open'];
      return [r.id, !then || then.get(r.id) === 'proved' ? 'released' : 'nightly'];
    }),
  );
}

/** The layers as a table: what each does, and its parts with their guides; a part not built yet names its requirement. */
export function layersTable(arch, states) {
  const rows = arch.layers.map((l) => {
    const parts = arch.parts
      .filter((p) => p.layer === l.id)
      .map((p) =>
        p.path
          ? p.guide
            ? `[${cell(p.name)}](${REPO}/blob/main/${p.guide})`
            : cell(p.name)
          : `${cell(p.name)} (${STATES[states.get(p.requirement) ?? 'open']}, \`${p.requirement}\`)`,
      );
    return `| **${cell(l.name)}** | ${cell(l.does)} | ${parts.join('<br/>') || '—'} |`;
  });
  return ['| Layer | What it does | Parts |', '|---|---|---|', ...rows].join('\n');
}

/** The interfaces as a table: where each is defined, its contract checks, its page, and where its requirements stand. */
export function interfacesTable(arch, states) {
  const rows = arch.interfaces.map((i) => {
    const where = [i.file && fileLink(i.file), i.contract && `checks: ${fileLink(i.contract)}`].filter(Boolean);
    const reqs = i.requirements.map((id) => `${STATES[states.get(id) ?? 'open'].split(' ')[0]} \`${id}\``);
    const name = i.page ? `[${cell(i.name)}](${i.page})` : cell(i.name);
    return `| ${name} | ${where.join('<br/>') || 'Not written yet'} | ${reqs.join('<br/>')} |`;
  });
  return ['| Interface | Where it is defined | Requirements |', '|---|---|---|', ...rows].join('\n');
}

/**
 * One section of the requirements, shown as ThoughtKnot shows a graph. First a drawing: each requirement a box joined
 * to its section and grouped by where it stands. Then the same as a table, with its rule in full.
 */
export function sectionView(num, board, states) {
  const section = board.sections.find((s) => s.num === num);
  if (!section) throw new Error(`<!-- wiki:section ${num} -->: no section ${num} in the requirements`);
  const reqs = board.requirements.filter((r) => r.section === num);
  const chart = ['```mermaid', 'flowchart LR', `  s${num}(["§${num} ${label(section.title)}<br/><i>:Section</i>"])`];
  for (const [state, words] of Object.entries(STATES)) {
    const of = reqs.filter((r) => states.get(r.id) === state);
    if (!of.length) continue;
    chart.push(`  subgraph g_${state}["${words}"]`);
    for (const r of of) chart.push(`    ${r.id}["${r.id}<br/><i>:Requirement</i>"]`);
    chart.push('  end');
    chart.push(`  s${num} --- g_${state}`);
  }
  chart.push('```');
  const rows = reqs.map((r) => `| \`${r.id}\` | ${STATES[states.get(r.id)]} | ${r.level} | ${cell(r.rule)} |`);
  return [chart.join('\n'), '', '| Requirement | Where it stands | Level | Rule |', '|---|---|---|---|', ...rows].join(
    '\n',
  );
}

/** The extension points as a table: the word a manifest names, and what a plug-in adds through it. */
export function pointsTable(points) {
  const rows = points.map((p) => {
    if (!(p in POINT_ABOUT))
      throw new Error(`the extension point "${p}" has no words in POINT_ABOUT (scripts/wiki-developers.mjs)`);
    return `| \`${p}\` | ${cell(POINT_ABOUT[p])} |`;
  });
  return ['| Extension point | What a plug-in adds through it |', '|---|---|', ...rows].join('\n');
}

/** A list of contract checks, each as a ticked line, as the contract names them. */
export const checksList = (names) => names.map((n) => `- ☑ ${n}`).join('\n');

/** The plug-ins built in, each with what it adds: [{id, version, uses, formats}]. */
export function builtInTable(builtIns) {
  const rows = builtIns.map(
    (b) =>
      `| \`${b.id}\` | ${b.version} | ${b.uses.map((u) => `\`${u}\``).join(', ')} | ${b.adds.map(cell).join(', ')} |`,
  );
  return ['| Plug-in | Version | Uses | Adds |', '|---|---|---|---|', ...rows].join('\n');
}

/** The members of `interface DisplayHost` in host.ts: [{name, optional, says}], each with its doc comment in one line. */
export function hostMembers(source) {
  const body = /export interface DisplayHost \{([\s\S]*?)\n\}/.exec(source)?.[1];
  if (!body) throw new Error('no interface DisplayHost in packages/core/src/display/host.ts');
  const members = [];
  for (const m of body.matchAll(/\/\*\*([\s\S]*?)\*\/\s*(\w+)(\??):/g))
    members.push({
      name: m[2],
      optional: m[3] === '?',
      says: m[1]
        .split('\n')
        .map((l) => l.replace(/^\s*\*\s?/, '').trim())
        .filter(Boolean)
        .join(' '),
    });
  return members;
}

/** The host interface as a table: each member, whether a host must give it, and what it is for. */
export function hostTable(members) {
  const rows = members.map((m) => `| \`${m.name}\` | ${m.optional ? 'Optional' : 'Required'} | ${cell(m.says)} |`);
  return ['| Member | | What it is for |', '|---|---|---|', ...rows].join('\n');
}

/** The design tokens as a table: each token, its kind and what it paints, sets or spaces. */
export function tokensTable(tokens) {
  const rows = Object.entries(tokens).map(([name, t]) => `| \`${name}\` | ${t.kind} | ${cell(t.says)} |`);
  return ['| Token | Kind | What it is for |', '|---|---|---|', ...rows].join('\n');
}

/** The problem codes as a table, by code: the message, its fix, the spec section and the libraries that raise it. */
export function problemCodesTable(codes) {
  const lib = { both: 'JavaScript, Python', js: 'JavaScript', py: 'Python' };
  const rows = codes.map((c) => {
    const libs = c.libraries.length === 2 ? lib.both : lib[c.libraries[0]];
    return `| \`${c.code}\` | ${cell(c.message)} | ${cell(c.fix)} | ${c.section ? `§${c.section}` : '—'} | ${libs} |`;
  });
  return ['| Code | Problem | Fix | Spec | Raised by |', '|---|---|---|---|---|', ...rows].join('\n');
}

/** The line each developer page opens with: what it describes, and the release it is compared with. */
export function editionNote(latest) {
  return latest
    ? `> This page describes **main**, which the nightly build is made from. The latest release is ` +
        `**[${latest}](${REPO}/releases/tag/${latest})**: ✅ is in it, 🌙 is only in the nightly build, ` +
        `🟡 is being built and ⏳ is planned.`
    : `> This page describes **main**, which the nightly build is made from: ✅ is built, 🟡 is being built and ⏳ is planned.`;
}

/**
 * The markers the developer pages use, filled from `dev`. It gives the architecture text and the facts read from the
 * code: {points, pluginApi, exporterChecks, tokenChecks, builtIns, hostSource, hostChecks, hostVersion, tokens}. It
 * also gives the board and states of the requirements and the latest release's tag.
 */
export function developerFills(dev, board, states, latest) {
  const arch = readArchitecture(dev.architectureText);
  return {
    edition: editionNote(latest),
    architecture: architectureChart(arch),
    layers: layersTable(arch, states),
    interfaces: interfacesTable(arch, states),
    section: (num) => sectionView(num, board, states),
    'plugin-api': `\`${dev.pluginApi}\``,
    'plugin-points': pointsTable(dev.points),
    'plugin-checks':
      `**Every data export** (\`exporterContract\`):\n\n${checksList(dev.exporterChecks)}\n\n` +
      `**Every theme colour** (\`themeTokenContract\`):\n\n${checksList(dev.tokenChecks)}\n\n` +
      `**Every storage** (\`storageBackendContract\`):\n\n${checksList(dev.storageChecks)}\n\n` +
      `**Every command** (\`commandContract\`):\n\n${checksList(dev.commandChecks)}`,
    'built-in-plugins': builtInTable(dev.builtIns),
    'host-members': hostTable(hostMembers(dev.hostSource)),
    'host-checks': checksList(dev.hostChecks),
    'host-version': `\`${dev.hostVersion}\``,
    'theme-tokens': tokensTable(dev.tokens),
  };
}

/** The Developer reference page, without the footer the wiki adds: the versions, the problem codes and the standard schemas. */
export function referencePage(dev, latest) {
  const schemas = dev.schemas.map((s) => {
    const [first, about] = s.split('\n');
    return `| \`${/SCHEMA\s+(\S+)/.exec(first)?.[1] ?? first}\` | ${cell((about ?? '').replace(/^\/\/\s*/, ''))} |`;
  });
  return [
    '# Developer reference',
    '',
    editionNote(latest),
    '',
    'The numbers and lists a plug-in, a host or a tool that reads graph notes is built against.',
    '',
    '## Versions',
    '',
    '| Interface | Version | Changes when |',
    '|---|---|---|',
    `| Plug-in interface (\`PLUGIN_API\`) | \`${dev.pluginApi}\` | A plug-in built for another version is refused. |`,
    `| Host interface (\`HOST_CONTRACT_VERSION\`) | \`${dev.hostVersion}\` | Every change to \`DisplayHost\`. |`,
    '',
    '## Problem codes',
    '',
    'Every problem the reader raises has a stable code, the same in JavaScript and Python, and given as the Language ' +
      'Server Protocol diagnostic code. A code is never reused. Each `{name}` is filled in by the problem.',
    '',
    problemCodesTable(dev.problemCodes),
    '',
    '## Standard schemas',
    '',
    'A graph can name one in its first line, such as `// graph: reader · schema decision@1`, and needs no schema of its own.',
    '',
    '| Schema | What it is for |',
    '|---|---|',
    ...schemas,
    '',
  ].join('\n');
}

/**
 * The architecture graph and what the developer pages show of the code, read from the files that define it. It throws,
 * naming each fault, when the architecture graph names a path or a requirement that is not there.
 */
export async function developerFacts() {
  const { EXTENSION_POINTS, PLUGIN_API, pluginRegistry } = await import('../packages/core/src/plugins.ts');
  const contracts = await import('../packages/core/src/plugins-contract.ts');
  const { commandContract, exporterContract, storageBackendContract, themeTokenContract } = contracts;
  const { HOST_CONTRACT_VERSION, hostContract } = await import('../packages/core/src/display/host-contract.ts');
  const { THEME_TOKENS } = await import('../packages/core/src/theme-tokens.ts');
  const { CORE_EXPORTS } = await import('../packages/core/src/export-data.ts');
  const { memoryStorage } = await import('../packages/core/src/note-storage.ts');
  const { CORE_STORAGE } = await import('../packages/core/src/core-storage.ts');
  const { STANDARD_SCHEMAS } = await import('../packages/core/src/standard-schemas.ts');
  const text = (rel) => readFileSync(join(ROOT, rel), 'utf8');
  const builtIns = [CORE_EXPORTS, CORE_STORAGE].map((p) => {
    const registry = pluginRegistry();
    registry.register(p);
    const adds = [
      ...registry.exporters().map((e) => `${e.title} export`),
      ...registry.themeTokens().map((t) => t.name),
      ...registry.storages().map((b) => `${b.title} storage`),
      ...registry.commands().map((c) => `${c.title} command`),
    ];
    return { id: p.id, version: p.version, uses: p.uses, adds };
  });
  const exporter = { format: 'x', title: 'X', extension: 'x', mime: 'text/plain', write: () => '' };
  const token = { name: '--gn-plugin-x-y-z', light: '#000000', dark: '#ffffff' };
  const architectureText = text('requirements/architecture.gql');
  const faults = architectureProblems(
    readArchitecture(architectureText),
    readBoard(text('requirements/editor-requirements.md')).requirements,
    (rel) => existsSync(join(ROOT, rel)),
  );
  if (faults.length) throw new Error(`requirements/architecture.gql:\n${faults.join('\n')}`);
  return {
    architectureText,
    points: [...EXTENSION_POINTS],
    pluginApi: PLUGIN_API,
    exporterChecks: exporterContract(exporter).map((c) => c.name),
    tokenChecks: themeTokenContract(token, 'x.y').map((c) => c.name),
    storageChecks: storageBackendContract({ name: 'x', title: 'X', open: memoryStorage }).map((c) => c.name),
    commandChecks: commandContract({ id: 'x.y.z', title: 'X', run: () => {} }, 'x.y').map((c) => c.name),
    builtIns,
    hostSource: text('packages/core/src/display/host.ts'),
    hostChecks: hostContract(() => {
      throw new Error('the names alone are read');
    }).map((c) => c.name),
    hostVersion: HOST_CONTRACT_VERSION,
    tokens: THEME_TOKENS,
    problemCodes: JSON.parse(text('packages/graph-spec/src/reader/problem-codes.json')).codes,
    schemas: [...STANDARD_SCHEMAS],
  };
}
