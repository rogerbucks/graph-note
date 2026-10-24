// The contract suite of each extension point (editor spec §43, plugin_contract_suites). It checks any plug-in runs
// against what it adds, and every built-in passes in CI. Like the host contract, the checks need no test framework.
// Each throws, saying what was wanted, when what was added breaks a promise of its point. A point's titles are checked
// for right-to-left too (plugin_rtl). A title forces no direction of its own, so it reads in the host's. A host shows
// each one isolated, so a name keeps its own direction beside it.
import type { DataInfo, ExportedData } from './export-data-model.ts';
import type { DataExporter, GivenGraph, PluginCommand, PluginSource, PluginStep, StorageBackend } from './plugins.ts';
import { joinedGraph } from './plugin-sources.ts';
import { providerProblem } from './plugin-ai.ts';
import type { AiProvider } from './plugin-ai.ts';
import { diagramProblem, drawnMarks } from './plugin-diagrams.ts';
import type { DiagramSpace, PluginDiagram } from './plugin-diagrams.ts';
import type { GraphShape } from './types-shape.ts';
import { storageContract } from './storage-contract.ts';
import type { StorageCheck } from './storage-contract.ts';
import {
  isTokenColour,
  TOKEN_BACKGROUNDS,
  tokenColourProblem,
  tokenContrastProblem,
  tokenNameProblem,
  tokenPrefix,
} from './theme-tokens.ts';
import type { ThemeToken } from './theme-tokens.ts';

/** One check of a contract: what it holds a plug-in to, and the run that throws when the plug-in breaks it. */
export interface PluginCheck {
  name: string;
  run: () => void;
}

const INFO: DataInfo = { note: 'Trips/Trip.md', date: '2026-10-17' };

/** The exports every data export is tried on, made afresh each time: none, a graph with notes, and a view with its faded context. */
export const sampleExports = (): Record<string, ExportedData> => ({
  empty: { graph: 'trip', things: [], links: [] },
  small: {
    graph: 'trip',
    things: [
      ['home', ['Place'], { id: 'home', name: 'Home, "sweet" home', rooms: 3 }],
      ['park', ['Place', 'Green'], { id: 'park', name: 'The park', open: true }],
    ],
    links: [['home', 'NEAR', 'park', { metres: 400 }]],
    notes: { things: [['home', 'Where the trip starts.']], links: [[0, 'A short walk.']] },
  },
  faded: {
    graph: 'trip',
    view: 'Near home',
    things: [
      ['home', ['Place'], { id: 'home', name: 'Home' }],
      ['park', ['Place'], { id: 'park', name: 'The park' }],
    ],
    links: [['home', 'NEAR', 'park', {}]],
    faded: { things: ['park'], links: [0] },
  },
});

/** Fails a check with what was wanted and what the plug-in did. */
function fail(name: string, wanted: string, got: unknown): never {
  throw new Error(`${name}: wanted ${wanted}, got ${JSON.stringify(got)}`);
}

/** The marks that force a direction on text: left-to-right and right-to-left marks, embeddings, overrides, isolates. */
const FORCED_DIRECTION = /[\u200e\u200f\u061c\u202a-\u202e\u2066-\u2069]/u;

/** The check that a title a person reads forces no direction, so it reads in the host's (plugin_rtl). */
const readsInHostDirection = (what: string, title: string): PluginCheck => ({
  name: 'its title reads in the host’s direction, forcing none of its own',
  run: () => {
    if (FORCED_DIRECTION.test(title)) fail(what, 'a title with no direction marks', title);
  },
});

/** Every check a data export is held to. */
export function exporterContract(e: DataExporter): PluginCheck[] {
  const each = (check: (name: string, data: ExportedData) => void) => () => {
    for (const [name, data] of Object.entries(sampleExports())) check(name, data);
  };
  return [
    {
      name: 'it writes text for every export: none, a graph with notes, and a view with its faded context',
      run: each((name, data) => {
        const text: unknown = e.write(data, INFO);
        if (typeof text !== 'string') fail(`${e.format} on ${name}`, 'text', text);
      }),
    },
    {
      name: 'it writes the same bytes each time for the same export',
      run: each((name, data) => {
        const a = e.write(data, INFO);
        const b = e.write(data, INFO);
        if (a !== b) fail(`${e.format} on ${name}`, 'the same text twice', [a.length, b.length]);
      }),
    },
    {
      name: 'it leaves the export it is given as it was',
      run: each((name, data) => {
        const before = JSON.stringify(data);
        e.write(data, INFO);
        if (JSON.stringify(data) !== before) fail(`${e.format} on ${name}`, 'the export unchanged', data);
      }),
    },
    {
      name: 'it is offered under a title, with a file extension and a media type',
      run: () => {
        if (!e.title.trim()) fail(e.format, 'a title', e.title);
        if (!/^[a-z][a-z0-9-]*$/.test(e.extension)) fail(e.format, 'a lower-case extension', e.extension);
        if (!/^[a-z]+\/[a-z0-9.+-]+$/.test(e.mime)) fail(e.format, 'a media type', e.mime);
      },
    },
    readsInHostDirection(e.format, e.title),
  ];
}

