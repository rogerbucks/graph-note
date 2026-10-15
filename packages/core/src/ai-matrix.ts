// A model's row of the destination matrix (editor spec §19, model_ceiling; Roger, 16 Oct 2026). In a model's settings the
// user picks a row of the vault's matrix, never guessed from the model's address or name. The model may receive exactly
// the classes its row marks yes; each class marked conditional is off until the user switches it on for that model, with
// the row's condition shown beside the switch, and the switch holds only for the condition it was given under; one marked
// no, or marked in any other way, is never allowed. What a model may receive is a set of classes, not a rank. The host
// reads the matrix note and hands the core plain rows, so the core never reads the note's layout. Classes match by exact
// name, with a table in the settings for other names; a class matched by neither is flagged and never guessed, so it is
// never allowed. A row named twice, or two columns standing for one classification, is never resolved by taking the first.
import type { AiModel } from './settings.ts';

/** What a row says of a class: yes, conditional on what the row says, no, or unknown (not exactly one of the marks). */
export type Mark = 'yes' | 'conditional' | 'no' | 'unknown';

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

/** A switch the user turned on for a model: the class, and the condition the row had when they did. */
export interface MatrixSwitch {
  class: string;
  condition: string;
}

/** A class of a model's row as the settings page shows it: the mark, the switch and whether the model may get it. */
export interface ClassGrant {
  /** The class as the matrix names it. */
  name: string;
  /** The classification it stands for here, or null when it is matched by neither name nor table: flagged. */
  level: string | null;
  mark: Mark;
  condition?: string;
  /** Whether the user has switched it on for this model, under the condition the row now has. */
  on: boolean;
  /** A switch was made under another condition than the row has now: it is dropped until switched on again. */
  changed: boolean;
  allowed: boolean;
}

// a name is exact: a character that changes under compatibility normalisation (the Kelvin sign, a full-width letter) is
// never taken for the plain one, so it is flagged rather than matched
const plainName = (s: string) => s.trim().normalize('NFKC') === s.trim();
const same = (a: string, b: string) =>
  plainName(a) && plainName(b) && a.trim().toLowerCase() === b.trim().toLowerCase();
// a condition is words: spacing and case do not change what it says
const words = (s: string) => s.normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase();

/** The switches from what was saved: only well-formed ones, one for each class. */
export function switchesFrom(given: unknown): MatrixSwitch[] {
  const out: MatrixSwitch[] = [];
  for (const g of Array.isArray(given) ? (given as unknown[]) : []) {
    const o = g && typeof g === 'object' ? (g as Record<string, unknown>) : {};
    if (typeof o.class === 'string' && !out.some((s) => same(s.class, o.class as string)))
      out.push({ class: o.class, condition: typeof o.condition === 'string' ? o.condition : '' });
  }
  return out;
}

/**
 * The classification a matrix class name stands for: the same name, else the table's, else null (flagged). A table that
 * disagrees with itself (keys differing only in case that map apart), or with the name (an entry for a name that is a
 * classification, mapped to another), matches nothing.
 */
export function matchClass(name: string, classifications: string[], classMap: Record<string, string>): string | null {
  const exact = classifications.find((c) => same(c, name));
  const mapped = Object.keys(classMap)
    .filter((k) => same(k, name))
    .map((k) => classifications.find((c) => same(c, classMap[k] ?? '')) ?? null);
  if (exact !== undefined) return mapped.every((m) => m === exact) ? exact : null;
  return mapped.length && mapped.every((m) => m === mapped[0]) ? (mapped[0] ?? null) : null;
}

/** The rows with this name; more than one is a duplicate, which is never resolved by taking the first. */
const rowsNamed = (rows: MatrixRow[], name: string) => rows.filter((r) => same(r.name, name));

/** The columns of a row that stand for one classification, as `A and B both stand for L`; null when none do. */
function sharedColumn(row: MatrixRow, classifications: string[], classMap: Record<string, string>): string | null {
  const seen = new Map<string, string[]>();
  for (const c of row.cells) {
    const level = matchClass(c.class, classifications, classMap);
    if (level !== null) seen.set(level, [...(seen.get(level) ?? []), c.class.trim()]);
  }
  const twice = [...seen].find(([, names]) => names.length > 1);
  return twice ? `its columns ${twice[1].join(' and ')} both stand for ${twice[0]}` : null;
}

