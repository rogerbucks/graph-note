// A model's row of the destination matrix on the settings page (spec §19, model_ceiling): a choice among the rows of the
// matrix note, and a switch for each class the row marks conditional, off until the user turns it on for that model, with
// the row's condition beside it. A class marked yes needs no switch and one marked no has none; a class matched by no
// classification is flagged, never guessed. The row is only ever chosen here, never worked out from the model.
import type { SettingDefinition } from 'obsidian';
import { matrixGrants, unmatchedClasses } from '@graph-note/core';
import type { AiModel, MatrixRow, Settings } from '@graph-note/core';

const NO_ROW = '';
const MARKS = { yes: '✅', conditional: '⚠️', no: '❌' };

/** The key of a class's switch on a model's page: the class name is escaped so a dot in it cannot split the key. */
export const switchKey = (i: number, name: string): string =>
  `aiModels.${i}.matrixOn.${encodeURIComponent(name).replace(/\./g, '%2E')}`;

/** The class a switch's key names, or null when the key is not a switch's. */
export function switchedClass(key: string): { i: number; name: string } | null {
  const m = /^aiModels\.(\d+)\.matrixOn\.(.+)$/.exec(key);
  return m ? { i: Number(m[1]), name: decodeURIComponent(m[2] ?? '') } : null;
}

/** Whether the class's switch is on for the model, by its key. */
export const switchIsOn = (s: Settings, key: string): boolean => {
  const at = switchedClass(key);
  const on = at ? (s.aiModels[at.i]?.matrixOn ?? []) : [];
  return !!at && on.some((o) => o.trim().toLowerCase() === at.name.trim().toLowerCase());
};

/** The switches of a model after one is changed: the class added or taken out, nothing else. */
export function withSwitch(m: AiModel, name: string, value: boolean): string[] {
  const others = (m.matrixOn ?? []).filter((o) => o.trim().toLowerCase() !== name.trim().toLowerCase());
  return value ? [...others, name] : others;
}

/** The controls of a model's page for its row: the choice of row, then a switch for each class marked conditional. */
export function matrixControls(s: Settings, m: AiModel, i: number, rows: MatrixRow[]): SettingDefinition[] {
  const unmatched = unmatchedClasses(rows, s.classifications, s.aiClassMap);
  const grants = matrixGrants(m, rows, s.classifications, s.aiClassMap);
  const names = [...new Set([...rows.map((r) => r.name), ...(m.matrixRow ? [m.matrixRow] : [])])];
  const options: Record<string, string> = {
    [NO_ROW]: 'None: use the ceiling',
    ...Object.fromEntries(names.map((r): [string, string] => [r, r])),
  };
  const said = grants.length
    ? grants
        .map((g) => `${g.name} ${MARKS[g.mark]}${g.level === null ? ' (flagged: matches no classification)' : ''}`)
        .join(', ')
    : m.matrixRow
      ? `${m.matrixRow} is not in the matrix note now: nothing is sent to this model until a row is chosen again.`
      : 'Choose a row of the destination matrix to hold this model to it, in place of its ceiling.';
  return [
    {
      name: 'Matrix row',
      desc: `${said}${unmatched.length && !grants.length ? ` Flagged in the matrix: ${unmatched.join(', ')}.` : ''}`,
      control: { type: 'dropdown', key: `aiModels.${i}.matrixRow`, options },
    },
    ...grants
      .filter((g) => g.mark === 'conditional' && g.level !== null)
      .map((g): SettingDefinition => ({
        name: `Send ${g.level} notes`,
        desc: g.condition
          ? `The row’s condition: ${g.condition}. Off until you switch it on for this model.`
          : 'Off until you switch it on for this model.',
        control: { type: 'toggle', key: switchKey(i, g.name) },
      })),
  ];
}
