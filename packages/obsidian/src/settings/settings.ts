// The settings page (spec §21): one page in Obsidian's plugin settings, holding every option the editor offers, each
// with its sentence, defined from the core's list of options so none can be left off, in Obsidian's declarative form
// so each is found by the settings search. Each change is saved at once, read back as the core reads settings.
import { PluginSettingTab } from 'obsidian';
import type { App, SettingDefinition, SettingDefinitionItem } from 'obsidian';
import {
  OPTIONS,
  classMapFrom,
  classMapProblems,
  classMapText,
  optionSaid,
  unmatchedClasses,
  word,
} from '@graph-note/core';
import type { MatrixRow, Option, Settings } from '@graph-note/core';
import type GraphNotePlugin from '../main';
import { knownClass } from '../ai/matrix-known';
import { readMatrix } from '../ai/matrix-note';
import { aiModelList, getModelValue, setModelValue } from './ai-models';

const SECTIONS = ['Strictness', 'AI models', 'Proposals', 'Formatting', 'Drawing', 'Export'] as const;

/** The heading of each section, in the person's language. */
const SECTION_WORDS = {
  Strictness: 'settings.section.strictness',
  'AI models': 'settings.section.ai-models',
  Proposals: 'settings.section.proposals',
  Formatting: 'settings.section.formatting',
  Drawing: 'settings.section.drawing',
  Export: 'settings.section.export',
} as const;

/** The plugin's settings page. */
export class GraphNoteSettingTab extends PluginSettingTab {
  constructor(
    app: App,
    private readonly owner: GraphNotePlugin,
  ) {
    super(app, owner);
  }

  override getSettingDefinitions(): SettingDefinitionItem[] {
    void this.loadMatrix();
    return SECTIONS.flatMap((heading): SettingDefinitionItem[] => [
      {
        type: 'group',
        heading: word(SECTION_WORDS[heading]),
        items: OPTIONS.filter((o) => o.section === heading).flatMap((o) => this.definitions(o)),
      },
      // a list stands on its own, after its part of the page
      ...(heading === 'AI models' ? [aiModelList(this.app, this.owner, this, this.matrix)] : []),
    ]);
  }

  /** The matrix note's rows as last read; the page is drawn again when the note, or the path to it, changes them. */
  private matrix: MatrixRow[] = [];

  private async loadMatrix(): Promise<void> {
    const rows = await readMatrix(this.app, this.owner.settings.aiMatrixNote, knownClass(this.owner.settings));
    if (JSON.stringify(rows) === JSON.stringify(this.matrix)) return;
    this.matrix = rows;
    this.update();
  }

  /** The rows an option is shown in: one for most; for the departures, one each and the action that converts. */
  private definitions(option: Option): SettingDefinition[] {
    const s = this.owner.settings;
    const o = optionSaid(option);
    if (o.key === 'allowed')
      return [
        { name: o.name, desc: o.sentence },
        ...(o.choices ?? []).map((c): SettingDefinition => ({
          name: c.name,
          desc: c.sentence ?? '',
          control: { type: 'toggle', key: `allowed.${c.value}` },
        })),
        {
          name: word('settings.convert'),
          desc: word('settings.convert.sentence'),
          action: () => void this.owner.convertToStandard(),
        },
      ];
    if (o.key === 'classifications')
      return [{ name: o.name, desc: o.sentence, control: { type: 'textarea', key: 'classifications' } }];
    if (o.key === 'aiModels') return [{ name: o.name, desc: o.sentence }];
    if (o.key === 'exportFolder' || o.key === 'aiMatrixNote' || o.key === 'decider')
      return [{ name: o.name, desc: o.sentence, control: { type: 'text', key: o.key } }];
    if (o.key === 'aiClassMap')
      return [
        {
          name: o.name,
          // a class of the matrix matched by neither name nor the table here is said, never guessed
          desc: [
            o.sentence,
            ...(unmatchedClasses(this.matrix, s.classifications, s.aiClassMap).length
              ? [
                  word('settings.flagged', {
                    classes: unmatchedClasses(this.matrix, s.classifications, s.aiClassMap).join(', '),
                  }),
                ]
              : []),
            ...classMapProblems(s.classifications, s.aiClassMap),
          ].join(' '),
          control: { type: 'textarea', key: 'aiClassMap' },
        },
      ];
    // the level an export asks above, and the level an unlabelled note counts as for AI, are each one of the
    // classifications as they are set now
    if (o.key === 'exportAsksAbove' || o.key === 'aiUnlabelled')
      return [
        {
          name: o.name,
          desc: o.sentence,
          control: {
            type: 'dropdown',
            key: o.key,
            options: Object.fromEntries(s.classifications.map((c) => [c, c])),
          },
        },
      ];
    const chosen = o.choices?.find((c) => c.value === s[o.key]);
    return [
      {
        name: o.name,
        desc: chosen?.sentence ? `${o.sentence} ${chosen.sentence}` : o.sentence,
        control: {
          type: 'dropdown',
          key: o.key,
          options: Object.fromEntries((o.choices ?? []).map((c) => [c.value, c.name])),
        },
      },
    ];
  }

  override getControlValue(key: string): unknown {
    const s = this.owner.settings;
    if (key.startsWith('allowed.')) return s.allowed.some((a) => `allowed.${a}` === key);
    if (key === 'classifications') return s.classifications.join('\n');
    if (key === 'aiClassMap') return classMapText(s.aiClassMap);
    if (key.startsWith('aiModels.')) return getModelValue(s, key, this.matrix);
    return s[key as keyof Settings];
  }

  override async setControlValue(key: string, value: unknown): Promise<void> {
    const s = this.owner.settings;
    let change: Partial<Settings>;
    if (key.startsWith('allowed.')) {
      const id = key.slice('allowed.'.length);
      const others = s.allowed.filter((a) => a !== id);
      change = { allowed: value ? ([...others, id] as Settings['allowed']) : others };
    } else if (key === 'classifications') {
      const levels = String(value)
        .split('\n')
        .map((x) => x.trim())
        .filter(Boolean);
      if (!levels.length) return;
      change = { classifications: levels };
    } else if (key === 'aiClassMap') change = { aiClassMap: classMapFrom(String(value)) };
    else if (key.startsWith('aiModels.')) change = setModelValue(s, key, value, this.matrix);
    else change = { [key]: value };
    await this.owner.saveSettings({ ...s, ...change });
    // a level's own sentence, and a model's ceiling, follow a choice; the page is never drawn again under typing
    const chosen = key.endsWith('.ceiling') || key.endsWith('.matrixRow') || key.includes('.matrixOn.');
    const typed =
      ['classifications', 'exportFolder', 'decider', 'aiMatrixNote', 'aiClassMap'].includes(key) ||
      (key.startsWith('aiModels.') && !chosen);
    if (!typed) this.update();
    // the matrix note, or how its classes are matched, changed what the page shows of it
    if (key === 'aiMatrixNote' || key === 'aiClassMap') void this.loadMatrix();
  }
}
