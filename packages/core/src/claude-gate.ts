// What the browser editor may show Claude (editor spec §26, cc_classified_asks, cc_credential_never): Claude can read
// the pane the editor opens in, so a note is held to a ceiling before it opens, and again before every send. A note above
// the level set for Claude is asked about first, and the yes is for the digest of the text it was given about; one at the
// highest classification never opens, whatever the settings; a note with no classification counts as the level set for
// unlabelled notes (the highest until chosen); one whose classification cannot be read for certain is unknown, and
// refused; and a credential never reaches Claude, at any classification. The level for Claude is the ceiling of the model
// named Claude among the models set up (§19); with none, the lowest classification, so everything above it asks. When a
// row of the destination matrix is picked for that model (model_ceiling), the row decides instead, by the same rules as
// for any model (a no, an unknown mark, a duplicate or a missing row never clears; a conditional class only once
// switched on), so a note it does not clear asks. What is said names kinds and the levels set, never the note's own label or its text.
import { sha256 } from './ai-digest.ts';
import { credentialsIn } from './ai-ceiling.ts';
import { matrixRefusal } from './ai-matrix.ts';
import type { MatrixRow } from './ai-matrix.ts';
import type { AiModel, Settings } from './settings.ts';

/** The settings the gate reads. */
export type GateSettings = Pick<Settings, 'classifications' | 'aiUnlabelled'> & {
  aiModels: readonly AiModel[];
  /** The rows of the vault's destination matrix, as the host read them, and the table mapping its class names. */
  matrix?: MatrixRow[];
  aiClassMap?: Record<string, string>;
  /** The note that holds the matrix, by its path in the vault, for the host that reads it. */
  aiMatrixNote?: string;
  /** Why the host did not read the matrix note (such as a link out of the vault), said when a row then clears nothing. */
  matrixProblem?: string;
};

/** The name Claude is set up under among the AI models. */
export const CLAUDE = 'Claude';

/** What to do with a note: open it, ask the user first (with the question), or refuse it (with why). */
export type Gate = { open: true } | { ask: string } | { refuse: string };

/** A note's classification as its front matter gives it: none, one, or unknown when it cannot be read for certain. */
export type NoteClassification = { kind: 'none' } | { kind: 'given'; level: string } | { kind: 'unknown' };

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
const rank = (levels: readonly string[], level: string) => levels.findIndex((l) => same(l, level));

/** The front matter's own lines, or null when the text does not begin with front matter that ends. */
function frontMatter(text: string): string[] | null {
  const lines = (text.charCodeAt(0) === 0xfeff ? text.slice(1) : text).split(/\r?\n/);
  if (lines[0]?.trim() !== '---') return null;
  const end = lines.findIndex((l, i) => i > 0 && l.trim() === '---');
  return end < 0 ? null : lines.slice(1, end);
}

/** A top-level key line: unindented, a plain or quoted key, then a colon. Returns the key and the rest of the line. */
const KEY = /^("[^"]*"|'[^']*'|[^\s:#'"[\]{}>|&*!%@`-][^:#]*?)\s*:(?:\s(.*)|())$/;

/** Whether a value's quote or bracket is left open on its line, so the next lines may belong to it. */
function opensOver(value: string): boolean {
  const v = value.trim();
  if (/^"/.test(v)) return !/^"(?:[^"\\]|\\.)*"\s*(#.*)?$/.test(v);
  if (/^'/.test(v)) return !/^'(?:[^']|'')*'\s*(#.*)?$/.test(v);
  if (/^\[/.test(v)) return !/\]\s*(#.*)?$/.test(v);
  if (/^\{/.test(v)) return !/\}\s*(#.*)?$/.test(v);
  return false;
}

/** The value of a classification key as one label, or null when it cannot be read as exactly one. */
function labelOf(raw: string): string | null {
  const v = raw.trim();
  const quoted = /^"([^"\\]*)"\s*(?:#.*)?$/.exec(v) ?? /^'([^']*)'\s*(?:#.*)?$/.exec(v);
  const label = quoted ? (quoted[1] ?? '') : v.replace(/\s+#.*$/, '').trim();
  if (!label || label.includes(': ') || label.endsWith(':')) return null;
  if (!quoted && /^[[{|>&*!%@`"'#]/.test(label)) return null;
  return label.trim() || null;
}

/**
 * The note's classification, from an unindented, top-level `classification:` key of its front matter. A nested key, one
 * inside a block scalar and one indented do not count. Several of them, a value that is a list, a mapping, a block, an
 * anchor, a tag or a quote left open, an empty value followed by list or child lines, and a front matter in which an
 * earlier value may run over the key, are unknown: the gate refuses them. An empty value alone is none.
 */