/**
 * Every check a storage backend is held to (§41, storage_contract). It is the one note storage contract, run on a store
 * the backend opens afresh for each check, which must start empty. Its title is checked as any title is.
 */
export function storageBackendContract(b: StorageBackend): StorageCheck[] {
  const title = readsInHostDirection(b.name, b.title);
  return [...storageContract(async () => b.open()), { name: title.name, run: async () => title.run() }];
}

/** Every check a command of the plug-in `pluginId` is held to. */
export function commandContract(c: PluginCommand, pluginId: string): PluginCheck[] {
  return [
    {
      name: 'it is named under its plug-in’s own id, and offered under a title on one line',
      run: () => {
        if (!c.id.startsWith(`${pluginId}.`)) fail(c.id, `an id ${pluginId}.<word>`, c.id);
        if (!c.title.trim() || /[\r\n]/.test(c.title)) fail(c.id, 'a title on one line', c.title);
      },
    },
    {
      name: 'it can be run',
      run: () => {
        if (typeof c.run !== 'function') fail(c.id, 'a run', typeof c.run);
        if (c.available !== undefined && typeof c.available !== 'function')
          fail(c.id, 'an available that is a function, or none', typeof c.available);
      },
    },
    readsInHostDirection(c.id, c.title),
  ];
}

/** Every check a theme token of the plug-in `pluginId` is held to (§44, plugin_theme_tokens). */
export function themeTokenContract(t: ThemeToken, pluginId: string): PluginCheck[] {
  const held = (why: string | null, wanted: string, got: unknown) => {
    if (why) fail(t.name, wanted, got);
  };
  const contrast = (theme: 'light' | 'dark'): PluginCheck => ({
    name: `it meets the locked contrast in the ${theme} theme, on the background it sits on`,
    run: () => {
      if (!isTokenColour(t[theme])) fail(t.name, `a colour in the ${theme} theme`, t[theme]);
      if (t.on !== undefined && !Object.hasOwn(TOKEN_BACKGROUNDS, t.on)) fail(t.name, 'a core background', t.on);
      held(tokenContrastProblem(t, theme), `the locked contrast on ${t.on ?? '--gn-bg'}`, t[theme]);
    },
  });
  return [
    {
      name: 'it is named under its plug-in’s own prefix, so it takes no core token’s name and no other plug-in’s',
      run: () => held(tokenNameProblem(t.name, pluginId), `a name ${tokenPrefix(pluginId)}<word>`, t.name),
    },
    {
      name: 'it gives a colour, as #rrggbb or #rgb, for light and dark, on a core background',
      run: () => held(tokenColourProblem(t), 'two colours on --gn-bg or --gn-bg-alt', [t.light, t.dark, t.on]),
    },
    contrast('light'),
    contrast('dark'),
  ];
}

/** The graph every step is tried on, with its class. */
export const SAMPLE_GRAPH: GivenGraph = Object.freeze({
  text: "// graph: trip\n(paris:City {name: 'Paris'}),\n(rome:City {name: 'Rome'}),\n(paris)-[:TO]->(rome)",
  classification: 'Public',
});

/** The check that what a source or step gave back is held as a joined graph: text, within the read limits. */
const heldAs = (what: string, given: unknown) => {
  const g = joinedGraph(given, { plugin: '', place: what }, [], ['Public', 'Restricted']);
  if (typeof g === 'string') fail(what, 'a graph’s text, within the read limits', g);
};

/** Every check a graph source is held to; `target` is a place it can read, as its own tests have one. */
export function sourceContract(s: PluginSource, target: string): StorageCheck[] {
  const title = readsInHostDirection(s.scheme, s.title);
  return [
    {
      name: 'it is chosen by a lower-case word, and offered under a title on one line',
      run: async () => {
        if (!/^[a-z][a-z0-9-]*$/.test(s.scheme)) fail(s.scheme, 'a lower-case word', s.scheme);
        if (!s.title.trim() || /[\r\n]/.test(s.title)) fail(s.scheme, 'a title on one line', s.title);
      },
    },
    {
      name: 'it gives back a graph’s text for a place, within the read limits',
      run: async () => heldAs(`${s.scheme}:${target}`, await s.read(target)),
    },
    ...(s.fetch ? [fetchCheck(s, target)] : []),
    { name: title.name, run: async () => title.run() },
  ];
}

/** The check of a built-in source's `fetch`: it says what it found, or that nothing is there. */
function fetchCheck(s: PluginSource, target: string): StorageCheck {
  return {
    name: 'it says what it found at a place, or that it is missing, as the person’s own',
    run: async () => {
      const got: unknown = await s.fetch?.(target, '');
      if (!got || typeof got !== 'object' || !('found' in got || 'missing' in got))
        fail(s.scheme, 'what was found, or missing', got);
    },
  };
}

