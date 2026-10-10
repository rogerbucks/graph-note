// The AI models on the settings page (spec §21, settings_ai_models; §19): a list with a page for each model — its name,
// purpose, ceiling, model, endpoint and key. The key is chosen in the app's own secret store, by name, so it never
// reaches the vault: the plugin's saved settings hold only that name.
import { SecretComponent } from 'obsidian';
import type { App, SettingDefinitionList, SettingTab } from 'obsidian';
import { aiModel } from '@graph-note/core';
import type { AiModel, Settings } from '@graph-note/core';
import type GraphNotePlugin from '../main';

const TEXTS: [keyof AiModel, string][] = [
  ['name', 'Name'],
  ['purpose', 'Purpose'],
  ['model', 'Model'],
  ['endpoint', 'Endpoint'],
];

/** The models, each a page of its own, with an affordance to add one and to remove each. */
export function aiModelList(app: App, owner: GraphNotePlugin, tab: SettingTab): SettingDefinitionList {
  const s = owner.settings;
  const save = async (aiModels: AiModel[]) => {
    await owner.saveSettings({ ...owner.settings, aiModels });
    tab.update();
  };
  return {
    type: 'list',
    emptyState: 'No model is set up: nothing is ever sent.',
    items: s.aiModels.map((m, i) => ({
      type: 'page',
      name: `Model ${i + 1}`,
      desc: m.name ? `${m.name}: ${m.purpose || 'no purpose given'}, up to ${m.ceiling}` : 'Not named yet',
      items: [
        {
          type: 'group',
          items: [
            ...TEXTS.map(([field, name]) => ({
              name,
              control: { type: 'text' as const, key: `aiModels.${i}.${field}` },
            })),
            {
              name: 'Ceiling',
              desc: 'The highest classification of note this model may be sent.',
              control: {
                type: 'dropdown' as const,
                key: `aiModels.${i}.ceiling`,
                options: Object.fromEntries(s.classifications.map((c) => [c, c])),
              },
            },
            {
              name: 'Key',
              desc: 'Kept in the app’s own secret store, never in the vault.',
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
      name: 'Add a model',
      action: () => void save([...owner.settings.aiModels, aiModel({}, owner.settings.classifications)]),
    },
  };
}

/** The models with one changed, read back as the core reads a model. */
function changed(s: Settings, i: number, part: Partial<AiModel>): AiModel[] {
  return s.aiModels.map((m, j) => (j === i ? aiModel({ ...m, ...part }, s.classifications) : m));
}

const parts = (key: string): [number, keyof AiModel] => {
  const [, i, field] = key.split('.');
  return [Number(i), field as keyof AiModel];
};

/** A model's field, by its control key `aiModels.<index>.<field>`. */
export function getModelValue(s: Settings, key: string): string {
  const [i, field] = parts(key);
  return s.aiModels[i]?.[field] ?? '';
}

/** The change a model's field makes to the settings, by its control key. */
export function setModelValue(s: Settings, key: string, value: unknown): Partial<Settings> {
  const [i, field] = parts(key);
  return { aiModels: changed(s, i, { [field]: String(value) }) };
}
