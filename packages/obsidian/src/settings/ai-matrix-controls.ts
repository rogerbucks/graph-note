// A model's row of the destination matrix on the settings page (spec §19, model_ceiling).
// - A choice among the rows of the matrix note.
// - A switch for each class the row marks conditional with a condition. It is off until the user turns it on for that
//   model. The row's condition is beside it.
// The switch keeps the condition it was turned on under. It is dropped, and said to be, if the note's words change. A
// class marked yes needs no switch and one marked no has none. These are flagged, never guessed: a class matched by no
// classification, a row named twice, and two columns for one class. The row is only ever chosen here, never worked out
// from the model.
import type { SettingDefinition } from 'obsidian';
import { classMapProblems, matrixGrants, matrixProblems, unmatchedClasses, word } from '@thoughtknot/core';
import type { AiModel, ClassGrant, MatrixRow, MatrixSwitch, Settings } from '@thoughtknot/core';

const NO_ROW = '';
const MARKS = { yes: '✅', conditional: '⚠️', no: '❌', unknown: '❓' };
const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** The key of a class's switch on a model's page: the class name is escaped so a dot in it cannot split the key. */
export const switchKey = (i: number, name: string): string =>
  `aiModels.${i}.matrixOn.${encodeURIComponent(name).replace(/\./g, '%2E')}`;

/** The class a switch's key names, or null when the key is not a switch's. */
export function switchedClass(key: string): { i: number; name: string } | null {
  const m = /^aiModels\.(\d+)\.matrixOn\.(.+)$/.exec(key);
  return m ? { i: Number(m[1]), name: decodeURIComponent(m[2] ?? '') } : null;
}

const grantOf = (s: Settings, rows: MatrixRow[], i: number, name: string): ClassGrant | undefined => {
  const m = s.aiModels[i];
  return m ? matrixGrants(m, rows, s.classifications, s.aiClassMap).find((g) => sameName(g.name, name)) : undefined;
};

/** Whether the class's switch is on for the model, by its key: on only under the condition the note has now. */
export function switchIsOn(s: Settings, rows: MatrixRow[], key: string): boolean {
  const at = switchedClass(key);
  return !!at && !!grantOf(s, rows, at.i, at.name)?.on;
}

/** The switches of a model after one is changed: turned on, it keeps the condition the note has now; off, it is gone. */
export function withSwitch(s: Settings, rows: MatrixRow[], i: number, name: string, value: boolean): MatrixSwitch[] {
  const others = (s.aiModels[i]?.matrixOn ?? []).filter((o) => !sameName(o.class, name));
  const condition = grantOf(s, rows, i, name)?.condition;
  return value && condition ? [...others, { class: name, condition }] : others;
}

/** The controls of a model's page for its row: the choice of row, then a switch for each class marked conditional. */
export function matrixControls(s: Settings, m: AiModel, i: number, rows: MatrixRow[]): SettingDefinition[] {
  const unmatched = unmatchedClasses(rows, s.classifications, s.aiClassMap);
  const grants = matrixGrants(m, rows, s.classifications, s.aiClassMap);
  const problems = [
    ...matrixProblems(rows, s.classifications, s.aiClassMap),
    ...classMapProblems(s.classifications, s.aiClassMap),
  ];
  const names = [...new Set([...rows.map((r) => r.name), ...(m.matrixRow ? [m.matrixRow] : [])])];
  const options: Record<string, string> = {
    [NO_ROW]: word('models.no-row'),
    ...Object.fromEntries(names.map((r): [string, string] => [r, r])),
  };
  const said = grants.length
    ? grants.map((g) => `${g.name} ${MARKS[g.mark]}${g.level === null ? word('models.unmatched') : ''}`).join(', ')
    : m.matrixRow
      ? word('models.row-gone', { row: m.matrixRow })
      : word('models.choose-row');
  return [
    {
      name: word('models.row'),
      desc: [
        said,
        ...(unmatched.length && !grants.length ? [word('models.flagged', { classes: unmatched.join(', ') })] : []),
        ...problems,
      ].join(' '),
      control: { type: 'dropdown', key: `aiModels.${i}.matrixRow`, options },
    },
    ...grants
      .filter((g) => g.mark === 'conditional' && g.level !== null && g.condition)
      .map((g): SettingDefinition => ({
        name: word('models.send-level', { level: g.level ?? '' }),
        desc: `${word('models.condition', { condition: g.condition ?? '' })}${g.changed ? word('models.condition-changed') : ''}`,
        control: { type: 'toggle', key: switchKey(i, g.name) },
      })),
  ];
}
