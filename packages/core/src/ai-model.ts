// An AI model as the settings keep it (editor spec §19), and how one is read back. It is kept apart from settings.ts,
// which re-exports it. So that file stays within the size limit.
import { switchesFrom } from './ai-matrix.ts';
import type { MatrixSwitch } from './ai-matrix.ts';

/** The classifications a note may carry, lowest first, until the settings change them. */
export const CLASSIFICATIONS = ['Public', 'Internal', 'Confidential', 'Restricted'];

const text = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback);

/** An AI model set up for §19: what it is for, and its ceiling — the highest classification of note it may be sent. */
export interface AiModel {
  name: string;
  purpose: string;
  ceiling: string;
  /** Where requests go, set by the user; nothing is sent unless the user sends it. */
  endpoint: string;
  model: string;
  /** The name of its key in the host's secret store: never the key itself. */
  keyName: string;
  /** The row of the vault's destination matrix the user picked for it (§19, model_ceiling); with none, `ceiling` rules. */
  matrixRow?: string;
  /** The conditional classes of that row the user switched on for this model, as the matrix names them. */
  matrixOn?: MatrixSwitch[];
  /** The AI provider a plug-in adds that shapes its requests, by name; with none, the one wire format. */
  provider?: string;
}

/**
 * An AI model from what was given, with only its own fields: whatever else was given, such as a key, is dropped. A
 * model with no ceiling gets the lowest classification. One whose ceiling is no longer a classification keeps it as
 * written. So a classification being retyped never loses it, and the settings page says so.
 */
export function aiModel(given: Partial<AiModel> & Record<string, unknown>, classifications?: string[]): AiModel {
  const levels = classifications ?? CLASSIFICATIONS;
  return {
    name: text(given.name),
    purpose: text(given.purpose),
    ceiling: text(given.ceiling) || (levels[0] ?? ''),
    endpoint: text(given.endpoint),
    model: text(given.model),
    keyName: text(given.keyName),
    // kept only with a row picked, so a model with none is as it was
    ...(text(given.matrixRow).trim() && {
      matrixRow: text(given.matrixRow).trim(),
      matrixOn: switchesFrom(given.matrixOn),
    }),
    ...(text(given.provider).trim() && { provider: text(given.provider).trim() }),
  };
}
