// A model's row of the destination matrix (editor spec §19, model_ceiling; Roger, 16 Oct 2026). In a model's settings the
// user picks a row of the vault's matrix, never guessed from the model's address or name. The model may receive exactly
// the classes its row marks yes. Each class marked conditional is off until the user switches it on for that model. The
// row's condition is shown beside the switch. The switch holds only for the condition it was given under. A class
// marked no, or marked in any other way, is never allowed. What a model may receive is a set of classes, not a rank.
// The host reads the matrix note and hands the core plain rows, so the core never reads the note's layout. Classes
// match by exact name, with a table in the settings for other names. A class matched by neither is flagged and never
// guessed. So it is never allowed. A row named twice, or two columns standing for one classification, is never resolved
// by taking the first.
import { formatList } from './locale-formats.ts';
import type { AiModel } from './settings.ts';
import { word } from './words.ts';

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

// a name is exact. A character that changes under compatibility normalisation (the Kelvin sign, a full-width letter) is
// never taken for the plain one. So it is flagged rather than matched
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
 * The classification a matrix class name stands for: the same name, else the table's, else null (flagged). A table may
 * disagree with itself (keys differing only in case that map apart). Or it may disagree with the name (an entry for a
 * name that is a classification, mapped to another). Such a table matches nothing.
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

/** The columns of a row that stand for one classification, as a list in words, and that classification; or null. */
function sharedColumn(
  row: MatrixRow,
  classifications: string[],
  classMap: Record<string, string>,
): { columns: string; level: string } | null {
  const seen = new Map<string, string[]>();
  for (const c of row.cells) {
    const level = matchClass(c.class, classifications, classMap);
    if (level !== null) seen.set(level, [...(seen.get(level) ?? []), c.class.trim()]);
  }
  const twice = [...seen].find(([, names]) => names.length > 1);
  return twice ? { columns: formatList(twice[1]), level: twice[0] } : null;
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
      problems.push(word('ai.matrix.row-twice', { row: r.name }));
    const shared = sharedColumn(r, classifications, classMap);
    if (shared) problems.push(word('ai.matrix.columns-shared', { row: r.name, ...shared }));
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
      problems.push(word('ai.matrix.table-case', { keys: formatList(group) }));
    const to = classMap[k] ?? '';
    if (!classifications.some((c) => same(c, to))) problems.push(word('ai.matrix.table-not-class', { from: k, to }));
    else if (classifications.some((c) => same(c, k)) && !classifications.some((c) => same(c, k) && same(c, to)))
      problems.push(word('ai.matrix.table-same-name', { from: k, to }));
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

/**
 * Why a note of `level` may not go to `model` by its row, or null when it may. `said` is how the note's level is said.
 */
export function matrixRefusal(
  level: string,
  said: string,
  model: AiModel,
  matrix: MatrixInput | null | undefined,
  classifications: string[],
): string | null {
  const wanted = model.matrixRow ?? '';
  const found = matrix ? rowsNamed(matrix.rows, wanted) : [];
  const named = { model: model.name, row: wanted };
  if (!matrix || !found.length) return word('ai.matrix.row-missing', named);
  if (found.length > 1) return word('ai.matrix.held-twice', named);
  const shared = sharedColumn(found[0] as MatrixRow, classifications, matrix.classMap);
  if (shared) return word('ai.matrix.held-shared', { ...named, ...shared });
  const grants = matrixGrants(model, matrix.rows, classifications, matrix.classMap);
  const here = grants.find((g) => g.level !== null && same(g.level, level));
  if (!here) {
    const flagged = grants.filter((g) => g.level === null).map((g) => g.name.trim());
    const none = word('ai.matrix.no-class', { said, level, ...named });
    return flagged.length ? `${none} ${word('ai.matrix.unmatched', { classes: flagged.join(', ') })}` : none;
  }
  if (here.allowed) return null;
  const of = { said, name: here.name, condition: here.condition ?? '', ...named };
  if (here.mark === 'no') return word('ai.matrix.never', of);
  if (here.mark === 'unknown') return word('ai.matrix.unknown-mark', of);
  if (here.mark === 'conditional' && !here.condition) return word('ai.matrix.no-condition', of);
  if (here.changed) return word('ai.matrix.condition-changed', of);
  return word('ai.matrix.condition-off', of);
}