export function classificationOf(text: string): NoteClassification {
  const lines = frontMatter(text);
  if (!lines) return { kind: 'none' };
  let found: { at: number; raw: string } | null = null;
  let risky = false;
  let more = false;
  lines.forEach((line, i) => {
    if (!line || /^\s/.test(line) || line.startsWith('-') || line.startsWith('#')) return;
    const m = KEY.exec(line);
    if (!m) return;
    const key = (m[1] ?? '').replace(/^(["'])(.*)\1$/, '$2').trim();
    const raw = m[2] ?? '';
    if (same(key, 'classification')) {
      if (found) more = true;
      found = { at: i, raw };
    }
    if (opensOver(raw) && !same(key, 'classification')) risky = true;
  });
  // a quote or block left open by an earlier key could swallow the line that looks like the key
  if (more) return { kind: 'unknown' };
  const mentioned = lines.some((l) => /^\s*-?\s*["']?classification["']?\s*:/i.test(l));
  if (risky && mentioned) return { kind: 'unknown' };
  if (!found) return { kind: 'none' };
  const { at, raw } = found as { at: number; raw: string };
  const next = lines.slice(at + 1).find((l) => l.trim() !== '');
  const child = next !== undefined && (/^\s/.test(next) || /^-(\s|$)/.test(next));
  if (raw.trim() === '' || raw.trim().startsWith('#')) return child ? { kind: 'unknown' } : { kind: 'none' };
  if (child) return { kind: 'unknown' };
  const level = labelOf(raw);
  return level === null ? { kind: 'unknown' } : { kind: 'given', level };
}

/** The note's classification (its front matter `classification:`), without quotes; null when it has none or it is unknown. */
export function noteClassification(text: string): string | null {
  const c = classificationOf(text);
  return c.kind === 'given' ? c.level : null;
}

/** Claude's ceiling: the one of the model named Claude; none set up, or one no longer a classification, is the lowest. */
function ceilingOf(settings: GateSettings): number {
  const model = settings.aiModels.find((m) => same(m.name, CLAUDE));
  return model ? Math.max(0, rank(settings.classifications, model.ceiling)) : 0;
}

/**
 * Whether a note may open in a pane Claude can read. A credential in it, whatever its classification, a classification
 * at the highest set, not among those set or unknown, are refused with no question; one above Claude's ceiling is asked
 * about, unless `confirmed` is the digest (SHA-256, in hexadecimal) of this very text, which is the user's yes to it. The
 * words name kinds and the levels set, never the note's label or its text.
 */
export function claudeGate(text: string, settings: GateSettings, confirmed: string | null = null): Gate {
  const levels = settings.classifications;
  const held = credentialsIn(text);
  if (held.length)
    return {
      refuse: `This note holds ${held.join(' and ')}, and a credential is never shown to Claude, so it is not opened.`,
    };
  const given = classificationOf(text);
  if (given.kind === 'unknown')
    return {
      refuse: `This note has an unknown classification (its front matter does not give exactly one), so it counts as above every ceiling and is not opened.`,
    };
  const unlabelled = given.kind === 'none';
  const wanted = given.kind === 'given' ? given.level : settings.aiUnlabelled;
  const at = rank(levels, wanted);
  if (at === -1)
    return {
      refuse: `This note has an unknown classification, which is not one of the classifications set (${levels.join(', ')}), so it counts as above every ceiling and is not opened.`,
    };
  const level = levels[at] ?? '';
  const said = unlabelled
    ? `This note has no classification, so it counts as ${level}`
    : `This note is classified ${level}`;
  if (at === levels.length - 1)
    return { refuse: `${said}, the highest classification set: it is never shown to Claude, whatever the settings.` };
  const ceiling = ceilingOf(settings);
  // a row of the destination matrix picked for the model named Claude replaces its ceiling, held to the same rules
  const claude = settings.aiModels.find((m) => same(m.name, CLAUDE));
  const row = claude?.matrixRow;
  const cleared =
    claude && row
      ? matrixRefusal(
          level,
          '',
          claude,
          { rows: settings.matrix ?? [], classMap: settings.aiClassMap ?? {} },
          levels,
        ) === null
      : at <= ceiling;
  if (!cleared) {
    if (confirmed && confirmed === sha256(text)) return { open: true };
    const set = row
      ? `not cleared for Claude by its matrix row, ${row}`
      : `above the level set for Claude, ${levels[ceiling]}`;
    const why = row && settings.matrixProblem ? ` ${settings.matrixProblem}` : '';
    return { ask: `${said}, ${set}. Claude can read the pane the editor opens in.${why}` };
  }
  return { open: true };
}
