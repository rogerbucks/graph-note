// The editor's options (spec §21): each with its name and a sentence saying what it does, its choices and its default,
// so a host's settings page shows every one, and saved settings are read back with anything unknown or out of range
// left out. Nothing secret is kept: an AI model names its key in the host's own secret store (§19), never the key.
import { DEPARTURES } from './strictness.ts';
import type { Departure, Strictness, StrictnessSettings } from './strictness.ts';
import { STYLE } from './layout.ts';

/** An AI model set up for §19: what it is for, and its ceiling — the highest classification of note it may be sent. */
export interface AiModel {
  name: string;
  purpose: string;
  ceiling: string;
  /** Where requests go, set by the user; nothing is sent unless the user sends it. */
  endpoint: string;
  model: string;
  /** The name of its key in the host's secret store: never the key itself. */
  keyName: string;
}

/** How a line the editor writes is indented. */
export type Indent = 'two' | 'four' | 'tab';

/** Every option the editor offers. */
export interface Settings extends StrictnessSettings {
  /** The classifications a note may carry, lowest first: the ceilings an AI model may be given. */
  classifications: string[];
  aiModels: AiModel[];
  indent: Indent;
  /** The best fit of the locked style's directions, or one of them. */
  direction: string;
}

/** The settings before any is changed. */
export const DEFAULT_SETTINGS: Settings = {
  strictness: 'forgiving',
  allowed: [],
  classifications: ['Public', 'Internal', 'Confidential', 'Restricted'],
  aiModels: [],
  indent: 'four',
  direction: 'best',
};

/** One choice of an option: its value, its name, and, where it needs one, a sentence. */
export interface Choice {
  value: string;
  name: string;
  sentence?: string;
}

/** One option on the settings page: the setting it sets, its part of the page, its name, its sentence, its choices. */
export interface Option {
  key: keyof Settings;
  section: 'Strictness' | 'AI models' | 'Formatting' | 'Drawing';
  name: string;
  sentence: string;
  choices?: Choice[];
}

const LEVELS: Choice[] = [
  { value: 'standard', name: 'Standard', sentence: 'Every departure from standard GQL is an error.' },
  {
    value: 'forgiving',
    name: 'Forgiving',
    sentence: 'A slip is read as meant, reported as a warning, and offered its fix.',
  },
  { value: 'simplified', name: 'Simplified', sentence: 'The departures chosen below are allowed as written.' },
];

const INDENTS: Choice[] = [
  { value: 'two', name: 'Two spaces' },
  { value: 'four', name: 'Four spaces' },
  { value: 'tab', name: 'A tab' },
];

/** Every option, in the order the settings page shows them. */
export const OPTIONS: Option[] = [
  {
    key: 'strictness',
    section: 'Strictness',
    name: 'Strictness',
    sentence: 'How strictly a graph is read against standard GQL.',
    choices: LEVELS,
  },
  {
    key: 'allowed',
    section: 'Strictness',
    name: 'Allowed in Simplified',
    sentence:
      'The departures from standard GQL that Simplified allows as written; an engine or export still gets standard GQL.',
    choices: DEPARTURES.map((d) => ({ value: d.id, name: d.name, sentence: d.sentence })),
  },
  {
    key: 'classifications',
    section: 'AI models',
    name: 'Classifications',
    sentence: 'The classifications a note may carry, lowest first, one per line.',
  },
  {
    key: 'aiModels',
    section: 'AI models',
    name: 'AI models',
    sentence:
      'Each AI model the editor may ask, with its purpose and its ceiling, the highest classification of note it may be sent.',
  },
  {
    key: 'indent',
    section: 'Formatting',
    name: 'Indent',
    sentence: 'How the editor indents the later lines of a thing it writes.',
    choices: INDENTS,
  },
  {
    key: 'direction',
    section: 'Drawing',
    name: 'Direction',
    sentence: 'Which way a drawing runs: the best fit, or always one of the directions the locked style allows.',
    choices: [
      { value: 'best', name: 'Best fit' },
      ...STYLE.directions.map((d) => ({ value: d, name: d === 'LR' ? 'Left to right' : 'Top to bottom' })),
    ],
  },
];

const text = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback);
const oneOf = <T extends string>(key: keyof Settings, v: unknown, fallback: T): T =>
  (OPTIONS.find((o) => o.key === key)?.choices ?? []).some((c) => c.value === v) ? (v as T) : fallback;

/** An AI model from what was given, with only its own fields: whatever else was given, such as a key, is dropped. */
export function aiModel(given: Partial<AiModel> & Record<string, unknown>, classifications?: string[]): AiModel {
  const levels = classifications ?? DEFAULT_SETTINGS.classifications;
  const ceiling = text(given.ceiling);
  return {
    name: text(given.name),
    purpose: text(given.purpose),
    ceiling: classifications && !levels.includes(ceiling) ? (levels[0] ?? '') : ceiling || (levels[0] ?? ''),
    endpoint: text(given.endpoint),
    model: text(given.model),
    keyName: text(given.keyName),
  };
}

/** Settings read back from what was saved: each known one kept when it is in range, else its default. */
export function settingsFrom(saved: unknown): Settings {
  const s = saved && typeof saved === 'object' ? (saved as Record<string, unknown>) : {};
  const d = DEFAULT_SETTINGS;
  const isDeparture = (a: unknown): a is Departure => DEPARTURES.some((x) => x.id === a);
  const given: unknown[] = Array.isArray(s.classifications) ? s.classifications : [];
  const levels = given.filter((c): c is string => typeof c === 'string');
  const classifications = levels.length && levels.length === given.length ? levels : d.classifications;
  return {
    strictness: oneOf<Strictness>('strictness', s.strictness, d.strictness),
    allowed: Array.isArray(s.allowed) ? (s.allowed as unknown[]).filter(isDeparture) : d.allowed,
    classifications: [...classifications],
    aiModels: Array.isArray(s.aiModels)
      ? s.aiModels
          .filter((m): m is Record<string, unknown> => !!m && typeof m === 'object')
          .map((m) => aiModel(m, classifications))
      : d.aiModels,
    indent: oneOf<Indent>('indent', s.indent, d.indent),
    direction: oneOf('direction', s.direction, d.direction),
  };
}

/** The text an indent setting writes. */
export const indentText = (indent: Indent): string => (indent === 'two' ? '  ' : indent === 'tab' ? '\t' : '    ');