/** What is wrong with the matrix as it stands, for the settings page to flag: a row named twice, two columns for one class. */
export function matrixProblems(
  rows: MatrixRow[],
  classifications: string[],
  classMap: Record<string, string>,
): string[] {
  const problems: string[] = [];
  for (const r of rows) {
    const first = rows.findIndex((x) => same(x.name, r.name));
    if (rows.indexOf(r) === first && rowsNamed(rows, r.name).length > 1)
      problems.push(`The matrix has the row “${r.name}” more than once, so no model is sent to by it.`);
    const shared = sharedColumn(r, classifications, classMap);
    if (shared) problems.push(`In the matrix row “${r.name}”, ${shared}, so no model is sent to by it.`);
  }
  return problems;
}

/** What is wrong with the mapping table, for the settings page to flag. */
export function classMapProblems(classifications: string[], classMap: Record<string, string>): string[] {
  const keys = Object.keys(classMap);
  const problems: string[] = [];
  for (const k of keys) {
    const group = keys.filter((o) => same(o, k));
    if (group.length > 1 && keys.indexOf(group[0] ?? k) === keys.indexOf(k))
      problems.push(`The table has ${group.join(' and ')}, which differ only in case: keep one.`);
    const to = classMap[k] ?? '';
    if (!classifications.some((c) => same(c, to)))
      problems.push(`The table maps ${k} to ${to}, which is not a classification.`);
    else if (classifications.some((c) => same(c, k)) && !classifications.some((c) => same(c, k) && same(c, to)))
      problems.push(
        `The table maps ${k} to ${to}, but ${k} is already a classification of that name: remove the entry.`,
      );
  }
  return problems;
}

/** Each class of the model's row with what it may do; empty when the model has no row, the matrix has none such or two. */
export function matrixGrants(
  model: Pick<AiModel, 'matrixRow' | 'matrixOn'>,
  rows: MatrixRow[],
  classifications: string[],
  classMap: Record<string, string>,
): ClassGrant[] {
  const found = model.matrixRow ? rowsNamed(rows, model.matrixRow) : [];
  const row = found.length === 1 ? found[0] : undefined;
  return (row?.cells ?? []).map((c) => {
    const level = matchClass(c.class, classifications, classMap);
    const saved = (model.matrixOn ?? []).find((o) => same(o.class, c.class));
    const conditional = c.mark === 'conditional' && !!c.condition;
    // the switch is consent to the words it was given under: other words, or no longer a conditional, and it is dropped
    const on = conditional && !!saved && words(saved.condition) === words(c.condition ?? '');
    return {
      name: c.class,
      level,
      mark: c.mark,
      ...(c.condition ? { condition: c.condition } : {}),
      on,
      changed: conditional && !!saved && !on,
      allowed: level !== null && (c.mark === 'yes' || on),
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
  return names.filter((n, i) => names.findIndex((m) => m.trim().toLowerCase() === n.trim().toLowerCase()) === i);
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
  const found = matrix ? rowsNamed(matrix.rows, wanted) : [];
  if (!matrix || !found.length)
    return `${model.name} uses the matrix row “${wanted}”, which the matrix note does not have now (or the note could not be read), so nothing is sent to it: choose it again in the model’s settings.`;
  const held =
    found.length > 1
      ? 'the matrix has that row more than once'
      : sharedColumn(found[0] as MatrixRow, classifications, matrix.classMap);
  if (held)
    return `${model.name} is held to the matrix row “${wanted}”, but ${held}, so nothing is sent to it: correct the matrix note.`;
  const grants = matrixGrants(model, matrix.rows, classifications, matrix.classMap);
  const here = grants.find((g) => g.level !== null && same(g.level, level));
  if (!here) {
    const flagged = grants.filter((g) => g.level === null).map((g) => g.name.trim());
    return `${said}, and the matrix row ${wanted} has no class for ${level}, so it is not sent to ${model.name}.${flagged.length ? ` These classes of the row match no classification and are not used: ${flagged.join(', ')}. Map them in the AI models settings.` : ''}`;
  }
  if (here.allowed) return null;
  const row = `the matrix row ${wanted}`;
  if (here.mark === 'no')
    return `${said}, and ${row} marks ${here.name} never to be sent, so it is not sent to ${model.name}.`;
  if (here.mark === 'unknown')
    return `${said}, and ${row} has for ${here.name} something other than exactly ✅, ⚠️ or ❌, so it is not sent to ${model.name}.`;
  if (here.mark === 'conditional' && !here.condition)
    return `${said}, and ${row} allows ${here.name} on a condition but gives no condition, so it cannot be switched on and is not sent to ${model.name}.`;
  if (here.changed)
    return `${said}, and the condition has changed since you switched on ${here.name} for ${model.name} (it is now: ${here.condition ?? ''}): read it and switch it on again to send it.`;
  return `${said}, and ${row} allows ${here.name} only on a condition (${here.condition ?? ''}), and that is off for ${model.name}: switch it on in the model’s settings to send it.`;
}
