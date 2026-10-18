// The editor's options (spec §21), each with its name, a sentence saying what it does, its choices and its default. So
// a host's settings page shows every one. Saved settings are read back with anything unknown or out of range left out.
// Nothing secret is kept: an AI model names its key in the host's own secret store (§19), never the key.
import { DEPARTURES } from './strictness.ts';
import type { Departure, Strictness, StrictnessSettings } from './strictness.ts';
import { STYLE } from './layout.ts';
import { switchesFrom } from './ai-matrix.ts';
import type { AiModel } from './ai-model.ts';
import { vaultFolder } from './vault-folder.ts';
import { AID_OPTIONS } from './settings-aids.ts';
import { MATRIX_OPTIONS } from './settings-matrix.ts';
import type { DrawingHeightSetting, MiniMapSetting } from './settings-aids.ts';

export type { DrawingHeightSetting, MiniMapSetting } from './settings-aids.ts';

export type { AiModel } from './ai-model.ts';

/** How a line the editor writes is indented. */
export type Indent = 'two' | 'four' | 'tab';

/** How far focus reaches (§25): `one` step, the default, or `two`. */
export type FocusDepthSetting = 'one' | 'two';

/** The theme an exported image is drawn in, its colours fixed so it reads the same outside Obsidian (§16). */
export type ExportTheme = 'light' | 'dark';

/** Whether an export saved into the vault also gets a companion note (§16). */
export type CompanionSetting = 'off' | 'on';

/** Whether AI is used at all (§19, ai_off_until_chosen): off until the user turns it on. */
export type AiUse = 'off' | 'on';

/** A switch of the View menu as the settings hold its default (§25, view_switch_defaults): on or off. */
export type SwitchSetting = 'on' | 'off';

/** Every option the editor offers. */
export interface Settings extends StrictnessSettings {
  /** Whether the editor may send anything to an AI model: off until the user turns it on. */
  aiUse: AiUse;
  /** The classifications a note may carry, lowest first: the ceilings an AI model may be given. */
  classifications: string[];
  /** The level a note with no classification counts as for AI (§19, unclassified_strictest): the highest until chosen. */
  aiUnlabelled: string;
  aiModels: AiModel[];
  /** The note that holds the destination matrix, by its path; empty when the vault keeps none. */
  aiMatrixNote: string;
  /** Matrix class names mapped by hand to the classification each stands for. */
  aiClassMap: Record<string, string>;
  indent: Indent;
  /** The best fit of the locked style's directions, or one of them. */
  direction: string;
  /** How far focus reaches from a selected thing: one step, or two (§25). */
  focusDepth: FocusDepthSetting;
  /** Each View menu switch's default, used by every graph until its View menu changes it (§25). */
  labelsByZoom: SwitchSetting;
  foldHubs: SwitchSetting;
  foldGroups: SwitchSetting;
  mergeLinks: SwitchSetting;
  /** Whether each note is drawn on the drawing as a callout joined to its thing by a dashed line (§24, note_callouts). */
  noteCallouts: SwitchSetting;
  /** When the small copy of the whole drawing, with the visible part outlined, shows (§24, mini_map_setting). */
  miniMap: MiniMapSetting;
  /** Whether the details panel stays open beside or below the drawing, showing the graph's summary (§24, details_always_visible). */
  detailsOpen: SwitchSetting;
  /** How much of the window a drawing in a note may take (§24, drawing_height_setting). */
  drawingHeight: DrawingHeightSetting;
  /** The colours exported images are drawn in. */
  exportTheme: ExportTheme;
  /** Whether an export saved in the vault gets a companion note. */
  companionNote: CompanionSetting;
  /** The vault folder exports are saved in, without a leading or trailing slash; empty is next to the note. */
  exportFolder: string;
  /** The classification above which an export asks first: one of `classifications`. */
  exportAsksAbove: string;
  /** The name recorded when you accept or reject a change in a proposal, as typed; empty records "you" (§17). */
  decider: string;
}

/** The most characters a decider's name is kept to. */
const MOST_NAME = 200;

const CLASSIFICATIONS = ['Public', 'Internal', 'Confidential', 'Restricted'];