/** Every check a graph step of the plug-in `pluginId` is held to, tried on the sample graph. */
export function stepContract(s: PluginStep, pluginId: string): StorageCheck[] {
  const [named, , title] = commandContract({ id: s.id, title: s.title, run: () => {} }, pluginId) as [
    PluginCheck,
    PluginCheck,
    PluginCheck,
  ];
  return [
    { name: named.name, run: async () => named.run() },
    {
      name: 'it gives back a graph’s text for a graph it is given, within the read limits',
      run: async () => heldAs(s.id, await s.run(Object.freeze([SAMPLE_GRAPH]))),
    },
    {
      name: 'it gives back the same graph each time for the same graphs',
      run: async () => {
        const a: unknown = await s.run(Object.freeze([SAMPLE_GRAPH]));
        const b: unknown = await s.run(Object.freeze([SAMPLE_GRAPH]));
        if (JSON.stringify(a) !== JSON.stringify(b)) fail(s.id, 'the same graph twice', [a, b]);
      },
    },
    { name: title.name, run: async () => title.run() },
  ];
}

/** The request every AI provider is tried on. */
const SAMPLE_REQUEST = Object.freeze({
  model: 'sample-1',
  instructions: 'Answer with JSON only.',
  asked: '```graph-data\nGraph trip:\n\n(paris:City)\n```\n\nQuestion: What is missing?',
});

/** Every check an AI provider is held to (trust_ai_provider_bounded): it shapes text, the same each time, and reads any reply. */
export function providerContract(p: AiProvider): PluginCheck[] {
  return [
    {
      name: 'it is named by a lower-case word, and puts the key only in a header it may',
      run: () => {
        const why = providerProblem(p, new Map());
        if (why) fail(p.name, 'a provider the registry accepts', why);
      },
    },
    {
      name: 'it shapes a request as text, the same each time, holding what it was asked',
      run: () => {
        const a: unknown = p.shape(SAMPLE_REQUEST);
        if (typeof a !== 'string') fail(p.name, 'text', a);
        if (a !== p.shape(SAMPLE_REQUEST)) fail(p.name, 'the same text twice', a);
        if (!a.includes('graph-data')) fail(p.name, 'the asked text, fence and all', a);
      },
    },
    {
      name: 'it reads an answer, a refusal or nothing from any reply, and never throws',
      run: () => {
        for (const reply of [
          { status: 200, text: '{}' },
          { status: 500, text: 'down' },
          { status: 200, text: 'not json' },
        ]) {
          const r: unknown = p.read(reply);
          const said: unknown = r && typeof r === 'object' ? Object.values(r)[0] : undefined;
          if (typeof said !== 'string') fail(p.name, 'an answer, a refusal or why it read none', r);
        }
      },
    },
    readsInHostDirection(p.name, p.title),
  ];
}

/** The shapes every diagram type is tried on: none, and the sample graph's two cities and their link. */
const SAMPLE_SHAPES: Record<string, GraphShape> = {
  empty: { things: [], links: [] },
  small: {
    things: [
      { key: 'paris', text: 'Paris', kinds: ['City'] },
      { key: 'rome', text: 'Rome', kinds: ['City'] },
    ],
    links: [{ from: 'paris', type: 'TO', to: 'rome' }],
  },
};
const SAMPLE_SPACE: DiagramSpace = Object.freeze({ width: 400, height: 300 });

/** Every check a diagram type of the plug-in `pluginId` is held to (trust_diagram_type_data). */
export function diagramContract(d: PluginDiagram, pluginId: string): StorageCheck[] {
  const title = readsInHostDirection(d.type, d.title);
  const drawn = async (shape: GraphShape) => d.draw(Object.freeze({ shape, space: SAMPLE_SPACE }));
  return [
    {
      name: 'it is named under its plug-in’s own id, as a style graph chooses it, and offered under a title on one line',
      run: async () => {
        const why = diagramProblem(d, pluginId, new Map());
        if (why) fail(d.type, 'a diagram type the registry accepts', why);
      },
    },
    {
      name: 'it gives back marks as data, inside the space it was given, for an empty graph and a small one',
      run: async () => {
        for (const [name, shape] of Object.entries(SAMPLE_SHAPES)) {
          const marks = drawnMarks(await drawn(shape), SAMPLE_SPACE);
          if (typeof marks === 'string')
            fail(`${d.type} on ${name}`, 'boxes, lines and text, or drawing marks, in the space', marks);
        }
      },
    },
    {
      name: 'it gives back the same marks each time for the same graph',
      run: async () => {
        const a: unknown = await drawn(SAMPLE_SHAPES.small as GraphShape);
        const b: unknown = await drawn(SAMPLE_SHAPES.small as GraphShape);
        if (JSON.stringify(a) !== JSON.stringify(b)) fail(d.type, 'the same marks twice', [a, b]);
      },
    },
    { name: title.name, run: async () => title.run() },
  ];
}
