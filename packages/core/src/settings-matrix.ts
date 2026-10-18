// The options for the destination matrix (editor spec §19, model_ceiling), with the rest of the AI models section of
// the settings page. They are the note that holds the matrix, and how class names that are not classifications are
// mapped to them.
import type { Option } from './settings.ts';

/** The matrix options, in the order the settings page shows them. */
export const MATRIX_OPTIONS: Option[] = [
  {
    key: 'aiMatrixNote',
    section: 'AI models',
    name: 'Destination matrix note',
    sentence:
      'The note that holds the vault’s destination matrix, by its path. A model can then take a row of it in place of a ceiling.',
  },
  {
    key: 'aiClassMap',
    section: 'AI models',
    name: 'Matrix classes',
    sentence:
      'Classes of the matrix that go by another name than a classification, one per line as matrix name: classification. A class matched by neither is flagged and never sent.',
  },
];
