// What a model may be sent (editor spec §19, model_ceiling, never_above_ceiling, never_credential). Each model carries
// a ceiling, the highest classification of note it may be sent. A note above it is never sent to it, and the editor
// says why and names the models cleared for it. Nothing at the highest classification set is sent to any model. Nothing
// that looks like a credential is sent either, whatever the note's classification. A note with no classification counts
// as the level set for unlabelled notes. That is the most sensitive until the user chooses (unclassified_strictest). So
// by default it goes to no model.
import { matrixRefusal } from './ai-matrix.ts';
import type { MatrixInput } from './ai-matrix.ts';
import { formatList } from './locale-formats.ts';
import type { AiModel } from './settings.ts';
import { word } from './words.ts';
import type { WordKey } from './words.ts';
import gs from '@thoughtknot/graph-spec';

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
const rank = (levels: string[], level: string) => levels.findIndex((l) => same(l, level));

/** How a note's level is said: as classified, or, for a note with none, as the level it counts as. */
export const levelSaid = (level: string, unlabelled: boolean): string =>
  word(unlabelled ? 'ai.level.unlabelled' : 'ai.level.classified', { level });

/**
 * Why a note of `level` may not be sent to `model`, or null when it may; `unlabelled` when it counts as that level.
 * `reachable` says whether some ceiling could reach the level: the highest and an unknown one have no model to offer.
 */
function aboveCeiling(
  level: string,
  unlabelled: boolean,
  model: AiModel,
  levels: string[],
  matrix?: MatrixInput | null,
): { why: string; reachable: boolean } | null {
  const at = rank(levels, level),
    top = levels.length - 1;
  if (at === -1) return { why: word('ai.ceiling.unknown', { level, levels: levels.join(', ') }), reachable: false };
  const said = levelSaid(levels[at] ?? level, unlabelled);
  if (at === top) return { why: word('ai.ceiling.highest', { said }), reachable: false };
  // a row picked in the model's settings replaces its ceiling (model_ceiling); with none, the ceiling stands
  const ceiling = rank(levels, model.ceiling);
  const why = model.matrixRow
    ? matrixRefusal(levels[at] ?? level, said, model, matrix, levels)
    : ceiling === -1
      ? word('ai.ceiling.gone', { model: model.name, ceiling: model.ceiling })
      : at > ceiling
        ? word('ai.ceiling.above', { said, model: model.name, ceiling: levels[ceiling] ?? '' })
        : null;
  return why === null ? null : { why, reachable: true };
}

/** Whether a note may be sent to a model: yes, or why not and the models that are cleared for it. */
export type Clearance = { cleared: true } | { refused: string; cleared: string[] };

/**
 * Whether a note of `level` may be sent to `model`, against the classifications set (lowest first) and the models that
 * may be asked. A note with no classification (null) counts as `unlabelled`, the level set for such notes. That is the
 * most sensitive until the user chooses (unclassified_strictest). One not among those set counts as above every
 * ceiling. One at the highest is never sent. When it may not, the refusal says why and names the models cleared for it.
 * For a note with no classification it says what to change: give it one, or choose a lower level for unlabelled notes.
 * A model with a matrix row picked is held to the classes its row allows, in place of its ceiling. That is against the
 * `matrix` the host read.
 */
export function clearance(
  level: string | null,
  model: AiModel,
  levels: string[],
  models: AiModel[],
  unlabelled: string,
  matrix?: MatrixInput | null,
): Clearance {
  const counted = level === null || !level.trim();
  const as = counted ? unlabelled : level;
  const above = aboveCeiling(as, counted, model, levels, matrix);
  if (!above) return { cleared: true };
  const others = models.filter((m) => m !== model && !aboveCeiling(as, counted, m, levels, matrix)).map((m) => m.name);
  // only a level a ceiling can reach has a model to offer: the highest and an unknown one have none
  const offer = !above.reachable
    ? ''
    : others.length
      ? word('ai.ceiling.cleared', { count: others.length, models: formatList(others), level: as })
      : word('ai.ceiling.none-cleared', { level: as });
  const change = counted ? word('ai.ceiling.change') : '';
  return { refused: [above.why, offer, change].filter(Boolean).join(' '), cleared: offer ? others : [] };
}

/** Each kind of secret, as the graph spec library names it, by the key it is said by here. */
const KINDS: Record<string, WordKey> = {
  'a private key': 'ai.credential.private',
  'an access key': 'ai.credential.access',
  'an API key': 'ai.credential.api',
  'a token': 'ai.credential.token',
  'a password or secret': 'ai.credential.password',
  'a card number': 'ai.credential.card',
};

/**
 * The kinds of credential `text` holds, each once and in words (never the text that matched). It finds `secrets`, such
 * as the key of the model asked, wherever they are written.
 */
export function credentialsIn(text: string, secrets: readonly string[] = []): string[] {
  // the shapes are the graph spec library's, so the editor and every reader find the same (editor spec §51)
  const found = gs.secretsIn(text).map((kind) => {
    const key = KINDS[kind];
    return key ? word(key) : kind;
  });
  if (secrets.some((s) => s.length >= 8 && text.includes(s))) found.push(word('ai.credential.model-key'));
  return [...new Set(found)];
}
