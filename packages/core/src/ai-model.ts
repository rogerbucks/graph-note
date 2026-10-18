// An AI model as the settings keep it (editor spec §19). It is kept apart from settings.ts, which re-exports it. So
// that file stays within the size limit.
import type { MatrixSwitch } from './ai-matrix.ts';

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
}
