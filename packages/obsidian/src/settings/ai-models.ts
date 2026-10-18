// The AI models on the settings page (spec §21, settings_ai_models; §19): a list with a page for each model — its name,
// purpose, ceiling, model, endpoint and key. The key is chosen in the app's own secret store, by name, so it never
// reaches the vault: the plugin's saved settings hold only that name.
import { SecretComponent } from 'obsidian';
import type { App, SettingDefinitionList, SettingTab } from 'obsidian';
import { AI_PURPOSES, aiModel, endpointProblem, word } from '@thoughtknot/core';
import type { AiModel, MatrixRow, Settings } from '@thoughtknot/core';
import { matrixControls, switchIsOn, switchedClass, withSwitch } from './ai-matrix-controls';
import type ThoughtKnotPlugin from '../main';

/** Each text field of a model's page, with its name and sentence, said in the person's language when the page is drawn. */
const texts = (): [keyof AiModel, string, string][] => [
  ['name', word('models.name'), ''],
  ['purpose', word('models.purpose'), word('models.purpose.sentence', { purposes: AI_PURPOSES.join(', ') })],
  ['model', word('models.model'), word('models.model.sentence')],
  ['endpoint', word('models.endpoint'), word('models.endpoint.sentence')],
];

/** The models, each a page of its own, with an affordance to add one and to remove each. */
export function aiModelList(
  app: App,
  owner: ThoughtKnotPlugin,
  tab: SettingTab,
  matrix: MatrixRow[],
): SettingDefinitionList {
  const s = owner.settings;
  const save = async (aiModels: AiModel[]) => {
    await owner.saveSettings({ ...owner.settings, aiModels });
    tab.update();
  };
  return {
    type: 'list',
    emptyState: word('models.none'),
    items: s.aiModels.map((m, i) => ({
      type: 'page',
      name: word('models.page', { n: i + 1 }),
      desc: [
        m.name
          ? word('models.said', { name: m.name, purpose: m.purpose || word('models.no-purpose'), ceiling: m.ceiling })
          : word('models.unnamed'),
        // a ceiling no longer among the classifications is kept as written, and said, until it is chosen again
        ...(s.classifications.includes(m.ceiling) ? [] : [word('models.ceiling-gone', { ceiling: m.ceiling })]),
        // an address set but not usable is said, so a model that will never be offered says why (user_models)
        ...(m.endpoint.trim() ? [endpointProblem(m.endpoint) ?? ''].filter(Boolean) : []),
        ...(m.matrixRow ? [word('models.held', { row: m.matrixRow })] : []),
      ].join('. '),
      items: [
        {
          type: 'group',
          items: [
            ...texts().map(([field, name, desc]) => ({
              name,
              ...(desc ? { desc } : {}),
              control: { type: 'text' as const, key: `aiModels.${i}.${field}` },
            })),
            {
              name: word('models.ceiling'),
              desc: word('models.ceiling.sentence'),
              control: {
                type: 'dropdown' as const,
                key: `aiModels.${i}.ceiling`,
                options: Object.fromEntries(
                  [...new Set([...s.classifications, m.ceiling])].filter(Boolean).map((c) => [c, c]),
                ),
              },
            },
            ...matrixControls(s, m, i, matrix),
            {
              name: word('models.key'),
              desc: word('models.key.sentence'),
              render: (setting) => {
                new SecretComponent(app, setting.controlEl)
                  .setValue(m.keyName)
                  .onChange((name) => void save(changed(owner.settings, i, { keyName: name })));
              },
            },
          ],
        },
      ],
    })),
    onDelete: (i) => void save(owner.settings.aiModels.filter((_, j) => j !== i)),
    addItem: {
      name: word('models.add'),
      action: () => void save([...owner.settings.aiModels, aiModel({}, owner.settings.classifications)]),
    },
  };
}

/** The models with one changed, read back as the core reads a model. */
function changed(s: Settings, i: number, part: Partial<AiModel>): AiModel[] {
  return s.aiModels.map((m, j) => (j === i ? aiModel({ ...m, ...part }, s.classifications) : m));
}

type Text = Exclude<keyof AiModel, 'matrixOn'>;
const parts = (key: string): [number, Text] => {
  const [, i, field] = key.split('.');
  return [Number(i), field as Text];
};

/** A model's field, by its control key `aiModels.<index>.<field>`; a class's switch is on or off. */
export function getModelValue(s: Settings, key: string, rows: MatrixRow[]): string | boolean {
  if (switchedClass(key)) return switchIsOn(s, rows, key);
  const [i, field] = parts(key);
  return s.aiModels[i]?.[field] ?? '';
}

/** The change a model's field makes to the settings, by its control key; a new row starts with every switch off. */
export function setModelValue(s: Settings, key: string, value: unknown, rows: MatrixRow[]): Partial<Settings> {
  const on = switchedClass(key);
  if (on) return { aiModels: changed(s, on.i, { matrixOn: withSwitch(s, rows, on.i, on.name, !!value) }) };
  const [i, field] = parts(key);
  return { aiModels: changed(s, i, { [field]: String(value), ...(field === 'matrixRow' ? { matrixOn: [] } : {}) }) };
}