/** The settings before any is changed. */
export const DEFAULT_SETTINGS: Settings = {
  strictness: 'forgiving',
  allowed: [],
  aiUse: 'off',
  classifications: CLASSIFICATIONS,
  // the most sensitive, so a note nobody has classified goes to no model until the user chooses otherwise
  aiUnlabelled: CLASSIFICATIONS.at(-1) ?? '',
  aiModels: [],
  aiMatrixNote: '',
  aiClassMap: {},
  indent: 'four',
  direction: 'best',
  focusDepth: 'one',
  labelsByZoom: 'on',
  foldHubs: 'on',
  foldGroups: 'off',
  mergeLinks: 'off',
  noteCallouts: 'off',
  miniMap: 'auto',
  detailsOpen: 'off',
  drawingHeight: 'most',
  exportTheme: 'light',
  companionNote: 'off',
  exportFolder: '',
  // the lowest, so anything above it asks
  exportAsksAbove: CLASSIFICATIONS[0] ?? '',
  decider: '',
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
  section: 'Strictness' | 'AI models' | 'Proposals' | 'Formatting' | 'Drawing' | 'Export';
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

/** The default of one of the View menu's switches (§25): on or off, in the Drawing section. */
function switchOption(key: keyof Settings, name: string, sentence: string): Option {
  return {
    key,
    section: 'Drawing',
    name,
    sentence,
    choices: [
      { value: 'on', name: 'On' },
      { value: 'off', name: 'Off' },
    ],
  };
}

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
      'The ways Simplified lets a graph leave standard GQL as written. An engine or an export still gets standard GQL.',
    choices: DEPARTURES.map((d) => ({ value: d.id, name: d.name, sentence: d.sentence })),
  },
  {
    key: 'aiUse',
    section: 'AI models',
    name: 'Use AI models',
    sentence:
      'Whether the editor may send anything to an AI model. Even when on, nothing is sent until you send it. It goes only to a model set up below, once you have seen exactly what it will send.',
    choices: [
      { value: 'off', name: 'Off: nothing is ever sent' },
      { value: 'on', name: 'On: send only when I say' },
    ],
  },
  {
    key: 'classifications',
    section: 'AI models',
    name: 'Classifications',
    sentence: 'The classifications a note may carry, lowest first, one per line.',
  },
  {
    key: 'aiUnlabelled',
    section: 'AI models',
    name: 'Unlabelled notes count as',
    sentence:
      'The classification a note with no classification counts as when it would be sent to an AI model. The most sensitive until you choose: nothing at it is ever sent, so an unlabelled note goes to no model.',
  },
  {
    key: 'aiModels',
    section: 'AI models',
    name: 'AI models',
    sentence:
      'Each AI model the editor may ask, and its purpose. Each has a ceiling: the highest classification of note it may be sent, or a row of the destination matrix.',
  },
  ...MATRIX_OPTIONS, // the matrix note and its class names (§19)
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
  {
    key: 'focusDepth',
    section: 'Drawing',
    name: 'Focus reaches',
    sentence:
      'How far focus reaches from a selected thing: its own links, or those of the things at their other ends too.',
    choices: [
      { value: 'one', name: 'One step' },
      { value: 'two', name: 'Two steps' },
    ],
  },
  switchOption(
    'labelsByZoom',
    'Labels by zoom',
    'Whether a link’s label shows only when zoomed in far enough to read it; a graph’s View menu can change it.',
  ),
  switchOption(
    'foldHubs',
    'Busy hubs folded',
    'Whether a thing with many links draws them folded into one stub marked with their count; a graph’s View menu can change it.',
  ),
  switchOption(
    'foldGroups',
    'Groups folded',
    'Whether each group draws as one box showing how many things it holds; a graph’s View menu can change it.',
  ),
  switchOption(
    'mergeLinks',
    'Parallel links merged',
    'Whether links running between the same two groups share one trunk; a graph’s View menu can change it.',
  ),
  switchOption(
    'noteCallouts',
    'Draw notes as callouts',
    'Whether each note written above a thing or link is drawn on the drawing as a callout, joined to its thing by a dashed line. Off unless you turn it on; a note always shows in its thing’s details.',
  ),
  ...AID_OPTIONS, // the mini-map and the details kept open (§24)
  {
    key: 'exportTheme',
    section: 'Export',
    name: 'Export theme',
    sentence: 'The colours an exported image is drawn in, fixed so it reads the same outside Obsidian.',
    choices: [
      { value: 'light', name: 'Light' },
      { value: 'dark', name: 'Dark' },
    ],
  },
  {
    key: 'companionNote',
    section: 'Export',
    name: 'Companion note',
    sentence: 'Whether an export saved into the vault also gets a short note linking the image to its source.',
    choices: [
      { value: 'off', name: 'No companion note' },
      { value: 'on', name: 'Write a companion note' },
    ],
  },
  {
    key: 'exportFolder',
    section: 'Export',
    name: 'Export folder',
    sentence: 'The vault folder exports are saved in; left empty, an export is saved next to its note.',
  },
  {
    key: 'exportAsksAbove',
    section: 'Export',
    name: 'Ask before exporting above',
    sentence: 'Exports of a note above this classification ask you first. Choose one of the classifications set above.',
  },
  {
    key: 'decider',
    section: 'Proposals',
    name: 'Your name on decisions',
    sentence:
      'The name recorded when you accept or reject a change in a proposal. It is kept exactly as you type it. Left empty, it is recorded as “you”.',
  },
];

