// What the browser editor may show Claude (editor spec §26, cc_classified_asks, cc_credential_never): Claude can read
// the pane the editor opens in, so a note is held to a ceiling before it opens. A note above the level set for Claude is
// asked about first; one at the highest classification never opens, whatever the settings; a note with no
// classification counts as the level set for unlabelled notes (the highest until chosen); and a credential never reaches
// Claude, at any classification. The level for Claude is the ceiling of the model named Claude among the models set up
// (§19); with none, the lowest classification, so everything above it asks. The §19 destination matrix is not read here
// (model_ceiling is the owner's call): `ceilingOf` is the one place a default from it would come in.
import { credentialsIn } from './ai-ceiling.ts';
import type { AiModel, Settings } from './settings.ts';

/** The settings the gate reads. */
export type GateSettings = Pick<Settings, 'classifications' | 'aiUnlabelled'> & { aiModels: readonly AiModel[] };

/** The name Claude is set up under among the AI models. */
export const CLAUDE = 'Claude';

/** What to do with a note: open it, ask the user first (with the question), or refuse it (with why). */
export type Gate = { open: true } | { ask: string } | { refuse: string };

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
const rank = (levels: readonly string[], level: string) => levels.findIndex((l) => same(l, level));

/** The front matter's own lines, or null when the text does not begin with front matter that ends. */
function frontMatter(text: string): string[] | null {
  const lines = (text.charCodeAt(0) === 0xfeff ? text.slice(1) : text).split(/\r?\n/);
  if (lines[0]?.trim() !== '---') return null;
  const end = lines.findIndex((l, i) => i > 0 && l.trim() === '---');
  return end < 0 ? null : lines.slice(1, end);
}

/** The note's classification (its front matter `classification:`), without quotes; null when it has none. */
export function noteClassification(text: string): string | null {
  for (const line of frontMatter(text) ?? []) {
    const m = /^classification\s*:\s*(.*)$/i.exec(line.trim());
    if (m) {
      const value = (m[1] ?? '')
        .trim()
        .replace(/^(["'])(.*)\1$/, '$2')
        .trim();
      return value || null;
    }
  }
  return null;
}

/** Claude's ceiling: the one of the model named Claude; none set up, or one no longer a classification, is the lowest. */
function ceilingOf(settings: GateSettings): number {
  const model = settings.aiModels.find((m) => same(m.name, CLAUDE));
  return model ? Math.max(0, rank(settings.classifications, model.ceiling)) : 0;
}

/**
 * Whether a note may open in a pane Claude can read. A credential in it, whatever its classification, and a
 * classification at the highest set or not among those set, are refused with no question; one above Claude's ceiling is
 * asked about. The words name the kind and the levels, never the note's text or what matched.
 */
export function claudeGate(text: string, settings: GateSettings): Gate {
  const levels = settings.classifications;
  const held = credentialsIn(text);
  if (held.length)
    return {
      refuse: `This note holds ${held.join(' and ')}, and a credential is never shown to Claude, so it is not opened.`,
    };
  const given = noteClassification(text);
  const unlabelled = given === null;
  const level = unlabelled ? settings.aiUnlabelled : given;
  const at = rank(levels, level);
  const said = unlabelled
    ? `This note has no classification, so it counts as ${level}`
    : `This note is classified ${level}`;
  if (at === -1)
    return {
      refuse: `${said}, which is not one of the classifications set (${levels.join(', ')}), so it counts as above every ceiling and is not opened.`,
    };
  if (at === levels.length - 1)
    return { refuse: `${said}, the highest classification set: it is never shown to Claude, whatever the settings.` };
  const ceiling = ceilingOf(settings);
  if (at > ceiling)
    return {
      ask: `${said}, above the level set for Claude, ${levels[ceiling]}. Claude can read the pane the editor opens in.`,
    };
  return { open: true };
}
