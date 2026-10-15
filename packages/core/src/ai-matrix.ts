// A model's row of the destination matrix (editor spec §19, model_ceiling; Roger, 16 Oct 2026). In a model's settings the
// user picks a row of the vault's matrix, never guessed from the model's address or name. The model may receive exactly
// the classes its row marks yes; each class marked conditional is off until the user switches it on for that model, with
// the row's condition shown beside the switch; one marked no is never allowed. What a model may receive is a set of
// classes, not a rank. The host reads the matrix note and hands the core plain rows, so the core never reads the note's
// layout. Classes match by name, with a table in the settings for other names; a class matched by neither is flagged
// and never guessed, so it is never allowed.
import type { AiModel } from './settings.ts';

/** What a row says of a class: it may be sent (yes), only on a condition the user accepts (conditional), or never (no). */
export type Mark = 'yes' | 'conditional' | 'no';

/** One class of a row: its name as the matrix writes it, its mark and, for a conditional one, the condition. */
export interface MatrixCell {
  class: string;
  mark: Mark;
  condition?: string;
}

/** A destination of the matrix: its name, and its cell for each class. */
export interface MatrixRow {
  name: string;
  cells: MatrixCell[];
}

/** The matrix as the host hands it: its rows, and the settings table that maps a matrix class name to a classification. */
export interface MatrixInput {
  rows: MatrixRow[];
  classMap: Record<string, string>;
}

/** A class of a model's row as the settings page shows it: the mark, the switch and whether the model may get it. */
export interface ClassGrant {
  /** The class as the matrix names it. */
  name: string;
  /** The classification it stands for here, or null when it is matched by neither name nor table: flagged. */
  level: string | null;
  mark: Mark;
  condition?: string;
  /** Whether the user has switched it on for this model (only a conditional class can be). */
  on: boolean;
  allowed: boolean;
}

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** The classification a matrix class name stands for: the same name, else the table's, else null (flagged). */
export function matchClass(name: string, classifications: string[], classMap: Record<string, string>): string | null {
  const exact = classifications.find((c) => same(c, name));
  if (exact !== undefined) return exact;
  const key = Object.keys(classMap).find((k) => same(k, name));
  const mapped = key === undefined ? undefined : classMap[key];
  return mapped === undefined ? null : (classifications.find((c) => same(c, mapped)) ?? null);
}

/** Each class of the model's row with what it may do; empty when the model has no row, or the matrix has no such row. */
export function matrixGrants(
  model: Pick<AiModel, 'matrixRow' | 'matrixOn'>,
  rows: MatrixRow[],
  classifications: string[],
  classMap: Record<string, string>,
): ClassGrant[] {
  const row = model.matrixRow ? rows.find((r) => same(r.name, model.matrixRow ?? '')) : undefined;
  return (row?.cells ?? []).map((c) => {
    const classification = matchClass(c.class, classifications, classMap);
    const on = c.mark === 'conditional' && (model.matrixOn ?? []).some((o) => same(o, c.class));
    return {
      name: c.class,
      level: classification,
      mark: c.mark,
      ...(c.condition ? { condition: c.condition } : {}),
      on,
      allowed: classification !== null && (c.mark === 'yes' || on),
    };
  });
}

/** The matrix classes matched by neither name nor table, each once: flagged, for the user to map by hand. */
export function unmatchedClasses(
  rows: MatrixRow[],
  classifications: string[],
  classMap: Record<string, string>,
): string[] {
  const names = rows
    .flatMap((r) => r.cells.map((c) => c.class))
    .filter((n) => matchClass(n, classifications, classMap) === null);
  return names.filter((n, i) => names.findIndex((m) => same(m, n)) === i);
}

/** The table kept as text in a setting: one `matrix name: classification` pair a line. */
export const classMapText = (map: Record<string, string>): string =>
  Object.entries(map)
    .map(([from, to]) => `${from}: ${to}`)
    .join('\n');

/** The table read from that text; a line that is not a pair is left out. */
export function classMapFrom(text: string): Record<string, string> {
  const map: Record<string, string> = {};
  for (const line of text.split('\n')) {
    const at = line.indexOf(':');
    const from = line.slice(0, at).trim(),
      to = line.slice(at + 1).trim();
    if (at > 0 && from && to) map[from] = to;
  }
  return map;
}

/** Why a note of `level` may not go to `model` by its row, or null when it may; `said` is how the note's level is said. */
export function matrixRefusal(
  level: string,
  said: string,
  model: AiModel,
  matrix: MatrixInput | null | undefined,
  classifications: string[],
): string | null {
  const wanted = model.matrixRow ?? '';
  const grants = matrix ? matrixGrants(model, matrix.rows, classifications, matrix.classMap) : [];
  if (!grants.length)
    return `${model.name} uses the matrix row “${wanted}”, which the matrix note does not have now (or the note could not be read), so nothing is sent to it: choose it again in the model’s settings.`;
  const here = grants.find((g) => g.level !== null && same(g.level, level));
  if (!here) {
    const flagged = grants.filter((g) => g.level === null).map((g) => g.name);
    return `${said}, and the matrix row ${wanted} has no class for ${level}, so it is not sent to ${model.name}.${flagged.length ? ` These classes of the row match no classification and are not used: ${flagged.join(', ')}. Map them in the AI models settings.` : ''}`;
  }
  if (here.allowed) return null;
  if (here.mark === 'no')
    return `${said}, and the matrix row ${wanted} marks ${here.name} never to be sent, so it is not sent to ${model.name}.`;
  return `${said}, and the matrix row ${wanted} allows ${here.name} only on a condition (${here.condition ?? 'none given'}), and that is off for ${model.name}: switch it on in the model’s settings to send it.`;
}
