// The contract suite of each extension point (editor spec §43, plugin_contract_suites): checks any plug-in runs against
// what it adds, and every built-in passes in CI. Like the host contract, the checks need no test framework: each throws,
// saying what was wanted, when what was added breaks a promise of its point.
import type { DataInfo, ExportedData } from './export-data-model.ts';
import type { DataExporter } from './plugins.ts';

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
  ];
}