const text = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback);
const oneOf = <T extends string>(key: keyof Settings, v: unknown, fallback: T): T =>
  (OPTIONS.find((o) => o.key === key)?.choices ?? []).some((c) => c.value === v) ? (v as T) : fallback;

/**
 * An AI model from what was given, with only its own fields: whatever else was given, such as a key, is dropped. A
 * model with no ceiling gets the lowest classification. One whose ceiling is no longer a classification keeps it as
 * written. So a classification being retyped never loses it, and the settings page says so.
 */
export function aiModel(given: Partial<AiModel> & Record<string, unknown>, classifications?: string[]): AiModel {
  const levels = classifications ?? DEFAULT_SETTINGS.classifications;
  return {
    name: text(given.name),
    purpose: text(given.purpose),
    ceiling: text(given.ceiling) || (levels[0] ?? ''),
    endpoint: text(given.endpoint),
    model: text(given.model),
    keyName: text(given.keyName),
    // kept only with a row picked, so a model with none is as it was
    ...(text(given.matrixRow).trim() && {
      matrixRow: text(given.matrixRow).trim(),
      matrixOn: switchesFrom(given.matrixOn),
    }),
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
    // copies, never the defaults themselves: a change to what is handed out never changes them
    allowed: Array.isArray(s.allowed) ? (s.allowed as unknown[]).filter(isDeparture) : [...d.allowed],
    aiUse: oneOf<AiUse>('aiUse', s.aiUse, d.aiUse),
    classifications: [...classifications],
    // one of the classifications set, else the most sensitive of them, so a level being retyped never lowers it
    aiUnlabelled:
      typeof s.aiUnlabelled === 'string' && classifications.includes(s.aiUnlabelled)
        ? s.aiUnlabelled
        : (classifications.at(-1) ?? ''),
    aiModels: Array.isArray(s.aiModels)
      ? s.aiModels
          .filter((m): m is Record<string, unknown> => !!m && typeof m === 'object')
          .map((m) => aiModel(m, classifications))
      : [],
    aiMatrixNote: text(s.aiMatrixNote).trim(),
    aiClassMap: Object.fromEntries(
      Object.entries(s.aiClassMap && typeof s.aiClassMap === 'object' ? s.aiClassMap : {}).filter(
        (e): e is [string, string] => typeof e[1] === 'string',
      ),
    ),
    indent: oneOf<Indent>('indent', s.indent, d.indent),
    direction: oneOf('direction', s.direction, d.direction),
    focusDepth: oneOf<FocusDepthSetting>('focusDepth', s.focusDepth, d.focusDepth),
    labelsByZoom: oneOf<SwitchSetting>('labelsByZoom', s.labelsByZoom, d.labelsByZoom),
    foldHubs: oneOf<SwitchSetting>('foldHubs', s.foldHubs, d.foldHubs),
    foldGroups: oneOf<SwitchSetting>('foldGroups', s.foldGroups, d.foldGroups),
    mergeLinks: oneOf<SwitchSetting>('mergeLinks', s.mergeLinks, d.mergeLinks),
    noteCallouts: oneOf<SwitchSetting>('noteCallouts', s.noteCallouts, d.noteCallouts),
    miniMap: oneOf<MiniMapSetting>('miniMap', s.miniMap, d.miniMap),
    detailsOpen: oneOf<SwitchSetting>('detailsOpen', s.detailsOpen, d.detailsOpen),
    drawingHeight: oneOf<DrawingHeightSetting>('drawingHeight', s.drawingHeight, d.drawingHeight),
    exportTheme: oneOf<ExportTheme>('exportTheme', s.exportTheme, d.exportTheme),
    companionNote: oneOf<CompanionSetting>('companionNote', s.companionNote, d.companionNote),
    exportFolder: vaultFolder(s.exportFolder) ?? d.exportFolder,
    // one of the classifications set, else the lowest of them, so a level being retyped never leaves exports unasked
    exportAsksAbove:
      typeof s.exportAsksAbove === 'string' && classifications.includes(s.exportAsksAbove)
        ? s.exportAsksAbove
        : (classifications[0] ?? ''),
    // as typed, spaces and capitals kept; a name is one line, and not an essay
    decider: typeof s.decider === 'string' ? s.decider.replace(/[\r\n]+/g, ' ').slice(0, MOST_NAME) : d.decider,
  };
}

/** The text an indent setting writes. */
export const indentText = (indent: Indent): string => (indent === 'two' ? '  ' : indent === 'tab' ? '\t' : '    ');
