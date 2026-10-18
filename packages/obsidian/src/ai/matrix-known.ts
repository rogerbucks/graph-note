// Which names in the matrix note's header are classes the vault knows (editor spec §19, model_ceiling). Each is a
// classification, or a name the settings map to one. The matrix is the table with such a class across it. So another
// table that happens to have an empty corner is not taken for it.
import { matchClass } from '@thoughtknot/core';
import type { Settings } from '@thoughtknot/core';

/** Whether a name is a class the vault knows, against the classifications and the mapping table as they are now. */
export const knownClass =
  (s: Pick<Settings, 'classifications' | 'aiClassMap'>) =>
  (name: string): boolean =>
    matchClass(name, s.classifications, s.aiClassMap) !== null;
